// aiDailySubmit — Cloud Scheduler runs this daily at 10:30 AM ET (14:30 UTC)
// Scans Catalin's submitted rounds for today, picks 1 AI IC per expiration
// If no user submission for an expiration, runs "ghost mode" (tracked, no leaderboard)

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getCredentialsForUser, findActiveTastyUser } from './shared/credentials';
import {
    getAccessToken, getAccounts, getOptionsChain, getMarketDataSnapshot, getUnderlyingPrice, getAccountBalances, getPositions,
} from './shared/tasty-rest-client';
import { getTopCandidates, hasStrikeOverlap, type ChainInput } from './shared/ic-picker';
import { pickWithLlm } from './shared/llm-picker';
import { checkGates, fetchUpcomingEvents } from './shared/economic-calendar';
import type {
    IAiState, ICompetitionRoundV2, IMarketContext, ITechnicalsContext, IWeeklyMemo,
} from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

const CATALIN_UID = process.env.CATALIN_UID ?? ''; // set via config
const TICKERS: Array<'SPX' | 'QQQ'> = ['SPX', 'QQQ'];

async function getAiState(uid: string): Promise<IAiState> {
    const doc = await admin.firestore().collection('users').doc(uid).collection('aiState').doc('current').get();
    if (doc.exists) return doc.data() as IAiState;
    // Seed with default
    await admin.firestore().collection('users').doc(uid).collection('aiState').doc('current').set(DEFAULT_AI_STATE);
    return { ...DEFAULT_AI_STATE };
}

async function getTodayUserRounds(uid: string, date: string): Promise<ICompetitionRoundV2[]> {
    const snap = await admin.firestore()
        .collection('users').doc(uid)
        .collection('competitionV2')
        .where('date', '==', date)
        .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ICompetitionRoundV2));
}

export const aiDailySubmit = onSchedule(
    {
        schedule: '30 14 * * 1-5', // 10:30 AM ET weekdays = 14:30 UTC
        timeZone: 'America/New_York',
        region: 'us-east1',
        secrets: [anthropicKey],
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async (_event) => {
        const uid = CATALIN_UID || await findActiveTastyUser();
        if (!uid) {
            console.error('[aiDailySubmit] No user with active TastyTrade found — aborting');
            return;
        }
        console.log(`[aiDailySubmit] Resolved uid=${uid}`);

        const date = new Date().toISOString().split('T')[0];
        console.log(`[aiDailySubmit] Starting for uid=${uid}, date=${date}`);

        // 0. Economic Calendar gate — skip all picks when today/tomorrow (ET) has high-impact event
        try {
            const upcomingEvents = await fetchUpcomingEvents(48);
            const gates = await checkGates(new Date(), upcomingEvents);
            if (gates.ladderingPause.paused) {
                const reason = gates.ladderingPause.reason;
                const blockingIds = gates.ladderingPause.blockingEvents.map((e) => e.id);
                console.log(`[aiDailySubmit] BLOCKED by economic event: ${reason}`);
                await admin.firestore().collection('dailyScans').doc(date).set({
                    scanDate: date,
                    uid,
                    blocked: true,
                    blockedReason: reason,
                    blockingEventIds: blockingIds,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return;
            }
        } catch (err) {
            console.warn('[aiDailySubmit] Economic calendar gate check failed, proceeding (fail-open)', err);
        }

        // 1. Load credentials + access token
        const creds = await getCredentialsForUser(uid);
        if (!creds) {
            console.error('[aiDailySubmit] No credentials for user');
            return;
        }
        const token = await getAccessToken(creds);

        // 2. Load AI state + latest weekly memo
        const aiState = await getAiState(uid);
        const memoSnap = await admin.firestore()
            .collection('users').doc(uid)
            .collection('aiState').doc('current').collection('weeklyMemos')
            .orderBy('createdAt', 'desc').limit(1).get();
        const latestMemo: IWeeklyMemo | null = memoSnap.empty ? null : (memoSnap.docs[0].data() as IWeeklyMemo);
        const memoText = latestMemo?.memoText ?? null;

        // 3. Determine target expirations: union of (user-submitted today) + (top 2 upcoming weeklies per ticker for ghost mode)
        const userRounds = await getTodayUserRounds(uid, date);
        const userExpsByTicker = new Map<string, Set<string>>();
        for (const r of userRounds) {
            if (!userExpsByTicker.has(r.ticker)) userExpsByTicker.set(r.ticker, new Set());
            userExpsByTicker.get(r.ticker)!.add(r.expirationDate);
        }

        // 4. Fetch accounts (for position conflict check later if needed)
        const accounts = await getAccounts(token);
        if (accounts.length === 0) {
            console.error('[aiDailySubmit] No accounts found');
            return;
        }
        const accountNumber = accounts[0]['account-number'];
        console.log(`[aiDailySubmit] Using account ${accountNumber}`);

        // 4b. BPE gate — fetch current buying power usage
        // FAIL-SAFE: if balances API fails, SKIP all picks (never trade blind)
        const balances = await getAccountBalances(token, accountNumber);
        if (!balances) {
            console.error('[aiDailySubmit] Cannot fetch account balances — skipping all picks (fail-safe: never trade without BPE check)');
            return;
        }
        const bpePct = balances.derivativeBuyingPowerPercentage;
        console.log(`[aiDailySubmit] Current BPE: ${bpePct.toFixed(1)}% of net liq`);

        // 4c. Fetch current open positions (for strike-overlap conflict detection)
        const existingPositions = await getPositions(token, accountNumber);
        console.log(`[aiDailySubmit] Open positions: ${existingPositions.length} option legs`);

        // Hard cap 80%, soft cap 50% (or 70% with VIX>22 exception)
        if (bpePct >= 80) {
            console.warn(`[aiDailySubmit] BPE ${bpePct}% >= 80% hard cap — skipping all picks today`);
            return;
        }

        // 5. For each ticker, fetch chain + underlying price + market data, pick ICs
        for (const ticker of TICKERS) {
            try {
                const underlyingPrice = await getUnderlyingPrice(token, ticker) ?? 0;
                if (!underlyingPrice) {
                    console.warn(`[aiDailySubmit] No underlying price for ${ticker} — skipping`);
                    continue;
                }

                const chain = await getOptionsChain(token, ticker);
                const firstChain = chain.items[0];
                if (!firstChain) {
                    console.warn(`[aiDailySubmit] No chain for ${ticker}`);
                    continue;
                }

                // Filter expirations: user-picked + next 3-4 upcoming (for ghost mode)
                const userExps = userExpsByTicker.get(ticker) ?? new Set<string>();
                const upcomingGhost = firstChain.expirations
                    .filter((e) => e['days-to-expiration'] >= 7 && e['days-to-expiration'] <= 45)
                    .slice(0, 4)
                    .map((e) => e['expiration-date']);
                const targetExps = new Set<string>([...userExps, ...upcomingGhost]);

                // Market context
                const vix = await getUnderlyingPrice(token, 'VIX') ?? 20;

                // Pull latest technical indicators (RSI/BB/ATR) for this ticker
                let technicals: ITechnicalsContext | null = null;
                try {
                    const techDoc = await admin.firestore().collection('marketTechnicals').doc(ticker).get();
                    if (techDoc.exists) {
                        const d = techDoc.data() as {
                            rsi: { value: number; verdict: string };
                            bb: { distanceSigma: number; verdict: string };
                            atr: { value: number; verdict: string };
                            computedAt: string;
                            stale?: boolean;
                        };
                        const ageHours = (Date.now() - new Date(d.computedAt).getTime()) / 3_600_000;
                        const isStale = !!d.stale || ageHours > 48;
                        technicals = {
                            rsi: d.rsi.value,
                            rsiVerdict: d.rsi.verdict,
                            bbDistance: d.bb.distanceSigma,
                            bbVerdict: d.bb.verdict,
                            atr: d.atr.value,
                            atrVerdict: d.atr.verdict,
                            computedAt: d.computedAt,
                            stale: isStale,
                        };
                        if (isStale) {
                            console.warn(`[aiDailySubmit] ${ticker}: technicals stale (${ageHours.toFixed(1)}h old) — treating as null`);
                            technicals = null;
                        }
                    }
                } catch (e) {
                    console.warn(`[aiDailySubmit] ${ticker}: failed to load technicals:`, e);
                }

                const marketContext: IMarketContext = {
                    underlyingPrice,
                    vix,
                    ivRank: 0, // TODO: fetch IV rank via /instruments/cryptocurrencies or /market-metrics
                    technicals,
                };

                // BPE gate per-ticker (re-checked since BPE could change between tickers)
                // 50% standard cap; 70% allowed only if VIX > 22 (Catalin's documented exception)
                const bpeCap = vix > 22 ? 70 : 50;
                if (bpePct >= bpeCap) {
                    console.warn(`[aiDailySubmit] ${ticker}: BPE ${bpePct.toFixed(1)}% >= ${bpeCap}% cap (VIX=${vix.toFixed(1)}) — skipping ticker`);
                    continue;
                }

                for (const expDate of targetExps) {
                    const exp = firstChain.expirations.find((e) => e['expiration-date'] === expDate);
                    if (!exp) continue;

                    // Collect ALL streamer symbols in this expiration
                    const streamerSymbols: string[] = [];
                    for (const s of exp.strikes) {
                        streamerSymbols.push(s['call-streamer-symbol'], s['put-streamer-symbol']);
                    }

                    // Fetch snapshots
                    const quoteMap = await getMarketDataSnapshot(token, streamerSymbols);
                    if (quoteMap.size === 0) {
                        console.warn(`[aiDailySubmit] No quotes for ${ticker} ${expDate}`);
                        continue;
                    }

                    // Build ChainInput
                    const chainInput: ChainInput = {
                        ticker,
                        underlyingPrice,
                        expirationDate: expDate,
                        dte: exp['days-to-expiration'],
                        strikes: exp.strikes.map((s) => ({
                            strike: parseFloat(s['strike-price']),
                            callSymbol: s.call,
                            callStreamerSymbol: s['call-streamer-symbol'],
                            putSymbol: s.put,
                            putStreamerSymbol: s['put-streamer-symbol'],
                        })),
                        quotes: quoteMap,
                    };

                    // Generate top candidates with rule-based picker (request extra so we can filter overlaps)
                    const candidates = getTopCandidates(chainInput, aiState, marketContext, 10);
                    if (candidates.topN.length === 0) {
                        console.log(`[aiDailySubmit] ${ticker} ${expDate}: no candidates — ${candidates.reason}`);
                        continue;
                    }

                    // Filter out candidates with strike overlap against existing positions on same expiration
                    const conflictFree = candidates.topN.filter((c) => {
                        const check = hasStrikeOverlap(
                            { putBuy: c.putBuy, putSell: c.putSell, callSell: c.callSell, callBuy: c.callBuy },
                            expDate,
                            existingPositions,
                        );
                        if (check.overlaps) {
                            console.log(`[aiDailySubmit] ${ticker} ${expDate}: filtered candidate ${c.putBuy}/${c.putSell}p ${c.callSell}/${c.callBuy}c — ${check.reason}`);
                        }
                        return !check.overlaps;
                    }).slice(0, 5);

                    if (conflictFree.length === 0) {
                        console.log(`[aiDailySubmit] ${ticker} ${expDate}: all candidates conflict with existing positions — skipping`);
                        continue;
                    }
                    candidates.topN = conflictFree;

                    const isGhost = !userExps.has(expDate);
                    const existingUserRound = userRounds.find((r) => r.ticker === ticker && r.expirationDate === expDate);

                    // Use Claude Opus to pick (with fallback to rule-based on failure)
                    const llmResult = await pickWithLlm(
                        uid, ticker, expDate, exp['days-to-expiration'],
                        marketContext, aiState, candidates,
                        memoText,
                        existingUserRound?.userTrade ?? null,
                        bpePct,
                    );

                    if (!llmResult.trade) {
                        console.log(`[aiDailySubmit] ${ticker} ${expDate}: no trade — ${llmResult.reason}`);
                        continue;
                    }
                    console.log(`[aiDailySubmit] ${ticker} ${expDate}: ${llmResult.reason} (fallback=${llmResult.fallback})`);

                    if (existingUserRound && existingUserRound.id) {
                        // Attach AI pick to existing round
                        await admin.firestore()
                            .collection('users').doc(uid)
                            .collection('competitionV2').doc(existingUserRound.id)
                            .update({
                                aiTrade: llmResult.trade,
                                revealedAt: new Date().toISOString(),
                                ghost: false,
                            });
                        console.log(`[aiDailySubmit] Attached AI pick to round ${existingUserRound.id}`);
                    } else {
                        // Create ghost round
                        const roundId = `${date}_${ticker}_${expDate}_ghost`;
                        const round: Omit<ICompetitionRoundV2, 'id'> = {
                            roundNumber: 0, // assigned later
                            date,
                            userEmail: '', // ghost
                            expirationDate: expDate,
                            ticker,
                            userTrade: null,
                            aiTrade: llmResult.trade,
                            winner: 'GhostOnly',
                            ghost: true,
                            marketContext,
                            userScore: null,
                            aiScore: null,
                            winnerDecidedAt: null,
                            createdAt: new Date().toISOString(),
                            revealedAt: new Date().toISOString(),
                        };
                        await admin.firestore()
                            .collection('users').doc(uid)
                            .collection('competitionV2').doc(roundId)
                            .set(round);
                        console.log(`[aiDailySubmit] Created ghost round ${roundId} for ${ticker} ${expDate}`);
                    }

                    void isGhost; // linter
                }
            } catch (e) {
                console.error(`[aiDailySubmit] Error processing ${ticker}:`, e);
            }
        }

        console.log('[aiDailySubmit] Complete');
    },
);

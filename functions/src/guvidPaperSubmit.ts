// guvidPaperSubmit — Cloud Scheduler runs this daily at 10:30 AM ET (weekdays)
// Guvid autonomous PAPER TRADING: picks Iron Condors on its own and books them
// into a virtual account seeded with the user's real net liq at first run.
// No competition — Guvid trades solo; performance is tracked for review.

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getCredentialsForUser, findActiveTastyUser, CATALIN_UID as CATALIN_UID_CONST } from './shared/credentials';
import {
    getAccessToken, getAccounts, getOptionsChain, getMarketDataSnapshot, getUnderlyingPrice, getAccountBalances,
} from './shared/tasty-rest-client';
import type { IRawPosition } from './shared/tasty-rest-client';
import { getTopCandidates, hasStrikeOverlap, type ChainInput } from './shared/ic-picker';
import { pickWithLlm } from './shared/llm-picker';
import {
    getOrCreatePaperAccount, getOpenPaperTrades, paperBpePercentage, paperEquity,
    sizePaperQuantity, tradesCollection, updatePaperAccount, type IPaperTrade,
} from './shared/paper-account';
import type { IAiState, IMarketContext, ITechnicalsContext } from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

const CATALIN_UID = CATALIN_UID_CONST;
const TICKERS: Array<'SPX' | 'QQQ'> = ['SPX', 'QQQ'];

// Entry window: 25-45 DTE so the 21-DTE management rule leaves room to work.
const MIN_ENTRY_DTE = 25;
const MAX_ENTRY_DTE = 45;
const MAX_EXPIRATIONS_PER_TICKER = 3;

async function getAiState(uid: string): Promise<IAiState> {
    const doc = await admin.firestore().collection('users').doc(uid).collection('aiState').doc('current').get();
    if (doc.exists) return doc.data() as IAiState;
    await admin.firestore().collection('users').doc(uid).collection('aiState').doc('current').set(DEFAULT_AI_STATE);
    return { ...DEFAULT_AI_STATE };
}

/** Open paper trades expressed as raw positions, so hasStrikeOverlap can
 *  guard against strike cancel/duplicate conflicts within the paper book. */
function paperTradesAsPositions(trades: IPaperTrade[]): IRawPosition[] {
    const positions: IRawPosition[] = [];
    for (const t of trades) {
        for (const leg of t.legs) {
            positions.push({
                symbol: `${t.ticker}-paper`,
                underlyingSymbol: t.ticker,
                strikePrice: leg.strike,
                optionType: leg.optionType === 'C' ? 'C' : 'P',
                expirationDate: t.expiration,
                quantity: t.quantity,
                quantityDirection: leg.type === 'BTO' ? 'Long' : 'Short',
                averageOpenPrice: 0,
                closePrice: 0,
                multiplier: 100,
            });
        }
    }
    return positions;
}

async function loadTechnicals(ticker: string): Promise<ITechnicalsContext | null> {
    try {
        const techDoc = await admin.firestore().collection('marketTechnicals').doc(ticker).get();
        if (!techDoc.exists) return null;
        const d = techDoc.data() as {
            rsi: { value: number; verdict: string };
            bb: { distanceSigma: number; verdict: string };
            atr: { value: number; verdict: string };
            computedAt: string;
            stale?: boolean;
        };
        const ageHours = (Date.now() - new Date(d.computedAt).getTime()) / 3_600_000;
        if (!!d.stale || ageHours > 48) return null;
        return {
            rsi: d.rsi.value,
            rsiVerdict: d.rsi.verdict,
            bbDistance: d.bb.distanceSigma,
            bbVerdict: d.bb.verdict,
            atr: d.atr.value,
            atrVerdict: d.atr.verdict,
            computedAt: d.computedAt,
            stale: false,
        };
    } catch {
        return null;
    }
}

export const guvidPaperSubmit = onSchedule(
    {
        schedule: '30 10 * * 1-5', // 10:30 AM ET weekdays
        timeZone: 'America/New_York',
        region: 'us-east1',
        secrets: [anthropicKey],
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async () => {
        const uid = CATALIN_UID || await findActiveTastyUser();
        if (!uid) {
            console.error('[guvidPaperSubmit] No user with active TastyTrade found — aborting');
            return;
        }
        const date = new Date().toISOString().split('T')[0];
        console.log(`[guvidPaperSubmit] Starting for uid=${uid}, date=${date}`);

        // 1. Credentials + token (market data only — no real orders, ever)
        const creds = await getCredentialsForUser(uid);
        if (!creds) {
            console.error('[guvidPaperSubmit] No credentials for user');
            return;
        }
        const token = await getAccessToken(creds);

        // 2. Paper account — seed with real net liq on first run
        const accounts = await getAccounts(token);
        if (accounts.length === 0) {
            console.error('[guvidPaperSubmit] No accounts found');
            return;
        }
        const balances = await getAccountBalances(token, accounts[0]['account-number']);
        const account = await getOrCreatePaperAccount(uid, balances?.netLiquidatingValue ?? 0);
        if (!account) {
            console.error('[guvidPaperSubmit] Paper account not seeded (real balances unavailable) — skipping run');
            return;
        }
        const equity = paperEquity(account);

        // 3. Open paper positions → BPE of the paper account
        const openTrades = await getOpenPaperTrades(uid);
        let bpePct = paperBpePercentage(openTrades, equity);
        console.log(`[guvidPaperSubmit] Paper equity $${equity.toFixed(2)}, BPE ${bpePct.toFixed(1)}%, open trades ${openTrades.length}`);

        if (bpePct >= 80) {
            console.warn(`[guvidPaperSubmit] Paper BPE ${bpePct.toFixed(1)}% >= 80% hard cap — skipping all picks today`);
            return;
        }

        const paperPositions = paperTradesAsPositions(openTrades);

        // 4. AI state — override the competition-era counters with the paper
        //    account's actual record so prompts reflect what Guvid is judged on.
        //    The weekly memo producer is retired, so no memo is injected.
        const aiState = await getAiState(uid);
        aiState.wins = account.wins;
        aiState.losses = account.losses;
        aiState.draws = 0;
        aiState.ghostRounds = 0;
        aiState.totalRounds = account.tradesClosed;
        const memoText: string | null = null;

        // VIX fetched once (identical for all tickers). FAIL-SAFE: without a
        // real VIX reading the VIX≥18 entry gate cannot be evaluated — skip
        // the whole run rather than trade blind on a default.
        const vix = await getUnderlyingPrice(token, 'VIX');
        if (vix === null || vix <= 0) {
            console.error('[guvidPaperSubmit] No VIX reading — skipping all picks (fail-safe: never trade blind)');
            return;
        }
        const bpeCap = vix > 22 ? 70 : 50;

        let tradesOpenedToday = 0;

        for (const ticker of TICKERS) {
            try {
                // BPE soft cap per ticker — checked BEFORE any heavy fetch
                if (bpePct >= bpeCap) {
                    console.warn(`[guvidPaperSubmit] ${ticker}: paper BPE ${bpePct.toFixed(1)}% >= ${bpeCap}% cap (VIX=${vix.toFixed(1)}) — skipping ticker`);
                    continue;
                }

                const [underlyingPrice, chain, technicals] = await Promise.all([
                    getUnderlyingPrice(token, ticker).then((p) => p ?? 0),
                    getOptionsChain(token, ticker),
                    loadTechnicals(ticker),
                ]);
                if (!underlyingPrice) {
                    console.warn(`[guvidPaperSubmit] No underlying price for ${ticker} — skipping`);
                    continue;
                }
                const firstChain = chain.items[0];
                if (!firstChain) {
                    console.warn(`[guvidPaperSubmit] No chain for ${ticker}`);
                    continue;
                }

                const marketContext: IMarketContext = {
                    underlyingPrice,
                    vix,
                    ivRank: 0,
                    technicals,
                };

                const targetExps = firstChain.expirations
                    .filter((e) => e['days-to-expiration'] >= MIN_ENTRY_DTE && e['days-to-expiration'] <= MAX_ENTRY_DTE)
                    .slice(0, MAX_EXPIRATIONS_PER_TICKER);

                for (const exp of targetExps) {
                    try {
                    const expDate = exp['expiration-date'];

                    // Bound quote subscriptions to ±10% of spot
                    const STRIKE_BAND_PCT = 0.10;
                    const lo = underlyingPrice * (1 - STRIKE_BAND_PCT);
                    const hi = underlyingPrice * (1 + STRIKE_BAND_PCT);
                    const streamerSymbols: string[] = [];
                    for (const s of exp.strikes) {
                        const k = parseFloat(s['strike-price']);
                        if (k < lo || k > hi) continue;
                        streamerSymbols.push(s['call-streamer-symbol'], s['put-streamer-symbol']);
                    }

                    const quoteMap = await getMarketDataSnapshot(token, streamerSymbols);
                    if (quoteMap.size === 0) {
                        console.warn(`[guvidPaperSubmit] No quotes for ${ticker} ${expDate}`);
                        continue;
                    }

                    const chainInput: ChainInput = {
                        ticker,
                        underlyingPrice,
                        expirationDate: expDate,
                        dte: exp['days-to-expiration'],
                        strikes: exp.strikes
                            .filter((s) => {
                                const k = parseFloat(s['strike-price']);
                                return k >= lo && k <= hi;
                            })
                            .map((s) => ({
                                strike: parseFloat(s['strike-price']),
                                callSymbol: s.call,
                                callStreamerSymbol: s['call-streamer-symbol'],
                                putSymbol: s.put,
                                putStreamerSymbol: s['put-streamer-symbol'],
                            })),
                        quotes: quoteMap,
                    };

                    const candidates = getTopCandidates(chainInput, aiState, marketContext, 10);
                    if (candidates.topN.length === 0) {
                        console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: no candidates — ${candidates.reason}`);
                        continue;
                    }

                    // No strike conflicts inside the paper book
                    const conflictFree = candidates.topN.filter((c) => {
                        const check = hasStrikeOverlap(
                            { putBuy: c.putBuy, putSell: c.putSell, callSell: c.callSell, callBuy: c.callBuy },
                            expDate,
                            paperPositions,
                        );
                        if (check.overlaps) {
                            console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: filtered ${c.putBuy}/${c.putSell}p ${c.callSell}/${c.callBuy}c — ${check.reason}`);
                        }
                        return !check.overlaps;
                    }).slice(0, 5);
                    if (conflictFree.length === 0) {
                        console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: all candidates conflict with open paper positions — skipping`);
                        continue;
                    }
                    candidates.topN = conflictFree;

                    // LLM pick (Picker → Risk Manager) in paper-trading mode
                    const llmResult = await pickWithLlm(
                        uid, ticker, expDate, exp['days-to-expiration'],
                        marketContext, aiState, candidates,
                        memoText,
                        null,           // no user submission — Guvid trades solo
                        bpePct,
                        'paper',
                    );
                    if (!llmResult.trade) {
                        console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: no trade — ${llmResult.reason}`);
                        continue;
                    }

                    // Re-size against the paper account: max loss ≤ 5% of equity
                    const t = llmResult.trade;
                    const perContractMaxLoss = (t.wings - t.credit) * 100;
                    const qty = sizePaperQuantity(perContractMaxLoss, equity);
                    if (qty === 0) {
                        console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: 1 contract max loss $${perContractMaxLoss.toFixed(0)} exceeds 5% of equity — skipping`);
                        continue;
                    }
                    const sized: typeof t = {
                        ...t,
                        quantity: qty,
                        maxProfit: Math.round(t.credit * 100 * qty * 100) / 100,
                        maxLoss: Math.round(perContractMaxLoss * qty * 100) / 100,
                        // No approval workflow in paper mode — deviations are
                        // logged in the rationale, never left 'pending' forever.
                        requiresApproval: false,
                        approvalStatus: undefined,
                    };

                    // BPE gate again including the new trade
                    const projectedBpe = bpePct + (sized.maxLoss / equity) * 100;
                    if (projectedBpe >= bpeCap) {
                        console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: trade would push BPE to ${projectedBpe.toFixed(1)}% >= ${bpeCap}% — skipping`);
                        continue;
                    }

                    const shortPut = sized.legs.find((l) => l.type === 'STO' && l.optionType === 'P')?.strike ?? 0;
                    const shortCall = sized.legs.find((l) => l.type === 'STO' && l.optionType === 'C')?.strike ?? 0;
                    const tradeId = `${date}_${ticker}_${expDate}_${shortPut}p${shortCall}c`;

                    const paperTrade: Omit<IPaperTrade, 'id'> = {
                        ...sized,
                        openDate: date,
                        dteAtEntry: exp['days-to-expiration'],
                        marketContext,
                        currentClose: null,
                        unrealizedPl: null,
                        profitPct: null,
                        correct: null,
                    };
                    // .create() (not .set()) — a retry the same day must never
                    // overwrite an already-booked trade back to 'open'.
                    try {
                        await tradesCollection(uid).doc(tradeId).create(paperTrade);
                    } catch (e) {
                        if ((e as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
                            console.log(`[guvidPaperSubmit] ${tradeId} already exists — skipping duplicate`);
                            continue;
                        }
                        throw e;
                    }
                    console.log(`[guvidPaperSubmit] OPENED ${tradeId}: ${sized.strategy} x${qty}, credit $${sized.credit}, maxLoss $${sized.maxLoss} (${llmResult.reason})`);

                    // Track the new exposure for subsequent gates + overlap checks
                    bpePct = projectedBpe;
                    tradesOpenedToday++;
                    paperPositions.push(...paperTradesAsPositions([{ ...paperTrade, id: tradeId } as IPaperTrade]));
                    } catch (e) {
                        // One bad expiration must not discard the remaining ones
                        console.error(`[guvidPaperSubmit] Error on ${ticker} ${exp['expiration-date']}:`, e);
                    }
                }
            } catch (e) {
                console.error(`[guvidPaperSubmit] Error processing ${ticker}:`, e);
            }
        }

        if (tradesOpenedToday > 0) {
            await updatePaperAccount(uid, { tradesOpened: account.tradesOpened + tradesOpenedToday });
        }
        console.log(`[guvidPaperSubmit] Complete — ${tradesOpenedToday} paper trades opened`);
    },
);

// closeCheck — Cloud Scheduler daily 4:00 PM ET (21:00 UTC)
// For each open AI virtual position: check current price, close if 75% profit or 10 DTE
// For each open user position: scan transactions to detect actual close
// When BOTH sides closed: set winner

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getCredentialsForUser } from './shared/credentials';
import {
    getAccessToken, getAccounts, getMarketDataSnapshot, getTransactions,
} from './shared/tasty-rest-client';
import type { ICompetitionRoundV2, ICompetitionTradeV2, IAiCompetitionTrade } from './shared/types';

const encryptionKey = defineSecret('ENCRYPTION_KEY');
const CATALIN_UID = process.env.CATALIN_UID ?? '';

function daysUntil(expirationDate: string): number {
    const exp = new Date(expirationDate + 'T16:00:00-05:00'); // 4 PM ET expiration
    const now = new Date();
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeScore(exitPl: number | null, maxLoss: number): number | null {
    if (exitPl === null || maxLoss <= 0) return null;
    return exitPl / maxLoss;
}

function setWinner(round: ICompetitionRoundV2): { winner: ICompetitionRoundV2['winner']; userScore: number | null; aiScore: number | null } {
    const aiScore = computeScore(round.aiTrade.exitPl, round.aiTrade.maxLoss);
    const userScore = round.userTrade ? computeScore(round.userTrade.exitPl, round.userTrade.maxLoss) : null;

    if (round.ghost || !round.userTrade) {
        return { winner: 'GhostOnly', userScore: null, aiScore };
    }
    if (aiScore === null || userScore === null) {
        return { winner: 'Pending', userScore, aiScore };
    }
    if (Math.abs(userScore - aiScore) < 0.05) {
        return { winner: 'Draw', userScore, aiScore };
    }
    return { winner: userScore > aiScore ? 'User' : 'AI', userScore, aiScore };
}

/** Check AI virtual trade — close if 75% profit or DTE<=10 */
async function maybeCloseAiTrade(trade: IAiCompetitionTrade, quotes: Map<string, import('./shared/tasty-rest-client').IOptionQuote>, streamerSymLookup: (strike: number, type: 'P' | 'C') => string | null): Promise<IAiCompetitionTrade | null> {
    const dte = daysUntil(trade.expiration);

    // Compute current close price from snapshots if we have them
    let currentClose: number | null = null;
    const psSym = streamerSymLookup(trade.legs.find(l => l.type === 'STO' && l.optionType === 'P')!.strike, 'P');
    const pbSym = streamerSymLookup(trade.legs.find(l => l.type === 'BTO' && l.optionType === 'P')!.strike, 'P');
    const scSym = streamerSymLookup(trade.legs.find(l => l.type === 'STO' && l.optionType === 'C')!.strike, 'C');
    const cbSym = streamerSymLookup(trade.legs.find(l => l.type === 'BTO' && l.optionType === 'C')!.strike, 'C');

    if (psSym && pbSym && scSym && cbSym) {
        const ps = quotes.get(psSym); const pb = quotes.get(pbSym);
        const sc = quotes.get(scSym); const cb = quotes.get(cbSym);
        if (ps && pb && sc && cb) {
            currentClose = ps.mid + sc.mid - pb.mid - cb.mid;
        }
    }

    // Profit % = (credit - currentClose) / credit * 100
    if (currentClose !== null && trade.credit > 0) {
        const profitPct = ((trade.credit - currentClose) / trade.credit) * 100;
        if (profitPct >= 75) {
            return {
                ...trade,
                status: 'closed',
                exitPl: Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100,
                exitDate: new Date().toISOString().split('T')[0],
                closedBy: 'target',
            };
        }
    }

    if (dte <= 10) {
        return {
            ...trade,
            status: 'closed',
            exitPl: currentClose !== null
                ? Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100
                : Math.round(trade.credit * 100 * trade.quantity * 100) / 100, // if no close price, assume worthless
            exitDate: new Date().toISOString().split('T')[0],
            closedBy: 'dte',
        };
    }

    return null; // no close yet
}

/** Check user trade — scan transactions for matching closing order */
async function maybeCloseUserTrade(
    trade: ICompetitionTradeV2,
    transactions: Array<import('./shared/tasty-rest-client').IRawTransaction>,
): Promise<ICompetitionTradeV2 | null> {
    // Find transactions that close ALL 4 legs (expiration + strike + flipped direction)
    const legStrikes = new Set(trade.legs.map((l) => l.strike));
    const matching = transactions.filter((t) => {
        if (t['underlying-symbol'] !== trade.ticker && !trade.ticker.startsWith(t['underlying-symbol'])) return false;
        if (t['expiration-date'] !== trade.expiration) return false;
        const strike = parseFloat(t['strike-price'] ?? '0');
        return legStrikes.has(strike);
    });

    if (matching.length < 4) return null;

    // Aggregate debit paid / credit received at close
    // Close transactions: "Buy to Close" short legs, "Sell to Close" long legs
    let closeDebit = 0;
    let closeDate = '';
    for (const t of matching) {
        const price = parseFloat(t.price) * parseFloat(t.quantity) * 100; // total dollars for this leg
        if (t.action.includes('Buy to Close')) closeDebit += price;
        else if (t.action.includes('Sell to Close')) closeDebit -= price;
        if (t['executed-at'] > closeDate) closeDate = t['executed-at'];
    }

    const openCredit = trade.credit * 100 * trade.quantity;
    const exitPl = Math.round((openCredit - closeDebit) * 100) / 100;

    return {
        ...trade,
        status: 'closed',
        exitPl,
        exitDate: closeDate.split('T')[0],
        closedBy: 'user',
    };
}

export const closeCheck = onSchedule(
    {
        schedule: '0 21 * * 1-5', // 4:00 PM ET weekdays = 21:00 UTC (EST) or 20:00 UTC (EDT)
        timeZone: 'America/New_York',
        region: 'us-east1',
        secrets: [encryptionKey],
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async () => {
        const uid = CATALIN_UID;
        if (!uid) { console.error('[closeCheck] CATALIN_UID not set'); return; }

        const creds = await getCredentialsForUser(uid);
        if (!creds) { console.error('[closeCheck] No credentials'); return; }
        const token = await getAccessToken(creds);
        const accounts = await getAccounts(token);
        if (accounts.length === 0) { console.error('[closeCheck] No accounts'); return; }
        const accountNumber = accounts[0]['account-number'];

        // Fetch all open rounds
        const snap = await admin.firestore()
            .collection('users').doc(uid)
            .collection('competitionV2')
            .where('winner', 'in', ['Pending', 'GhostOnly'])
            .get();

        const openRounds: ICompetitionRoundV2[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ICompetitionRoundV2));
        console.log(`[closeCheck] Found ${openRounds.length} open rounds`);

        // Fetch transactions covering last 60 days
        const today = new Date();
        const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
        const transactions = await getTransactions(token, accountNumber, {
            startDate: sixtyDaysAgo.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
        });

        // For each open round: gather streamer symbols for AI legs and fetch quotes
        const streamerNeeds = new Map<string, string>(); // key "ticker|exp|strike|type" -> we'll look up later

        // Simplified: fetch quotes in one batch per ticker/expiration pair
        const byExp = new Map<string, ICompetitionRoundV2[]>();
        for (const r of openRounds) {
            if (r.aiTrade.status !== 'open') continue;
            const k = `${r.ticker}|${r.expirationDate}`;
            if (!byExp.has(k)) byExp.set(k, []);
            byExp.get(k)!.push(r);
        }

        // Build global quote map — fetch all needed streamer symbols
        // Note: without chain info, we construct streamer symbols from strikes — this requires chain lookup
        // Simpler approach: fetch chain per unique ticker, then extract streamer symbols

        for (const [key, rounds] of byExp) {
            const [ticker, expDate] = key.split('|');
            const { getOptionsChain } = await import('./shared/tasty-rest-client');
            const chain = await getOptionsChain(token, ticker);
            const exp = chain.items[0]?.expirations.find((e) => e['expiration-date'] === expDate);
            if (!exp) { console.warn(`[closeCheck] No chain for ${key}`); continue; }

            const strikeMap = new Map<number, { call: string; put: string }>();
            for (const s of exp.strikes) {
                strikeMap.set(parseFloat(s['strike-price']), {
                    call: s['call-streamer-symbol'],
                    put: s['put-streamer-symbol'],
                });
            }

            const allSymbols: string[] = [];
            for (const r of rounds) {
                for (const leg of r.aiTrade.legs) {
                    const entry = strikeMap.get(leg.strike);
                    if (!entry) continue;
                    allSymbols.push(leg.optionType === 'C' ? entry.call : entry.put);
                }
            }

            const quotes = await getMarketDataSnapshot(token, [...new Set(allSymbols)]);

            const lookup = (strike: number, type: 'P' | 'C'): string | null => {
                const e = strikeMap.get(strike);
                if (!e) return null;
                return type === 'C' ? e.call : e.put;
            };

            // Process each round
            for (const r of rounds) {
                try {
                    let updatedAi = r.aiTrade;
                    let updatedUser = r.userTrade;

                    if (r.aiTrade.status === 'open') {
                        const closed = await maybeCloseAiTrade(r.aiTrade, quotes, lookup);
                        if (closed) {
                            updatedAi = closed;
                            console.log(`[closeCheck] AI closed ${r.id}: ${closed.closedBy}, P&L=${closed.exitPl}`);
                        }
                    }

                    if (r.userTrade && r.userTrade.status === 'open') {
                        const closed = await maybeCloseUserTrade(r.userTrade, transactions);
                        if (closed) {
                            updatedUser = closed;
                            console.log(`[closeCheck] User closed ${r.id}: P&L=${closed.exitPl}`);
                        }
                    }

                    const { winner, userScore, aiScore } = setWinner({
                        ...r,
                        aiTrade: updatedAi,
                        userTrade: updatedUser,
                    });

                    await admin.firestore()
                        .collection('users').doc(uid)
                        .collection('competitionV2').doc(r.id!)
                        .update({
                            aiTrade: updatedAi,
                            userTrade: updatedUser,
                            winner,
                            userScore,
                            aiScore,
                            winnerDecidedAt: winner !== 'Pending' ? new Date().toISOString() : null,
                        });
                } catch (e) {
                    console.error(`[closeCheck] Error processing round ${r.id}:`, e);
                }
            }
            void streamerNeeds;
        }

        console.log('[closeCheck] Complete');
    },
);

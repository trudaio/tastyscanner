// guvidPaperClose — Cloud Scheduler daily 4:05 PM ET (weekdays)
// Manages Guvid's open paper trades:
//   - refreshes current close cost + unrealized P&L on every open trade
//   - closes at 75% of max profit, or at 21 DTE (Catalin's management rules)
//   - updates the paper account (realized P&L, wins/losses, correct count)
//   - writes a daily equity snapshot for the equity curve

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getCredentialsForUser, findActiveTastyUser, CATALIN_UID as CATALIN_UID_CONST } from './shared/credentials';
import { getAccessToken, getOptionsChain, getMarketDataSnapshot } from './shared/tasty-rest-client';
import {
    equityCollection, getOpenPaperTrades, paperEquity, tradesCollection, updatePaperAccount,
    type IEquityPoint, type IPaperAccount, type IPaperTrade,
} from './shared/paper-account';
import * as admin from 'firebase-admin';

const CATALIN_UID = CATALIN_UID_CONST;

const PROFIT_TARGET_PCT = 75;   // close at 75% of max profit
const MANAGE_DTE = 21;          // close at 21 DTE (Catalin's rule)

function daysUntil(expirationDate: string): number {
    const exp = new Date(expirationDate + 'T16:00:00-05:00'); // 4 PM ET expiration
    const now = new Date();
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const guvidPaperClose = onSchedule(
    {
        schedule: '5 16 * * 1-5', // 4:05 PM ET weekdays
        timeZone: 'America/New_York',
        region: 'us-east1',
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async () => {
        const uid = CATALIN_UID || await findActiveTastyUser();
        if (!uid) { console.error('[guvidPaperClose] No active TastyTrade user found'); return; }

        const accountDoc = await admin.firestore()
            .collection('users').doc(uid).collection('guvidPaper').doc('account').get();
        if (!accountDoc.exists) {
            console.log('[guvidPaperClose] No paper account yet — nothing to manage');
            return;
        }
        const account = accountDoc.data() as IPaperAccount;

        const creds = await getCredentialsForUser(uid);
        if (!creds) { console.error('[guvidPaperClose] No credentials'); return; }
        const token = await getAccessToken(creds);

        const openTrades = await getOpenPaperTrades(uid);
        console.log(`[guvidPaperClose] ${openTrades.length} open paper trades`);

        let realizedDelta = 0;
        let winsDelta = 0;
        let lossesDelta = 0;
        let closedDelta = 0;
        let unrealizedTotal = 0;
        let stillOpen = 0;

        // Group by ticker|expiration so each chain is fetched once
        const byExp = new Map<string, IPaperTrade[]>();
        for (const t of openTrades) {
            const k = `${t.ticker}|${t.expiration}`;
            if (!byExp.has(k)) byExp.set(k, []);
            byExp.get(k)!.push(t);
        }

        for (const [key, trades] of byExp) {
            const [ticker, expDate] = key.split('|');
            let strikeMap = new Map<number, { call: string; put: string }>();
            try {
                const chain = await getOptionsChain(token, ticker);
                const exp = chain.items[0]?.expirations.find((e) => e['expiration-date'] === expDate);
                if (exp) {
                    for (const s of exp.strikes) {
                        strikeMap.set(parseFloat(s['strike-price']), {
                            call: s['call-streamer-symbol'],
                            put: s['put-streamer-symbol'],
                        });
                    }
                }
            } catch (e) {
                console.warn(`[guvidPaperClose] Chain fetch failed for ${key}:`, e);
                strikeMap = new Map();
            }

            const allSymbols: string[] = [];
            for (const t of trades) {
                for (const leg of t.legs) {
                    const entry = strikeMap.get(leg.strike);
                    if (entry) allSymbols.push(leg.optionType === 'C' ? entry.call : entry.put);
                }
            }
            const quotes = allSymbols.length > 0
                ? await getMarketDataSnapshot(token, [...new Set(allSymbols)])
                : new Map<string, import('./shared/tasty-rest-client').IOptionQuote>();

            for (const trade of trades) {
                try {
                    const dte = daysUntil(trade.expiration);

                    // Current cost to close = short mids − long mids (per share)
                    let currentClose: number | null = null;
                    const legMid = (strike: number, type: 'P' | 'C'): number | null => {
                        const e = strikeMap.get(strike);
                        if (!e) return null;
                        const q = quotes.get(type === 'C' ? e.call : e.put);
                        return q ? q.mid : null;
                    };
                    const ps = legMid(trade.legs.find((l) => l.type === 'STO' && l.optionType === 'P')!.strike, 'P');
                    const pb = legMid(trade.legs.find((l) => l.type === 'BTO' && l.optionType === 'P')!.strike, 'P');
                    const sc = legMid(trade.legs.find((l) => l.type === 'STO' && l.optionType === 'C')!.strike, 'C');
                    const cb = legMid(trade.legs.find((l) => l.type === 'BTO' && l.optionType === 'C')!.strike, 'C');
                    if (ps !== null && pb !== null && sc !== null && cb !== null) {
                        currentClose = ps + sc - pb - cb;
                    }

                    const plDollars = currentClose !== null
                        ? Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100
                        : null;
                    const profitPct = currentClose !== null && trade.credit > 0
                        ? Math.round(((trade.credit - currentClose) / trade.credit) * 1000) / 10
                        : null;

                    const hitTarget = profitPct !== null && profitPct >= PROFIT_TARGET_PCT;
                    const hitDte = dte <= MANAGE_DTE;

                    if (hitTarget || hitDte) {
                        // Close. If no quotes at DTE close, assume shorts expire worthless
                        // (keeps full credit) — same convention as the old closeCheck.
                        const exitPl = plDollars !== null
                            ? plDollars
                            : Math.round(trade.credit * 100 * trade.quantity * 100) / 100;
                        const correct = exitPl > 0;
                        await tradesCollection(uid).doc(trade.id!).update({
                            status: 'closed',
                            exitPl,
                            exitDate: new Date().toISOString().split('T')[0],
                            closedBy: hitTarget ? 'target' : 'dte',
                            currentClose,
                            unrealizedPl: null,
                            profitPct,
                            correct,
                        });
                        realizedDelta += exitPl;
                        closedDelta++;
                        if (correct) winsDelta++; else lossesDelta++;
                        console.log(`[guvidPaperClose] CLOSED ${trade.id}: ${hitTarget ? 'target' : `${dte} DTE`}, P&L $${exitPl.toFixed(2)}`);
                    } else {
                        await tradesCollection(uid).doc(trade.id!).update({
                            currentClose,
                            unrealizedPl: plDollars,
                            profitPct,
                        });
                        unrealizedTotal += plDollars ?? 0;
                        stillOpen++;
                    }
                } catch (e) {
                    console.error(`[guvidPaperClose] Error processing ${trade.id}:`, e);
                }
            }
        }

        // Update the paper account
        if (closedDelta > 0) {
            await updatePaperAccount(uid, {
                realizedPl: Math.round((account.realizedPl + realizedDelta) * 100) / 100,
                wins: account.wins + winsDelta,
                losses: account.losses + lossesDelta,
                tradesClosed: account.tradesClosed + closedDelta,
            });
        }

        // Daily equity snapshot
        const date = new Date().toISOString().split('T')[0];
        const newRealized = Math.round((account.realizedPl + realizedDelta) * 100) / 100;
        const equityPoint: IEquityPoint = {
            date,
            realizedPl: newRealized,
            unrealizedPl: Math.round(unrealizedTotal * 100) / 100,
            equity: Math.round((paperEquity({ ...account, realizedPl: newRealized }) + unrealizedTotal) * 100) / 100,
            openCount: stillOpen,
        };
        await equityCollection(uid).doc(date).set(equityPoint);

        console.log(`[guvidPaperClose] Complete — closed ${closedDelta}, realized $${realizedDelta.toFixed(2)}, equity $${equityPoint.equity.toFixed(2)}`);
    },
);

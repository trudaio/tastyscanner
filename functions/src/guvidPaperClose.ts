// guvidPaperClose — Cloud Scheduler daily 4:05 PM ET (weekdays)
// Manages Guvid's open paper trades:
//   - refreshes current close cost + unrealized P&L on every open trade
//   - closes at 75% of max profit, or at 21 DTE (Catalin's management rules)
//   - NEVER closes without live quotes — a quote outage defers to the next run
//     instead of fabricating a P&L
//   - all writes (trades + account + equity snapshot) commit in ONE batch, so
//     a mid-run failure can't desynchronize the account from the trade docs

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getCredentialsForUser, CATALIN_UID } from './shared/credentials';
import { getAccessToken, getOptionsChain, getMarketDataSnapshot } from './shared/tasty-rest-client';
import type { IOptionQuote } from './shared/tasty-rest-client';
import {
    daysUntilExpiration, equityCollection, getOpenPaperTrades, paperEquity, tradesCollection,
    type IEquityPoint, type IPaperAccount, type IPaperTrade,
} from './shared/paper-account';
import * as admin from 'firebase-admin';

const PROFIT_TARGET_PCT = 75;   // close at 75% of max profit
const MANAGE_DTE = 21;          // close at 21 DTE (Catalin's rule)

type StrikeMap = Map<number, { call: string; put: string }>;
type ChainResult = Awaited<ReturnType<typeof getOptionsChain>>;

/** Build streamer-symbol lookup for one expiration, searching ALL chain roots
 *  (SPX exposes multiple roots — SPX and SPXW — and the expiration may not
 *  live under items[0]). */
function buildStrikeMap(chain: ChainResult, expDate: string): StrikeMap {
    const map: StrikeMap = new Map();
    for (const item of chain.items) {
        const exp = item.expirations.find((e) => e['expiration-date'] === expDate);
        if (!exp) continue;
        for (const s of exp.strikes) {
            map.set(parseFloat(s['strike-price']), {
                call: s['call-streamer-symbol'],
                put: s['put-streamer-symbol'],
            });
        }
        if (map.size > 0) break;
    }
    return map;
}

/** Cost to close (per share): short mids − long mids. Null when any leg is
 *  missing a quote or the trade isn't a complete 4-leg IC. */
function computeCurrentClose(
    trade: IPaperTrade,
    strikeMap: StrikeMap,
    quotes: Map<string, IOptionQuote>,
): number | null {
    let total = 0;
    let legs = 0;
    for (const leg of trade.legs) {
        const entry = strikeMap.get(leg.strike);
        if (!entry) return null;
        const q = quotes.get(leg.optionType === 'C' ? entry.call : entry.put);
        if (!q || (q.bid <= 0 && q.ask <= 0)) return null;
        total += (leg.type === 'STO' ? 1 : -1) * q.mid;
        legs++;
    }
    return legs === 4 ? total : null;
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
        // Hardcoded owner uid — see shared/credentials.ts
        const uid = CATALIN_UID;

        const accountRef = admin.firestore()
            .collection('users').doc(uid).collection('guvidPaper').doc('account');
        const accountDoc = await accountRef.get();
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

        const batch = admin.firestore().batch();

        // Group by ticker|expiration; fetch each ticker's chain only once
        const byExp = new Map<string, IPaperTrade[]>();
        for (const t of openTrades) {
            const k = `${t.ticker}|${t.expiration}`;
            if (!byExp.has(k)) byExp.set(k, []);
            byExp.get(k)!.push(t);
        }
        const chainCache = new Map<string, ChainResult | null>();

        for (const [key, trades] of byExp) {
            const [ticker, expDate] = key.split('|');

            if (!chainCache.has(ticker)) {
                try {
                    chainCache.set(ticker, await getOptionsChain(token, ticker));
                } catch (e) {
                    console.warn(`[guvidPaperClose] Chain fetch failed for ${ticker}:`, e);
                    chainCache.set(ticker, null);
                }
            }
            const chain = chainCache.get(ticker) ?? null;
            const strikeMap: StrikeMap = chain ? buildStrikeMap(chain, expDate) : new Map();

            const allSymbols: string[] = [];
            for (const t of trades) {
                for (const leg of t.legs) {
                    const entry = strikeMap.get(leg.strike);
                    if (entry) allSymbols.push(leg.optionType === 'C' ? entry.call : entry.put);
                }
            }
            const quotes = allSymbols.length > 0
                ? await getMarketDataSnapshot(token, [...new Set(allSymbols)])
                : new Map<string, IOptionQuote>();

            for (const trade of trades) {
                try {
                    const dte = daysUntilExpiration(trade.expiration);
                    const currentClose = computeCurrentClose(trade, strikeMap, quotes);

                    if (currentClose === null) {
                        // No reliable quotes — never book a P&L we didn't observe.
                        // Leave the trade open; the next run will retry.
                        console.warn(`[guvidPaperClose] ${trade.id}: no quotes (dte=${dte}) — deferring management to next run`);
                        stillOpen++;
                        unrealizedTotal += trade.unrealizedPl ?? 0;
                        continue;
                    }

                    const plDollars = Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100;
                    const profitPct = trade.credit > 0
                        ? Math.round(((trade.credit - currentClose) / trade.credit) * 1000) / 10
                        : null;

                    const hitTarget = profitPct !== null && profitPct >= PROFIT_TARGET_PCT;
                    const hitDte = dte <= MANAGE_DTE;

                    if (hitTarget || hitDte) {
                        const correct = plDollars > 0;
                        batch.update(tradesCollection(uid).doc(trade.id!), {
                            status: 'closed',
                            exitPl: plDollars,
                            exitDate: new Date().toISOString().split('T')[0],
                            closedBy: hitTarget ? 'target' : 'dte',
                            currentClose,
                            unrealizedPl: null,
                            profitPct,
                            correct,
                        });
                        realizedDelta += plDollars;
                        closedDelta++;
                        if (correct) winsDelta++; else lossesDelta++;
                        console.log(`[guvidPaperClose] CLOSED ${trade.id}: ${hitTarget ? 'target' : `${dte} DTE`}, P&L $${plDollars.toFixed(2)}`);
                    } else {
                        batch.update(tradesCollection(uid).doc(trade.id!), {
                            currentClose,
                            unrealizedPl: plDollars,
                            profitPct,
                        });
                        unrealizedTotal += plDollars;
                        stillOpen++;
                    }
                } catch (e) {
                    console.error(`[guvidPaperClose] Error processing ${trade.id}:`, e);
                }
            }
        }

        // Account update + daily equity snapshot in the SAME batch as the
        // trade updates — atomic, so realizedPl can never drift from the docs.
        const newRealized = Math.round((account.realizedPl + realizedDelta) * 100) / 100;
        if (closedDelta > 0) {
            batch.update(accountRef, {
                realizedPl: newRealized,
                wins: account.wins + winsDelta,
                losses: account.losses + lossesDelta,
                tradesClosed: account.tradesClosed + closedDelta,
                lastUpdated: new Date().toISOString(),
            });
        }

        const date = new Date().toISOString().split('T')[0];
        const equityPoint: IEquityPoint = {
            date,
            realizedPl: newRealized,
            unrealizedPl: Math.round(unrealizedTotal * 100) / 100,
            equity: Math.round((paperEquity({ ...account, realizedPl: newRealized }) + unrealizedTotal) * 100) / 100,
            openCount: stillOpen,
        };
        batch.set(equityCollection(uid).doc(date), equityPoint);

        await batch.commit();

        console.log(`[guvidPaperClose] Complete — closed ${closedDelta}, realized $${realizedDelta.toFixed(2)}, equity $${equityPoint.equity.toFixed(2)}`);
    },
);

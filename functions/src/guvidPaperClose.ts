// guvidPaperClose — Cloud Scheduler daily 3:00 PM ET (weekdays)
// Guvidelul ladder exits, ported from guvidel_book.py. Per rung, in PRIORITY
// order (the bot's house standard — several may trigger at once):
//   1. STOP:   buy-back debit ≥ 2× entry credit   (GUVIDEL_BOOK_STOP_MULT)
//   2. Target: profit ≥ 50% of credit             (GUVIDEL_BOOK_TARGET_PCT)
//   3. DTE:    ≤ 14 DTE                           (GUVIDEL_BOOK_EXIT_DTE)
// Portfolio stress rules:
//   - unrealized ≤ −20% NAV → close TESTED rungs (spot beyond a short strike)
//   - kill switch: equity 20% below its peak → close EVERYTHING
// Pricing integrity: a rung is only closed on live two-sided quotes; the exit
// debit takes a slippage haircut toward natural. No quotes → defer, never
// invent a P&L. All writes commit in ONE batch (account can't desync).

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getCredentialsForUser, CATALIN_UID } from './shared/credentials';
import { getAccessToken, getOptionsChain, getMarketDataSnapshot, getUnderlyingPrice } from './shared/tasty-rest-client';
import type { IOptionQuote } from './shared/tasty-rest-client';
import {
    GUVIDEL_BOOK_EXIT_DTE, GUVIDEL_BOOK_STOP_MULT, GUVIDEL_BOOK_TARGET_PCT,
    GUVIDEL_BOOK_KILL_DD, GUVIDEL_STRESS_TESTED_PCT, SLIPPAGE_PER_IC,
} from './shared/guvidel-rules';
import {
    daysUntilExpiration, equityCollection, getOpenPaperTrades, paperEquity, tradesCollection,
    type IEquityPoint, type IPaperAccount, type IPaperTrade,
} from './shared/paper-account';
import * as admin from 'firebase-admin';

type StrikeMap = Map<number, { call: string; put: string }>;
type ChainResult = Awaited<ReturnType<typeof getOptionsChain>>;

/** Streamer-symbol lookup for one expiration, searching ALL chain roots
 *  (SPX exposes SPX and SPXW; the expiration may not live under items[0]). */
function buildStrikeMap(chain: ChainResult, expDate: string): StrikeMap {
    const map: StrikeMap = new Map();
    for (const item of chain.items) {
        const exp = item.expirations.find((e) => e['expiration-date'] === expDate);
        if (!exp) continue;
        for (const s of exp.strikes) {
            map.set(parseFloat(s['strike-price']), {
                // TastyTrade symbols — the REST snapshot is keyed by them
                call: s.call,
                put: s.put,
            });
        }
        if (map.size > 0) break;
    }
    return map;
}

/** Mid cost to close (per share): short mids − long mids. Null when any leg
 *  lacks a two-sided quote or the trade isn't a complete 4-leg IC. */
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
        if (!q || q.bid <= 0 || q.ask <= 0) return null;
        total += (leg.type === 'STO' ? 1 : -1) * q.mid;
        legs++;
    }
    return legs === 4 ? total : null;
}

/** A rung is TESTED when spot has moved beyond one of its short strikes. */
function isTested(trade: IPaperTrade, spot: number | null): boolean {
    if (spot === null || spot <= 0) return false;
    const shortPut = trade.legs.find((l) => l.type === 'STO' && l.optionType === 'P')?.strike;
    const shortCall = trade.legs.find((l) => l.type === 'STO' && l.optionType === 'C')?.strike;
    return (shortPut !== undefined && spot < shortPut) || (shortCall !== undefined && spot > shortCall);
}

export const guvidPaperClose = onSchedule(
    {
        schedule: '0 15 * * 1-5', // 3:00 PM ET weekdays (the bot's exit pass)
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
        console.log(`[guvidPaperClose] ${openTrades.length} open rungs`);

        let realizedDelta = 0;
        let winsDelta = 0;
        let lossesDelta = 0;
        let closedDelta = 0;
        let unrealizedTotal = 0;
        let stillOpen = 0;

        const batch = admin.firestore().batch();

        // Group by ticker|expiration; fetch each ticker's chain + spot once
        const byExp = new Map<string, IPaperTrade[]>();
        for (const t of openTrades) {
            const k = `${t.ticker}|${t.expiration}`;
            if (!byExp.has(k)) byExp.set(k, []);
            byExp.get(k)!.push(t);
        }
        const chainCache = new Map<string, ChainResult | null>();
        const spotCache = new Map<string, number | null>();

        // ── Pass 1: mark every rung (currentClose, dte, tested) ─────────
        interface IMarkedRung {
            trade: IPaperTrade;
            currentClose: number | null;
            dte: number;
            tested: boolean;
        }
        const marked: IMarkedRung[] = [];

        for (const [key, trades] of byExp) {
            const [ticker, expDate] = key.split('|');

            if (!chainCache.has(ticker)) {
                try {
                    chainCache.set(ticker, await getOptionsChain(token, ticker));
                } catch (e) {
                    console.warn(`[guvidPaperClose] Chain fetch failed for ${ticker}:`, e);
                    chainCache.set(ticker, null);
                }
                spotCache.set(ticker, await getUnderlyingPrice(token, ticker));
            }
            const chain = chainCache.get(ticker) ?? null;
            const spot = spotCache.get(ticker) ?? null;
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
                marked.push({
                    trade,
                    currentClose: computeCurrentClose(trade, strikeMap, quotes),
                    dte: daysUntilExpiration(trade.expiration),
                    tested: isTested(trade, spot),
                });
            }
        }

        // ── Portfolio stress state ──────────────────────────────────────
        const markedUnrealized = marked.reduce((s, m) => {
            if (m.currentClose === null) return s + (m.trade.unrealizedPl ?? 0);
            return s + (m.trade.credit - m.currentClose) * 100 * m.trade.quantity;
        }, 0);
        const nav = paperEquity(account) + markedUnrealized;
        const peak = Math.max(account.peakEquity ?? account.startingCapital, nav);
        const drawdown = peak > 0 ? (peak - nav) / peak : 0;
        const killSwitch = drawdown >= GUVIDEL_BOOK_KILL_DD;
        const stressTested = nav > 0 && markedUnrealized / paperEquity(account) <= GUVIDEL_STRESS_TESTED_PCT;
        if (killSwitch) console.warn(`[guvidPaperClose] KILL SWITCH: drawdown ${(drawdown * 100).toFixed(1)}% ≥ ${GUVIDEL_BOOK_KILL_DD * 100}% — closing everything`);
        else if (stressTested) console.warn(`[guvidPaperClose] STRESS: unrealized ${(markedUnrealized).toFixed(0)} ≤ ${GUVIDEL_STRESS_TESTED_PCT * 100}% NAV — closing tested rungs`);

        // ── Pass 2: decide + write ──────────────────────────────────────
        for (const m of marked) {
            const { trade, currentClose, dte, tested } = m;
            try {
                if (currentClose === null) {
                    // No live two-sided quotes — never book a P&L we didn't observe.
                    console.warn(`[guvidPaperClose] ${trade.id}: no quotes (dte=${dte}) — deferring to next run`);
                    stillOpen++;
                    unrealizedTotal += trade.unrealizedPl ?? 0;
                    continue;
                }

                // Exit debit takes the slippage haircut toward natural
                const exitDebit = currentClose + SLIPPAGE_PER_IC;
                const plDollars = Math.round((trade.credit - exitDebit) * 100 * trade.quantity * 100) / 100;
                const profitPct = trade.credit > 0
                    ? Math.round(((trade.credit - exitDebit) / trade.credit) * 1000) / 10
                    : null;

                // Priority order: STOP → target → DTE (then portfolio stress rules)
                let closedBy: IPaperTrade['closedBy'] = null;
                if (exitDebit >= GUVIDEL_BOOK_STOP_MULT * trade.credit) closedBy = 'stop';
                else if (profitPct !== null && profitPct >= GUVIDEL_BOOK_TARGET_PCT) closedBy = 'target';
                else if (dte <= GUVIDEL_BOOK_EXIT_DTE) closedBy = 'dte';
                else if (killSwitch) closedBy = 'kill';
                else if (stressTested && tested) closedBy = 'stress';

                if (closedBy) {
                    const correct = plDollars > 0;
                    batch.update(tradesCollection(uid).doc(trade.id!), {
                        status: 'closed',
                        exitPl: plDollars,
                        exitDate: new Date().toISOString().split('T')[0],
                        closedBy,
                        currentClose,
                        unrealizedPl: null,
                        profitPct,
                        correct,
                    });
                    realizedDelta += plDollars;
                    closedDelta++;
                    if (correct) winsDelta++; else lossesDelta++;
                    console.log(`[guvidPaperClose] CLOSED ${trade.id}: ${closedBy} (dte=${dte}), P&L $${plDollars.toFixed(2)}`);
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

        // ── Account + equity snapshot, SAME batch (atomic) ──────────────
        const newRealized = Math.round((account.realizedPl + realizedDelta) * 100) / 100;
        const equityNow = Math.round((paperEquity({ ...account, realizedPl: newRealized }) + unrealizedTotal) * 100) / 100;
        const newPeak = Math.round(Math.max(account.peakEquity ?? account.startingCapital, equityNow) * 100) / 100;
        batch.update(accountRef, {
            ...(closedDelta > 0 ? {
                realizedPl: newRealized,
                wins: account.wins + winsDelta,
                losses: account.losses + lossesDelta,
                tradesClosed: account.tradesClosed + closedDelta,
            } : {}),
            peakEquity: newPeak,
            lastUpdated: new Date().toISOString(),
        });

        const date = new Date().toISOString().split('T')[0];
        const equityPoint: IEquityPoint = {
            date,
            realizedPl: newRealized,
            unrealizedPl: Math.round(unrealizedTotal * 100) / 100,
            equity: equityNow,
            openCount: stillOpen,
        };
        batch.set(equityCollection(uid).doc(date), equityPoint);

        await batch.commit();

        console.log(`[guvidPaperClose] Complete — closed ${closedDelta}, realized $${realizedDelta.toFixed(2)}, equity $${equityPoint.equity.toFixed(2)}, peak $${newPeak.toFixed(2)}`);
    },
);

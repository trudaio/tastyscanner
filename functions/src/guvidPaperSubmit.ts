// guvidPaperSubmit — Cloud Scheduler runs this daily at 10:30 AM ET (weekdays)
// Guvidelul ladder book (paper): ported from the Guvidul-Skew Discord bot
// (guvidel_book.py, spec 03-TASTYSCANNER-IC-RULES.md, commit f591a59).
//
// Entry rules, per ticker (QQQ has priority — it is the reference instrument;
// the bot's second name comes from its 2σ "fresh box" range scan, which has no
// server-side equivalent here, so SPX stands in as the second book name):
//   1. IVR ≥ 30 (true 52-week IVR from market-metrics)
//   2. 2σ move gate: skip if |yesterday c2c| or |today so far| > 2σ_daily(60)
//   3. Macro gate (FOMC/CPI) — NOT implemented server-side (no calendar source)
// Then open ONE new IC rung on EVERY expiration inside 21–45 DTE that wasn't
// already opened today, longest DTE first, 1 contract per rung:
//   short put ~0.18Δ, short call ~0.16Δ, longs ~$10 out (±50% tolerance),
//   skew tilt: relative 25Δ skew beyond ±30% doubles the expensive side's wing.
// Caps: Σ rung BP (width × 100) ≤ 80% of NAV; max 20 new rungs/day;
// stress pause: portfolio unrealized ≤ −10% NAV → no new rungs.
// Pricing integrity: two-sided quotes on all 4 legs, slippage haircut,
// credit plausibility invariant — no invented prices, ever.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getCredentialsForUser, CATALIN_UID } from './shared/credentials';
import {
    getAccessToken, getAccounts, getOptionsChain, getMarketDataSnapshot, getUnderlyingPrice, getAccountBalances, getIvRanks,
} from './shared/tasty-rest-client';
import { fetchDailyBarsWithRetry } from './shared/polygon-client';
import {
    buildRung, decideStructure, measureSkew25, twoSigmaGate,
    GUVIDEL_MIN_IVR, GUVIDEL_VOL_LOOKBACK, GUVIDEL_BOOK_DTE_MIN, GUVIDEL_BOOK_DTE_MAX,
    GUVIDEL_BOOK_QTY, GUVIDEL_BOOK_BP_CAP, GUVIDEL_MAX_RUNGS_PER_DAY, GUVIDEL_STRESS_PAUSE_PCT,
    GUVIDEL_BOOK_TARGET_PCT, GUVIDEL_BOOK_STOP_MULT, GUVIDEL_BOOK_EXIT_DTE,
    type IChainStrike,
} from './shared/guvidel-rules';
import {
    getOrCreatePaperAccount, getOpenPaperTrades, paperEquity,
    tradesCollection, updatePaperAccount, type IPaperTrade,
} from './shared/paper-account';
import type { IMarketContext } from './shared/types';

const polygonApiKey = defineSecret('POLYGON_API_KEY');

// QQQ first — it gets the buying power before the cap bites
const TICKERS: Array<'QQQ' | 'SPX'> = ['QQQ', 'SPX'];

export const guvidPaperSubmit = onSchedule(
    {
        schedule: '30 10 * * 1-5', // 10:30 AM ET weekdays
        timeZone: 'America/New_York',
        region: 'us-east1',
        secrets: [polygonApiKey],
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async () => {
        // Hardcoded owner uid — background jobs must never run on another
        // user's TastyTrade account (see shared/credentials.ts).
        const uid = CATALIN_UID;
        const date = new Date().toISOString().split('T')[0];
        console.log(`[guvidPaperSubmit] Guvidelul ladder starting, date=${date}`);

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

        // 3. Book state: NAV, BP usage, stress check
        const openTrades = await getOpenPaperTrades(uid);
        const unrealizedTotal = openTrades.reduce((s, t) => s + (t.unrealizedPl ?? 0), 0);
        const nav = paperEquity(account) + unrealizedTotal;
        let bpUsed = openTrades.reduce((s, t) => s + t.wings * 100 * t.quantity, 0);
        const bpCap = nav * GUVIDEL_BOOK_BP_CAP;
        console.log(`[guvidPaperSubmit] NAV $${nav.toFixed(2)}, BP used $${bpUsed.toFixed(0)} / cap $${bpCap.toFixed(0)}, open rungs ${openTrades.length}`);

        // Stress rule: unrealized P&L ≤ −10% NAV → stop opening new rungs
        if (nav > 0 && unrealizedTotal / nav <= GUVIDEL_STRESS_PAUSE_PCT) {
            console.warn(`[guvidPaperSubmit] STRESS PAUSE: unrealized $${unrealizedTotal.toFixed(0)} ≤ ${GUVIDEL_STRESS_PAUSE_PCT * 100}% of NAV — no new rungs today`);
            return;
        }

        // 4. Context: IVR per ticker + VIX (display only — the ladder gates on IVR, not VIX)
        const [ivRanks, vix] = await Promise.all([
            getIvRanks(token, TICKERS),
            getUnderlyingPrice(token, 'VIX'),
        ]);

        // Rungs already opened today (any status) — one rung per expiration per day
        const todaySnap = await tradesCollection(uid).where('openDate', '==', date).get();
        const openedToday = new Set(todaySnap.docs.map((d) => {
            const t = d.data() as IPaperTrade;
            return `${t.ticker}|${t.expiration}`;
        }));

        let rungsOpenedToday = 0;

        for (const ticker of TICKERS) {
            try {
                // Gate 1: IVR ≥ 30. Fail-safe: unknown IVR → skip (never trade blind)
                const ivr = ivRanks.get(ticker);
                if (ivr === undefined) {
                    console.warn(`[guvidPaperSubmit] ${ticker}: IVR unavailable — skipping (fail-safe)`);
                    continue;
                }
                if (ivr < GUVIDEL_MIN_IVR) {
                    console.log(`[guvidPaperSubmit] ${ticker}: IVR ${ivr.toFixed(1)} < ${GUVIDEL_MIN_IVR} — gate closed`);
                    continue;
                }

                const spot = await getUnderlyingPrice(token, ticker) ?? 0;
                if (!spot) {
                    console.warn(`[guvidPaperSubmit] ${ticker}: no spot price — skipping`);
                    continue;
                }

                // Gate 2: 2σ move gate (σ over 60 sessions from Polygon daily closes;
                // SPX uses SPY as proxy inside polygon-client — return σ is ~identical)
                try {
                    const bars = await fetchDailyBarsWithRetry(polygonApiKey.value(), ticker, GUVIDEL_VOL_LOOKBACK + 5);
                    const gate = twoSigmaGate(bars.map((b) => b.close), ticker === 'SPX' ? 0 : spot);
                    // NOTE: for SPX the spot is an index level vs SPY closes — today-so-far
                    // leg is skipped there (0), yesterday's c2c still applies via SPY.
                    if (gate.blocked) {
                        console.log(`[guvidPaperSubmit] ${ticker}: 2σ gate — ${gate.reason}`);
                        continue;
                    }
                    console.log(`[guvidPaperSubmit] ${ticker}: 2σ gate ok (${gate.reason})`);
                } catch (e) {
                    console.warn(`[guvidPaperSubmit] ${ticker}: Polygon bars unavailable — 2σ gate skipped:`, e);
                }

                // Gate 3 (macro FOMC/CPI) — no server-side calendar source; not enforced.

                const chain = await getOptionsChain(token, ticker);

                // Merge expirations across ALL chain roots (SPX lists SPX + SPXW),
                // dedupe by date, keep the root with more strikes.
                const expMap = new Map<string, { dte: number; strikes: IChainStrike[] }>();
                for (const item of chain.items) {
                    for (const exp of item.expirations) {
                        const dte = exp['days-to-expiration'];
                        if (dte < GUVIDEL_BOOK_DTE_MIN || dte > GUVIDEL_BOOK_DTE_MAX) continue;
                        // TastyTrade symbols (not streamer) — the REST snapshot is keyed by them
                        const strikes: IChainStrike[] = exp.strikes.map((s) => ({
                            strike: parseFloat(s['strike-price']),
                            callSymbol: s.call,
                            putSymbol: s.put,
                        }));
                        const existing = expMap.get(exp['expiration-date']);
                        if (!existing || strikes.length > existing.strikes.length) {
                            expMap.set(exp['expiration-date'], { dte, strikes });
                        }
                    }
                }

                // Longest DTE first — most theta runway gets the BP before the cap bites
                const ladder = [...expMap.entries()].sort((a, b) => b[1].dte - a[1].dte);
                console.log(`[guvidPaperSubmit] ${ticker}: ${ladder.length} expirations in ${GUVIDEL_BOOK_DTE_MIN}-${GUVIDEL_BOOK_DTE_MAX} DTE window, IVR ${ivr.toFixed(1)}`);

                for (const [expDate, { dte, strikes }] of ladder) {
                    try {
                        if (rungsOpenedToday >= GUVIDEL_MAX_RUNGS_PER_DAY) {
                            console.warn(`[guvidPaperSubmit] runaway breaker: ${GUVIDEL_MAX_RUNGS_PER_DAY} rungs today — stopping`);
                            return finish();
                        }
                        if (openedToday.has(`${ticker}|${expDate}`)) continue;

                        // Quote the strikes within ±10% of spot
                        const lo = spot * 0.90;
                        const hi = spot * 1.10;
                        const banded = strikes.filter((s) => s.strike >= lo && s.strike <= hi);
                        const symbols = banded.flatMap((s) => [s.callSymbol, s.putSymbol]);
                        if (symbols.length === 0) continue;
                        const quotes = await getMarketDataSnapshot(token, symbols);
                        if (quotes.size === 0) {
                            console.warn(`[guvidPaperSubmit] ${ticker} ${expDate}: no quotes — skipping (no invented prices)`);
                            continue;
                        }

                        // Skew → structure (wider wing on the expensive side)
                        const skew = measureSkew25(banded, quotes);
                        const structure = decideStructure(skew?.skewPct ?? null);

                        const { rung, reason } = buildRung(banded, quotes, spot, dte, structure);
                        if (!rung) {
                            console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: no rung — ${reason}`);
                            continue;
                        }

                        // BP cap: Σ rung BP ≤ 80% of NAV
                        const rungBp = rung.width * 100 * GUVIDEL_BOOK_QTY;
                        if (bpUsed + rungBp > bpCap) {
                            console.log(`[guvidPaperSubmit] ${ticker} ${expDate}: BP cap — used $${bpUsed.toFixed(0)} + $${rungBp} > $${bpCap.toFixed(0)}; ladder stops here`);
                            break; // shorter rungs won't fit either (same width scale) — next ticker
                        }

                        const qty = GUVIDEL_BOOK_QTY;
                        const maxProfit = Math.round(rung.credit * 100 * qty * 100) / 100;
                        const maxLoss = Math.round((rung.width - rung.credit) * 100 * qty * 100) / 100;
                        const marketContext: IMarketContext = {
                            underlyingPrice: spot,
                            vix: vix ?? 0,
                            ivRank: ivr,
                            technicals: null,
                        };

                        const skewNote = skew
                            ? `skew25 ${skew.skewPts >= 0 ? '+' : ''}${skew.skewPts.toFixed(1)}pts (${skew.classification}, ${skew.skewPct >= 0 ? '+' : ''}${skew.skewPct.toFixed(0)}%)`
                            : 'skew25 n/a';
                        const rationale =
                            `Guvidelul ladder rung: IVR ${ivr.toFixed(1)} ≥ ${GUVIDEL_MIN_IVR}; ${skewNote} → ${structure} wings $${rung.putWing}/$${rung.callWing}; ` +
                            `shorts ${rung.shortPut}p (Δ${rung.deltaShortPut.toFixed(2)}) / ${rung.shortCall}c (Δ${rung.deltaShortCall.toFixed(2)}); ` +
                            `credit $${rung.credit.toFixed(2)} after slippage; POP ${rung.pop.toFixed(1)}%; managed EV $${rung.ev.toFixed(2)}. ` +
                            `Management: TP ${GUVIDEL_BOOK_TARGET_PCT}% of credit / stop ${GUVIDEL_BOOK_STOP_MULT}× credit / exit ${GUVIDEL_BOOK_EXIT_DTE} DTE (priority STOP → target → DTE).`;

                        const tradeId = `${date}_${ticker}_${expDate}_${rung.shortPut}p${rung.shortCall}c`;
                        const paperTrade: Omit<IPaperTrade, 'id'> = {
                            ticker,
                            strategy: `IC ${rung.longPut}/${rung.shortPut}p ${rung.shortCall}/${rung.longCall}c`,
                            expiration: expDate,
                            legs: [
                                { type: 'BTO', optionType: 'P', strike: rung.longPut },
                                { type: 'STO', optionType: 'P', strike: rung.shortPut },
                                { type: 'STO', optionType: 'C', strike: rung.shortCall },
                                { type: 'BTO', optionType: 'C', strike: rung.longCall },
                            ],
                            credit: rung.credit,
                            quantity: qty,
                            wings: rung.width,
                            maxProfit,
                            maxLoss,
                            pop: rung.pop,
                            ev: rung.ev,
                            alpha: maxLoss > 0 ? Math.round((rung.ev / maxLoss) * 10000) / 100 : 0,
                            rr: Math.round((rung.width / rung.credit) * 100) / 100,
                            delta: Math.round(rung.deltaShortPut * 100) / 100,
                            theta: rung.thetaTotal,
                            exitPl: null, exitDate: null, closedBy: null, status: 'open',
                            rationale,
                            confidenceScore: 50,
                            rulesApplied: [
                                `guvidel_min_ivr_${GUVIDEL_MIN_IVR}`,
                                'guvidel_2sigma_gate',
                                `structure_${structure.toLowerCase().replace('-', '_')}`,
                                `wing_target_10_tol_50pct`,
                                'two_sided_quotes_all_legs',
                            ],
                            experimentVariant: null,
                            openDate: date,
                            dteAtEntry: dte,
                            marketContext,
                            currentClose: null,
                            unrealizedPl: null,
                            profitPct: null,
                            correct: null,
                            structure,
                            putWing: rung.putWing,
                            callWing: rung.callWing,
                            skewPts: skew?.skewPts ?? null,
                            skewPct: skew?.skewPct ?? null,
                        };

                        // .create() — a retry the same day must never overwrite a booked trade
                        try {
                            await tradesCollection(uid).doc(tradeId).create(paperTrade);
                        } catch (e) {
                            if ((e as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
                                console.log(`[guvidPaperSubmit] ${tradeId} already exists — skipping duplicate`);
                                continue;
                            }
                            throw e;
                        }
                        bpUsed += rungBp;
                        rungsOpenedToday++;
                        openedToday.add(`${ticker}|${expDate}`);
                        console.log(`[guvidPaperSubmit] RUNG ${tradeId}: ${paperTrade.strategy} x${qty} (${structure}), credit $${rung.credit}, width $${rung.width}, POP ${rung.pop}%`);
                    } catch (e) {
                        // One bad expiration must not discard the remaining rungs
                        console.error(`[guvidPaperSubmit] Error on ${ticker} ${expDate}:`, e);
                    }
                }
            } catch (e) {
                console.error(`[guvidPaperSubmit] Error processing ${ticker}:`, e);
            }
        }

        await finish();

        async function finish(): Promise<void> {
            if (rungsOpenedToday > 0) {
                await updatePaperAccount(uid, { tradesOpened: account!.tradesOpened + rungsOpenedToday });
            }
            console.log(`[guvidPaperSubmit] Complete — ${rungsOpenedToday} rungs opened`);
        }
    },
);

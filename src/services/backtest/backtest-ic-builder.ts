/**
 * Backtest Iron Condor Builder
 *
 * Port of src/models/strategies-builder.ts logic, operating on
 * IHistoricalExpiration data instead of live WebSocket data.
 *
 * Pure functions — no MobX, no services, no side effects.
 *
 * Reuses the same formulas from iron-condor.model.ts:
 * - Credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid
 * - MaxProfit = credit × 100
 * - MaxLoss = (wingsWidth - credit) × 100
 * - POP = 100 - max(putBreakEvenDelta, callBreakEvenDelta)
 * - EV = (pop/100 × maxProfit) - ((1-pop/100) × maxLoss)
 * - Alpha = (EV / maxLoss) × 100
 */

import type {
    IHistoricalExpiration,
    IHistoricalStrike,
    IHistoricalOption,
    IBacktestIronCondor,
} from './backtest-engine.interface';

// ─── Filter Config ───────────────────────────────────────────────────────────

export interface IBacktestFilters {
    minDelta: number;           // absolute delta % min
    maxDelta: number;           // absolute delta % max
    wings: number[];            // wing widths in $
    icType: 'symmetric' | 'bullish' | 'bearish';
    minPop: number;             // %
    minExpectedValue: number;   // $
    minAlpha: number;           // %
    minCredit: number;          // $ per share
    maxRiskRewardRatio: number;

    // Optional per-side delta overrides (asymmetric delta)
    putMinDelta?: number;       // overrides minDelta for put side
    putMaxDelta?: number;       // overrides maxDelta for put side
    callMinDelta?: number;      // overrides minDelta for call side
    callMaxDelta?: number;      // overrides maxDelta for call side
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStrikeByPrice(strikes: IHistoricalStrike[], target: number): IHistoricalStrike | undefined {
    return strikes.find(s => s.strikePrice === target);
}

function getStrikeBelow(strikes: IHistoricalStrike[], price: number): IHistoricalStrike | null {
    for (let i = strikes.length - 1; i >= 0; i--) {
        if (strikes[i].strikePrice < price) return strikes[i];
    }
    return null;
}

function getStrikeAbove(strikes: IHistoricalStrike[], price: number): IHistoricalStrike | null {
    for (let i = 0; i < strikes.length; i++) {
        if (strikes[i].strikePrice > price) return strikes[i];
    }
    return null;
}

/**
 * Calculate POP for an iron condor using break-even strike deltas.
 *
 * Break-even prices:
 * - Put side: stoPut.strike - credit
 * - Call side: stoCall.strike + credit
 *
 * Then find the delta at those break-even strikes and:
 * POP = 100 - max(putBE delta%, callBE delta%)
 */
function calculatePOP(
    stoPut: IHistoricalOption,
    stoCall: IHistoricalOption,
    credit: number,
    strikes: IHistoricalStrike[],
): number {
    const putBreakEven = stoPut.strikePrice - credit;
    const callBreakEven = stoCall.strikePrice + credit;

    // Find delta at break-even strikes
    const putBEStrike = getStrikeBelow(strikes, putBreakEven + 0.01);
    const callBEStrike = getStrikeAbove(strikes, callBreakEven - 0.01);

    const putBEDelta = putBEStrike ? putBEStrike.put.absoluteDeltaPercent : 0;
    const callBEDelta = callBEStrike ? callBEStrike.call.absoluteDeltaPercent : 0;

    return Math.max(0, 100 - Math.max(putBEDelta, callBEDelta));
}

// ─── IC Builder ──────────────────────────────────────────────────────────────

/**
 * Build iron condor candidates from a historical expiration chain.
 *
 * Logic matches strategies-builder.ts:
 * 1. Filter OTM puts and calls by delta range
 * 2. Pair by delta (symmetric/bullish/bearish)
 * 3. Apply wings to find protection legs
 * 4. Calculate metrics
 * 5. Filter by POP/EV/Alpha/Credit/R:R
 * 6. Sort by alpha descending
 */
export function buildBacktestIronCondors(
    expiration: IHistoricalExpiration,
    filters: IBacktestFilters,
    spotPrice: number,
): IBacktestIronCondor[] {
    const { strikes } = expiration;
    if (strikes.length < 4) return []; // Need at least 4 strikes

    // 1. Filter OTM puts (below spot) and calls (above spot) by delta
    //    Use per-side overrides if available (asymmetric delta)
    const putMinD = filters.putMinDelta ?? filters.minDelta;
    const putMaxD = filters.putMaxDelta ?? filters.maxDelta;
    const callMinD = filters.callMinDelta ?? filters.minDelta;
    const callMaxD = filters.callMaxDelta ?? filters.maxDelta;

    const otmPuts = strikes
        .filter(s =>
            s.strikePrice < spotPrice &&
            s.put.absoluteDeltaPercent >= putMinD &&
            s.put.absoluteDeltaPercent <= putMaxD
        );

    const otmCalls = strikes
        .filter(s =>
            s.strikePrice > spotPrice &&
            s.call.absoluteDeltaPercent >= callMinD &&
            s.call.absoluteDeltaPercent <= callMaxD
        );

    if (otmPuts.length === 0 || otmCalls.length === 0) return [];

    // 2. Delta pairing
    const deltaPairs: Array<{ putStrike: IHistoricalStrike; callStrike: IHistoricalStrike }> = [];

    if (filters.icType === 'symmetric') {
        // Match by index (closest delta pairs)
        const len = Math.min(otmPuts.length, otmCalls.length);
        for (let i = 0; i < len; i++) {
            deltaPairs.push({
                putStrike: otmPuts[otmPuts.length - 1 - i], // highest OTM puts first
                callStrike: otmCalls[i],                      // lowest OTM calls first
            });
        }
    } else if (filters.icType === 'bullish') {
        // All combos where putDelta - callDelta >= 5 (net positive delta)
        for (const put of otmPuts) {
            for (const call of otmCalls) {
                if (put.put.absoluteDeltaPercent - call.call.absoluteDeltaPercent >= 5) {
                    deltaPairs.push({ putStrike: put, callStrike: call });
                }
            }
        }
    } else {
        // bearish: All combos where callDelta - putDelta >= 5 (net negative delta)
        for (const put of otmPuts) {
            for (const call of otmCalls) {
                if (call.call.absoluteDeltaPercent - put.put.absoluteDeltaPercent >= 5) {
                    deltaPairs.push({ putStrike: put, callStrike: call });
                }
            }
        }
    }

    if (deltaPairs.length === 0) return [];

    // 3. For each delta pair × wing width, build the IC
    const results: IBacktestIronCondor[] = [];

    for (const pair of deltaPairs) {
        for (const wing of filters.wings) {
            // Wing asymmetry
            let putWing: number;
            let callWing: number;

            if (filters.icType === 'bullish') {
                // Wider put wing (more downside protection), narrower call wing (half-width, min $2.50)
                putWing = wing;
                callWing = Math.max(wing / 2, 2.5);
            } else if (filters.icType === 'bearish') {
                // Wider call wing (more upside protection), narrower put wing (half-width, min $2.50)
                putWing = Math.max(wing / 2, 2.5);
                callWing = wing;
            } else {
                putWing = wing;
                callWing = wing;
            }

            // Find protection legs
            const btoPutStrike = getStrikeByPrice(strikes, pair.putStrike.strikePrice - putWing);
            const btoCallStrike = getStrikeByPrice(strikes, pair.callStrike.strikePrice + callWing);

            if (!btoPutStrike || !btoCallStrike) continue;

            const btoPut = btoPutStrike.put;
            const stoPut = pair.putStrike.put;
            const stoCall = pair.callStrike.call;
            const btoCall = btoCallStrike.call;

            // Verify all prices are positive
            if (btoPut.midPrice <= 0 || stoPut.midPrice <= 0 ||
                stoCall.midPrice <= 0 || btoCall.midPrice <= 0) continue;

            // 4. Calculate metrics
            const credit = Math.round(
                (stoPut.midPrice + stoCall.midPrice - btoPut.midPrice - btoCall.midPrice) * 100
            ) / 100;

            if (credit <= 0) continue;
            if (credit < filters.minCredit) continue;

            const wingsWidth = Math.max(putWing, callWing);
            const maxProfit = Math.round(credit * 100 * 100) / 100;
            const maxLoss = Math.round((wingsWidth - credit) * 100 * 100) / 100;

            if (maxLoss <= 0) continue;

            const riskRewardRatio = Math.round((wingsWidth / credit) * 100) / 100;
            if (riskRewardRatio > filters.maxRiskRewardRatio) continue;

            const pop = calculatePOP(stoPut, stoCall, credit, strikes);
            if (pop < filters.minPop) continue;

            const popDecimal = pop / 100;
            const expectedValue = Math.round(
                (popDecimal * maxProfit - (1 - popDecimal) * maxLoss) * 100
            ) / 100;
            if (expectedValue < filters.minExpectedValue) continue;

            const alpha = maxLoss > 0
                ? Math.round((expectedValue / maxLoss) * 10000) / 100
                : 0;
            if (alpha < filters.minAlpha) continue;

            // Net delta and theta
            const delta = Math.round(
                (stoPut.delta + btoCall.delta - btoPut.delta - stoCall.delta) * 10000
            ) / 100;

            const theta = Math.round(
                (btoPut.theta + btoCall.theta - stoPut.theta - stoCall.theta) * 10000
            ) / 100;

            results.push({
                putBuyStrike: btoPut.strikePrice,
                putSellStrike: stoPut.strikePrice,
                callSellStrike: stoCall.strikePrice,
                callBuyStrike: btoCall.strikePrice,
                wingsWidth,
                credit,
                maxProfit,
                maxLoss,
                riskRewardRatio,
                pop,
                expectedValue,
                alpha,
                delta,
                theta,
                daysToExpiration: expiration.daysToExpiration,
                expirationDate: expiration.expirationDate,
                putBuyTicker: btoPutStrike.put.contractTicker,
                putSellTicker: pair.putStrike.put.contractTicker,
                callSellTicker: pair.callStrike.call.contractTicker,
                callBuyTicker: btoCallStrike.call.contractTicker,
            });
        }
    }

    // 5. Sort by alpha descending
    results.sort((a, b) => b.alpha - a.alpha);

    return results;
}

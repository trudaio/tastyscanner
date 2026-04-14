// Pure scenario computation — zero I/O.
// Estimates IC daily profit from underlying price path + theta decay proxy.

import type { IIronCondorTrade } from '../iron-condor-analytics/iron-condor-analytics.interface';
import type {
    IScenarioOutcome,
    ITradeScenarioResult,
    IScenarioStudySummary,
    IStrategySummary,
    IUnderlyingBar,
    ScenarioLabel,
} from './scenario-study.interface';

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

// ─── IC intrinsic at expiration ─────────────────────────────────────────────

/**
 * At expiration, IC value = intrinsic only (no extrinsic).
 * For a credit IC: profit = credit - max(put spread intrinsic, 0) - max(call spread intrinsic, 0).
 * Put spread intrinsic = max(putSell - underlying, 0) - max(putBuy - underlying, 0)
 * Call spread intrinsic = max(underlying - callSell, 0) - max(underlying - callBuy, 0)
 */
export function computeICIntrinsic(
    underlying: number,
    putBuy: number, putSell: number,
    callSell: number, callBuy: number,
): number {
    const putSpread = Math.max(putSell - underlying, 0) - Math.max(putBuy - underlying, 0);
    const callSpread = Math.max(underlying - callSell, 0) - Math.max(underlying - callBuy, 0);
    return putSpread + callSpread; // cost to close at expiration
}

// ─── Estimate daily IC value (proxy) ────────────────────────────────────────

/**
 * Approximate IC value (cost to close) at any point before expiration.
 *
 * Model: IC value decays with time (theta) but increases if underlying
 * approaches a short strike (gamma/delta risk).
 *
 * - Time decay: linear approximation, IC starts at `credit` and decays to `intrinsic` at expiry
 * - Proximity penalty: exponential increase as underlying nears short strike
 *
 * Returns estimated cost-to-close (lower = more profitable for seller).
 */
export function estimateICValue(
    credit: number,
    underlying: number,
    putBuy: number, putSell: number,
    callSell: number, callBuy: number,
    dteFraction: number, // 0 = at expiry, 1 = at open
): number {
    const wings = putSell - putBuy;
    const intrinsic = computeICIntrinsic(underlying, putBuy, putSell, callSell, callBuy);

    // Distance to nearest short strike (normalized by wings width)
    const distToPut = (underlying - putSell) / wings;
    const distToCall = (callSell - underlying) / wings;
    const minDist = Math.min(distToPut, distToCall);

    // If underlying is outside the IC range entirely, position is at/near max loss
    if (underlying <= putBuy || underlying >= callBuy) {
        return wings; // max loss scenario (cost to close = full wing width)
    }

    // Extrinsic value: decays with time, but inflates near short strikes
    // Theta decay is NON-LINEAR: slow early (first 2/3 of DTE), accelerates in last 1/3.
    // Model: extrinsic ∝ sqrt(dteFraction) — at 50% DTE remaining, ~71% extrinsic remains
    // (vs 50% with linear). At 25% DTE remaining, ~50% remains. At 10%, ~32%.
    const thetaDecay = Math.sqrt(clamp(dteFraction, 0, 1));
    const baseExtrinsic = credit * thetaDecay;

    // Proximity penalty: as we get closer to short strike, extrinsic balloons
    // minDist > 1 means safe (far from strikes), < 0.5 means danger zone
    let proximityMultiplier = 1.0;
    if (minDist < 0) {
        // Past a short strike but inside long strike
        proximityMultiplier = 2.0 + Math.abs(minDist) * 3;
    } else if (minDist < 0.5) {
        // Approaching short strike
        proximityMultiplier = 1.0 + (0.5 - minDist) * 2;
    }

    const estimatedExtrinsic = baseExtrinsic * proximityMultiplier;
    return Math.max(intrinsic, intrinsic + estimatedExtrinsic);
}

// ─── Scenario builders ──────────────────────────────────────────────────────

export function computeExpireScenario(
    trade: IIronCondorTrade,
    underlyingAtExpiry: number | null,
): IScenarioOutcome {
    // openCredit is in TOTAL DOLLARS (per-share × qty × 100 multiplier)
    // Convert to per-share for comparison with intrinsic (which is per-share)
    const qty = trade.quantity;
    const multiplier = qty * 100;
    const creditPerShare = trade.openCredit / multiplier;
    const daysHeld = daysBetween(trade.openDate, trade.expirationDate);

    if (underlyingAtExpiry === null) {
        // No data — assume expired worthless (OTM) as fallback
        return {
            label: 'expire', profit: trade.openCredit, profitPct: 100,
            daysHeld, targetReached: true, hitDate: null,
        };
    }

    const intrinsic = computeICIntrinsic(
        underlyingAtExpiry, trade.putBuyStrike, trade.putSellStrike,
        trade.callSellStrike, trade.callBuyStrike,
    );
    // P&L per share = credit per share - intrinsic, then scale back to total dollars
    const profitTotal = (creditPerShare - intrinsic) * multiplier;
    const profitPct = creditPerShare > 0 ? ((creditPerShare - intrinsic) / creditPerShare) * 100 : 0;
    return {
        label: 'expire',
        profit: Math.round(profitTotal * 100) / 100,
        profitPct: Math.round(profitPct * 100) / 100,
        daysHeld,
        targetReached: true, // expire always "reaches" — it's a terminal state
        hitDate: null,
    };
}

export function computeActualScenario(trade: IIronCondorTrade): IScenarioOutcome {
    // Both profit and openCredit are in total dollars — profitPct is simply their ratio
    const profit = trade.profit; // already = openCredit - closeDebit (total dollars)
    const profitPct = trade.openCredit > 0 ? (profit / trade.openCredit) * 100 : 0;
    const daysHeld = trade.closeDate
        ? daysBetween(trade.openDate, trade.closeDate)
        : daysBetween(trade.openDate, trade.expirationDate);
    return {
        label: 'actual',
        profit: Math.round(profit * 100) / 100,
        profitPct: Math.round(profitPct * 100) / 100,
        daysHeld,
        targetReached: true,
        hitDate: trade.closeDate ?? trade.expirationDate,
    };
}

export function findTargetScenario(
    trade: IIronCondorTrade,
    bars: IUnderlyingBar[],
    targetPct: number,
    label: ScenarioLabel,
): IScenarioOutcome {
    // openCredit is in TOTAL DOLLARS — normalize to per-share
    const qty = trade.quantity;
    const multiplier = qty * 100;
    const creditPerShare = trade.openCredit / multiplier;
    const totalDte = daysBetween(trade.openDate, trade.expirationDate);
    if (totalDte <= 0) {
        return { label, profit: 0, profitPct: 0, daysHeld: 0, targetReached: false, hitDate: null };
    }

    // Walk daily bars during trade's lifetime
    for (const bar of bars) {
        if (bar.date < trade.openDate) continue;
        if (bar.date > trade.expirationDate) break;

        const daysElapsed = daysBetween(trade.openDate, bar.date);
        const dteFraction = clamp(1 - daysElapsed / totalDte, 0, 1);

        const estValue = estimateICValue(
            creditPerShare, bar.close,
            trade.putBuyStrike, trade.putSellStrike,
            trade.callSellStrike, trade.callBuyStrike,
            dteFraction,
        );

        const estProfitPerShare = creditPerShare - estValue;
        const estProfitPct = creditPerShare > 0 ? (estProfitPerShare / creditPerShare) * 100 : 0;

        if (estProfitPct >= targetPct) {
            // Target hit — scale back to total dollars
            const profitTotal = estProfitPerShare * multiplier;
            return {
                label,
                profit: Math.round(profitTotal * 100) / 100,
                profitPct: Math.round(estProfitPct * 100) / 100,
                daysHeld: daysElapsed,
                targetReached: true,
                hitDate: bar.date,
            };
        }
    }

    // Target never hit — position held to expiration
    const lastBar = bars.find((b) => b.date >= trade.expirationDate)
        ?? bars[bars.length - 1];
    const expireIntrinsic = lastBar
        ? computeICIntrinsic(
            lastBar.close, trade.putBuyStrike, trade.putSellStrike,
            trade.callSellStrike, trade.callBuyStrike,
        )
        : 0;
    const expireProfitPerShare = creditPerShare - expireIntrinsic;
    const expireProfitTotal = expireProfitPerShare * multiplier;
    const expirePct = creditPerShare > 0 ? (expireProfitPerShare / creditPerShare) * 100 : 0;

    return {
        label,
        profit: Math.round(expireProfitTotal * 100) / 100,
        profitPct: Math.round(expirePct * 100) / 100,
        daysHeld: daysBetween(trade.openDate, trade.expirationDate),
        targetReached: false,
        hitDate: null,
    };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export function computeAllScenarios(
    trade: IIronCondorTrade,
    bars: IUnderlyingBar[],
): ITradeScenarioResult {
    const wings = trade.putSellStrike - trade.putBuyStrike;
    const multiplier = trade.quantity * 100;
    // openCredit is already total dollars — it IS maxProfit
    const maxProfit = trade.openCredit;
    const creditPerShare = trade.openCredit / multiplier;
    const maxLoss = (wings - creditPerShare) * multiplier;

    // Find underlying at expiration
    const expiryBar = bars.find((b) => b.date >= trade.expirationDate);
    const underlyingAtExpiry = expiryBar?.close ?? null;

    const actual = computeActualScenario(trade);
    const target75 = findTargetScenario(trade, bars, 75, 'target75');
    const target50 = findTargetScenario(trade, bars, 50, 'target50');
    const target25 = findTargetScenario(trade, bars, 25, 'target25');
    const expire = computeExpireScenario(trade, underlyingAtExpiry);

    const scenarios = { actual, target75, target50, target25, expire };

    // Best strategy = highest profit
    const all = [actual, target75, target50, target25, expire];
    const best = all.reduce((a, b) => a.profit > b.profit ? a : b);

    return {
        trade,
        maxProfit: Math.round(maxProfit * 100) / 100,
        maxLoss: Math.round(maxLoss * 100) / 100,
        wings,
        scenarios,
        bestStrategy: best.label,
    };
}

// ─── Summary aggregation ────────────────────────────────────────────────────

function summarizeStrategy(
    results: ITradeScenarioResult[],
    key: ScenarioLabel,
    label: string,
): IStrategySummary {
    let totalPL = 0;
    let wins = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalDays = 0;
    let targetsHit = 0;

    for (const r of results) {
        const s = r.scenarios[key];
        totalPL += s.profit;
        totalDays += s.daysHeld;
        if (s.profit > 0) { wins++; totalWins += s.profit; }
        else { totalLosses += Math.abs(s.profit); }
        if (s.targetReached) targetsHit++;
    }

    const n = results.length || 1;
    return {
        label,
        totalPL: Math.round(totalPL * 100) / 100,
        avgPL: Math.round((totalPL / n) * 100) / 100,
        winRate: Math.round((wins / n) * 10000) / 100,
        avgDaysHeld: Math.round(totalDays / n),
        profitFactor: totalLosses > 0 ? Math.round((totalWins / totalLosses) * 100) / 100 : totalWins > 0 ? Infinity : 0,
        targetHitRate: Math.round((targetsHit / n) * 10000) / 100,
        totalTrades: results.length,
    };
}

export function computeSummary(results: ITradeScenarioResult[]): IScenarioStudySummary {
    const strategies = {
        actual: summarizeStrategy(results, 'actual', 'Actual'),
        target75: summarizeStrategy(results, 'target75', '75% TP'),
        target50: summarizeStrategy(results, 'target50', '50% TP'),
        target25: summarizeStrategy(results, 'target25', '25% TP'),
        expire: summarizeStrategy(results, 'expire', 'Expire'),
    };

    const all = Object.entries(strategies) as [ScenarioLabel, IStrategySummary][];
    const best = all.reduce((a, b) => a[1].totalPL > b[1].totalPL ? a : b);

    return {
        totalTrades: results.length,
        strategies,
        bestOverall: best[0],
    };
}

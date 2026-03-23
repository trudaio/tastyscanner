/**
 * Backtest Engine — Core Simulation Loop
 *
 * Iterates day-by-day through historical data:
 * 1. Manage existing positions (check exit conditions)
 * 2. Enter new positions (build ICs, apply filters)
 * 3. Track equity, drawdown, and daily P&L
 *
 * Pure computation — no MobX, no side effects, no network calls.
 * All data must be pre-fetched and passed in.
 */

import type {
    IBacktestParams,
    IBacktestResults,
    IBacktestTrade,
    IOpenPosition,
    IEquityPoint,
    IDailyReturn,
    IMonthlyPL,
    ITickerPL,
    IPolygonStockBar,
    IPolygonOptionsContract,
    IPolygonOptionBar,
    IHistoricalChain,
    IBacktestScenarioResult,
    IBacktestBatchResults,
    ExitReason,
    ProgressCallback,
} from './backtest-engine.interface';
import type { IPreFetchedData } from './polygon-data-provider';
import { buildHistoricalChain } from './polygon-data-provider';
import { buildBacktestIronCondors, type IBacktestFilters } from './backtest-ic-builder';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA + 'T00:00:00Z');
    const b = new Date(dateB + 'T00:00:00Z');
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Look up the close price of a specific option contract on a given date.
 * Returns null if no data available.
 */
function getOptionClosePrice(
    contractTicker: string,
    date: string,
    optionBarLookup: Map<string, Map<string, IPolygonOptionBar>>,
): number | null {
    const dateMap = optionBarLookup.get(contractTicker);
    if (!dateMap) return null;
    const bar = dateMap.get(date);
    return bar ? bar.close : null;
}

/**
 * Price the IC at current market values.
 * Returns the net debit to close (sum of all 4 leg close prices with signs).
 * Positive = costs money to close (losing), negative = receive money (winning).
 */
function repriceIC(
    position: IOpenPosition,
    date: string,
    spotPrice: number,
    optionBarLookup: Map<string, Map<string, IPolygonOptionBar>>,
): number | null {
    const putBuyPrice = getOptionClosePrice(position.putBuyTicker, date, optionBarLookup);
    const putSellPrice = getOptionClosePrice(position.putSellTicker, date, optionBarLookup);
    const callSellPrice = getOptionClosePrice(position.callSellTicker, date, optionBarLookup);
    const callBuyPrice = getOptionClosePrice(position.callBuyTicker, date, optionBarLookup);

    // If any leg is missing, use intrinsic value fallback
    const pbp = putBuyPrice ?? Math.max(0, position.putBuyStrike - spotPrice);
    const psp = putSellPrice ?? Math.max(0, position.putSellStrike - spotPrice);
    const csp = callSellPrice ?? Math.max(0, spotPrice - position.callSellStrike);
    const cbp = callBuyPrice ?? Math.max(0, spotPrice - position.callBuyStrike);

    // Debit to close = buy back short legs - sell long legs
    // = (putSellPrice + callSellPrice) - (putBuyPrice + callBuyPrice)
    return Math.round((psp + csp - pbp - cbp) * 100) / 100;
}

/**
 * Settlement value at expiration (intrinsic values only).
 */
function settleIC(position: IOpenPosition, spotPrice: number): number {
    const putBuyIntrinsic = Math.max(0, position.putBuyStrike - spotPrice);
    const putSellIntrinsic = Math.max(0, position.putSellStrike - spotPrice);
    const callSellIntrinsic = Math.max(0, spotPrice - position.callSellStrike);
    const callBuyIntrinsic = Math.max(0, spotPrice - position.callBuyStrike);

    // Debit at settlement = short legs intrinsic - long legs intrinsic
    return Math.round((putSellIntrinsic + callSellIntrinsic - putBuyIntrinsic - callBuyIntrinsic) * 100) / 100;
}

// ─── Risk Metrics Calculation ────────────────────────────────────────────────

function calculateSharpeRatio(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (mean / stdDev) * Math.sqrt(252); // Annualized
}

function calculateSortinoRatio(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const downsideReturns = dailyReturns.filter(r => r < 0);
    if (downsideReturns.length === 0) return mean > 0 ? Infinity : 0;
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / downsideReturns.length;
    const downsideDev = Math.sqrt(downsideVariance);
    if (downsideDev === 0) return 0;
    return (mean / downsideDev) * Math.sqrt(252);
}

function calculateKellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss === 0 || avgWin === 0) return 0;
    const w = winRate / 100;
    const b = avgWin / Math.abs(avgLoss); // win/loss ratio
    return Math.max(0, w - (1 - w) / b);
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export function runBacktestEngine(
    params: IBacktestParams,
    data: IPreFetchedData,
    onProgress?: ProgressCallback,
): IBacktestResults {
    const startTime = Date.now();

    // Build stock bar lookup: ticker → date → bar
    const stockBarLookup = new Map<string, Map<string, IPolygonStockBar>>();
    for (const [ticker, bars] of data.stockBars) {
        const dateMap = new Map<string, IPolygonStockBar>();
        for (const bar of bars) {
            dateMap.set(bar.date, bar);
        }
        stockBarLookup.set(ticker, dateMap);
    }

    // IC filter config
    const deltaMargin = 4;
    const filters: IBacktestFilters = {
        minDelta: params.minDelta,
        maxDelta: params.maxDelta,
        wings: params.wings,
        icType: params.icType,
        minPop: params.minPop,
        minExpectedValue: params.minExpectedValue,
        minAlpha: params.minAlpha,
        minCredit: params.minCredit,
        maxRiskRewardRatio: params.maxRiskRewardRatio,
        // Per-side delta overrides for asymmetric delta
        ...(params.putTargetDelta != null ? {
            putMinDelta: Math.max(1, params.putTargetDelta - deltaMargin),
            putMaxDelta: params.putTargetDelta + deltaMargin,
        } : {}),
        ...(params.callTargetDelta != null ? {
            callMinDelta: Math.max(1, params.callTargetDelta - deltaMargin),
            callMaxDelta: params.callTargetDelta + deltaMargin,
        } : {}),
    };

    const isFillAll = params.ladderingMode === 'fill-all';
    const contracts = params.contractsPerPosition ?? 1;

    // Simulation state
    let capital = params.initialCapital;
    let nextTradeId = 1;
    const openPositions: IOpenPosition[] = [];
    const completedTrades: IBacktestTrade[] = [];
    const equityCurve: IEquityPoint[] = [];
    const dailyReturns: IDailyReturn[] = [];
    const dailyPctReturns: number[] = [];
    let peakEquity = capital;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let cumulativePL = 0;
    let prevEquity = capital;
    let cancelled = false;

    // Filter trading days within range
    const tradingDays = data.tradingDays.filter(
        d => d >= params.startDate && d <= params.endDate
    );

    // ─── Daily Loop ──────────────────────────────────────────────────────

    for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
        if (cancelled) break;

        const today = tradingDays[dayIdx];

        // Skip excluded dates
        if (params.excludedDates?.includes(today)) continue;

        // Progress update every 5 days
        if (dayIdx % 5 === 0) {
            onProgress?.({
                percent: 50 + Math.round((dayIdx / tradingDays.length) * 50),
                message: `Simulating day ${dayIdx + 1}/${tradingDays.length} (${today})...`,
            });
        }

        // Get spot prices for all tickers
        const spotPrices = new Map<string, number>();
        for (const ticker of params.tickers) {
            const bar = stockBarLookup.get(ticker)?.get(today);
            if (bar) spotPrices.set(ticker, bar.close);
        }

        let dailyPL = 0;

        // ─── 1. MANAGE EXISTING POSITIONS ────────────────────────────────

        const positionsToClose: Array<{ idx: number; exitDebit: number; reason: ExitReason }> = [];

        for (let i = openPositions.length - 1; i >= 0; i--) {
            const pos = openPositions[i];
            const spotPrice = spotPrices.get(pos.ticker);
            if (!spotPrice) continue;

            const remainingDTE = daysBetween(today, pos.expirationDate);

            // Check expiration
            if (remainingDTE <= 0 || today >= pos.expirationDate) {
                const exitDebit = settleIC(pos, spotPrice);
                positionsToClose.push({ idx: i, exitDebit, reason: 'expiration' });
                continue;
            }

            // Reprice
            const currentDebit = repriceIC(pos, today, spotPrice, data.optionBarLookup);
            if (currentDebit === null) continue;

            // Profit target: IC value dropped enough
            // Credit received - current debit = unrealized profit per share
            // Close when unrealized profit ≥ profitTargetPct% of max profit
            const unrealizedProfitPerShare = pos.entryCredit - currentDebit;
            const profitThreshold = pos.entryCredit * (params.profitTargetPct / 100);
            if (unrealizedProfitPerShare >= profitThreshold) {
                positionsToClose.push({ idx: i, exitDebit: currentDebit, reason: 'profit_target' });
                continue;
            }

            // Stop loss: IC value increased too much
            const maxLossPerShare = pos.maxLoss / 100;
            const unrealizedLossPerShare = currentDebit - pos.entryCredit;
            const stopLossThreshold = maxLossPerShare * (params.stopLossPct / 100);
            if (unrealizedLossPerShare >= stopLossThreshold) {
                positionsToClose.push({ idx: i, exitDebit: currentDebit, reason: 'stop_loss' });
                continue;
            }

            // DTE close
            if (remainingDTE <= params.closeDTE) {
                positionsToClose.push({ idx: i, exitDebit: currentDebit, reason: 'dte_close' });
            }
        }

        // Close positions (iterate in reverse to avoid index shifting)
        positionsToClose.sort((a, b) => b.idx - a.idx);
        for (const { idx, exitDebit, reason } of positionsToClose) {
            const pos = openPositions[idx];
            const pnlPerShare = pos.entryCredit - exitDebit;
            const pnlPerContract = Math.round(pnlPerShare * 100 * 100) / 100; // × 100 multiplier
            const commissions = params.commissionPerContract * 4 * 2 * contracts; // 4 legs × 2 (open + close) × contracts
            const slippageTotal = params.slippage * 4 * 2 * 100 * contracts; // 4 legs × 2 × multiplier × contracts
            const netPnl = Math.round((pnlPerContract * contracts - commissions - slippageTotal) * 100) / 100;

            capital += netPnl;
            dailyPL += netPnl;
            cumulativePL += netPnl;

            completedTrades.push({
                id: pos.id,
                ticker: pos.ticker,
                entryDate: pos.entryDate,
                exitDate: today,
                exitReason: reason,
                putBuyStrike: pos.putBuyStrike,
                putSellStrike: pos.putSellStrike,
                callSellStrike: pos.callSellStrike,
                callBuyStrike: pos.callBuyStrike,
                entryCredit: pos.entryCredit,
                exitDebit,
                pnl: netPnl,
                maxProfit: pos.maxProfit,
                maxLoss: pos.maxLoss,
                daysHeld: daysBetween(pos.entryDate, today),
                entryDTE: pos.entryDTE,
                entryAlpha: pos.entryAlpha,
                entryPOP: pos.entryPOP,
            });

            openPositions.splice(idx, 1);
        }

        // ─── 2. ENTRY (if capacity available) ────────────────────────────

        const capacityAvailable = isFillAll || openPositions.length < params.maxOpenPositions;

        if (capacityAvailable) {
            for (const ticker of params.tickers) {
                if (!isFillAll && openPositions.length >= params.maxOpenPositions) break;

                const spotPrice = spotPrices.get(ticker);
                if (!spotPrice) continue;

                // Check position limit per capital
                const maxRiskPerTrade = capital * (params.maxPositionPct / 100);

                // Build chain for today
                const tickerContracts = data.contracts.get(ticker) || [];
                const chain = buildHistoricalChain(
                    today,
                    spotPrice,
                    tickerContracts,
                    data.optionBarLookup,
                    params.riskFreeRate,
                    params.minDTE,
                    params.maxDTE,
                );

                // Try each expiration
                for (const exp of chain.expirations) {
                    if (!isFillAll && openPositions.length >= params.maxOpenPositions) break;

                    // Check we don't already have a position for this ticker+expiration
                    const alreadyHas = openPositions.some(
                        p => p.ticker === ticker && p.expirationDate === exp.expirationDate
                    );
                    if (alreadyHas) continue;

                    const candidates = buildBacktestIronCondors(exp, filters, spotPrice);
                    if (candidates.length === 0) continue;

                    // Take the best candidate (highest alpha)
                    const best = candidates[0];

                    // Check risk limit (scaled by contracts)
                    if (!isFillAll && best.maxLoss * contracts > maxRiskPerTrade) continue;

                    // In fill-all mode: enforce aggregate capital-at-risk cap
                    if (isFillAll) {
                        const maxTotalRiskPct = params.maxTotalRiskPct ?? (params.maxPositionPct * params.maxOpenPositions);
                        const maxTotalRisk = capital * (maxTotalRiskPct / 100);
                        const totalExistingRisk = openPositions.reduce((sum, p) => sum + p.maxLoss * contracts, 0);
                        if (totalExistingRisk + best.maxLoss * contracts > maxTotalRisk) continue;
                    }

                    // Open position
                    openPositions.push({
                        id: nextTradeId++,
                        ticker,
                        entryDate: today,
                        expirationDate: best.expirationDate,
                        putBuyStrike: best.putBuyStrike,
                        putSellStrike: best.putSellStrike,
                        callSellStrike: best.callSellStrike,
                        callBuyStrike: best.callBuyStrike,
                        putBuyTicker: best.putBuyTicker,
                        putSellTicker: best.putSellTicker,
                        callSellTicker: best.callSellTicker,
                        callBuyTicker: best.callBuyTicker,
                        entryCredit: best.credit,
                        maxProfit: best.maxProfit,
                        maxLoss: best.maxLoss,
                        entryAlpha: best.alpha,
                        entryPOP: best.pop,
                        entryDTE: best.daysToExpiration,
                    });

                    // In single mode: only one IC per ticker per day
                    if (!isFillAll) break;
                    // In fill-all mode: continue to next expiration
                }
            }
        }

        // ─── 3. TRACK METRICS ────────────────────────────────────────────

        // Calculate unrealized P&L for open positions
        let unrealizedPL = 0;
        for (const pos of openPositions) {
            const spotPrice = spotPrices.get(pos.ticker);
            if (!spotPrice) continue;
            const currentDebit = repriceIC(pos, today, spotPrice, data.optionBarLookup);
            if (currentDebit !== null) {
                unrealizedPL += (pos.entryCredit - currentDebit) * 100 * contracts; // per contract × N
            }
        }

        const equity = capital + unrealizedPL;
        peakEquity = Math.max(peakEquity, equity);
        const drawdown = peakEquity - equity;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        if (peakEquity > 0) {
            maxDrawdownPct = Math.max(maxDrawdownPct, (drawdown / peakEquity) * 100);
        }

        const dailyReturn = equity - prevEquity;
        const dailyPctReturn = prevEquity > 0 ? dailyReturn / prevEquity : 0;
        dailyPctReturns.push(dailyPctReturn);

        equityCurve.push({ date: today, equity: Math.round(equity * 100) / 100, drawdown: Math.round(drawdown * 100) / 100 });
        dailyReturns.push({
            date: today,
            pnl: Math.round(dailyReturn * 100) / 100,
            pctReturn: Math.round(dailyPctReturn * 10000) / 10000,
            cumulativePL: Math.round(cumulativePL * 100) / 100,
        });

        prevEquity = equity;
    }

    // ─── Compute Summary Metrics ─────────────────────────────────────────

    const profitableTrades = completedTrades.filter(t => t.pnl > 0);
    const losingTrades = completedTrades.filter(t => t.pnl <= 0);
    const totalTrades = completedTrades.length;
    const winRate = totalTrades > 0 ? Math.round((profitableTrades.length / totalTrades) * 10000) / 100 : 0;

    const totalPL = Math.round(completedTrades.reduce((sum, t) => sum + t.pnl, 0) * 100) / 100;
    const averagePL = totalTrades > 0 ? Math.round((totalPL / totalTrades) * 100) / 100 : 0;
    const largestWin = profitableTrades.length > 0 ? Math.max(...profitableTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

    const totalWins = profitableTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? Math.round((totalWins / totalLosses) * 100) / 100 : totalWins > 0 ? Infinity : 0;

    const avgWin = profitableTrades.length > 0 ? totalWins / profitableTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

    const sharpeRatio = Math.round(calculateSharpeRatio(dailyPctReturns) * 100) / 100;
    const sortinoRatio = Math.round(calculateSortinoRatio(dailyPctReturns) * 100) / 100;
    const annualizedReturn = tradingDays.length > 0
        ? (cumulativePL / params.initialCapital) * (252 / tradingDays.length)
        : 0;
    const calmarRatio = maxDrawdownPct > 0
        ? Math.round((annualizedReturn * 100 / maxDrawdownPct) * 100) / 100
        : 0;
    const kellyFraction = Math.round(calculateKellyFraction(winRate, avgWin, avgLoss) * 10000) / 100;

    // ─── Monthly Breakdown ───────────────────────────────────────────────

    const monthlyMap = new Map<string, { trades: number; wins: number; losses: number; totalPL: number }>();
    for (const t of completedTrades) {
        const month = t.exitDate.substring(0, 7); // YYYY-MM
        if (!monthlyMap.has(month)) {
            monthlyMap.set(month, { trades: 0, wins: 0, losses: 0, totalPL: 0 });
        }
        const m = monthlyMap.get(month)!;
        m.trades++;
        if (t.pnl > 0) m.wins++;
        else m.losses++;
        m.totalPL += t.pnl;
    }

    const monthlyBreakdown: IMonthlyPL[] = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
            month,
            trades: data.trades,
            wins: data.wins,
            losses: data.losses,
            winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
            totalPL: Math.round(data.totalPL * 100) / 100,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

    // ─── Ticker Breakdown ────────────────────────────────────────────────

    const tickerMap = new Map<string, { trades: number; wins: number; losses: number; totalPL: number }>();
    for (const t of completedTrades) {
        if (!tickerMap.has(t.ticker)) {
            tickerMap.set(t.ticker, { trades: 0, wins: 0, losses: 0, totalPL: 0 });
        }
        const d = tickerMap.get(t.ticker)!;
        d.trades++;
        if (t.pnl > 0) d.wins++;
        else d.losses++;
        d.totalPL += t.pnl;
    }

    const tickerBreakdown: ITickerPL[] = Array.from(tickerMap.entries())
        .map(([ticker, data]) => ({
            ticker,
            trades: data.trades,
            wins: data.wins,
            losses: data.losses,
            winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
            totalPL: Math.round(data.totalPL * 100) / 100,
            averagePL: data.trades > 0 ? Math.round((data.totalPL / data.trades) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.totalPL - a.totalPL);

    // ─── Results ─────────────────────────────────────────────────────────

    return {
        totalTrades,
        profitableTrades: profitableTrades.length,
        losingTrades: losingTrades.length,
        winRate,
        totalPL,
        averagePL,
        largestWin,
        largestLoss,
        profitFactor,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
        sharpeRatio,
        sortinoRatio,
        calmarRatio,
        kellyFraction,
        equityCurve,
        dailyReturns,
        monthlyBreakdown,
        tickerBreakdown,
        trades: completedTrades,
        params,
        executionTimeMs: Date.now() - startTime,
    };
}

// ─── Batch Runner ───────────────────────────────────────────────────────────

/**
 * Run multiple backtest scenarios with different profit targets.
 * Data is fetched ONCE and shared across all runs.
 */
export function runBatchBacktest(
    params: IBacktestParams,
    data: IPreFetchedData,
    profitTargets: number[],
    onProgress?: ProgressCallback,
): IBacktestBatchResults {
    const startTime = Date.now();
    const scenarios: IBacktestScenarioResult[] = [];

    for (let i = 0; i < profitTargets.length; i++) {
        const tp = profitTargets[i];
        const label = tp >= 9999 ? 'Expire' : `TP ${tp}%`;

        onProgress?.({
            percent: 50 + Math.round(((i + 0.5) / profitTargets.length) * 50),
            message: `Running scenario ${i + 1}/${profitTargets.length}: ${label}...`,
        });

        const scenarioParams: IBacktestParams = {
            ...params,
            profitTargetPct: tp,
            batchProfitTargets: undefined, // prevent recursive batch
        };

        const results = runBacktestEngine(scenarioParams, data);

        scenarios.push({ label, profitTargetPct: tp, results });
    }

    return {
        scenarios,
        params,
        executionTimeMs: Date.now() - startTime,
    };
}

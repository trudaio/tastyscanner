/**
 * Backtest Engine — Interfaces & Types
 *
 * All data structures used by the backtest system:
 * - Parameters (input config)
 * - Results (output metrics)
 * - Trade records
 * - Historical chain data
 * - Polygon API response types
 */

// ─── Polygon API Types (normalized from proxy) ──────────────────────────────

export interface IPolygonStockBar {
    date: string;       // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface IPolygonOptionsContract {
    ticker: string;             // e.g., "O:SPY250620C00550000"
    underlyingTicker: string;
    contractType: 'call' | 'put';
    strikePrice: number;
    expirationDate: string;     // YYYY-MM-DD
}

export interface IPolygonOptionBar {
    date: string;       // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// ─── Reconstructed Historical Chain ──────────────────────────────────────────

export interface IHistoricalOption {
    contractTicker: string;
    type: 'call' | 'put';
    strikePrice: number;
    // Real market data from Polygon
    closePrice: number;
    volume: number;
    // Derived via Black-Scholes from closePrice
    impliedVolatility: number;
    delta: number;                  // raw delta (-1 to 1)
    absoluteDeltaPercent: number;   // |delta| * 100
    gamma: number;
    theta: number;                  // per calendar day
    vega: number;                   // per 1% vol change
    // Simulated bid/ask from close ± spread
    bidPrice: number;
    askPrice: number;
    midPrice: number;               // = closePrice
}

export interface IHistoricalStrike {
    strikePrice: number;
    call: IHistoricalOption;
    put: IHistoricalOption;
}

export interface IHistoricalExpiration {
    expirationDate: string;
    daysToExpiration: number;
    strikes: IHistoricalStrike[];
}

export interface IHistoricalChain {
    date: string;
    spotPrice: number;
    expirations: IHistoricalExpiration[];
}

// ─── Backtest Iron Condor (candidate for entry) ─────────────────────────────

export interface IBacktestIronCondor {
    // Leg strikes
    putBuyStrike: number;       // long put (lowest)
    putSellStrike: number;      // short put
    callSellStrike: number;     // short call
    callBuyStrike: number;      // long call (highest)
    wingsWidth: number;         // max(putWing, callWing)

    // Pricing
    credit: number;             // net credit per share
    maxProfit: number;          // credit × 100 (per contract $)
    maxLoss: number;            // (width - credit) × 100 (per contract $)
    riskRewardRatio: number;    // width / credit

    // Edge metrics
    pop: number;                // probability of profit (%)
    expectedValue: number;      // $ per contract
    alpha: number;              // (EV / maxLoss) × 100

    // Greeks
    delta: number;              // net delta (2 decimals)
    theta: number;              // net theta (2 decimals)

    // Expiration
    daysToExpiration: number;
    expirationDate: string;

    // Contract tickers for tracking
    putBuyTicker: string;
    putSellTicker: string;
    callSellTicker: string;
    callBuyTicker: string;
}

// ─── Backtest Parameters ─────────────────────────────────────────────────────

export interface IBacktestParams {
    // Universe
    tickers: string[];
    startDate: string;              // YYYY-MM-DD
    endDate: string;                // YYYY-MM-DD

    // Capital
    initialCapital: number;         // e.g., 100000
    maxPositionPct: number;         // max % of capital per trade (default: 5)
    maxOpenPositions: number;       // max concurrent ICs (default: 10)

    // IC Strategy Filters
    minDelta: number;               // absolute delta % min (e.g., 10)
    maxDelta: number;               // absolute delta % max (e.g., 20)
    wings: number[];                // wing widths in $ (e.g., [5, 10])
    icType: 'symmetric' | 'bullish' | 'bearish';
    minPop: number;                 // min probability of profit %
    minExpectedValue: number;       // min EV $
    minAlpha: number;               // min alpha %
    minCredit: number;              // min credit per share $
    maxRiskRewardRatio: number;     // max risk/reward

    // Expiration filters
    minDTE: number;                 // e.g., 30
    maxDTE: number;                 // e.g., 60

    // Exit rules
    profitTargetPct: number;        // close at X% of max profit (default: 75)
    stopLossPct: number;            // close at X% of max loss (default: 200 = 2x credit)
    closeDTE: number;               // close at N DTE (default: 21)

    // Simulation parameters
    riskFreeRate: number;           // annual (default: 0.05)
    slippage: number;               // $ per share (default: 0.02)
    commissionPerContract: number;  // $ per contract (default: 1.00)

    // Asymmetric delta (when set, overrides minDelta/maxDelta per side)
    putTargetDelta?: number;        // e.g., 20 — target delta for put side
    callTargetDelta?: number;       // e.g., 15 — target delta for call side

    // Laddering mode
    ladderingMode?: 'single' | 'fill-all';  // default: 'single' (current behavior)
    contractsPerPosition?: number;           // default: 1

    // Batch mode — run multiple profit target scenarios
    batchProfitTargets?: number[];  // e.g., [9999, 70, 85, 90]

    // Metadata
    description?: string;           // optional test name
    excludedDates?: string[];       // YYYY-MM-DD dates to skip
}

export const DEFAULT_BACKTEST_PARAMS: IBacktestParams = {
    tickers: ['SPY'],
    startDate: '',
    endDate: '',
    initialCapital: 100000,
    maxPositionPct: 5,
    maxOpenPositions: 10,
    minDelta: 10,
    maxDelta: 20,
    wings: [5],
    icType: 'symmetric',
    minPop: 60,
    minExpectedValue: 0,
    minAlpha: 0,
    minCredit: 1.00,
    maxRiskRewardRatio: 5,
    minDTE: 30,
    maxDTE: 60,
    profitTargetPct: 75,
    stopLossPct: 200,
    closeDTE: 21,
    riskFreeRate: 0.05,
    slippage: 0.02,
    commissionPerContract: 1.00,
};

// ─── Open Position (tracked during simulation) ──────────────────────────────

export interface IOpenPosition {
    id: number;
    ticker: string;
    entryDate: string;
    expirationDate: string;

    // Strikes
    putBuyStrike: number;
    putSellStrike: number;
    callSellStrike: number;
    callBuyStrike: number;

    // Contract tickers for price lookups
    putBuyTicker: string;
    putSellTicker: string;
    callSellTicker: string;
    callBuyTicker: string;

    // Entry metrics
    entryCredit: number;        // per share
    maxProfit: number;          // per contract $
    maxLoss: number;            // per contract $
    entryAlpha: number;
    entryPOP: number;
    entryDTE: number;
}

// ─── Trade Record (completed) ────────────────────────────────────────────────

export type ExitReason = 'profit_target' | 'stop_loss' | 'dte_close' | 'expiration';

export interface IBacktestTrade {
    id: number;
    ticker: string;
    entryDate: string;
    exitDate: string;
    exitReason: ExitReason;

    // Strikes
    putBuyStrike: number;
    putSellStrike: number;
    callSellStrike: number;
    callBuyStrike: number;

    // Financials
    entryCredit: number;        // per share
    exitDebit: number;          // per share
    pnl: number;                // after commissions, per contract $
    maxProfit: number;          // per contract $
    maxLoss: number;            // per contract $

    // Stats
    daysHeld: number;
    entryDTE: number;
    entryAlpha: number;
    entryPOP: number;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface IEquityPoint {
    date: string;
    equity: number;
    drawdown: number;           // $ below peak
}

export interface IDailyReturn {
    date: string;
    pnl: number;                // $ change
    pctReturn: number;          // % change
    cumulativePL: number;       // $ total P&L
}

export interface IMonthlyPL {
    month: string;              // YYYY-MM
    trades: number;
    wins: number;
    losses: number;
    winRate: number;            // %
    totalPL: number;            // $
}

export interface ITickerPL {
    ticker: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;            // %
    totalPL: number;            // $
    averagePL: number;          // $
}

export interface IBacktestResults {
    // Summary
    totalTrades: number;
    profitableTrades: number;
    losingTrades: number;
    winRate: number;                    // %

    // P&L
    totalPL: number;                    // $
    averagePL: number;                  // $ per trade
    largestWin: number;                 // $
    largestLoss: number;                // $ (negative)
    profitFactor: number;               // totalWins / |totalLosses|

    // Risk metrics
    maxDrawdown: number;                // $ from peak
    maxDrawdownPct: number;             // % from peak
    sharpeRatio: number;                // annualized
    sortinoRatio: number;              // downside-only vol
    calmarRatio: number;               // annualized return / max drawdown
    kellyFraction: number;              // optimal bet fraction

    // Time series
    equityCurve: IEquityPoint[];
    dailyReturns: IDailyReturn[];
    monthlyBreakdown: IMonthlyPL[];
    tickerBreakdown: ITickerPL[];

    // Trades
    trades: IBacktestTrade[];

    // Meta
    params: IBacktestParams;
    executionTimeMs: number;
}

// ─── Batch Backtest Results ──────────────────────────────────────────────

export interface IBacktestScenarioResult {
    label: string;              // e.g., "TP 70%" or "Expire"
    profitTargetPct: number;
    results: IBacktestResults;
}

export interface IBacktestBatchResults {
    scenarios: IBacktestScenarioResult[];
    params: IBacktestParams;    // shared base params
    executionTimeMs: number;
}

// ─── Saved Backtest Types (re-export for convenience) ────────────────────

export type { ISavedBacktestSummary, ISavedBacktest } from './backtest-saved.interface';
import type { ISavedBacktestSummary, ISavedBacktest } from './backtest-saved.interface';

// ─── Backtest Service Interface ──────────────────────────────────────────────

export interface IBacktestService {
    // Observable state
    isRunning: boolean;
    progress: number;               // 0-100
    progressMessage: string;
    results: IBacktestResults | null;
    batchResults: IBacktestBatchResults | null;
    error: string | null;

    // Save/load state
    savedTests: ISavedBacktestSummary[];
    isSaving: boolean;
    isLoadingSavedTests: boolean;

    // Actions
    runBacktest(params: IBacktestParams): Promise<void>;
    cancelBacktest(): void;

    // Save/load actions
    saveBacktest(name: string): Promise<string>;
    loadSavedTestsList(): Promise<void>;
    loadSavedTest(id: string): Promise<ISavedBacktest>;
    deleteSavedTest(id: string): Promise<void>;
}

// ─── Progress Callback ───────────────────────────────────────────────────────

export interface IBacktestProgress {
    percent: number;            // 0-100
    message: string;
}

export type ProgressCallback = (progress: IBacktestProgress) => void;

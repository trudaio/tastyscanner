/**
 * Saved Backtest — Firestore persistence interfaces
 */

import type { IBacktestParams, IBacktestResults } from './backtest-engine.interface';

/** Summary stored alongside each saved backtest — cheap to load for list views */
export interface ISavedBacktestSummary {
    id: string;
    name: string;
    createdAt: number;              // Unix ms
    tickers: string[];
    startDate: string;
    endDate: string;
    totalTrades: number;
    winRate: number;
    totalPL: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    profitFactor: number;
    averagePL: number;
    kellyFraction: number;
    executionTimeMs: number;
}

/** Full saved backtest document (loaded on demand) */
export interface ISavedBacktest extends ISavedBacktestSummary {
    params: IBacktestParams;
    results: IBacktestResults;
}

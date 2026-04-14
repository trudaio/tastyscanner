import type { IIronCondorTrade } from '../iron-condor-analytics/iron-condor-analytics.interface';

export type ScenarioLabel = 'actual' | 'target75' | 'target50' | 'target25' | 'expire';

export interface IScenarioOutcome {
    label: ScenarioLabel;
    /** Dollar P&L for this scenario (positive = profit). Per-position (not per-contract). */
    profit: number;
    /** Profit as % of max profit. 100 = full credit kept, -100 = full loss. */
    profitPct: number;
    /** Calendar days the position would have been held. */
    daysHeld: number;
    /** Whether the target profit level was reached during the trade's lifetime. */
    targetReached: boolean;
    /** Date the target was first reached (YYYY-MM-DD), or null if never reached / expire scenario. */
    hitDate: string | null;
}

export interface ITradeScenarioResult {
    trade: IIronCondorTrade;
    maxProfit: number;
    maxLoss: number;
    wings: number;
    scenarios: {
        actual: IScenarioOutcome;
        target75: IScenarioOutcome;
        target50: IScenarioOutcome;
        target25: IScenarioOutcome;
        expire: IScenarioOutcome;
    };
    /** Which scenario produced the best P&L for this trade. */
    bestStrategy: ScenarioLabel;
}

export interface IStrategySummary {
    label: string;
    totalPL: number;
    avgPL: number;
    winRate: number;
    avgDaysHeld: number;
    /** Sum of wins / |sum of losses|. >1 = profitable system. */
    profitFactor: number;
    /** How many trades actually reached this target (%). Only relevant for target scenarios. */
    targetHitRate: number;
    totalTrades: number;
}

export interface IScenarioStudySummary {
    totalTrades: number;
    strategies: {
        actual: IStrategySummary;
        target75: IStrategySummary;
        target50: IStrategySummary;
        target25: IStrategySummary;
        expire: IStrategySummary;
    };
    /** Which strategy has the best total P&L across all trades. */
    bestOverall: ScenarioLabel;
}

export interface IUnderlyingBar {
    date: string;
    close: number;
}

export interface IScenarioStudyService {
    readonly isLoading: boolean;
    readonly results: ITradeScenarioResult[];
    readonly summary: IScenarioStudySummary | null;
    readonly error: string | null;
    compute(): Promise<void>;
}

/**
 * SkewAnalysis — per-ticker IV skew snapshot.
 *
 * The full snapshot drives the entire Skew Analysis page (chart, IV metrics,
 * max pain, expected move, P/C ratio, fundamentals, suggested trades, strike
 * by distance). One snapshot per ticker, cached in memory and replaced on
 * each `loadSnapshot` call.
 */

import type { IBasicTechnicals, IExpectedMove, IPCRatio } from '../../utils/skew-math';

export interface ISkewChartPoint {
    expiration: string;
    expirationLabel: string;
    dte: number;
    isMonthly: boolean;
    putIv10: number | null;
    callIv10: number | null;
    putIv20: number | null;
    callIv20: number | null;
    putIv30: number | null;
    callIv30: number | null;
    putIv40: number | null;
    callIv40: number | null;
    /** IV-based skew %: avg(putIV) - avg(callIV) at the 10Δ level. */
    skewPct10: number | null;
    /** Premium-based skew % at the 10Δ level. */
    premiumSkew10Pct: number | null;
}

export interface ISkewIvMetrics {
    ivRank: number | null;
    ivPercentile: number | null;
    ivIndex: number | null;
    beta: number | null;
}

export interface IStrikeByDistanceLeg {
    strike: number;
    delta: number | null;
    premium: number | null;
    volume: number;
    pctFromStock: number;
}

export interface IStrikeByDistance {
    distancePct: number;
    put: IStrikeByDistanceLeg | null;
    call: IStrikeByDistanceLeg | null;
}

export type SuggestionLevel = 'success' | 'info' | 'warning' | 'neutral';

export interface ISuggestedInsight {
    level: SuggestionLevel;
    text: string;
}

export interface ISuggestedTrades {
    assessment: 'Elevated Fear' | 'Normal' | 'Balanced' | 'Bullish' | 'Unknown';
    insights: ISuggestedInsight[];
}

export interface ISkewSnapshot {
    ticker: string;
    fetchedAt: number;
    fromDate: string;
    toDate: string;
    stockPrice: number | null;
    chartData: ISkewChartPoint[];
    ivMetrics: ISkewIvMetrics;
    maxPain: number | null;
    expectedMove: IExpectedMove | null;
    putCallRatio: IPCRatio | null;
    byDistance: IStrikeByDistance[];
    basicTechnicals: IBasicTechnicals;
    suggestedTrades: ISuggestedTrades;
}

export interface ISkewAnalysisService {
    snapshotByTicker: Map<string, ISkewSnapshot | null>;
    loadingByTicker: Map<string, boolean>;
    errorByTicker: Map<string, string | null>;

    loadSnapshot(ticker: string, fromDate: string, toDate: string): Promise<void>;

    getSnapshot(ticker: string): ISkewSnapshot | null;
    isLoading(ticker: string): boolean;
    getError(ticker: string): string | null;
    readonly hasPolygonKey: boolean;
    readonly hasFmpKey: boolean;
}

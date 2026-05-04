/**
 * SkewAnalysis — per-ticker IV skew snapshot.
 *
 * The full snapshot drives the entire Skew Analysis page (chart, IV metrics,
 * max pain, expected move, P/C ratio, fundamentals, suggested trades, strike
 * by distance). One snapshot per ticker, cached in memory and replaced on
 * each `loadSnapshot` call.
 */

import type { IBasicTechnicals, IExpectedMove, IPCRatio } from '../../utils/skew-math';
import type { IFmpFundamentals } from '../api-clients/fmp.client';

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

/** Per-delta level data for a single expiration. */
export interface IDeltaLevelDetail {
    delta: number; // 10, 20, 30, 40
    putStrike: number | null;
    putPremium: number | null;
    putDelta: number | null;
    putVolume: number;
    putIv: number | null;
    putDistPct: number | null; // signed % from stock price
    callStrike: number | null;
    callPremium: number | null;
    callDelta: number | null;
    callVolume: number;
    callIv: number | null;
    callDistPct: number | null;
    skewDollar: number | null; // putPremium - callPremium
    skewPct: number | null; // (put - call) / call * 100
    imbalance: number | null; // putDist / callDist
}

/** Detailed view of one expiration: per-delta plus totals. */
export interface IExpirationDetail {
    expiration: string;
    expirationLabel: string;
    dte: number;
    isMonthly: boolean;
    perDelta: IDeltaLevelDetail[]; // 10, 20, 30, 40
    putVolumeTotal: number;
    callVolumeTotal: number;
    maxPain: number | null;
}

/** Single strike row used by the volatility smile + bell curve scatters. */
export interface IStrikeRow {
    strike: number;
    type: 'put' | 'call';
    premium: number | null;
    iv: number | null; // 0..1 raw, page renders as %
    delta: number | null; // signed (-) for puts
    gamma: number | null;
    volume: number;
    openInterest: number;
    /** convenience: this strike's expiration so consumers can DTE-filter */
    expiration: string;
    dte: number;
}

export type TermStructure = 'backwardation' | 'contango' | 'flat' | 'unknown';

export interface ISkewSummary {
    stockPrice: number | null;
    /** average premium-skew % across all 10Δ expirations */
    avgSkewPct10: number | null;
    /** 10Δ skew in front-monthly minus back-monthly */
    termStructure: TermStructure;
    /** front-monthly max pain */
    maxPain: number | null;
    /** front-monthly expected move */
    expectedMove: IExpectedMove | null;
    putCallRatio: IPCRatio | null;
    /** put + call total volume across all expirations within 60 days */
    totalPuts60d: number;
    totalCalls60d: number;
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
    // F2.5: extended views
    expirationDetails: IExpirationDetail[];
    strikesByExpiration: Record<string, IStrikeRow[]>;
    summary: ISkewSummary;
    // F4: company fundamentals time series
    fundamentalsTimeSeries: IFundamentalsPoint[];
    /** Snapshot of TTM/profile fundamentals from FMP. null when key missing or fetch failed. */
    fmpFundamentals: IFmpFundamentals | null;
}

/** One quarter of fundamentals + matched stock price at quarter end. */
export interface IFundamentalsPoint {
    fiscalPeriod: string;
    periodEndDate: string;
    price: number | null;
    eps: number | null;
    epsDiluted: number | null;
    revenue: number | null;
    netIncome: number | null;
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

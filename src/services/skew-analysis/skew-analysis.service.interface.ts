/**
 * SkewAnalysis — per-ticker IV skew snapshot.
 *
 * Exposed via ServiceFactory for the Skew Analysis page. Owns the data flow
 * for: skew chart data, IV metrics, max pain, expected move, P/C ratio,
 * fundamentals, suggested trades, and strike-by-distance table.
 */

export interface ISkewChartPoint {
    expirationDate: string;
    daysToExpiration: number;
    putIv10: number | null;
    callIv10: number | null;
    putIv20: number | null;
    callIv20: number | null;
    putIv30: number | null;
    callIv30: number | null;
    putIv40: number | null;
    callIv40: number | null;
}

export interface ISkewIvMetrics {
    ivRank: number | null;
    ivPercentile: number | null;
    fiveDayChange: number | null;
}

export interface ISkewSnapshot {
    ticker: string;
    fetchedAt: number;
    stockPrice: number | null;
    chartData: ISkewChartPoint[];
    ivMetrics: ISkewIvMetrics;
    maxPain: number | null;
    expectedMove: number | null;
    putCallRatio: number | null;
}

export interface ISkewAnalysisService {
    snapshotByTicker: Map<string, ISkewSnapshot | null>;
    loadingByTicker: Map<string, boolean>;
    errorByTicker: Map<string, string | null>;

    /** F2: fetch + process a full snapshot. */
    loadSnapshot(ticker: string, fromDate: string, toDate: string): Promise<void>;

    getSnapshot(ticker: string): ISkewSnapshot | null;
    isLoading(ticker: string): boolean;
    getError(ticker: string): string | null;
}

export interface IOHLCBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type RsiVerdict = 'oversold_extreme' | 'oversold' | 'neutral' | 'overbought' | 'overbought_extreme';
export type BbVerdict = 'below_lower' | 'near_lower' | 'neutral' | 'near_upper' | 'above_upper';
export type AtrVerdict = 'low' | 'normal' | 'elevated';

export interface ITechnicals {
    ticker: string;
    computedAt: string;
    stale: boolean;
    bars: IOHLCBar[];
    rsi: { value: number; verdict: RsiVerdict };
    bb: {
        upper: number; mid: number; lower: number;
        stdDev: number;
        percentB: number;
        distanceSigma: number;
        verdict: BbVerdict;
    };
    atr: { value: number; verdict: AtrVerdict };
}

export interface ITechnicalsService {
    /** Ensures the given ticker's indicators are being watched (subscribed or fetched). */
    watch(ticker: string): void;
    /** Latest cached snapshot, or null if not available. */
    getTechnicals(ticker: string): ITechnicals | null;
    /** True while a first fetch is in flight. */
    isLoading(ticker: string): boolean;
    /** Short error string if the latest fetch failed, or null. */
    getError(ticker: string): string | null;
}

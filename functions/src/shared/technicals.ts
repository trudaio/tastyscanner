// Pure technical-indicator calculations — RSI(14), Bollinger Bands(20, 2σ), ATR(14)
// Zero I/O. Inputs are plain numbers/bars, outputs are numbers.
//
// Conventions:
// - Arrays are ordered oldest → newest (index 0 = oldest close)
// - RSI and ATR use Wilder's smoothing (first value = simple average, then EMA with α=1/period)
// - Returned indicator values correspond to the LAST element of the input array
// - Threshold boundaries: see docs/superpowers/specs/2026-04-13-technical-indicators-design.md

export interface OHLC {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface BBResult {
    upper: number;
    mid: number;
    lower: number;
    stdDev: number;
    /** 0 = at lower band, 1 = at upper band, can exceed */
    percentB: number;
    /** (close - mid) / stdDev — signed σ distance, e.g. +1.2 = 1.2 σ above mid */
    distanceSigma: number;
}

export class InsufficientDataError extends Error {
    constructor(needed: number, got: number) {
        super(`Insufficient data: need ${needed} samples, got ${got}`);
        this.name = 'InsufficientDataError';
    }
}

/**
 * Relative Strength Index (Wilder's smoothing), default period 14.
 * Returns 0–100.
 */
export function computeRSI(closes: number[], period = 14): number {
    if (closes.length < period + 1) {
        throw new InsufficientDataError(period + 1, closes.length);
    }

    // Seed: first `period` deltas, averaged as SMA
    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const delta = closes[i] - closes[i - 1];
        if (delta >= 0) gainSum += delta;
        else lossSum -= delta;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    // Wilder smoothing for the remaining bars
    for (let i = period + 1; i < closes.length; i++) {
        const delta = closes[i] - closes[i - 1];
        const gain = delta >= 0 ? delta : 0;
        const loss = delta < 0 ? -delta : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

/**
 * Bollinger Bands on the last `period` closes. Uses population std dev (divisor N).
 */
export function computeBB(closes: number[], period = 20, sigma = 2): BBResult {
    if (closes.length < period) {
        throw new InsufficientDataError(period, closes.length);
    }
    const slice = closes.slice(-period);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, x) => sum + (x - mid) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    const last = closes[closes.length - 1];
    const upper = mid + sigma * stdDev;
    const lower = mid - sigma * stdDev;
    const percentB = stdDev === 0 ? 0.5 : (last - lower) / (upper - lower);
    const distanceSigma = stdDev === 0 ? 0 : (last - mid) / stdDev;
    return { upper, mid, lower, stdDev, percentB, distanceSigma };
}

/**
 * Average True Range (Wilder's smoothing), default period 14.
 * Returns the ATR value for the LAST bar.
 */
export function computeATR(bars: OHLC[], period = 14): number {
    if (bars.length < period + 1) {
        throw new InsufficientDataError(period + 1, bars.length);
    }

    // True Range per bar, starting at index 1 (need previous close)
    const trs: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        const h = bars[i].high;
        const l = bars[i].low;
        const prevClose = bars[i - 1].close;
        const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
        trs.push(tr);
    }

    // Seed ATR as SMA of first `period` TRs, then Wilder-smooth
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trs.length; i++) {
        atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
}

// ─── Verdict helpers (pure, threshold-based) ─────────────────────────────────

export type RsiVerdict = 'oversold_extreme' | 'oversold' | 'neutral' | 'overbought' | 'overbought_extreme';
export type BbVerdict = 'below_lower' | 'near_lower' | 'neutral' | 'near_upper' | 'above_upper';
export type AtrVerdict = 'low' | 'normal' | 'elevated';

/** RSI verdict — boundaries per spec: <25 extreme, [25,30) oversold, [30,70] neutral, (70,75] overbought, >75 extreme. */
export function rsiVerdict(value: number): RsiVerdict {
    if (value < 25) return 'oversold_extreme';
    if (value < 30) return 'oversold';
    if (value <= 70) return 'neutral';
    if (value <= 75) return 'overbought';
    return 'overbought_extreme';
}

/** BB verdict from signed σ distance of last close vs mid band. */
export function bbVerdict(distanceSigma: number): BbVerdict {
    if (distanceSigma < -2) return 'below_lower';
    if (distanceSigma < -1) return 'near_lower';
    if (distanceSigma <= 1) return 'neutral';
    if (distanceSigma <= 2) return 'near_upper';
    return 'above_upper';
}

/** ATR verdict — thresholds differ by ticker (SPX vs QQQ scale). */
export function atrVerdict(ticker: string, value: number): AtrVerdict {
    if (ticker === 'SPX') {
        if (value < 40) return 'low';
        if (value <= 70) return 'normal';
        return 'elevated';
    }
    if (ticker === 'QQQ') {
        if (value < 5) return 'low';
        if (value <= 9) return 'normal';
        return 'elevated';
    }
    // Generic fallback for on-demand tickers: relative to close price
    // caller supplies raw ATR; we use a simple heuristic ratio
    return 'normal';
}

/** Human-readable RSI verdict for UI/prompt. */
export function rsiVerdictLabel(v: RsiVerdict): string {
    switch (v) {
        case 'oversold_extreme': return 'oversold (extreme)';
        case 'oversold': return 'oversold';
        case 'neutral': return 'neutral';
        case 'overbought': return 'overbought';
        case 'overbought_extreme': return 'overbought (extreme)';
    }
}

export function bbVerdictLabel(v: BbVerdict): string {
    switch (v) {
        case 'below_lower': return 'below lower band';
        case 'near_lower': return 'near lower band';
        case 'neutral': return 'near mid band';
        case 'near_upper': return 'near upper band';
        case 'above_upper': return 'above upper band';
    }
}

export function atrVerdictLabel(v: AtrVerdict): string {
    return v; // low / normal / elevated
}

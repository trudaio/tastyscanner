/**
 * Pure math utilities for the Skew Analysis page.
 *
 * Ported from skew-dashboard v13/v14 — extractPremium, IV rank, max pain,
 * expected move, P/C ratio, plus added historical volatility, RSI, ATR,
 * and 52-week range so the fundamentals fallback works without FMP.
 */

import type { IPolygonOptionSnapshot, IPolygonAggregateBar } from '../services/api-clients/polygon.client';

export interface IExpectedMove {
    dollars: number;
    percent: number;
    upperBound: number;
    lowerBound: number;
}

export interface IPCRatio {
    ratio: number;
    putVolume: number;
    callVolume: number;
}

/** Per-ticker basic technicals derived purely from price history. */
export interface IBasicTechnicals {
    rsi14: number | null;
    atr14: number | null;
    historicalVolatility30: number | null;
    week52High: number | null;
    week52Low: number | null;
    week52RangePct: number | null; // where current price sits in the 52w range, 0..100
    ytdReturnPct: number | null;
    qtdReturnPct: number | null;
}

/** Single processed option row used by chart formatting + max-pain math. */
export interface IProcessedOption {
    strike: number;
    delta: number | null;
    gamma: number | null;
    iv: number | null;
    premium: number | null;
    type: 'put' | 'call';
    expiration: string;
    volume: number;
    openInterest: number;
}

/** Mid-price extraction with strict bid>0 && ask>0 guard (v14 behaviour). */
export function extractPremium(opt: IPolygonOptionSnapshot): number | null {
    const lastQuote = opt.last_quote;
    if (lastQuote) {
        const bid = lastQuote.bid;
        const ask = lastQuote.ask;
        if (bid !== undefined && bid > 0 && ask !== undefined && ask > 0) {
            return (bid + ask) / 2;
        }
        if (ask !== undefined && ask > 0) return ask;
        if (bid !== undefined && bid > 0) return bid;
    }
    if (opt.day?.close !== undefined && opt.day.close > 0) return opt.day.close;
    return null;
}

/**
 * IV rank — current IV's position in the high/low range across the chain.
 * Convention: returns 0..100. We use the chain snapshot itself (not 52-week
 * IVs) since Polygon free tier doesn't expose IV history; this matches the
 * skew-dashboard original behaviour.
 */
export function calculateIVRank(allIVs: number[]): number | null {
    const valid = allIVs.filter((iv) => iv > 0);
    if (valid.length < 2) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const current = valid[valid.length - 1];
    if (max === min) return 50;
    return Math.round(((current - min) / (max - min)) * 100);
}

/**
 * Max pain strike — the strike where aggregate option holder losses are
 * maximised across the supplied chain. Uses open interest (or volume as a
 * fallback) as the weight per leg. Returns null if no usable data.
 */
export function calculateMaxPain(options: IProcessedOption[]): number | null {
    if (options.length === 0) return null;
    const strikes = Array.from(new Set(options.map((o) => o.strike))).sort((a, b) => a - b);
    let minPain = Infinity;
    let maxPainStrike: number | null = null;
    for (const test of strikes) {
        let pain = 0;
        for (const opt of options) {
            const oi = opt.openInterest > 0 ? opt.openInterest : (opt.volume > 0 ? opt.volume : 1);
            if (opt.type === 'call') {
                if (test > opt.strike) pain += (test - opt.strike) * oi * 100;
            } else {
                if (test < opt.strike) pain += (opt.strike - test) * oi * 100;
            }
        }
        if (pain < minPain) {
            minPain = pain;
            maxPainStrike = test;
        }
    }
    return maxPainStrike;
}

/**
 * Expected move — derived from ATM straddle premium with a 0.85 dampening
 * factor (skew-dashboard convention). Returns null if either ATM leg can't be
 * found.
 */
export function calculateExpectedMove(options: IProcessedOption[], stockPrice: number): IExpectedMove | null {
    if (options.length === 0 || !stockPrice) return null;
    let atmCall: IProcessedOption | null = null;
    let atmPut: IProcessedOption | null = null;
    let minCallDiff = Infinity;
    let minPutDiff = Infinity;
    for (const opt of options) {
        const diff = Math.abs(opt.strike - stockPrice);
        if (opt.type === 'call' && diff < minCallDiff) {
            minCallDiff = diff;
            atmCall = opt;
        }
        if (opt.type === 'put' && diff < minPutDiff) {
            minPutDiff = diff;
            atmPut = opt;
        }
    }
    if (!atmCall || !atmPut || atmCall.premium === null || atmPut.premium === null) return null;
    const straddle = atmCall.premium + atmPut.premium;
    const dollars = straddle * 0.85;
    return {
        dollars,
        percent: (dollars / stockPrice) * 100,
        upperBound: stockPrice + dollars,
        lowerBound: stockPrice - dollars,
    };
}

/** P/C ratio over the next 60 days of expirations. */
export function calculatePCRatio(options: IProcessedOption[]): IPCRatio | null {
    if (options.length === 0) return null;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + 60);
    let putVol = 0;
    let callVol = 0;
    for (const opt of options) {
        const expDate = new Date(opt.expiration + 'T00:00:00');
        if (expDate <= cutoff) {
            if (opt.type === 'put') putVol += opt.volume;
            else callVol += opt.volume;
        }
    }
    if (callVol === 0) return null;
    return { ratio: putVol / callVol, putVolume: putVol, callVolume: callVol };
}

/** True ATR with high/low/close — Wilder's smoothing not used; simple mean. */
export function calculateATR(bars: IPolygonAggregateBar[], period = 14): number | null {
    if (bars.length < period + 1) return null;
    const trs: number[] = [];
    for (let i = 1; i < bars.length; i += 1) {
        const high = bars[i].h;
        const low = bars[i].l;
        const prevClose = bars[i - 1].c;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Standard 14-period RSI on closes. */
export function calculateRSI(bars: IPolygonAggregateBar[], period = 14): number | null {
    if (bars.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i += 1) {
        const change = bars[i].c - bars[i - 1].c;
        if (change > 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < bars.length; i += 1) {
        const change = bars[i].c - bars[i - 1].c;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

/** Annualised historical volatility from log returns over the last N closes. */
export function calculateHistoricalVolatility(bars: IPolygonAggregateBar[], period = 30): number | null {
    if (bars.length < period + 1) return null;
    const tail = bars.slice(-(period + 1));
    const logReturns: number[] = [];
    for (let i = 1; i < tail.length; i += 1) {
        logReturns.push(Math.log(tail[i].c / tail[i - 1].c));
    }
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (logReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    return stdDev * Math.sqrt(252) * 100; // annualised, in %
}

export interface IRange52w {
    high: number;
    low: number;
    rangePct: number; // 0..100
}

export function calculate52WeekRange(bars: IPolygonAggregateBar[], currentPrice: number): IRange52w | null {
    if (bars.length === 0 || !currentPrice) return null;
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const inWindow = bars.filter((b) => b.t >= oneYearAgo);
    const sample = inWindow.length > 0 ? inWindow : bars;
    const highs = sample.map((b) => b.h);
    const lows = sample.map((b) => b.l);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    if (high === low) return { high, low, rangePct: 50 };
    return { high, low, rangePct: ((currentPrice - low) / (high - low)) * 100 };
}

export function calculateBasicTechnicals(bars: IPolygonAggregateBar[], currentPrice: number): IBasicTechnicals {
    const range = calculate52WeekRange(bars, currentPrice);
    const ytd = ytdReturn(bars, currentPrice);
    const qtd = qtdReturn(bars, currentPrice);
    return {
        rsi14: calculateRSI(bars, 14),
        atr14: calculateATR(bars, 14),
        historicalVolatility30: calculateHistoricalVolatility(bars, 30),
        week52High: range?.high ?? null,
        week52Low: range?.low ?? null,
        week52RangePct: range?.rangePct ?? null,
        ytdReturnPct: ytd,
        qtdReturnPct: qtd,
    };
}

function ytdReturn(bars: IPolygonAggregateBar[], currentPrice: number): number | null {
    if (bars.length === 0 || !currentPrice) return null;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const first = bars.find((b) => b.t >= yearStart);
    if (!first) return null;
    return ((currentPrice - first.c) / first.c) * 100;
}

function qtdReturn(bars: IPolygonAggregateBar[], currentPrice: number): number | null {
    if (bars.length === 0 || !currentPrice) return null;
    const now = new Date();
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1).getTime();
    const first = bars.find((b) => b.t >= quarterStart);
    if (!first) return null;
    return ((currentPrice - first.c) / first.c) * 100;
}

/**
 * Detect a monthly expiration (3rd Friday of the month). Day-of-week + day
 * range check matches skew-dashboard's `isMonthlyExpiration`.
 */
export function isMonthlyExpiration(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
}

/**
 * Days between an expiration date string and today, floored to days.
 */
export function daysToExpiration(dateStr: string): number {
    const exp = new Date(dateStr + 'T00:00:00').getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((exp - today.getTime()) / (24 * 60 * 60 * 1000)));
}

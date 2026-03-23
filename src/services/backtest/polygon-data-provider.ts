/**
 * Polygon Data Provider — Client-side service to fetch and cache
 * historical stock and options data via Firebase Function proxy.
 *
 * Key responsibilities:
 * 1. Fetch stock daily bars (underlying prices)
 * 2. Fetch options contracts list (available strikes/expirations)
 * 3. Fetch option daily bars (historical option prices)
 * 4. Reconstruct historical options chains for any given date
 * 5. Cache all data to avoid redundant API calls
 */

import { auth } from '../../firebase';
import { computeGreeksFromMarketPrice } from './black-scholes';
import type {
    IPolygonStockBar,
    IPolygonOptionsContract,
    IPolygonOptionBar,
    IHistoricalChain,
    IHistoricalExpiration,
    IHistoricalStrike,
    IHistoricalOption,
    IBacktestProgress,
    ProgressCallback,
} from './backtest-engine.interface';

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL as string;

// ─── Auth Helper ─────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

async function authFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = await getAuthToken();
    const resp = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options?.headers,
        },
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body}`);
    }
    return resp.json() as Promise<T>;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const stockBarsCache = new Map<string, IPolygonStockBar[]>();
const contractsCache = new Map<string, IPolygonOptionsContract[]>();
const optionBarsCache = new Map<string, IPolygonOptionBar[]>();

export function clearPolygonCache(): void {
    stockBarsCache.clear();
    contractsCache.clear();
    optionBarsCache.clear();
}

// ─── Fetch Functions ─────────────────────────────────────────────────────────

export async function fetchStockBars(
    symbol: string,
    from: string,
    to: string
): Promise<IPolygonStockBar[]> {
    const cacheKey = `${symbol}:${from}:${to}`;
    if (stockBarsCache.has(cacheKey)) {
        return stockBarsCache.get(cacheKey)!;
    }

    const data = await authFetch<{ bars: IPolygonStockBar[]; count: number }>(
        `${FUNCTIONS_BASE}/api/polygon/stock-bars?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
    );

    stockBarsCache.set(cacheKey, data.bars);
    return data.bars;
}

export async function fetchOptionsContracts(
    underlying: string,
    minExpiration: string,
    maxExpiration: string
): Promise<IPolygonOptionsContract[]> {
    const cacheKey = `${underlying}:${minExpiration}:${maxExpiration}`;
    if (contractsCache.has(cacheKey)) {
        return contractsCache.get(cacheKey)!;
    }

    const data = await authFetch<{ contracts: IPolygonOptionsContract[]; count: number }>(
        `${FUNCTIONS_BASE}/api/polygon/options-contracts?underlying=${encodeURIComponent(underlying)}&expiration_date.gte=${minExpiration}&expiration_date.lte=${maxExpiration}`
    );

    contractsCache.set(cacheKey, data.contracts);
    return data.contracts;
}

export async function fetchOptionBars(
    optionTicker: string,
    from: string,
    to: string
): Promise<IPolygonOptionBar[]> {
    const cacheKey = `${optionTicker}:${from}:${to}`;
    if (optionBarsCache.has(cacheKey)) {
        return optionBarsCache.get(cacheKey)!;
    }

    const data = await authFetch<{ bars: IPolygonOptionBar[]; count: number }>(
        `${FUNCTIONS_BASE}/api/polygon/option-bars?ticker=${encodeURIComponent(optionTicker)}&from=${from}&to=${to}`
    );

    optionBarsCache.set(cacheKey, data.bars);
    return data.bars;
}

export async function fetchOptionBarsBatch(
    tickers: string[],
    from: string,
    to: string
): Promise<Map<string, IPolygonOptionBar[]>> {
    // Check cache first, only fetch missing
    const missing: string[] = [];
    const result = new Map<string, IPolygonOptionBar[]>();

    for (const ticker of tickers) {
        const cacheKey = `${ticker}:${from}:${to}`;
        if (optionBarsCache.has(cacheKey)) {
            result.set(ticker, optionBarsCache.get(cacheKey)!);
        } else {
            missing.push(ticker);
        }
    }

    if (missing.length === 0) return result;

    // Batch fetch in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        const data = await authFetch<{ results: Record<string, IPolygonOptionBar[]> }>(
            `${FUNCTIONS_BASE}/api/polygon/option-bars-batch`,
            {
                method: 'POST',
                body: JSON.stringify({ tickers: chunk, from, to }),
            }
        );

        for (const [ticker, bars] of Object.entries(data.results)) {
            const cacheKey = `${ticker}:${from}:${to}`;
            optionBarsCache.set(cacheKey, bars);
            result.set(ticker, bars);
        }
    }

    return result;
}

// ─── Trading Day Utilities ───────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA + 'T00:00:00Z');
    const b = new Date(dateB + 'T00:00:00Z');
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Chain Reconstruction ────────────────────────────────────────────────────

/**
 * Build a lookup map: optionTicker → { date → bar }
 * for fast O(1) price lookups during simulation.
 */
export function buildOptionBarLookup(
    allBars: Map<string, IPolygonOptionBar[]>
): Map<string, Map<string, IPolygonOptionBar>> {
    const lookup = new Map<string, Map<string, IPolygonOptionBar>>();

    for (const [ticker, bars] of allBars) {
        const dateMap = new Map<string, IPolygonOptionBar>();
        for (const bar of bars) {
            dateMap.set(bar.date, bar);
        }
        lookup.set(ticker, dateMap);
    }

    return lookup;
}

/**
 * Reconstruct a full options chain for a specific date.
 *
 * Takes pre-fetched contract list + option bars, and produces a
 * historical chain with BS-derived Greeks for each option.
 */
export function buildHistoricalChain(
    date: string,
    spotPrice: number,
    contracts: IPolygonOptionsContract[],
    optionBarLookup: Map<string, Map<string, IPolygonOptionBar>>,
    riskFreeRate: number,
    minDTE: number,
    maxDTE: number,
    ivRank?: number,
): IHistoricalChain {
    // Group contracts by expiration
    const byExpiration = new Map<string, IPolygonOptionsContract[]>();
    for (const c of contracts) {
        const dte = daysBetween(date, c.expirationDate);
        if (dte < minDTE || dte > maxDTE) continue;

        if (!byExpiration.has(c.expirationDate)) {
            byExpiration.set(c.expirationDate, []);
        }
        byExpiration.get(c.expirationDate)!.push(c);
    }

    const expirations: IHistoricalExpiration[] = [];

    for (const [expDate, expContracts] of byExpiration) {
        const dte = daysBetween(date, expDate);
        if (dte <= 0) continue;

        const T = dte / 365; // time in years

        // Group by strike
        const byStrike = new Map<number, { call?: IPolygonOptionsContract; put?: IPolygonOptionsContract }>();
        for (const c of expContracts) {
            if (!byStrike.has(c.strikePrice)) {
                byStrike.set(c.strikePrice, {});
            }
            const entry = byStrike.get(c.strikePrice)!;
            if (c.contractType === 'call') entry.call = c;
            else entry.put = c;
        }

        const strikes: IHistoricalStrike[] = [];

        for (const [strikePrice, pair] of byStrike) {
            // Need both call and put to form a usable strike
            if (!pair.call || !pair.put) continue;

            const callBar = optionBarLookup.get(pair.call.ticker)?.get(date);
            const putBar = optionBarLookup.get(pair.put.ticker)?.get(date);

            // Need price data for both
            if (!callBar || !putBar || callBar.close <= 0 || putBar.close <= 0) continue;

            const callGreeks = computeGreeksFromMarketPrice(callBar.close, spotPrice, strikePrice, T, riskFreeRate, 'call');
            const putGreeks = computeGreeksFromMarketPrice(putBar.close, spotPrice, strikePrice, T, riskFreeRate, 'put');

            // Skip if IV solver failed
            if (!callGreeks || !putGreeks) continue;

            // Simulate bid/ask from close (±2.5% spread)
            const spreadFactor = 0.025;

            const callOption: IHistoricalOption = {
                contractTicker: pair.call.ticker,
                type: 'call',
                strikePrice,
                closePrice: callBar.close,
                volume: callBar.volume,
                impliedVolatility: callGreeks.impliedVolatility,
                delta: callGreeks.delta,
                absoluteDeltaPercent: Math.round(Math.abs(callGreeks.delta) * 100),
                gamma: callGreeks.gamma,
                theta: callGreeks.theta,
                vega: callGreeks.vega,
                bidPrice: Math.round((callBar.close * (1 - spreadFactor)) * 100) / 100,
                askPrice: Math.round((callBar.close * (1 + spreadFactor)) * 100) / 100,
                midPrice: callBar.close,
            };

            const putOption: IHistoricalOption = {
                contractTicker: pair.put.ticker,
                type: 'put',
                strikePrice,
                closePrice: putBar.close,
                volume: putBar.volume,
                impliedVolatility: putGreeks.impliedVolatility,
                delta: putGreeks.delta,
                absoluteDeltaPercent: Math.round(Math.abs(putGreeks.delta) * 100),
                gamma: putGreeks.gamma,
                theta: putGreeks.theta,
                vega: putGreeks.vega,
                bidPrice: Math.round((putBar.close * (1 - spreadFactor)) * 100) / 100,
                askPrice: Math.round((putBar.close * (1 + spreadFactor)) * 100) / 100,
                midPrice: putBar.close,
            };

            strikes.push({ strikePrice, call: callOption, put: putOption });
        }

        // Sort strikes ascending
        strikes.sort((a, b) => a.strikePrice - b.strikePrice);

        if (strikes.length > 0) {
            expirations.push({
                expirationDate: expDate,
                daysToExpiration: dte,
                strikes,
            });
        }
    }

    // Sort expirations by DTE
    expirations.sort((a, b) => a.daysToExpiration - b.daysToExpiration);

    return { date, spotPrice, expirations, ivRank };
}

// ─── Data Pre-Fetch (before backtest loop) ───────────────────────────────────

export interface IPreFetchedData {
    stockBars: Map<string, IPolygonStockBar[]>;             // ticker → daily bars
    contracts: Map<string, IPolygonOptionsContract[]>;       // ticker → contracts
    optionBarLookup: Map<string, Map<string, IPolygonOptionBar>>;  // contractTicker → date → bar
    tradingDays: string[];                                   // all trading days from stock bars
}

/**
 * Pre-fetch all data needed for the backtest.
 * This runs before the simulation loop and fetches everything in bulk.
 */
export async function preFetchBacktestData(
    tickers: string[],
    startDate: string,
    endDate: string,
    minDTE: number,
    maxDTE: number,
    onProgress?: ProgressCallback,
): Promise<IPreFetchedData> {
    const stockBars = new Map<string, IPolygonStockBar[]>();
    const contracts = new Map<string, IPolygonOptionsContract[]>();
    const allOptionBars = new Map<string, IPolygonOptionBar[]>();

    const totalSteps = tickers.length * 3; // stock + contracts + option bars per ticker
    let currentStep = 0;

    const report = (msg: string) => {
        currentStep++;
        onProgress?.({
            percent: Math.round((currentStep / totalSteps) * 50), // 0-50% for data fetch
            message: msg,
        });
    };

    // Calculate expiration date range: start - maxDTE to end + maxDTE
    // (need contracts that overlap with our simulation window)
    const startDateObj = new Date(startDate + 'T00:00:00Z');
    const endDateObj = new Date(endDate + 'T00:00:00Z');
    const minExpDate = new Date(startDateObj.getTime() + minDTE * 86400000).toISOString().split('T')[0];
    const maxExpDate = new Date(endDateObj.getTime() + maxDTE * 86400000).toISOString().split('T')[0];

    for (const ticker of tickers) {
        // 1. Fetch stock bars
        report(`Fetching ${ticker} stock data...`);
        const bars = await fetchStockBars(ticker, startDate, endDate);
        stockBars.set(ticker, bars);

        // 2. Fetch options contracts
        report(`Fetching ${ticker} options contracts...`);
        const tickerContracts = await fetchOptionsContracts(ticker, minExpDate, maxExpDate);
        contracts.set(ticker, tickerContracts);

        // 3. Fetch option bars for all contracts
        report(`Fetching ${ticker} option prices (${tickerContracts.length} contracts)...`);
        const contractTickers = tickerContracts.map(c => c.ticker);

        if (contractTickers.length > 0) {
            const barsMap = await fetchOptionBarsBatch(contractTickers, startDate, endDate);
            for (const [ct, cb] of barsMap) {
                allOptionBars.set(ct, cb);
            }
        }
    }

    // Build lookup and extract trading days
    const optionBarLookup = buildOptionBarLookup(allOptionBars);

    // Trading days = union of all stock bar dates, sorted
    const daySet = new Set<string>();
    for (const bars of stockBars.values()) {
        for (const bar of bars) {
            daySet.add(bar.date);
        }
    }
    const tradingDays = Array.from(daySet).sort();

    return { stockBars, contracts, optionBarLookup, tradingDays };
}

// ─── IV Rank Computation ──────────────────────────────────────────────────────

/**
 * Compute rolling 252-day IV Rank for a single ticker.
 *
 * For each trading day, finds the ATM option closest to 30 DTE
 * and extracts its implied volatility via the BS solver.
 * IV Rank = (currentIV − 52wkLow) / (52wkHigh − 52wkLow) × 100
 *
 * Uses a ±3 strike / 15–45 DTE search window for fast O(D×6×N_exp) lookup.
 * Returns a Map<date, ivRank (0–100)>.
 */
export function computeIVRankSeries(
    stockBars: IPolygonStockBar[],
    contracts: IPolygonOptionsContract[],
    optionBarLookup: Map<string, Map<string, IPolygonOptionBar>>,
    riskFreeRate: number,
): Map<string, number> {
    const TARGET_DTE = 30;
    const MIN_DTE = 15;
    const MAX_DTE = 45;

    // Index contracts by strike for fast nearest-ATM search
    const contractsByStrike = new Map<number, IPolygonOptionsContract[]>();
    for (const c of contracts) {
        if (!contractsByStrike.has(c.strikePrice)) {
            contractsByStrike.set(c.strikePrice, []);
        }
        contractsByStrike.get(c.strikePrice)!.push(c);
    }
    const sortedStrikes = Array.from(contractsByStrike.keys()).sort((a, b) => a - b);

    if (sortedStrikes.length === 0) return new Map();

    // Step 1: compute ATM IV for each trading day
    const dailyIV: Array<{ date: string; iv: number }> = [];

    for (const bar of stockBars) {
        const date = bar.date;
        const spot = bar.close;

        // Binary search: index of the first strike >= spot
        let lo = 0, hi = sortedStrikes.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedStrikes[mid] < spot) lo = mid + 1;
            else hi = mid;
        }
        // Pick closer of lo and lo-1
        const closestIdx = (lo > 0 &&
            Math.abs(sortedStrikes[lo - 1] - spot) < Math.abs(sortedStrikes[lo] - spot))
            ? lo - 1 : lo;

        let bestIV: number | null = null;
        let bestScore = Infinity; // lower = better (closer to ATM + closer to TARGET_DTE)

        for (let di = -3; di <= 3; di++) {
            const idx = closestIdx + di;
            if (idx < 0 || idx >= sortedStrikes.length) continue;
            const strike = sortedStrikes[idx];

            for (const c of contractsByStrike.get(strike)!) {
                const dte = daysBetween(date, c.expirationDate);
                if (dte < MIN_DTE || dte > MAX_DTE) continue;

                const optBar = optionBarLookup.get(c.ticker)?.get(date);
                if (!optBar || optBar.close <= 0) continue;

                const T = dte / 365;
                const greeks = computeGreeksFromMarketPrice(
                    optBar.close, spot, strike, T, riskFreeRate, c.contractType,
                );
                if (!greeks || isNaN(greeks.impliedVolatility) || greeks.impliedVolatility <= 0) continue;

                const score = Math.abs(strike - spot) / spot
                    + Math.abs(dte - TARGET_DTE) / TARGET_DTE;
                if (score < bestScore) {
                    bestIV = greeks.impliedVolatility;
                    bestScore = score;
                }
            }
        }

        if (bestIV !== null) {
            dailyIV.push({ date, iv: bestIV });
        }
    }

    // Step 2: rolling 252-day IV Rank
    const result = new Map<string, number>();
    const WINDOW = 252;

    for (let i = 0; i < dailyIV.length; i++) {
        const { date, iv } = dailyIV[i];
        const windowStart = Math.max(0, i - WINDOW + 1);
        const windowIVs = dailyIV.slice(windowStart, i + 1).map(d => d.iv);

        const min = Math.min(...windowIVs);
        const max = Math.max(...windowIVs);

        result.set(date, max <= min ? 50 : Math.round(((iv - min) / (max - min)) * 100));
    }

    return result;
}

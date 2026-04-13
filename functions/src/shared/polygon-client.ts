// Polygon.io client — daily bars for underlying (index or equity).
// Uses the POLYGON_API_KEY secret (already defined in index.ts).
//
// Ticker mapping: SPX → I:SPX (index), QQQ → QQQ, default: as-is.

import * as https from 'https';
import type { OHLC } from './technicals';

function mapTicker(ticker: string): string {
    if (ticker === 'SPX') return 'I:SPX';
    return ticker;
}

function msToDateStr(ms: number): string {
    return new Date(ms).toISOString().split('T')[0];
}

interface IPolygonAggResult {
    o: number; h: number; l: number; c: number; v: number; t: number;
}

interface IPolygonAggsResponse {
    results?: IPolygonAggResult[];
    status?: string;
}

function fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (c: string) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data) as T); }
                catch (e) { reject(new Error(`Polygon JSON parse failed: ${data.substring(0, 200)}`)); }
            });
        }).on('error', reject);
    });
}

/**
 * Fetch daily OHLC bars for the given ticker, returning approximately `days` bars
 * ending at the most recent close.
 *
 * Polygon returns only trading days, so we request a calendar window large enough
 * to guarantee at least `days` bars (1.6× buffer) and slice the tail.
 */
export async function fetchDailyBars(
    apiKey: string,
    ticker: string,
    days: number,
): Promise<OHLC[]> {
    const mapped = mapTicker(ticker);
    const end = new Date();
    const start = new Date();
    // 1.6× buffer for weekends/holidays, min 40 days
    start.setDate(end.getDate() - Math.max(40, Math.ceil(days * 1.6)));
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(mapped)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

    const resp = await fetchJson<IPolygonAggsResponse>(url);
    if (!resp.results || resp.results.length === 0) {
        throw new Error(`Polygon returned no bars for ${mapped} (${from} → ${to})`);
    }

    const bars: OHLC[] = resp.results.map((r) => ({
        date: msToDateStr(r.t),
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
    }));

    // Return only the last `days` bars
    return bars.slice(-days);
}

/** Simple retry wrapper with exponential backoff: 1s, 3s, 9s. */
export async function fetchDailyBarsWithRetry(
    apiKey: string,
    ticker: string,
    days: number,
    maxAttempts = 3,
): Promise<OHLC[]> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fetchDailyBars(apiKey, ticker, days);
        } catch (e) {
            lastErr = e;
            if (attempt < maxAttempts - 1) {
                const delayMs = Math.pow(3, attempt) * 1000;
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

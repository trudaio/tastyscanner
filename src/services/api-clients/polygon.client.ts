/**
 * Polygon.io REST client.
 *
 * Used by SkewAnalysisService and SkewScannerService for options chains,
 * historical prices, snapshots, and earnings data.
 */

const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface IPolygonOptionContract {
    ticker: string;
    underlying_ticker: string;
    strike_price: number;
    expiration_date: string;
    contract_type: 'call' | 'put';
}

export interface IPolygonOptionSnapshot {
    details: IPolygonOptionContract;
    greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
    implied_volatility?: number;
    open_interest?: number;
    last_quote?: { bid?: number; ask?: number; midpoint?: number };
    day?: { close?: number; volume?: number; vwap?: number; high?: number; low?: number; open?: number };
    last_trade?: { price?: number };
}

export interface IPolygonAggregateBar {
    t: number; // timestamp in ms
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
}

interface IPolygonChainResponse {
    results?: IPolygonOptionSnapshot[];
    next_url?: string;
    status?: string;
    error?: string;
}

interface IPolygonAggsResponse {
    results?: IPolygonAggregateBar[];
    status?: string;
}

interface IPolygonPrevResponse {
    results?: Array<{ c?: number }>;
}

export class PolygonClient {
    private readonly apiKey: string;
    private readonly baseUrl = POLYGON_BASE_URL;

    constructor() {
        this.apiKey = (import.meta.env.VITE_POLYGON_API_KEY as string | undefined) ?? '';
    }

    get isConfigured(): boolean {
        return this.apiKey.length > 0;
    }

    /**
     * Fetch the snapshot for all option contracts on `underlying` whose
     * expiration date is within [from, to]. Follows cursor pagination
     * (next_url) and re-injects the API key on each follow-up request.
     */
    async getOptionsChainSnapshot(
        underlying: string,
        from: string,
        to: string,
        signal?: AbortSignal,
    ): Promise<IPolygonOptionSnapshot[]> {
        if (!this.isConfigured) return [];
        const results: IPolygonOptionSnapshot[] = [];
        let url: string | null =
            `${this.baseUrl}/v3/snapshot/options/${encodeURIComponent(underlying)}?expiration_date.gte=${from}&expiration_date.lte=${to}&limit=250&apiKey=${this.apiKey}`;
        while (url) {
            const res = await fetch(url, { signal });
            if (!res.ok) {
                if (res.status === 429) {
                    throw new PolygonRateLimitError('Polygon rate limit hit (429)');
                }
                throw new Error(`Polygon API error ${res.status}`);
            }
            const data = (await res.json()) as IPolygonChainResponse;
            if (data.results) results.push(...data.results);
            url = data.next_url ? `${data.next_url}&apiKey=${this.apiKey}` : null;
        }
        return results;
    }

    /** Daily bars between two ISO dates (YYYY-MM-DD). */
    async getPriceHistory(
        ticker: string,
        from: string,
        to: string,
        signal?: AbortSignal,
    ): Promise<IPolygonAggregateBar[]> {
        if (!this.isConfigured) return [];
        const url = `${this.baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${this.apiKey}`;
        const res = await fetch(url, { signal });
        if (!res.ok) {
            if (res.status === 429) throw new PolygonRateLimitError('Polygon rate limit hit (429)');
            return [];
        }
        const data = (await res.json()) as IPolygonAggsResponse;
        return data.results ?? [];
    }

    /** Last close price using the previous-day aggregate endpoint. */
    async getStockPrice(ticker: string, signal?: AbortSignal): Promise<number | null> {
        if (!this.isConfigured) return null;
        const url = `${this.baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${this.apiKey}`;
        const res = await fetch(url, { signal });
        if (!res.ok) return null;
        const data = (await res.json()) as IPolygonPrevResponse;
        return data.results?.[0]?.c ?? null;
    }
}

export class PolygonRateLimitError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = 'PolygonRateLimitError';
    }
}

/** Today's ISO date (YYYY-MM-DD). */
export function todayIso(): string {
    return isoDate(new Date());
}

/** Today + N days (YYYY-MM-DD). */
export function isoDateNDaysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return isoDate(d);
}

/** ISO date for N days ago (YYYY-MM-DD). */
export function isoDateNDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return isoDate(d);
}

function isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

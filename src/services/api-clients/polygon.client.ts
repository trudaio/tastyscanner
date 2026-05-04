/**
 * Polygon.io REST client.
 *
 * Used by SkewAnalysisService and SkewScannerService for options chains,
 * historical prices, snapshots, and earnings data.
 *
 * F1 scaffold: methods declared, return shapes typed, but bodies throw
 * `NotImplementedError` — to be filled in F2.
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
    last_quote?: { bid?: number; ask?: number };
    day?: { close?: number; volume?: number };
}

export interface IPolygonAggregateBar {
    t: number; // timestamp
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
}

export class PolygonClient {
    private readonly apiKey: string;

    constructor() {
        this.apiKey = (import.meta.env.VITE_POLYGON_API_KEY as string | undefined) ?? '';
    }

    get isConfigured(): boolean {
        return this.apiKey.length > 0;
    }

    /** F2: fetch options chain snapshot for an underlying. */
    async getOptionsChainSnapshot(_underlying: string): Promise<IPolygonOptionSnapshot[]> {
        return [];
    }

    /** F2: fetch daily bars between two dates. */
    async getPriceHistory(_ticker: string, _from: string, _to: string): Promise<IPolygonAggregateBar[]> {
        return [];
    }

    /** F2: fetch the latest stock snapshot (last trade price). */
    async getStockPrice(_ticker: string): Promise<number | null> {
        return null;
    }

    /** Reserved for F2. */
    protected get baseUrl(): string {
        return POLYGON_BASE_URL;
    }
}

/**
 * Financial Modeling Prep (FMP) client.
 *
 * Used by SkewAnalysisService for fundamentals (P/E, EPS, market cap, dividend,
 * beta, ratios). Optional — if the API key is missing, callers should fall back
 * to `buildBasicFundamentals` (technicals only).
 *
 * F1 scaffold: methods declared, gracefully returns null when key missing.
 */

export interface IFmpFundamentals {
    pe: number | null;
    eps: number | null;
    marketCap: number | null;
    dividend: number | null;
    beta: number | null;
    epsGrowthQuarterly: number | null;
    salesGrowthQuarterly: number | null;
    epsThisYear: number | null;
    epsNextYear: number | null;
    longTermDebtToEquity: number | null;
    roic: number | null;
    sharesOutstanding: number | null;
    priceToSales: number | null;
}

export class FmpClient {
    private readonly apiKey: string;

    constructor() {
        this.apiKey = (import.meta.env.VITE_FMP_API_KEY as string | undefined) ?? '';
    }

    get isConfigured(): boolean {
        return this.apiKey.length > 0;
    }

    /**
     * F2: fetch fundamentals via 6 parallel FMP calls with 10s timeout.
     * Returns null if the API key is missing or all calls fail — caller falls
     * back to local technicals.
     */
    async getFundamentals(_ticker: string): Promise<IFmpFundamentals | null> {
        if (!this.isConfigured) return null;
        return null;
    }
}

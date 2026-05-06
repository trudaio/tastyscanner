/**
 * Financial Modeling Prep (FMP) client.
 *
 * Used by SkewAnalysisService for fundamentals (P/E, EPS, market cap, dividend,
 * beta, ratios). Optional — if the API key is missing, callers fall back to
 * basic technicals only.
 *
 * NOTE (2025): legacy `/api/v3/` endpoints are no longer accessible to accounts
 * created after 2025-08-31. We use the newer `stable/` endpoints which take
 * `?symbol=` as a query parameter and return slightly different field names.
 *
 * Free-tier rate limit: 250 requests/day. We pack everything into 5 parallel
 * calls per ticker so a single page load only spends 5 of those.
 */

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const REQUEST_TIMEOUT_MS = 10_000;

export interface IFmpFundamentals {
    pe: number | null;
    eps: number | null; // EPS TTM (sum of last 4 quarters)
    marketCap: number | null;
    livePrice: number | null;
    dividend: number | null;
    dividendYield: number | null; // %
    beta: number | null;
    epsGrowthQuarterly: number | null; // %
    salesGrowthQuarterly: number | null; // %
    epsThisYear: number | null;
    epsNextYear: number | null;
    longTermDebtToEquity: number | null;
    roic: number | null; // %
    roe: number | null; // %
    sharesOutstanding: number | null;
    priceToSales: number | null;
    priceToBook: number | null;
    sector: string | null;
    industry: string | null;
    companyName: string | null;
    // Finviz-style additions (from /quote and richer /profile fields)
    priceAvg50: number | null;
    priceAvg200: number | null;
    yearHigh: number | null;
    yearLow: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    volume: number | null;
    avgVolume: number | null;
    change: number | null; // $
    changePct: number | null; // %
    earningsAnnouncement: string | null; // ISO date string (not in stable/quote — left null)
    revenueTtm: number | null;
    netIncomeTtm: number | null;
    bookValuePerShare: number | null;
    cashPerShare: number | null;
    debtToEquity: number | null;
    profitMargin: number | null; // %
    operatingMargin: number | null; // %
    grossMargin: number | null; // %
    returnOnAssets: number | null; // %
    payoutRatio: number | null; // %
    pegRatio: number | null;
    enterpriseValueOverEbitda: number | null;
    earningsYield: number | null; // %
}

/** stable/profile shape */
interface IFmpProfile {
    symbol?: string;
    price?: number;
    beta?: number;
    marketCap?: number;
    lastDividend?: number;
    sector?: string;
    industry?: string;
    companyName?: string;
    averageVolume?: number;
    range?: string;
    change?: number;
    changePercentage?: number;
}

/** stable/quote shape */
interface IFmpQuote {
    symbol?: string;
    name?: string;
    price?: number;
    changePercentage?: number;
    change?: number;
    volume?: number;
    dayLow?: number;
    dayHigh?: number;
    yearHigh?: number;
    yearLow?: number;
    marketCap?: number;
    priceAvg50?: number;
    priceAvg200?: number;
    open?: number;
    previousClose?: number;
    timestamp?: number;
}

/** stable/key-metrics-ttm shape — many fewer fields than legacy v3. */
interface IFmpKeyMetricsTtm {
    marketCap?: number;
    enterpriseValueTTM?: number;
    evToEBITDATTM?: number;
    evToSalesTTM?: number;
    netDebtToEBITDATTM?: number;
    returnOnAssetsTTM?: number;
    returnOnEquityTTM?: number;
    returnOnInvestedCapitalTTM?: number;
    returnOnCapitalEmployedTTM?: number;
    earningsYieldTTM?: number;
    freeCashFlowYieldTTM?: number;
    workingCapitalTTM?: number;
}

/** stable/ratios-ttm shape — most ratios live here now. */
interface IFmpRatiosTtm {
    grossProfitMarginTTM?: number;
    operatingProfitMarginTTM?: number;
    netProfitMarginTTM?: number;
    ebitMarginTTM?: number;
    ebitdaMarginTTM?: number;
    priceToEarningsRatioTTM?: number;
    priceToBookRatioTTM?: number;
    priceToSalesRatioTTM?: number;
    priceToEarningsGrowthRatioTTM?: number;
    debtToEquityRatioTTM?: number;
    debtToAssetsRatioTTM?: number;
    debtToCapitalRatioTTM?: number;
    longTermDebtToCapitalRatioTTM?: number;
    dividendYieldTTM?: number;
    dividendPerShareTTM?: number;
    dividendPayoutRatioTTM?: number;
    revenuePerShareTTM?: number;
    netIncomePerShareTTM?: number;
    cashPerShareTTM?: number;
    bookValuePerShareTTM?: number;
    enterpriseValueMultipleTTM?: number;
}

interface IFmpIncomeStatement {
    eps?: number;
    epsDiluted?: number;
    revenue?: number;
    netIncome?: number;
    period?: string;
    date?: string;
    calendarYear?: string | number;
    weightedAverageShsOut?: number;
    weightedAverageShsOutDil?: number;
}

/** One annual or quarterly period of income-statement data, normalized for charts. */
export interface IFinancialsPoint {
    fiscalPeriod: string;       // "2024" or "Q3 2024"
    periodEndDate: string;      // ISO date
    eps: number | null;
    epsDiluted: number | null;
    revenue: number | null;             // raw $
    sharesOutstanding: number | null;   // raw count (basic)
}

export interface IHistoricalFinancials {
    annual: IFinancialsPoint[];     // oldest → newest
    quarterly: IFinancialsPoint[];  // oldest → newest
}

async function fetchWithTimeout<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
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
     * Fetches everything we need for the Fundamentals card + Company Evaluation
     * Finviz-style table in 5 parallel requests. Each request is independently
     * allowed to fail / timeout — we stitch together whatever does come back.
     */
    async getFundamentals(ticker: string): Promise<IFmpFundamentals | null> {
        if (!this.isConfigured) return null;
        const symbol = encodeURIComponent(ticker.toUpperCase());

        const [profileArr, keyMetricsArr, ratiosArr, incomeArr, quoteArr] = await Promise.all([
            fetchWithTimeout<IFmpProfile[]>(`${FMP_BASE}/profile?symbol=${symbol}&apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpKeyMetricsTtm[]>(`${FMP_BASE}/key-metrics-ttm?symbol=${symbol}&apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpRatiosTtm[]>(`${FMP_BASE}/ratios-ttm?symbol=${symbol}&apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpIncomeStatement[]>(`${FMP_BASE}/income-statement?symbol=${symbol}&period=quarter&limit=4&apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpQuote[]>(`${FMP_BASE}/quote?symbol=${symbol}&apikey=${this.apiKey}`),
        ]);

        const profile = Array.isArray(profileArr) && profileArr.length > 0 ? profileArr[0] : null;
        const keyMetrics = Array.isArray(keyMetricsArr) && keyMetricsArr.length > 0 ? keyMetricsArr[0] : null;
        const ratios = Array.isArray(ratiosArr) && ratiosArr.length > 0 ? ratiosArr[0] : null;
        const incomeQ = Array.isArray(incomeArr) ? incomeArr : [];
        const quote = Array.isArray(quoteArr) && quoteArr.length > 0 ? quoteArr[0] : null;

        if (!profile && !keyMetrics && !ratios && incomeQ.length === 0 && !quote) {
            return null;
        }

        // EPS Q/Q growth from the two most recent quarters of income statements
        let epsGrowthQuarterly: number | null = null;
        let salesGrowthQuarterly: number | null = null;
        if (incomeQ.length >= 2) {
            const latest = incomeQ[0];
            const prior = incomeQ[1];
            if (latest.eps != null && prior.eps != null && Math.abs(prior.eps) > 0) {
                epsGrowthQuarterly = ((latest.eps - prior.eps) / Math.abs(prior.eps)) * 100;
            }
            if (latest.revenue != null && prior.revenue != null && prior.revenue > 0) {
                salesGrowthQuarterly = ((latest.revenue - prior.revenue) / prior.revenue) * 100;
            }
        }

        const eps = incomeQ.length > 0 && incomeQ[0].eps != null
            ? incomeQ.slice(0, 4).reduce((a, q) => a + (q.eps ?? 0), 0) // TTM proxy = sum of last 4 quarters
            : null;

        const revenueTtm = incomeQ.length >= 1 && incomeQ[0].revenue != null
            ? incomeQ.slice(0, 4).reduce((a, q) => a + (q.revenue ?? 0), 0)
            : null;
        const netIncomeTtm = incomeQ.length >= 1 && incomeQ[0].netIncome != null
            ? incomeQ.slice(0, 4).reduce((a, q) => a + (q.netIncome ?? 0), 0)
            : null;

        const marketCap = quote?.marketCap ?? profile?.marketCap ?? keyMetrics?.marketCap ?? null;
        const livePrice = quote?.price ?? profile?.price ?? null;

        // sharesOutstanding — derive from market cap / price (most reliable post-stable)
        const sharesOutstanding = (() => {
            if (incomeQ.length > 0 && incomeQ[0].weightedAverageShsOut != null) return incomeQ[0].weightedAverageShsOut;
            if (marketCap != null && livePrice != null && livePrice > 0) return marketCap / livePrice;
            return null;
        })();

        const dividendYield = ratios?.dividendYieldTTM != null
            ? ratios.dividendYieldTTM * 100
            : null;

        const dividend = (() => {
            if (profile?.lastDividend != null && profile.lastDividend > 0) return profile.lastDividend;
            if (ratios?.dividendPerShareTTM != null) return ratios.dividendPerShareTTM;
            return null;
        })();

        const debtToEquity = ratios?.debtToEquityRatioTTM ?? null;

        return {
            pe: ratios?.priceToEarningsRatioTTM ?? null,
            eps,
            marketCap,
            livePrice,
            dividend,
            dividendYield,
            beta: profile?.beta ?? null,
            epsGrowthQuarterly,
            salesGrowthQuarterly,
            epsThisYear: null,
            epsNextYear: null,
            // longTermDebtToEquity — stable doesn't expose it; use overall D/E as proxy when missing
            longTermDebtToEquity: debtToEquity,
            roic: (() => {
                const v = keyMetrics?.returnOnInvestedCapitalTTM ?? keyMetrics?.returnOnCapitalEmployedTTM;
                return v != null ? v * 100 : null;
            })(),
            roe: (() => {
                const v = keyMetrics?.returnOnEquityTTM;
                return v != null ? v * 100 : null;
            })(),
            sharesOutstanding,
            priceToSales: ratios?.priceToSalesRatioTTM ?? null,
            priceToBook: ratios?.priceToBookRatioTTM ?? null,
            sector: profile?.sector ?? null,
            industry: profile?.industry ?? null,
            companyName: profile?.companyName ?? null,
            priceAvg50: quote?.priceAvg50 ?? null,
            priceAvg200: quote?.priceAvg200 ?? null,
            yearHigh: quote?.yearHigh ?? null,
            yearLow: quote?.yearLow ?? null,
            dayHigh: quote?.dayHigh ?? null,
            dayLow: quote?.dayLow ?? null,
            volume: quote?.volume ?? null,
            avgVolume: profile?.averageVolume ?? null,
            change: quote?.change ?? profile?.change ?? null,
            changePct: quote?.changePercentage ?? profile?.changePercentage ?? null,
            earningsAnnouncement: null, // not available on stable/quote — would need separate stable/earnings call
            revenueTtm,
            netIncomeTtm,
            bookValuePerShare: ratios?.bookValuePerShareTTM ?? null,
            cashPerShare: ratios?.cashPerShareTTM ?? null,
            debtToEquity,
            profitMargin: ratios?.netProfitMarginTTM != null ? ratios.netProfitMarginTTM * 100 : null,
            operatingMargin: ratios?.operatingProfitMarginTTM != null ? ratios.operatingProfitMarginTTM * 100 : null,
            grossMargin: ratios?.grossProfitMarginTTM != null ? ratios.grossProfitMarginTTM * 100 : null,
            returnOnAssets: keyMetrics?.returnOnAssetsTTM != null ? keyMetrics.returnOnAssetsTTM * 100 : null,
            payoutRatio: ratios?.dividendPayoutRatioTTM != null ? ratios.dividendPayoutRatioTTM * 100 : null,
            pegRatio: ratios?.priceToEarningsGrowthRatioTTM ?? null,
            // EV/EBITDA — prefer key-metrics evToEBITDATTM, else ratios enterpriseValueMultipleTTM
            enterpriseValueOverEbitda: keyMetrics?.evToEBITDATTM ?? ratios?.enterpriseValueMultipleTTM ?? null,
            earningsYield: keyMetrics?.earningsYieldTTM != null ? keyMetrics.earningsYieldTTM * 100 : null,
        };
    }

    // (Free-tier FMP caps `limit` at 5 for income-statement, so we source the
    // historical financials from Polygon instead — see SkewAnalysisService.)
}


/**
 * Financial Modeling Prep (FMP) client.
 *
 * Used by SkewAnalysisService for fundamentals (P/E, EPS, market cap, dividend,
 * beta, ratios). Optional — if the API key is missing, callers fall back to
 * basic technicals only.
 *
 * Free-tier rate limit: 250 requests/day. We pack everything into 4 parallel
 * calls per ticker so a single page load only spends 4 of those.
 */

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const REQUEST_TIMEOUT_MS = 10_000;

export interface IFmpFundamentals {
    pe: number | null;
    eps: number | null; // EPS TTM
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
}

interface IFmpProfile {
    symbol?: string;
    price?: number;
    beta?: number;
    mktCap?: number;
    lastDiv?: number;
    sector?: string;
    industry?: string;
    companyName?: string;
}

interface IFmpKeyMetricsTtm {
    peRatioTTM?: number;
    priceToBookRatioTTM?: number;
    priceToSalesRatioTTM?: number;
    enterpriseValueOverEBITDATTM?: number;
    longTermDebtToCapitalizationTTM?: number;
    netDebtToCapitalizationTTM?: number;
    debtToEquityTTM?: number;
    longTermDebtToEquityTTM?: number;
    returnOnEquityTTM?: number;
    returnOnTangibleAssetsTTM?: number;
    earningsYieldTTM?: number;
    dividendPerShareTTM?: number;
    dividendYieldTTM?: number;
    netIncomePerShareTTM?: number;
    sharesOutstandingTTM?: number;
}

interface IFmpRatiosTtm {
    returnOnAssetsTTM?: number;
    returnOnEquityTTM?: number;
    returnOnCapitalEmployedTTM?: number;
    priceEarningsRatioTTM?: number;
    priceToSalesRatioTTM?: number;
    priceBookValueRatioTTM?: number;
    longTermDebtToEquityTTM?: number;
    debtEquityRatioTTM?: number;
    dividendYielTTM?: number; // FMP typo
    dividendYieldTTM?: number;
    dividendPerShareTTM?: number;
}

interface IFmpIncomeStatementGrowth {
    growthRevenue?: number; // fraction
    growthEPS?: number; // fraction
    period?: string;
    date?: string;
}

interface IFmpIncomeStatement {
    eps?: number;
    epsdiluted?: number;
    revenue?: number;
    netIncome?: number;
    period?: string;
    date?: string;
    weightedAverageShsOut?: number;
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
     * Fetches everything we need for the Fundamentals card in 4 parallel
     * requests. Each request is independently allowed to fail / timeout — we
     * stitch together whatever does come back.
     */
    async getFundamentals(ticker: string): Promise<IFmpFundamentals | null> {
        if (!this.isConfigured) return null;
        const symbol = encodeURIComponent(ticker.toUpperCase());

        const [profileArr, keyMetricsArr, ratiosArr, incomeArr] = await Promise.all([
            fetchWithTimeout<IFmpProfile[]>(`${FMP_BASE}/profile/${symbol}?apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpKeyMetricsTtm[]>(`${FMP_BASE}/key-metrics-ttm/${symbol}?apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpRatiosTtm[]>(`${FMP_BASE}/ratios-ttm/${symbol}?apikey=${this.apiKey}`),
            fetchWithTimeout<IFmpIncomeStatement[]>(`${FMP_BASE}/income-statement/${symbol}?period=quarter&limit=4&apikey=${this.apiKey}`),
        ]);

        const profile = Array.isArray(profileArr) && profileArr.length > 0 ? profileArr[0] : null;
        const keyMetrics = Array.isArray(keyMetricsArr) && keyMetricsArr.length > 0 ? keyMetricsArr[0] : null;
        const ratios = Array.isArray(ratiosArr) && ratiosArr.length > 0 ? ratiosArr[0] : null;
        const incomeQ = Array.isArray(incomeArr) ? incomeArr : [];

        if (!profile && !keyMetrics && !ratios && incomeQ.length === 0) {
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

        const marketCap = profile?.mktCap ?? null;
        const livePrice = profile?.price ?? null;

        const dividendYield = (() => {
            if (ratios?.dividendYieldTTM != null) return ratios.dividendYieldTTM * 100;
            if (ratios?.dividendYielTTM != null) return ratios.dividendYielTTM * 100;
            if (keyMetrics?.dividendYieldTTM != null) return keyMetrics.dividendYieldTTM * 100;
            return null;
        })();

        const dividend = (() => {
            if (profile?.lastDiv != null && profile.lastDiv > 0) return profile.lastDiv;
            if (ratios?.dividendPerShareTTM != null) return ratios.dividendPerShareTTM;
            return null;
        })();

        return {
            pe: ratios?.priceEarningsRatioTTM ?? keyMetrics?.peRatioTTM ?? null,
            eps,
            marketCap,
            livePrice,
            dividend,
            dividendYield,
            beta: profile?.beta ?? null,
            epsGrowthQuarterly,
            salesGrowthQuarterly,
            epsThisYear: null, // FMP free tier doesn't expose forward EPS estimates reliably
            epsNextYear: null,
            longTermDebtToEquity: ratios?.longTermDebtToEquityTTM ?? keyMetrics?.longTermDebtToEquityTTM ?? null,
            roic: ratios?.returnOnCapitalEmployedTTM != null ? ratios.returnOnCapitalEmployedTTM * 100 : null,
            roe: (() => {
                const v = ratios?.returnOnEquityTTM ?? keyMetrics?.returnOnEquityTTM;
                return v != null ? v * 100 : null;
            })(),
            sharesOutstanding: keyMetrics?.sharesOutstandingTTM ?? null,
            priceToSales: ratios?.priceToSalesRatioTTM ?? keyMetrics?.priceToSalesRatioTTM ?? null,
            priceToBook: ratios?.priceBookValueRatioTTM ?? keyMetrics?.priceToBookRatioTTM ?? null,
            sector: profile?.sector ?? null,
            industry: profile?.industry ?? null,
            companyName: profile?.companyName ?? null,
        };
    }
}

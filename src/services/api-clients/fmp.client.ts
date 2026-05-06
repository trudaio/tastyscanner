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

/** Current analyst consensus snapshot — feeds the Wall St. Ratings card. */
export interface IGradesConsensus {
    symbol: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensus: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}

export type GradeAction = 'Upgrade' | 'Downgrade' | 'Initiated' | 'Resumed' | 'Reiterated';

/** A single analyst rating change — feeds the Rating Changes table and the 90-day donut. */
export interface IGradeChange {
    symbol: string;
    date: string;                  // ISO yyyy-mm-dd
    action: GradeAction;
    firm: string;                  // gradingCompany
    previousGrade: string | null;  // null for Initiated/Resumed
    newGrade: string;
    priceTarget: number | null;    // adjPriceTarget if available
}

export type InsiderTransactionType =
    | 'Sale'
    | 'Purchase'
    | 'Proposed Sale'
    | 'Proposed Purchase'
    | 'Other';

/** A single Form 4 insider transaction — feeds the Insider Trading table. */
export interface IInsiderTrade {
    symbol: string;
    insiderName: string;
    relationship: string;
    transactionDate: string;       // ISO
    transactionType: InsiderTransactionType;
    price: number | null;
    shares: number;
    value: number;                 // shares × price (or totalValue if FMP supplies it)
    sharesTotal: number | null;    // securitiesOwned post-transaction
    filedAt: string;               // ISO datetime — for SEC Form 4 column
    formUrl: string;               // SEC EDGAR link
}

/** stable/grades-consensus shape */
interface IFmpGradesConsensusRaw {
    symbol?: string;
    strongBuy?: number;
    buy?: number;
    hold?: number;
    sell?: number;
    strongSell?: number;
    consensus?: string;
}

/** stable/grades-news shape (rating changes with price targets) */
interface IFmpGradesNewsRaw {
    symbol?: string;
    publishedDate?: string;
    gradingCompany?: string;
    analystCompany?: string;
    previousGrade?: string;
    newGrade?: string;
    action?: string;
    priceTarget?: number;
    adjPriceTarget?: number;
    /** FMP rarely populates priceTarget on grades-news; we parse from newsTitle as a fallback. */
    newsTitle?: string;
}

/** stable/insider-trading/search shape */
interface IFmpInsiderTradeRaw {
    symbol?: string;
    filingDate?: string;
    transactionDate?: string;
    reportingName?: string;
    typeOfOwner?: string;
    transactionType?: string;       // e.g. "S-Sale", "P-Purchase", "F-Other"
    acquisitionOrDisposition?: 'A' | 'D';
    securitiesOwned?: number;
    securitiesTransacted?: number;
    price?: number;
    totalValue?: number;
    formType?: string;              // "4" for Form 4
    link?: string;
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

    /**
     * Current analyst consensus — counts of Strong Buy / Buy / Hold / Sell /
     * Strong Sell plus the overall consensus label. One row per symbol.
     */
    async getGradesConsensus(ticker: string): Promise<IGradesConsensus | null> {
        if (!this.isConfigured) return null;
        const symbol = encodeURIComponent(ticker.toUpperCase());
        const arr = await fetchWithTimeout<IFmpGradesConsensusRaw[]>(
            `${FMP_BASE}/grades-consensus?symbol=${symbol}&apikey=${this.apiKey}`,
        );
        const row = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
        if (!row) return null;
        const total = (row.strongBuy ?? 0) + (row.buy ?? 0) + (row.hold ?? 0) + (row.sell ?? 0) + (row.strongSell ?? 0);
        if (total === 0) return null;
        return {
            symbol: row.symbol ?? ticker.toUpperCase(),
            strongBuy: row.strongBuy ?? 0,
            buy: row.buy ?? 0,
            hold: row.hold ?? 0,
            sell: row.sell ?? 0,
            strongSell: row.strongSell ?? 0,
            consensus: normalizeConsensus(row.consensus),
        };
    }

    /**
     * Recent analyst rating changes (upgrades/downgrades/initiations) including
     * price targets where the analyst published one. Used for both the Rating
     * Changes table and the 90-day Analysts Breakdown donut.
     */
    async getGradesHistorical(ticker: string, limit = 25): Promise<IGradeChange[]> {
        if (!this.isConfigured) return [];
        const symbol = encodeURIComponent(ticker.toUpperCase());
        const arr = await fetchWithTimeout<IFmpGradesNewsRaw[]>(
            `${FMP_BASE}/grades-news?symbol=${symbol}&limit=${limit}&apikey=${this.apiKey}`,
        );
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((r) => !!r.newGrade && !!r.gradingCompany)
            .map<IGradeChange>((r) => ({
                symbol: r.symbol ?? ticker.toUpperCase(),
                date: (r.publishedDate ?? '').slice(0, 10),
                action: normalizeGradeAction(r.action, r.previousGrade, r.newGrade),
                firm: (r.gradingCompany ?? r.analystCompany ?? '').trim(),
                previousGrade: r.previousGrade && r.previousGrade.trim() !== '' ? r.previousGrade : null,
                newGrade: (r.newGrade ?? '').trim(),
                priceTarget: r.adjPriceTarget ?? r.priceTarget ?? parsePriceTargetFromTitle(r.newsTitle),
            }))
            .sort((a, b) => b.date.localeCompare(a.date));
    }

    /**
     * Insider Form 4 transactions (sales/purchases by officers, directors,
     * 10% owners). Returned newest-first. Free-tier FMP returns ~30 rows max.
     */
    async getInsiderTrades(ticker: string, limit = 30): Promise<IInsiderTrade[]> {
        if (!this.isConfigured) return [];
        const symbol = encodeURIComponent(ticker.toUpperCase());
        const arr = await fetchWithTimeout<IFmpInsiderTradeRaw[]>(
            `${FMP_BASE}/insider-trading/search?symbol=${symbol}&page=0&limit=${limit}&apikey=${this.apiKey}`,
        );
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((r) => r.securitiesTransacted != null && r.securitiesTransacted > 0)
            .map<IInsiderTrade>((r) => {
                const shares = r.securitiesTransacted ?? 0;
                const price = r.price ?? null;
                const value = r.totalValue && r.totalValue > 0
                    ? r.totalValue
                    : (price != null ? shares * price : 0);
                return {
                    symbol: r.symbol ?? ticker.toUpperCase(),
                    insiderName: (r.reportingName ?? '').trim(),
                    relationship: cleanRelationship(r.typeOfOwner),
                    transactionDate: (r.transactionDate ?? '').slice(0, 10),
                    transactionType: normalizeInsiderTxn(r.transactionType, r.acquisitionOrDisposition),
                    price,
                    shares,
                    value,
                    sharesTotal: r.securitiesOwned ?? null,
                    filedAt: r.filingDate ?? '',
                    formUrl: r.link ?? '',
                };
            })
            .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    }
}

function normalizeConsensus(raw?: string): IGradesConsensus['consensus'] {
    const v = (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (v.includes('strong buy')) return 'Strong Buy';
    if (v.includes('strong sell')) return 'Strong Sell';
    if (v.includes('buy') || v === 'outperform' || v === 'overweight') return 'Buy';
    if (v.includes('sell') || v === 'underperform' || v === 'underweight') return 'Sell';
    return 'Hold';
}

/** Map a grade label to a 1–5 ordinal so we can infer Upgrade/Downgrade by comparison. */
function gradeRank(grade?: string): number | null {
    if (!grade) return null;
    const g = grade.toLowerCase().trim();
    if (g === 'strong sell') return 1;
    if (
        g === 'sell' || g === 'underperform' || g === 'underweight' ||
        g === 'reduce' || g === 'negative' || g === 'sector underperform'
    ) return 2;
    if (
        g === 'hold' || g === 'neutral' || g === 'market perform' ||
        g === 'equal-weight' || g === 'equalweight' || g === 'peer perform' ||
        g === 'mkt perform' || g === 'sector weight' || g === 'in-line' || g === 'inline'
    ) return 3;
    if (
        g === 'buy' || g === 'outperform' || g === 'overweight' ||
        g === 'positive' || g === 'add' || g === 'accumulate' ||
        g === 'market outperform' || g === 'sector outperform'
    ) return 4;
    if (g === 'strong buy' || g === 'top pick') return 5;
    return null;
}

function normalizeGradeAction(raw?: string, previousGrade?: string, newGrade?: string): GradeAction {
    const v = (raw ?? '').toLowerCase().trim();
    if (v.includes('upgrade')) return 'Upgrade';
    if (v.includes('downgrade')) return 'Downgrade';
    if (v.includes('init')) return 'Initiated';
    if (v.includes('resum')) return 'Resumed';
    // FMP also returns "hold" for "no change" — but if the grades differ, infer.
    const prev = gradeRank(previousGrade);
    const next = gradeRank(newGrade);
    if (prev != null && next != null) {
        if (next > prev) return 'Upgrade';
        if (next < prev) return 'Downgrade';
    }
    if (!previousGrade || previousGrade.trim() === '') return 'Initiated';
    return 'Reiterated';
}

/** Pull "$X" out of headlines like "Apple price target raised to $310 from $300 at Wells Fargo". */
function parsePriceTargetFromTitle(title?: string): number | null {
    if (!title) return null;
    const m = title.match(/(?:raised|lowered|cut|hiked|increased|decreased|set|maintained|reiterated|kept|reaffirmed)\s+(?:to|at)\s+\$([\d,]+(?:\.\d+)?)/i);
    if (m) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    const m2 = title.match(/price\s+target\s+(?:of|at)\s+\$([\d,]+(?:\.\d+)?)/i);
    if (m2) {
        const n = parseFloat(m2[1].replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function cleanRelationship(raw?: string): string {
    if (!raw) return '';
    // FMP returns things like "officer: Chief Financial Officer" — strip the role prefix.
    const idx = raw.indexOf(':');
    return idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim();
}

function normalizeInsiderTxn(raw?: string, ad?: 'A' | 'D'): InsiderTransactionType {
    const v = (raw ?? '').toLowerCase();
    // FMP transaction codes: "S-Sale", "P-Purchase", "F-…", "M-…", etc.
    if (v.includes('sale') || v.startsWith('s-')) return 'Sale';
    if (v.includes('purchase') || v.startsWith('p-')) return 'Purchase';
    if (ad === 'A') return 'Purchase';
    if (ad === 'D') return 'Sale';
    return 'Other';
}


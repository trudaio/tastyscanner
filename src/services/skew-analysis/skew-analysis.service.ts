import { makeObservable, observable, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ISkewAnalysisService,
    ISkewSnapshot,
    ISkewChartPoint,
    ISuggestedInsight,
    ISuggestedTrades,
    IStrikeByDistance,
    IStrikeByDistanceLeg,
    IExpirationDetail,
    IDeltaLevelDetail,
    IStrikeRow,
    ISkewSummary,
    TermStructure,
} from './skew-analysis.service.interface';
import {
    PolygonClient,
    type IPolygonOptionSnapshot,
} from '../api-clients/polygon.client';
import { FmpClient } from '../api-clients/fmp.client';
import {
    extractPremium,
    calculateIVRank,
    calculateMaxPain,
    calculateExpectedMove,
    calculatePCRatio,
    calculateBasicTechnicals,
    isMonthlyExpiration,
    daysToExpiration,
    type IProcessedOption,
    type IExpectedMove,
    type IPCRatio,
} from '../../utils/skew-math';

const DELTAS = [10, 20, 30, 40] as const;
const DISTANCE_PERCENTS = [1, 5, 10] as const;

export class SkewAnalysisService implements ISkewAnalysisService {
    snapshotByTicker: Map<string, ISkewSnapshot | null> = new Map();
    loadingByTicker: Map<string, boolean> = new Map();
    errorByTicker: Map<string, string | null> = new Map();

    private readonly polygon: PolygonClient;
    private readonly fmp: FmpClient;
    private readonly factory: IServiceFactory;

    constructor(factory: IServiceFactory) {
        this.factory = factory;
        this.polygon = new PolygonClient();
        this.fmp = new FmpClient();
        makeObservable(this, {
            snapshotByTicker: observable.shallow,
            loadingByTicker: observable.shallow,
            errorByTicker: observable.shallow,
        });
    }

    get hasPolygonKey(): boolean {
        return this.polygon.isConfigured;
    }

    get hasFmpKey(): boolean {
        return this.fmp.isConfigured;
    }

    async loadSnapshot(ticker: string, fromDate: string, toDate: string): Promise<void> {
        const key = ticker.toUpperCase();
        runInAction(() => {
            this.loadingByTicker.set(key, true);
            this.errorByTicker.set(key, null);
        });
        try {
            if (!this.polygon.isConfigured) {
                throw new Error('Polygon API key missing — set VITE_POLYGON_API_KEY');
            }

            const yearAgo = new Date();
            yearAgo.setDate(yearAgo.getDate() - 365);
            const yearAgoIso = isoDate(yearAgo);
            const todayIsoStr = isoDate(new Date());

            const [chainRaw, priceHistory, stockPrice, marketMetrics] = await Promise.all([
                this.polygon.getOptionsChainSnapshot(key, fromDate, toDate),
                this.polygon.getPriceHistory(key, yearAgoIso, todayIsoStr),
                this.polygon.getStockPrice(key),
                this.factory.marketDataProvider.getSymbolMetrics(key).catch(() => null),
            ]);

            const processed = processOptions(chainRaw, stockPrice ?? null);
            const chartData = formatChartData(processed.byExp);
            const allOptions = processed.allOptions;
            const firstMonthly = chartData.find((d) => d.isMonthly) ?? chartData[0];
            const optsForFirst = firstMonthly
                ? allOptions.filter((o) => o.expiration === firstMonthly.expiration)
                : allOptions;

            const maxPain = calculateMaxPain(optsForFirst);
            const expectedMove = stockPrice ? calculateExpectedMove(optsForFirst, stockPrice) : null;
            const putCallRatio = calculatePCRatio(allOptions);
            const ivRank = calculateIVRank(processed.allIVs.map((iv) => iv * 100));
            const basicTechnicals = stockPrice
                ? calculateBasicTechnicals(priceHistory, stockPrice)
                : calculateBasicTechnicals(priceHistory, priceHistory[priceHistory.length - 1]?.c ?? 0);
            const byDistance = stockPrice
                ? buildByDistance(optsForFirst, stockPrice)
                : DISTANCE_PERCENTS.map((p) => ({ distancePct: p, put: null, call: null }));
            const suggestedTrades = buildSuggestedTrades(chartData, ivRank, putCallRatio?.ratio ?? null);

            const expirationDetails = buildExpirationDetails(processed.byExp, stockPrice ?? 0);
            const strikesByExpiration = buildStrikesByExpiration(processed.byExp);
            const summary = buildSummary({
                stockPrice: stockPrice ?? null,
                expirationDetails,
                allOptions,
                maxPain,
                expectedMove,
                putCallRatio,
            });

            const ivRankFromTT = toNumOrNull(marketMetrics?.impliedVolatilityIndexRank);
            const ivPercentileFromTT = toNumOrNull(marketMetrics?.impliedVolatilityPercentile);
            const ivIndexFromTT = toNumOrNull(marketMetrics?.impliedVolatilityIndex);
            const betaFromTT = toNumOrNull(marketMetrics?.beta);

            const snapshot: ISkewSnapshot = {
                ticker: key,
                fetchedAt: Date.now(),
                fromDate,
                toDate,
                stockPrice: toNumOrNull(stockPrice),
                chartData,
                ivMetrics: {
                    ivRank: ivRankFromTT != null ? Math.round(ivRankFromTT * 100) : ivRank,
                    ivPercentile: ivPercentileFromTT != null ? Math.round(ivPercentileFromTT * 100) : null,
                    ivIndex: ivIndexFromTT != null ? Math.round(ivIndexFromTT * 1000) / 10 : null,
                    beta: betaFromTT,
                },
                maxPain,
                expectedMove,
                putCallRatio,
                byDistance,
                basicTechnicals,
                suggestedTrades,
                expirationDetails,
                strikesByExpiration,
                summary,
            };

            runInAction(() => {
                this.snapshotByTicker.set(key, snapshot);
                this.loadingByTicker.set(key, false);
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            runInAction(() => {
                this.loadingByTicker.set(key, false);
                this.errorByTicker.set(key, msg);
            });
        }
    }

    getSnapshot(ticker: string): ISkewSnapshot | null {
        return this.snapshotByTicker.get(ticker.toUpperCase()) ?? null;
    }

    isLoading(ticker: string): boolean {
        return this.loadingByTicker.get(ticker.toUpperCase()) === true;
    }

    getError(ticker: string): string | null {
        return this.errorByTicker.get(ticker.toUpperCase()) ?? null;
    }
}

interface IExpirationGroup {
    puts: IProcessedOption[];
    calls: IProcessedOption[];
    isMonthly: boolean;
}

interface IProcessedChain {
    byExp: Map<string, IExpirationGroup>;
    allOptions: IProcessedOption[];
    allIVs: number[];
}

function processOptions(raw: IPolygonOptionSnapshot[], stockPrice: number | null): IProcessedChain {
    const byExp = new Map<string, IExpirationGroup>();
    const allOptions: IProcessedOption[] = [];
    const allIVs: number[] = [];
    void stockPrice;

    for (const opt of raw) {
        const exp = opt.details?.expiration_date;
        const type = opt.details?.contract_type;
        const strike = opt.details?.strike_price;
        if (!exp || !type || strike === undefined) continue;
        const iv = opt.implied_volatility;
        if (iv && iv > 0) allIVs.push(iv);

        const record: IProcessedOption = {
            strike,
            delta: opt.greeks?.delta ?? null,
            iv: iv ?? null,
            premium: extractPremium(opt),
            type,
            expiration: exp,
            volume: opt.day?.volume ?? 0,
            openInterest: opt.open_interest ?? 0,
        };
        allOptions.push(record);

        let group = byExp.get(exp);
        if (!group) {
            group = { puts: [], calls: [], isMonthly: isMonthlyExpiration(exp) };
            byExp.set(exp, group);
        }
        if (type === 'put') group.puts.push(record);
        else group.calls.push(record);
    }
    return { byExp, allOptions, allIVs };
}

function findClosestByDelta(legs: IProcessedOption[], target: number): IProcessedOption | null {
    let best: IProcessedOption | null = null;
    let bestDiff = Infinity;
    for (const leg of legs) {
        if (leg.delta === null) continue;
        const diff = Math.abs(leg.delta - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = leg;
        }
    }
    return best;
}

function findClosestByStrike(legs: IProcessedOption[], targetStrike: number): IProcessedOption | null {
    let best: IProcessedOption | null = null;
    let bestDiff = Infinity;
    for (const leg of legs) {
        const diff = Math.abs(leg.strike - targetStrike);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = leg;
        }
    }
    return best;
}

function formatChartData(byExp: Map<string, IExpirationGroup>): ISkewChartPoint[] {
    const sorted = Array.from(byExp.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([exp, group]) => {
        const point: ISkewChartPoint = {
            expiration: exp,
            expirationLabel: shortDate(exp),
            dte: daysToExpiration(exp),
            isMonthly: group.isMonthly,
            putIv10: null, callIv10: null,
            putIv20: null, callIv20: null,
            putIv30: null, callIv30: null,
            putIv40: null, callIv40: null,
            skewPct10: null,
            premiumSkew10Pct: null,
        };
        for (const d of DELTAS) {
            const putTarget = -d / 100;
            const callTarget = d / 100;
            const bestPut = findClosestByDelta(group.puts, putTarget);
            const bestCall = findClosestByDelta(group.calls, callTarget);
            const putIv = bestPut?.iv != null ? +(bestPut.iv * 100).toFixed(2) : null;
            const callIv = bestCall?.iv != null ? +(bestCall.iv * 100).toFixed(2) : null;
            assignIv(point, d, putIv, callIv);
            if (d === 10 && bestPut && bestCall) {
                if (bestPut.iv != null && bestCall.iv != null) {
                    point.skewPct10 = +(((bestPut.iv - bestCall.iv) / bestCall.iv) * 100).toFixed(2);
                }
                if (bestPut.premium != null && bestCall.premium != null && bestCall.premium > 0) {
                    point.premiumSkew10Pct = +(((bestPut.premium - bestCall.premium) / bestCall.premium) * 100).toFixed(2);
                }
            }
        }
        return point;
    });
}

function assignIv(point: ISkewChartPoint, delta: number, putIv: number | null, callIv: number | null): void {
    switch (delta) {
        case 10: point.putIv10 = putIv; point.callIv10 = callIv; return;
        case 20: point.putIv20 = putIv; point.callIv20 = callIv; return;
        case 30: point.putIv30 = putIv; point.callIv30 = callIv; return;
        case 40: point.putIv40 = putIv; point.callIv40 = callIv; return;
    }
}

function buildByDistance(opts: IProcessedOption[], stockPrice: number): IStrikeByDistance[] {
    const puts = opts.filter((o) => o.type === 'put');
    const calls = opts.filter((o) => o.type === 'call');
    return DISTANCE_PERCENTS.map((pct) => {
        const putTarget = stockPrice * (1 - pct / 100);
        const callTarget = stockPrice * (1 + pct / 100);
        const bestPut = findClosestByStrike(puts, putTarget);
        const bestCall = findClosestByStrike(calls, callTarget);
        return {
            distancePct: pct,
            put: legToView(bestPut, stockPrice),
            call: legToView(bestCall, stockPrice),
        };
    });
}

function legToView(leg: IProcessedOption | null, stockPrice: number): IStrikeByDistanceLeg | null {
    if (!leg) return null;
    return {
        strike: leg.strike,
        delta: leg.delta,
        premium: leg.premium,
        volume: leg.volume,
        pctFromStock: ((leg.strike - stockPrice) / stockPrice) * 100,
    };
}

function buildSuggestedTrades(
    chartData: ISkewChartPoint[],
    ivRank: number | null,
    pcRatio: number | null,
): ISuggestedTrades {
    const insights: ISuggestedInsight[] = [];
    const tenDeltaSkews = chartData
        .map((d) => d.premiumSkew10Pct)
        .filter((v): v is number => v !== null);
    const avgSkew10 = tenDeltaSkews.length
        ? tenDeltaSkews.reduce((a, b) => a + b, 0) / tenDeltaSkews.length
        : null;

    let assessment: ISuggestedTrades['assessment'] = 'Unknown';
    if (avgSkew10 !== null) {
        if (avgSkew10 > 20) {
            assessment = 'Elevated Fear';
            insights.push({ level: 'warning', text: `High put premium skew (+${avgSkew10.toFixed(1)}% avg). Significant downside hedging demand.` });
        } else if (avgSkew10 > 5) {
            assessment = 'Normal';
            insights.push({ level: 'info', text: `Moderate put premium skew (+${avgSkew10.toFixed(1)}% avg). Normal hedging activity.` });
        } else if (avgSkew10 > -5) {
            assessment = 'Balanced';
            insights.push({ level: 'neutral', text: `Balanced put/call premium (${avgSkew10 > 0 ? '+' : ''}${avgSkew10.toFixed(1)}% avg). Neutral sentiment.` });
        } else {
            assessment = 'Bullish';
            insights.push({ level: 'success', text: `Calls richer than puts (${avgSkew10.toFixed(1)}% avg). Bullish sentiment.` });
        }
    }

    if (ivRank !== null) {
        if (ivRank >= 50) {
            insights.push({ level: 'success', text: `IV rank at ${ivRank} — premium-selling environment (≥50). Iron condors / credit spreads favored.` });
        } else if (ivRank >= 30) {
            insights.push({ level: 'info', text: `IV rank at ${ivRank} — moderate. Prefer high-POP credit structures with wide wings.` });
        } else {
            insights.push({ level: 'warning', text: `IV rank at ${ivRank} — premium poor (<30). Consider waiting or debit/calendars.` });
        }
    }

    if (pcRatio !== null) {
        if (pcRatio > 1.2) {
            insights.push({ level: 'warning', text: `P/C ratio ${pcRatio.toFixed(2)} — bearish positioning (more put volume).` });
        } else if (pcRatio < 0.8) {
            insights.push({ level: 'success', text: `P/C ratio ${pcRatio.toFixed(2)} — bullish positioning (more call volume).` });
        } else {
            insights.push({ level: 'neutral', text: `P/C ratio ${pcRatio.toFixed(2)} — balanced volume.` });
        }
    }

    return { assessment, insights };
}

function buildExpirationDetails(
    byExp: Map<string, IExpirationGroup>,
    stockPrice: number,
): IExpirationDetail[] {
    const sorted = Array.from(byExp.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([exp, group]) => {
        const perDelta: IDeltaLevelDetail[] = DELTAS.map((d) => {
            const putTarget = -d / 100;
            const callTarget = d / 100;
            const bestPut = findClosestByDelta(group.puts, putTarget);
            const bestCall = findClosestByDelta(group.calls, callTarget);

            const putDist = stockPrice && bestPut ? ((bestPut.strike - stockPrice) / stockPrice) * 100 : null;
            const callDist = stockPrice && bestCall ? ((bestCall.strike - stockPrice) / stockPrice) * 100 : null;
            const skewDollar = bestPut?.premium != null && bestCall?.premium != null
                ? bestPut.premium - bestCall.premium
                : null;
            const skewPct = bestPut?.premium != null && bestCall?.premium != null && bestCall.premium > 0
                ? ((bestPut.premium - bestCall.premium) / bestCall.premium) * 100
                : null;
            const imbalance = putDist != null && callDist != null && callDist !== 0
                ? Math.abs(putDist / callDist)
                : null;
            return {
                delta: d,
                putStrike: bestPut?.strike ?? null,
                putPremium: bestPut?.premium ?? null,
                putDelta: bestPut?.delta ?? null,
                putVolume: bestPut?.volume ?? 0,
                putIv: bestPut?.iv ?? null,
                putDistPct: putDist,
                callStrike: bestCall?.strike ?? null,
                callPremium: bestCall?.premium ?? null,
                callDelta: bestCall?.delta ?? null,
                callVolume: bestCall?.volume ?? 0,
                callIv: bestCall?.iv ?? null,
                callDistPct: callDist,
                skewDollar,
                skewPct,
                imbalance,
            };
        });

        const expOpts = [...group.puts, ...group.calls];
        const putVolTotal = group.puts.reduce((a, b) => a + (b.volume || 0), 0);
        const callVolTotal = group.calls.reduce((a, b) => a + (b.volume || 0), 0);
        const expMaxPain = stockPrice ? calculateMaxPain(expOpts) : null;

        return {
            expiration: exp,
            expirationLabel: shortDate(exp),
            dte: daysToExpiration(exp),
            isMonthly: group.isMonthly,
            perDelta,
            putVolumeTotal: putVolTotal,
            callVolumeTotal: callVolTotal,
            maxPain: expMaxPain,
        };
    });
}

function buildStrikesByExpiration(byExp: Map<string, IExpirationGroup>): Record<string, IStrikeRow[]> {
    const out: Record<string, IStrikeRow[]> = {};
    for (const [exp, group] of byExp.entries()) {
        const rows: IStrikeRow[] = [];
        for (const o of group.puts) {
            rows.push({
                strike: o.strike,
                type: 'put',
                premium: o.premium,
                iv: o.iv,
                delta: o.delta,
                volume: o.volume,
                openInterest: o.openInterest,
            });
        }
        for (const o of group.calls) {
            rows.push({
                strike: o.strike,
                type: 'call',
                premium: o.premium,
                iv: o.iv,
                delta: o.delta,
                volume: o.volume,
                openInterest: o.openInterest,
            });
        }
        out[exp] = rows;
    }
    return out;
}

function buildSummary(args: {
    stockPrice: number | null;
    expirationDetails: IExpirationDetail[];
    allOptions: IProcessedOption[];
    maxPain: number | null;
    expectedMove: IExpectedMove | null;
    putCallRatio: IPCRatio | null;
}): ISkewSummary {
    const { stockPrice, expirationDetails, maxPain, expectedMove, putCallRatio } = args;
    const skews: number[] = [];
    for (const d of expirationDetails) {
        const ten = d.perDelta.find((x) => x.delta === 10);
        if (ten?.skewPct != null && Number.isFinite(ten.skewPct)) skews.push(ten.skewPct);
    }
    const avgSkewPct10 = skews.length ? skews.reduce((a, b) => a + b, 0) / skews.length : null;

    let termStructure: TermStructure = 'unknown';
    const front = expirationDetails[0];
    const back = expirationDetails[expirationDetails.length - 1];
    if (front && back && front !== back) {
        const f = front.perDelta.find((x) => x.delta === 10)?.skewPct ?? null;
        const b = back.perDelta.find((x) => x.delta === 10)?.skewPct ?? null;
        if (f != null && b != null) {
            const diff = f - b;
            if (Math.abs(diff) < 5) termStructure = 'flat';
            else if (diff > 0) termStructure = 'backwardation'; // front more skewed
            else termStructure = 'contango';
        }
    }

    return {
        stockPrice,
        avgSkewPct10,
        termStructure,
        maxPain,
        expectedMove,
        putCallRatio,
        totalPuts60d: putCallRatio?.putVolume ?? 0,
        totalCalls60d: putCallRatio?.callVolume ?? 0,
    };
}

function toNumOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function shortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

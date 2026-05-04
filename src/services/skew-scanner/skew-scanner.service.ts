import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ISkewScannerService,
    IScannerRow,
} from './skew-scanner.service.interface';
import {
    PolygonClient,
    PolygonRateLimitError,
    type IPolygonOptionSnapshot,
} from '../api-clients/polygon.client';
import { extractPremium, getNextMonthlyExpirations } from '../../utils/skew-math';

const DEFAULT_DELAY_MS = 8000;
const MAX_BACKOFF_MS = 60_000;
const MONTHLY_COUNT = 3;

function toNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function sleepMs(ms: number, isAborted: () => boolean): Promise<void> {
    return new Promise((resolve) => {
        if (ms <= 0) { resolve(); return; }
        const start = Date.now();
        const tick = (): void => {
            if (isAborted()) { resolve(); return; }
            const elapsed = Date.now() - start;
            if (elapsed >= ms) { resolve(); return; }
            setTimeout(tick, Math.min(200, ms - elapsed));
        };
        tick();
    });
}

export class SkewScannerService implements ISkewScannerService {
    rows: Map<string, IScannerRow> = new Map();
    monthlies: string[] = [];
    isRunning = false;
    delayMs: number = DEFAULT_DELAY_MS;

    private aborted = false;
    private readonly polygon: PolygonClient;
    private readonly factory: IServiceFactory;

    constructor(factory: IServiceFactory) {
        this.factory = factory;
        this.polygon = new PolygonClient();
        makeObservable(this, {
            rows: observable.shallow,
            monthlies: observable.ref,
            isRunning: observable,
            delayMs: observable,
            setDelayMs: action,
            reset: action,
            progress: computed,
        });
    }

    setDelayMs(ms: number): void {
        runInAction(() => {
            this.delayMs = Math.max(0, ms);
        });
    }

    get progress(): { done: number; total: number } {
        let done = 0;
        for (const r of this.rows.values()) {
            if (r.status === 'done' || r.status === 'error') done += 1;
        }
        return { done, total: this.rows.size };
    }

    private setRow(ticker: string, patch: Partial<IScannerRow>): void {
        const key = ticker.toUpperCase();
        runInAction(() => {
            const next = new Map(this.rows);
            const prev = next.get(key) ?? this.emptyRow(key);
            next.set(key, { ...prev, ...patch, ticker: key });
            this.rows = next;
        });
    }

    private emptyRow(ticker: string): IScannerRow {
        const skewByMonth: Record<string, number | null> = {};
        for (const m of this.monthlies) skewByMonth[m] = null;
        return {
            ticker,
            status: 'pending',
            price: null,
            ivRank: null,
            skewByMonth,
            avgSkewPct: null,
            lastUpdate: null,
            errorMessage: null,
        };
    }

    async start(tickers: string[]): Promise<void> {
        if (this.isRunning) return;
        this.aborted = false;

        const monthlies = getNextMonthlyExpirations(MONTHLY_COUNT);
        runInAction(() => {
            this.monthlies = monthlies;
            this.isRunning = true;
            const next = new Map<string, IScannerRow>();
            for (const t of tickers) {
                const key = t.toUpperCase();
                next.set(key, this.emptyRow(key));
            }
            this.rows = next;
        });

        let backoffMs = this.delayMs;
        const fromDate = monthlies[0];
        const toDate = monthlies[monthlies.length - 1];
        const isAborted = (): boolean => this.aborted;

        for (const rawTicker of tickers) {
            if (isAborted()) break;
            const ticker = rawTicker.toUpperCase();
            this.setRow(ticker, { status: 'scanning', errorMessage: null });

            try {
                const result = await this.scanTicker(ticker, fromDate, toDate, monthlies);
                this.setRow(ticker, {
                    status: 'done',
                    price: result.price,
                    ivRank: result.ivRank,
                    skewByMonth: result.skewByMonth,
                    avgSkewPct: result.avgSkewPct,
                    lastUpdate: Date.now(),
                    errorMessage: null,
                });
                backoffMs = this.delayMs;
            } catch (err) {
                if (err instanceof PolygonRateLimitError) {
                    const nextBackoff = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
                    this.setRow(ticker, {
                        status: 'rateLimited',
                        errorMessage: `Rate limited — backing off to ${(nextBackoff / 1000).toFixed(0)}s`,
                    });
                    backoffMs = nextBackoff;
                } else {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    this.setRow(ticker, { status: 'error', errorMessage: msg, lastUpdate: Date.now() });
                }
            }

            if (isAborted()) break;
            await sleepMs(backoffMs, isAborted);
            if (isAborted()) break;
        }

        runInAction(() => { this.isRunning = false; });
    }

    stop(): void {
        this.aborted = true;
        runInAction(() => { this.isRunning = false; });
    }

    reset(): void {
        this.rows = new Map();
        this.isRunning = false;
        this.aborted = false;
        this.monthlies = [];
    }

    private async scanTicker(
        ticker: string,
        fromDate: string,
        toDate: string,
        monthlies: string[],
    ): Promise<{
        price: number | null;
        ivRank: number | null;
        skewByMonth: Record<string, number | null>;
        avgSkewPct: number | null;
    }> {
        const [chain, price, metrics] = await Promise.all([
            this.polygon.getOptionsChainSnapshot(ticker, fromDate, toDate),
            this.polygon.getStockPrice(ticker),
            this.factory.marketDataProvider.getSymbolMetrics(ticker).catch(() => null),
        ]);

        const skewByMonth: Record<string, number | null> = {};
        const skews: number[] = [];
        for (const monthDate of monthlies) {
            const skew = compute25DeltaSkew(chain, monthDate);
            skewByMonth[monthDate] = skew;
            if (skew != null && Number.isFinite(skew)) skews.push(skew);
        }
        const avgSkewPct = skews.length ? skews.reduce((a, b) => a + b, 0) / skews.length : null;

        const ivRankRaw = toNum(metrics?.impliedVolatilityIndexRank);
        const ivRank = ivRankRaw != null ? Math.round(ivRankRaw * 100) : null;

        return {
            price: toNum(price),
            ivRank,
            skewByMonth,
            avgSkewPct,
        };
    }
}

function compute25DeltaSkew(chain: IPolygonOptionSnapshot[], monthDate: string): number | null {
    let bestPut: IPolygonOptionSnapshot | null = null;
    let bestPutDiff = Infinity;
    let bestCall: IPolygonOptionSnapshot | null = null;
    let bestCallDiff = Infinity;

    for (const opt of chain) {
        if (opt.details?.expiration_date !== monthDate) continue;
        const delta = opt.greeks?.delta;
        if (delta == null || !Number.isFinite(delta)) continue;
        if (opt.details.contract_type === 'put') {
            const diff = Math.abs(delta - -0.25);
            if (diff < bestPutDiff) { bestPutDiff = diff; bestPut = opt; }
        } else if (opt.details.contract_type === 'call') {
            const diff = Math.abs(delta - 0.25);
            if (diff < bestCallDiff) { bestCallDiff = diff; bestCall = opt; }
        }
    }
    if (!bestPut || !bestCall) return null;
    const putPrem = extractPremium(bestPut);
    const callPrem = extractPremium(bestCall);
    if (putPrem == null || callPrem == null || callPrem <= 0) return null;
    return ((putPrem - callPrem) / callPrem) * 100;
}

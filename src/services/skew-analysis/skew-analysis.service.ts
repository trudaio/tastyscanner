import { makeObservable, observable, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ISkewAnalysisService,
    ISkewSnapshot,
} from './skew-analysis.service.interface';
import { PolygonClient } from '../api-clients/polygon.client';
import { FmpClient } from '../api-clients/fmp.client';

export class SkewAnalysisService implements ISkewAnalysisService {
    snapshotByTicker: Map<string, ISkewSnapshot | null> = new Map();
    loadingByTicker: Map<string, boolean> = new Map();
    errorByTicker: Map<string, string | null> = new Map();

    private readonly polygon: PolygonClient;
    private readonly fmp: FmpClient;

    constructor(_factory: IServiceFactory) {
        this.polygon = new PolygonClient();
        this.fmp = new FmpClient();
        makeObservable(this, {
            snapshotByTicker: observable,
            loadingByTicker: observable,
            errorByTicker: observable,
        });
    }

    async loadSnapshot(ticker: string, _fromDate: string, _toDate: string): Promise<void> {
        const key = ticker.toUpperCase();
        runInAction(() => {
            this.loadingByTicker.set(key, true);
            this.errorByTicker.set(key, null);
        });
        try {
            // F2: orchestrate Polygon (chains + history + price), TastyTrade
            // (market metrics), FMP (fundamentals with fallback) + processors.
            // For F1 we just record an empty snapshot so the page can render.
            const snapshot: ISkewSnapshot = {
                ticker: key,
                fetchedAt: Date.now(),
                stockPrice: null,
                chartData: [],
                ivMetrics: { ivRank: null, ivPercentile: null, fiveDayChange: null },
                maxPain: null,
                expectedMove: null,
                putCallRatio: null,
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

    get hasPolygonKey(): boolean {
        return this.polygon.isConfigured;
    }

    get hasFmpKey(): boolean {
        return this.fmp.isConfigured;
    }
}

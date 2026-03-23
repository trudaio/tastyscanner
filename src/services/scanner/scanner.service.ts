import { makeObservable, observable, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type { IScannerService, IOpportunity } from './scanner.interface';
import type { IIronCondorViewModel } from '../../models/iron-condor.view-model.interface';
import { TickerModel } from '../../models/ticker.model';

/** Maximum number of watchlist tickers to consider per scan. */
const MAX_TICKERS = 20;
/** Maximum tickers to subscribe to DxLink for greeks during a scan. */
const MAX_DXLINK_TICKERS = 5;
/** Minimum IV Rank to qualify for scanning. */
const MIN_IV_RANK = 30;
/** Delay between REST chain loads to respect TastyTrade rate limits. */
const CHAIN_LOAD_DELAY_MS = 1500;
/** Time to wait for DxLink greeks to stream in after subscribing. */
const GREEKS_WAIT_MS = 5000;

export class ScannerService implements IScannerService {
    opportunities: IOpportunity[] = [];
    isScanning = false;
    lastScanTime: Date | null = null;

    constructor(private readonly _services: IServiceFactory) {
        makeObservable(this, {
            opportunities: observable,
            isScanning: observable,
            lastScanTime: observable.ref,
        });
    }

    async runScan(): Promise<void> {
        if (this.isScanning) return;
        runInAction(() => { this.isScanning = true; });

        try {
            // 1. Get watchlist symbols (limited to MAX_TICKERS)
            const allSymbols = Array.from(this._services.watchlistData.tickerData.keys())
                .slice(0, MAX_TICKERS);

            if (allSymbols.length === 0) return;

            // 2. Filter by IV Rank >= MIN_IV_RANK, sort descending
            const qualifying = allSymbols
                .filter(s => (this._services.watchlistData.getTickerData(s)?.ivRank ?? 0) >= MIN_IV_RANK)
                .sort((a, b) => {
                    const ivA = this._services.watchlistData.getTickerData(a)?.ivRank ?? 0;
                    const ivB = this._services.watchlistData.getTickerData(b)?.ivRank ?? 0;
                    return ivB - ivA;
                });

            if (qualifying.length === 0) return;

            // 3. Subscribe to DxLink only for top-N to limit connection usage
            const topTickers = qualifying.slice(0, MAX_DXLINK_TICKERS);

            // 4. Throttled chain load: load each ticker sequentially with delay
            const tickers: TickerModel[] = [];
            for (let i = 0; i < topTickers.length; i++) {
                const symbol = topTickers[i];
                const ticker = new TickerModel(symbol, this._services);
                await ticker.start();
                tickers.push(ticker);
                if (i < topTickers.length - 1) {
                    await this._delay(CHAIN_LOAD_DELAY_MS);
                }
            }

            // 5. Wait for greeks to stream in via DxLink
            await this._delay(GREEKS_WAIT_MS);

            // 6. Build and score opportunities
            const opportunities: IOpportunity[] = [];
            for (const ticker of tickers) {
                const ivRank = this._services.watchlistData.getTickerData(ticker.symbol)?.ivRank ?? ticker.ivRank;
                const opp = this._buildOpportunity(ticker, ivRank);
                if (opp) opportunities.push(opp);

                // Unsubscribe after scoring (skip positions.clearPositions to avoid shared state)
                this._unsubscribeTicker(ticker);
            }

            // 7. Sort by composite score descending
            opportunities.sort((a, b) => b.score - a.score);

            runInAction(() => {
                this.opportunities = opportunities;
                this.lastScanTime = new Date();
            });
        } finally {
            runInAction(() => { this.isScanning = false; });
        }
    }

    async scanTicker(symbol: string): Promise<IOpportunity | null> {
        // Resolve IV Rank: use watchlist cache first, else fetch fresh
        let ivRank = this._services.watchlistData.getTickerData(symbol)?.ivRank ?? null;
        if (ivRank === null) {
            const metrics = await this._services.marketDataProvider.getSymbolMetrics(symbol);
            ivRank = metrics?.impliedVolatilityIndexRank != null
                ? Math.round(metrics.impliedVolatilityIndexRank * 10000) / 100
                : 0;
        }

        const ticker = new TickerModel(symbol, this._services);
        await ticker.start();

        try {
            await this._delay(GREEKS_WAIT_MS);
            return this._buildOpportunity(ticker, ivRank);
        } finally {
            this._unsubscribeTicker(ticker);
        }
    }

    private _buildOpportunity(ticker: TickerModel, ivRank: number): IOpportunity | null {
        const expirations = ticker.getExpirationsWithIronCondors();
        if (expirations.length === 0) return null;

        // Use the first qualifying expiration (closest DTE within settings range)
        const expiration = expirations[0];
        const ironCondors = expiration.ironCondors;
        if (ironCondors.length === 0) return null;

        // ironCondors already sorted by alpha descending by StrategiesBuilder
        const bestIC = ironCondors[0];

        // Composite score: alpha * POP * IVR/100
        const score = bestIC.alpha * bestIC.pop * (ivRank / 100);

        return {
            ticker,
            ironCondor: bestIC,
            score,
            ivRank,
            estimatedCredit: bestIC.credit,
            scanTime: new Date(),
        };
    }

    /** Unsubscribe all DxLink symbols for a scanned ticker without touching shared positions state. */
    private _unsubscribeTicker(ticker: TickerModel): void {
        const symbols: string[] = [ticker.symbol];
        for (const exp of ticker.expirations) {
            exp.getAllSymbols().forEach(s => symbols.push(s));
        }
        this._services.marketDataProvider.unsubscribe(symbols);
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

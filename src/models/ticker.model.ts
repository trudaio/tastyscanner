import {IReactionDisposer, makeObservable, observable, reaction, runInAction, when} from "mobx";
import {OptionsExpirationModel} from "./options-expiration.model";
import {ITickerViewModel} from "./ticker.view-model.interface";
import {IServiceFactory} from "../services/service-factory.interface";
import {IOptionsExpirationVewModel} from "./options-expiration.view-model.interface";
import {
    IGreeksRawData,
    IQuoteRawData, ISymbolInfoRawData, ISymbolMetricsRawData, ITradeRawData
} from "../services/market-data-provider/market-data-provider.service.interface";
import {NullableNumber} from "../utils/nullable-types";

export class TickerModel implements ITickerViewModel {
    constructor(public readonly symbol: string,
                public readonly services: IServiceFactory) {

        makeObservable<this, '_isLoading' | '_marketMetrics' | '_symbolInfo'>(this, {
            expirations: observable,
            _isLoading: observable.ref,
            _marketMetrics: observable.ref,
            _symbolInfo: observable.ref,
        });
    }

    public expirations: OptionsExpirationModel[] = [];
    private _marketMetrics: ISymbolMetricsRawData | null = null;
    private _symbolInfo: ISymbolInfoRawData | null = null;

    private _isLoading: boolean = true;


    public get description(): string {
        return this._symbolInfo?.description ?? "";
    }

    public get currentPrice(): number {
        return this.getSymbolTrade(this.symbol)?.price ?? 0;
    }

    public get ivRank(): number {
        return Math.round((this._marketMetrics?.impliedVolatilityIndexRank ?? 0) * 10000) / 100;
    }


    public  get beta(): number {
        return Math.round((this._marketMetrics?.beta ?? 0) * 100) / 100;
    }

    public get earningsDate(): string {
        return this._marketMetrics?.earnings?.expectedReportDate ?? "";
    }

    public  get listedMarket(): string {
        return this._symbolInfo?.listedMarket ?? "";
    }

    public get daysUntilEarnings(): NullableNumber {
        const earningsDateStr = this.earningsDate;
        if(!earningsDateStr) {
            return null;
        }

        const earningsDate = new Date(earningsDateStr);
        return Math.round((earningsDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }


    get isLoading(): boolean {
        return this._isLoading;
    }

    set isLoading(value: boolean) {
        runInAction(() => this._isLoading = value);
    }

    getSymbolTrade(symbol: string): ITradeRawData | undefined {
        return this.services.marketDataProvider.getSymbolTrade(symbol);
    }

    getSymbolQuote(symbol: string): IQuoteRawData | undefined {
        return this.services.marketDataProvider.getSymbolQuote(symbol);
    }
    getSymbolGreeks(symbol: string): IGreeksRawData | undefined {
        return this.services.marketDataProvider.getSymbolGreeks(symbol);
    }


    private async _loadMarketData(): Promise<void> {

        if(!this._marketMetrics) {
            const mm = await this.services.marketDataProvider.getSymbolMetrics(this.symbol);
            runInAction(() => {
                this._marketMetrics = mm;
            });
        }

        if(!this._symbolInfo) {
            const si = await this.services.marketDataProvider.getSymbolInfo(this.symbol);
            runInAction(() => {
                this._symbolInfo = si;
            });
        }

        if(this.expirations.length > 0) {
            return;
        }

        const optionsChain = await this.services.marketDataProvider.getOptionsChain(this.symbol);
        const expirations: OptionsExpirationModel[] = []

        for(const optionChain of optionsChain) {
            for(const expiration of optionChain.expirations) {
                if(expiration.daysToExpiration <= 730) { //maximum 2 years is enough
                    expirations.push(new OptionsExpirationModel(expiration, this))
                }

            }
        }

        runInAction(() => {
            this.expirations = expirations.sort((a, b) => a.daysToExpiration - b.daysToExpiration);
        });
    }

    // DxLink rejects over-large subscription batches ("Your subscription rate is
    // too high") and the rejected symbols never receive data. Subscribing every
    // strike of every expiration (~11k symbols on QQQ) starved ~70% of the chain,
    // so only stream expirations inside the DTE filter and strikes near the money.
    private static readonly STRIKE_BAND_PCT = 0.20;

    private _streamedSymbols: string[] = [];
    private _filtersReaction: IReactionDisposer | null = null;
    private _spotWhenDisposer: IReactionDisposer | null = null;
    // Bumped by every start()/stop(); an in-flight start() aborts after each
    // await if it is no longer the current lifecycle (rapid ticker switch).
    private _lifecycleEpoch = 0;

    private _getSpotEstimate(): number {
        const trade = this.getSymbolTrade(this.symbol)?.price ?? 0;
        if(trade > 0) {
            return trade;
        }
        const quote = this.getSymbolQuote(this.symbol);
        const bid = quote?.bidPrice ?? 0;
        const ask = quote?.askPrice ?? 0;
        return (bid > 0 && ask > 0) ? (bid + ask) / 2 : 0;
    }

    private _getStreamSymbols(): string[] {
        const filters = this.services.settings.strategyFilters;
        const spot = this._getSpotEstimate();
        const symbols: string[] = [this.symbol];

        // Without a spot price the strike band can't be applied — subscribing
        // the full chain would flood DxLink's rate limit, so stream only the
        // underlying; the spot `when` in start() re-syncs once a price arrives.
        if(spot <= 0) {
            return symbols;
        }

        for(const expiration of this.expirations) {
            if(expiration.daysToExpiration < filters.minDaysToExpiration
                || expiration.daysToExpiration > filters.maxDaysToExpiration) {
                continue;
            }
            for(const strike of expiration.strikes) {
                if(spot > 0 && Math.abs(strike.strikePrice - spot) > spot * TickerModel.STRIKE_BAND_PCT) {
                    continue;
                }
                symbols.push(strike.put.streamerSymbol);
                symbols.push(strike.call.streamerSymbol);
            }
        }

        return symbols;
    }

    private _syncSubscriptions(): void {
        const next = this._getStreamSymbols();
        const nextSet = new Set(next);
        const prevSet = new Set(this._streamedSymbols);
        const toRemove = this._streamedSymbols.filter(s => !nextSet.has(s));
        const toAdd = next.filter(s => !prevSet.has(s));

        if(toRemove.length > 0) {
            this.services.marketDataProvider.unsubscribe(toRemove);
        }
        if(toAdd.length > 0) {
            this.services.marketDataProvider.subscribe(toAdd);
        }
        this._streamedSymbols = next;
    }

    private async _waitForSpot(timeoutMs: number): Promise<void> {
        const startedAt = Date.now();
        while(Date.now() - startedAt < timeoutMs) {
            if(this._getSpotEstimate() > 0) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async start(): Promise<void> {
        const epoch = ++this._lifecycleEpoch;
        this.isLoading = true;
        try {
            await this._loadMarketData();
            if(epoch !== this._lifecycleEpoch) {
                return; // superseded by a stop()/start() while loading
            }

            // Subscribe the underlying first and wait briefly for a spot price
            // so the options subscription can be narrowed to near-the-money strikes.
            this.services.marketDataProvider.subscribe([this.symbol]);
            await this._waitForSpot(3000);
            if(epoch !== this._lifecycleEpoch) {
                this.services.marketDataProvider.unsubscribe([this.symbol]);
                return;
            }
            this._streamedSymbols = [this.symbol];
            this._syncSubscriptions();

            // If the spot price wasn't known yet, only the underlying is
            // streaming (see _getStreamSymbols). Sync again once spot arrives
            // so the near-the-money option subscriptions kick in.
            this._disposeWatchers();
            if(this._getSpotEstimate() <= 0) {
                this._spotWhenDisposer = when(
                    () => this._getSpotEstimate() > 0,
                    () => this._syncSubscriptions());
            }

            // Re-sync streamed symbols whenever strategy filters change (DTE range).
            this._filtersReaction = reaction(
                () => this.services.settings.strategyFilters.lastUpdate,
                () => this._syncSubscriptions());

            // Load positions for this ticker to enable conflict detection
            await this.services.positions.loadPositions(this.symbol);

        } finally {
            this.isLoading = false;
        }

    }

    private _disposeWatchers(): void {
        if(this._filtersReaction) {
            this._filtersReaction();
            this._filtersReaction = null;
        }
        if(this._spotWhenDisposer) {
            this._spotWhenDisposer();
            this._spotWhenDisposer = null;
        }
    }

    async stop(): Promise<void> {
        this._lifecycleEpoch++;
        this._disposeWatchers();
        this.services.marketDataProvider.unsubscribe(this._streamedSymbols);
        this._streamedSymbols = [];
        this.services.positions.clearPositions();
    }

    private _shouldIncludeExpiration(expiration: OptionsExpirationModel): boolean {
        const filters = this.services.settings.strategyFilters;
        if(expiration.daysToExpiration < filters.minDaysToExpiration
            || expiration.daysToExpiration > filters.maxDaysToExpiration) {
            return false;
        }

        const daysUntilEarnings = this.daysUntilEarnings ?? 0;

        if(daysUntilEarnings <= 0) {
            return true;
        }

        switch (filters.byEarningsDate) {
            case 'before':
                return expiration.daysToExpiration < daysUntilEarnings;
            case 'after':
                return expiration.daysToExpiration > daysUntilEarnings;
            default:
                return true;
        }

    }

    private _filterExpirations(): IOptionsExpirationVewModel[] {
        return this.expirations.filter(expiration => this._shouldIncludeExpiration(expiration))
            .sort((a, b) => a.daysToExpiration - b.daysToExpiration);
    }

    getFilteredExpirations(): IOptionsExpirationVewModel[] {
        return this._filterExpirations();
    }

    getExpirationsWithIronCondors(): IOptionsExpirationVewModel[] {
        return this._filterExpirations().filter(expiration => expiration.ironCondors.length > 0);
    }

    getExpirationsWithPutCreditSpreads(): IOptionsExpirationVewModel[] {
        return this._filterExpirations().filter(expiration => expiration.putCreditSpreads.length > 0);
    }

    getExpirationsWithCallCreditSpreads(): IOptionsExpirationVewModel[] {
        return this._filterExpirations().filter(expiration => expiration.callCreditSpreads.length > 0);
    }

}
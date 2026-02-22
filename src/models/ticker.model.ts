import {makeObservable, observable, runInAction} from "mobx";
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

    private _getAllSymbols(): string[] {
        const allOptionsSymbols: string[] = [this.symbol];
        for(const expiration of this.expirations) {
            expiration.getAllSymbols().forEach(s => allOptionsSymbols.push(s));
        }

        return allOptionsSymbols;
    }

    async start(): Promise<void> {
        this.isLoading = true;
        try {
            await this._loadMarketData();

            this.services.marketDataProvider.subscribe(this._getAllSymbols());

            // Load positions for this ticker to enable conflict detection
            await this.services.positions.loadPositions(this.symbol);

        } finally {
            this.isLoading = false;
        }

    }

    async stop(): Promise<void> {
        this.services.marketDataProvider.unsubscribe(this._getAllSymbols());
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
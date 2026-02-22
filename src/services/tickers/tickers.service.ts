import {makeObservable, observable, runInAction} from "mobx";
import {TickerModel} from "../../models/ticker.model";
import {ISearchTickerResultItem, ITickersService} from "./tickers.service.interface";
import {ITickerViewModel} from "../../models/ticker.view-model.interface";
import {ServiceBase} from "../service-base";
import {IServiceFactory} from "../service-factory.interface";
import {RawLocalStorageKeys} from "../storage/raw-local-storage/raw-local-storage-keys";


export class TickersService extends ServiceBase implements ITickersService {
    constructor(services: IServiceFactory) {
        super(services);

        makeObservable<this, '_currentTicker'>(this, {
            _currentTicker: observable.ref,
            recentTickers: observable
        });



        this.services.marketDataProvider.start().then(() => {
            runInAction(() => {
                this.recentTickers = [
                    new TickerModel("SPY", this.services)
                ];
                this._loadRecentTickers();
                this._currentTicker = this.recentTickers[0];
            })

            return this._currentTicker?.start();
        });

    }


    public recentTickers: TickerModel[] = [];

    private _currentTicker: TickerModel | null = null;
    get currentTicker(): ITickerViewModel | null {
        return this._currentTicker;
    }

    async setCurrentTicker(symbol: string): Promise<void> {
        await this._currentTicker?.stop();

        let ticker = this.recentTickers.find(t => t.symbol === symbol);
        if(!ticker) {
            ticker = new TickerModel(symbol, this.services);
        }

        this._addToRecentTickers(ticker);

        runInAction(() => {
            this._currentTicker = ticker;
        });

        await this._currentTicker?.start();
    }

    private _saveRecentTickers(): void {
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.recentTickers, this.recentTickers.map(t => t.symbol));
    }

    private _loadRecentTickers(): void {
        const symbols = this.services.rawLocalStorage.getJson<string[]>(RawLocalStorageKeys.recentTickers) ?? [];
        runInAction(() => {
            this.recentTickers = symbols.map(s => new TickerModel(s, this.services));
        });
    }

    private _addToRecentTickers(ticker: TickerModel): void {
        const index = this.recentTickers.findIndex(t => t.symbol === ticker.symbol);

        runInAction(() => {
            if(index >= 0) {
                this.recentTickers.splice(index, 1);
            }

            this.recentTickers.splice(0, 0, ticker);
            if(this.recentTickers.length > 10) {
                this.recentTickers.splice(10, this.recentTickers.length - 10);
            }
            this._saveRecentTickers();
        });

    }

   async searchTicker(query: string): Promise<ISearchTickerResultItem[]> {
        const result = await this.services.marketDataProvider.searchSymbol(query);

        return result.map(item => {
            return {
                symbol: item.symbol,
                description: item.description
            }
        });
    }

}
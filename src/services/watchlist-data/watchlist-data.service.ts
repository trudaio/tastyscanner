import { makeObservable, observable, runInAction } from "mobx";
import { ServiceBase } from "../service-base";
import { IServiceFactory } from "../service-factory.interface";
import { IWatchlistDataService, IWatchlistTickerData } from "./watchlist-data.service.interface";

export class WatchlistDataService extends ServiceBase implements IWatchlistDataService {
    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            tickerData: observable,
            isLoading: observable.ref,
            lastFetchTime: observable.ref
        });
    }

    tickerData: Map<string, IWatchlistTickerData> = new Map();
    isLoading: boolean = false;
    lastFetchTime: Date | null = null;

    private _refreshInterval: ReturnType<typeof setTimeout> | null = null;
    private _currentSymbols: string[] = [];
    private _isSubscribed: boolean = false;

    private isMarketOpen(): boolean {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const timeInMinutes = hours * 60 + minutes;

        // Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET
        // Simplified: assuming local time is ET for now
        const marketOpen = 9 * 60 + 30; // 9:30 AM
        const marketClose = 16 * 60; // 4:00 PM

        const isWeekday = day >= 1 && day <= 5;
        const isDuringHours = timeInMinutes >= marketOpen && timeInMinutes < marketClose;

        return isWeekday && isDuringHours;
    }

    private getRefreshInterval(): number {
        // 15 minutes during market hours, 6 hours when closed
        return this.isMarketOpen() ? 15 * 60 * 1000 : 6 * 60 * 60 * 1000;
    }

    async fetchTickerData(symbols: string[]): Promise<void> {
        if (symbols.length === 0) return;

        runInAction(() => {
            this.isLoading = true;
        });

        try {
            console.log(`[WatchlistData] Fetching data for ${symbols.length} symbols...`);

            // Fetch metrics for all symbols in parallel (this always works, even when market is closed)
            const promises = symbols.map(async (symbol) => {
                try {
                    const metrics = await this.services.marketDataProvider.getSymbolMetrics(symbol).catch(() => null);

                    // Try to get price from streaming data
                    const quote = this.services.marketDataProvider.getSymbolQuote(symbol);
                    const trade = this.services.marketDataProvider.getSymbolTrade(symbol);

                    let lastPrice: number | null = null;

                    if (trade?.price) {
                        lastPrice = trade.price;
                    } else if (quote && quote.bidPrice && quote.askPrice) {
                        lastPrice = (quote.bidPrice + quote.askPrice) / 2;
                    }

                    const data: IWatchlistTickerData = {
                        symbol,
                        lastPrice,
                        priceChange: null,
                        priceChangePercent: null,
                        // Normalize IV rank to the same format used by TickerModel.ivRank (0-100, with one/two decimals)
                        ivRank: metrics?.impliedVolatilityIndexRank != null
                            ? Math.round((metrics.impliedVolatilityIndexRank) * 10000) / 100
                            : null,
                        lastUpdated: new Date()
                    };

                    return data;
                } catch (error) {
                    console.error(`[WatchlistData] Error fetching data for ${symbol}:`, error);
                    return {
                        symbol,
                        lastPrice: null,
                        priceChange: null,
                        priceChangePercent: null,
                        ivRank: null,
                        lastUpdated: new Date()
                    } as IWatchlistTickerData;
                }
            });

            const results = await Promise.all(promises);

            runInAction(() => {
                for (const data of results) {
                    this.tickerData.set(data.symbol, data);
                }
                this.lastFetchTime = new Date();
                this.isLoading = false;
            });

            // Log results
            const withPrice = results.filter(r => r.lastPrice !== null).length;
            const withIV = results.filter(r => r.ivRank !== null).length;
            console.log(`[WatchlistData] Fetched: ${withPrice}/${results.length} with price, ${withIV}/${results.length} with IV rank`);
        } catch (error) {
            console.error('[WatchlistData] Error fetching ticker data:', error);
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    getTickerData(symbol: string): IWatchlistTickerData | undefined {
        return this.tickerData.get(symbol);
    }

    startAutoRefresh(symbols: string[]): void {
        this._currentSymbols = symbols;

        // Clear any existing interval
        this.stopAutoRefresh();

        if (symbols.length === 0) return;

        // Subscribe to streaming data for real-time quotes
        console.log(`[WatchlistData] Subscribing to ${symbols.length} symbols for streaming data...`);
        this.services.marketDataProvider.subscribe(symbols);
        this._isSubscribed = true;

        // Wait a bit for streaming data to arrive, then fetch
        setTimeout(() => {
            this.fetchTickerData(symbols);
        }, 2000); // Wait 2 seconds for streaming data to arrive

        // Also fetch again after 5 seconds in case more data arrives
        setTimeout(() => {
            this.fetchTickerData(symbols);
        }, 5000);

        // Set up interval-based refresh
        const scheduleNextRefresh = () => {
            const interval = this.getRefreshInterval();
            console.log(`[WatchlistData] Next refresh in ${Math.round(interval / 1000 / 60)} minutes (market ${this.isMarketOpen() ? 'open' : 'closed'})`);

            this._refreshInterval = setTimeout(() => {
                this.fetchTickerData(this._currentSymbols);
                scheduleNextRefresh();
            }, interval);
        };

        scheduleNextRefresh();
    }

    stopAutoRefresh(): void {
        if (this._refreshInterval) {
            clearTimeout(this._refreshInterval);
            this._refreshInterval = null;
        }

        // Unsubscribe from streaming
        if (this._isSubscribed && this._currentSymbols.length > 0) {
            this.services.marketDataProvider.unsubscribe(this._currentSymbols);
            this._isSubscribed = false;
        }
    }
}

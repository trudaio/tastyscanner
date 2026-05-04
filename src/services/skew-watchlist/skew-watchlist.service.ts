import { makeObservable, observable, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type { ISkewWatchlistService } from './skew-watchlist.service.interface';

export const DEFAULT_SKEW_WATCHLIST: readonly string[] = Object.freeze([
    'SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'DIA', 'VTI', 'VOO', 'EEM', 'XLF',
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
    'JPM', 'V', 'XOM', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
    'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'ACN', 'TMO', 'ABT',
    'DHR', 'NEE', 'VZ', 'ADBE', 'CRM', 'NKE', 'TXN', 'PM', 'RTX', 'HON',
    'CMCSA', 'ORCL', 'IBM', 'AMGN', 'UPS', 'INTC', 'QCOM', 'LOW', 'MS', 'GS',
    'CAT', 'DE', 'BA', 'GE', 'ISRG', 'SPGI', 'BLK', 'INTU', 'AMD', 'AMAT',
    'MDLZ', 'ADP', 'GILD', 'BKNG', 'ADI', 'TJX', 'SBUX', 'MMC', 'SYK', 'REGN',
    'VRTX', 'LRCX', 'CI', 'CB', 'MO', 'ZTS', 'BDX', 'SO', 'DUK', 'PLD',
    'CME', 'CL', 'EQIX', 'ITW', 'SCHW', 'EOG', 'SLB', 'ATVI', 'PYPL', 'NOW',
]);

export class SkewWatchlistService implements ISkewWatchlistService {
    tickers: string[] = [];
    isLoading = false;
    error: string | null = null;

    constructor(_factory: IServiceFactory) {
        makeObservable(this, {
            tickers: observable.ref,
            isLoading: observable,
            error: observable,
        });
    }

    async load(): Promise<void> {
        // F3: subscribe to Firestore `users/{uid}/skewWatchlist/main` and seed
        // with DEFAULT_SKEW_WATCHLIST if the document doesn't exist.
        runInAction(() => {
            this.isLoading = true;
            this.error = null;
            this.tickers = [...DEFAULT_SKEW_WATCHLIST];
            this.isLoading = false;
        });
    }

    async add(ticker: string): Promise<void> {
        const t = ticker.toUpperCase().trim();
        if (!t) return;
        runInAction(() => {
            if (!this.tickers.includes(t)) this.tickers = [...this.tickers, t];
        });
    }

    async remove(ticker: string): Promise<void> {
        const t = ticker.toUpperCase().trim();
        runInAction(() => {
            this.tickers = this.tickers.filter((x) => x !== t);
        });
    }

    async setOrder(tickers: string[]): Promise<void> {
        runInAction(() => {
            this.tickers = tickers.map((t) => t.toUpperCase().trim()).filter(Boolean);
        });
    }

    async reset(): Promise<void> {
        runInAction(() => {
            this.tickers = [...DEFAULT_SKEW_WATCHLIST];
        });
    }
}

export interface IWatchlistTickerData {
    symbol: string;
    lastPrice: number | null;
    priceChange: number | null;
    priceChangePercent: number | null;
    ivRank: number | null;
    lastUpdated: Date | null;
}

export interface IWatchlistDataService {
    tickerData: Map<string, IWatchlistTickerData>;
    isLoading: boolean;
    lastFetchTime: Date | null;

    fetchTickerData(symbols: string[]): Promise<void>;
    getTickerData(symbol: string): IWatchlistTickerData | undefined;
    startAutoRefresh(symbols: string[]): void;
    stopAutoRefresh(): void;
}

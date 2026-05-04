/**
 * SkewWatchlist — user-editable list of tickers used by SkewScanner.
 *
 * Persisted in Firestore at `users/{uid}/skewWatchlist/main`. Default seed of
 * 100 tickers loaded on first read.
 */

export interface ISkewWatchlistService {
    tickers: string[];
    isLoading: boolean;
    error: string | null;

    /** F3: subscribe to Firestore + seed default if missing. */
    load(): Promise<void>;

    add(ticker: string): Promise<void>;
    remove(ticker: string): Promise<void>;
    setOrder(tickers: string[]): Promise<void>;
    reset(): Promise<void>;
}

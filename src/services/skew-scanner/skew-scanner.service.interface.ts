/**
 * SkewScanner — multi-ticker scanner over the user's editable watchlist.
 *
 * Iterates the watchlist sequentially with a configurable delay (default 8s)
 * to respect Polygon.io free-tier rate limits. Each row tracks status
 * independently so the UI can render incremental progress.
 */

export type ScannerRowStatus = 'pending' | 'scanning' | 'done' | 'error' | 'rateLimited';

export interface IScannerRow {
    ticker: string;
    status: ScannerRowStatus;
    ivRank: number | null;
    skewPercent: number | null;
    lastUpdate: number | null;
    errorMessage: string | null;
}

export interface ISkewScannerService {
    rows: Map<string, IScannerRow>;
    isRunning: boolean;
    delayMs: number;
    progress: { done: number; total: number };

    setDelayMs(ms: number): void;

    /** F3: kick off a scan over the supplied tickers. */
    start(tickers: string[]): Promise<void>;
    /** F3: cancel in-flight scan. */
    stop(): void;
    /** Reset row state to allow a fresh run. */
    reset(): void;
}

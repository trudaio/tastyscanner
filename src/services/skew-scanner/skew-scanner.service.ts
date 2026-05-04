import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ISkewScannerService,
    IScannerRow,
} from './skew-scanner.service.interface';

const DEFAULT_DELAY_MS = 8000;

export class SkewScannerService implements ISkewScannerService {
    rows: Map<string, IScannerRow> = new Map();
    isRunning = false;
    delayMs: number = DEFAULT_DELAY_MS;

    private aborted = false;

    constructor(_factory: IServiceFactory) {
        makeObservable(this, {
            rows: observable,
            isRunning: observable,
            delayMs: observable,
            setDelayMs: action,
            reset: action,
            progress: computed,
        });
    }

    setDelayMs(ms: number): void {
        this.delayMs = Math.max(0, ms);
    }

    get progress(): { done: number; total: number } {
        let done = 0;
        for (const r of this.rows.values()) {
            if (r.status === 'done' || r.status === 'error') done += 1;
        }
        return { done, total: this.rows.size };
    }

    async start(tickers: string[]): Promise<void> {
        // F3: full implementation. F1 stub seeds rows so the UI renders.
        this.aborted = false;
        runInAction(() => {
            this.isRunning = true;
            this.rows.clear();
            tickers.forEach((t) => {
                this.rows.set(t.toUpperCase(), {
                    ticker: t.toUpperCase(),
                    status: 'pending',
                    ivRank: null,
                    skewPercent: null,
                    lastUpdate: null,
                    errorMessage: null,
                });
            });
        });
        runInAction(() => {
            this.isRunning = false;
        });
    }

    stop(): void {
        this.aborted = true;
        runInAction(() => {
            this.isRunning = false;
        });
    }

    reset(): void {
        this.rows.clear();
        this.isRunning = false;
        this.aborted = false;
    }
}

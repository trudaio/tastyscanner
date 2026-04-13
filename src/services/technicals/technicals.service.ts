import { makeObservable, observable, runInAction } from 'mobx';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';
import type {
    ITechnicals,
    ITechnicalsService,
} from './technicals.service.interface';

const HOT_TICKERS = new Set(['SPX', 'QQQ']);

export class TechnicalsService implements ITechnicalsService {
    technicalsByTicker: Map<string, ITechnicals | null> = new Map();
    loadingByTicker: Map<string, boolean> = new Map();
    errorByTicker: Map<string, string | null> = new Map();

    private _subscriptions = new Map<string, Unsubscribe>();
    private _fetchedCold = new Set<string>();

    constructor() {
        makeObservable(this, {
            technicalsByTicker: observable,
            loadingByTicker: observable,
            errorByTicker: observable,
        });
    }

    watch(ticker: string): void {
        const key = ticker.toUpperCase();
        if (HOT_TICKERS.has(key)) {
            this.subscribeFirestore(key);
        } else if (!this._fetchedCold.has(key)) {
            this._fetchedCold.add(key);
            void this.fetchOnDemand(key);
        }
    }

    getTechnicals(ticker: string): ITechnicals | null {
        return this.technicalsByTicker.get(ticker.toUpperCase()) ?? null;
    }

    isLoading(ticker: string): boolean {
        return this.loadingByTicker.get(ticker.toUpperCase()) === true;
    }

    getError(ticker: string): string | null {
        return this.errorByTicker.get(ticker.toUpperCase()) ?? null;
    }

    private subscribeFirestore(ticker: string): void {
        if (this._subscriptions.has(ticker)) return;
        runInAction(() => {
            this.loadingByTicker.set(ticker, true);
            this.errorByTicker.set(ticker, null);
        });
        const ref = doc(db, 'marketTechnicals', ticker);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                runInAction(() => {
                    this.loadingByTicker.set(ticker, false);
                    if (!snap.exists()) {
                        this.technicalsByTicker.set(ticker, null);
                        this.errorByTicker.set(ticker, 'No data');
                        return;
                    }
                    const data = snap.data() as ITechnicals;
                    this.technicalsByTicker.set(ticker, data);
                    this.errorByTicker.set(ticker, null);
                });
            },
            (err) => {
                runInAction(() => {
                    this.loadingByTicker.set(ticker, false);
                    this.errorByTicker.set(ticker, err.message ?? 'Firestore error');
                });
            },
        );
        this._subscriptions.set(ticker, unsub);
    }

    private async fetchOnDemand(ticker: string): Promise<void> {
        runInAction(() => {
            this.loadingByTicker.set(ticker, true);
            this.errorByTicker.set(ticker, null);
        });
        try {
            const functions = getFunctions(app, 'us-east1');
            const callable = httpsCallable<{ ticker: string }, ITechnicals>(functions, 'getTechnicalsOnDemand');
            const result = await callable({ ticker });
            runInAction(() => {
                this.technicalsByTicker.set(ticker, result.data);
                this.loadingByTicker.set(ticker, false);
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            runInAction(() => {
                this.loadingByTicker.set(ticker, false);
                this.errorByTicker.set(ticker, msg);
                this.technicalsByTicker.set(ticker, null);
            });
        }
    }
}

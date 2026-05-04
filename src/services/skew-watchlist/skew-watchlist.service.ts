import { makeObservable, observable, runInAction } from 'mobx';
import {
    doc,
    onSnapshot,
    setDoc,
    serverTimestamp,
    type Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../firebase';
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

    private currentUid: string | null = null;
    private unsub: Unsubscribe | null = null;
    private hasSeeded = false;

    constructor(_factory: IServiceFactory) {
        makeObservable(this, {
            tickers: observable.ref,
            isLoading: observable,
            error: observable,
        });

        // Auto-subscribe whenever auth changes (and stop when signed out).
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.subscribe(user.uid);
            } else {
                this.unsubscribe();
                runInAction(() => {
                    this.tickers = [];
                    this.error = null;
                });
            }
        });
    }

    async load(): Promise<void> {
        const uid = auth.currentUser?.uid;
        if (uid && uid !== this.currentUid) {
            this.subscribe(uid);
        }
    }

    private subscribe(uid: string): void {
        if (this.currentUid === uid && this.unsub) return;
        this.unsubscribe();
        this.currentUid = uid;
        runInAction(() => {
            this.isLoading = true;
            this.error = null;
        });
        const ref = doc(db, 'users', uid, 'skewWatchlist', 'main');
        this.unsub = onSnapshot(
            ref,
            async (snap) => {
                if (!snap.exists()) {
                    if (!this.hasSeeded) {
                        this.hasSeeded = true;
                        try {
                            await setDoc(ref, {
                                tickers: [...DEFAULT_SKEW_WATCHLIST],
                                updatedAt: serverTimestamp(),
                            });
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Seed failed';
                            runInAction(() => {
                                this.error = msg;
                                this.isLoading = false;
                                this.tickers = [...DEFAULT_SKEW_WATCHLIST];
                            });
                        }
                    }
                    return;
                }
                const data = snap.data() as { tickers?: string[] } | undefined;
                runInAction(() => {
                    this.tickers = Array.isArray(data?.tickers)
                        ? data.tickers.filter((t): t is string => typeof t === 'string')
                        : [];
                    this.isLoading = false;
                    this.error = null;
                });
            },
            (err) => {
                runInAction(() => {
                    this.error = err.message ?? 'Firestore error';
                    this.isLoading = false;
                });
            },
        );
    }

    private unsubscribe(): void {
        this.unsub?.();
        this.unsub = null;
        this.currentUid = null;
        this.hasSeeded = false;
    }

    private async write(next: string[]): Promise<void> {
        const uid = auth.currentUser?.uid;
        if (!uid) {
            runInAction(() => { this.error = 'Not signed in'; });
            return;
        }
        const ref = doc(db, 'users', uid, 'skewWatchlist', 'main');
        try {
            await setDoc(ref, { tickers: next, updatedAt: serverTimestamp() }, { merge: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Write failed';
            runInAction(() => { this.error = msg; });
        }
    }

    async add(ticker: string): Promise<void> {
        const t = ticker.toUpperCase().trim();
        if (!t) return;
        if (this.tickers.includes(t)) return;
        await this.write([...this.tickers, t]);
    }

    async remove(ticker: string): Promise<void> {
        const t = ticker.toUpperCase().trim();
        await this.write(this.tickers.filter((x) => x !== t));
    }

    async setOrder(tickers: string[]): Promise<void> {
        const cleaned = tickers
            .map((t) => t.toUpperCase().trim())
            .filter((t) => t.length > 0);
        await this.write(cleaned);
    }

    async reset(): Promise<void> {
        await this.write([...DEFAULT_SKEW_WATCHLIST]);
    }
}

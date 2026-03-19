/**
 * Backtest Service — MobX Observable Wrapper
 *
 * Orchestrates the two-phase backtest execution:
 * Phase A (0-50%): Data collection from Polygon API
 * Phase B (50-100%): Simulation engine
 *
 * Also handles Firestore persistence of saved backtests.
 */

import { makeObservable, observable, action, runInAction } from 'mobx';
import {
    collection, addDoc, getDocs, getDoc, deleteDoc, doc, query, orderBy, Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import type {
    IBacktestService,
    IBacktestParams,
    IBacktestResults,
    IBacktestBatchResults,
} from './backtest-engine.interface';
import type { ISavedBacktestSummary, ISavedBacktest } from './backtest-saved.interface';
import { preFetchBacktestData } from './polygon-data-provider';
import { runBacktestEngine, runBatchBacktest } from './backtest-engine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUid(): string {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.uid;
}

function backtestsCol() {
    return collection(db, 'users', getUid(), 'backtests');
}

function backtestDoc(id: string) {
    return doc(db, 'users', getUid(), 'backtests', id);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class BacktestService implements IBacktestService {
    isRunning = false;
    progress = 0;
    progressMessage = '';
    results: IBacktestResults | null = null;
    batchResults: IBacktestBatchResults | null = null;
    error: string | null = null;

    // Save/load state
    savedTests: ISavedBacktestSummary[] = [];
    isSaving = false;
    isLoadingSavedTests = false;

    private _cancelled = false;
    private _lastParams: IBacktestParams | null = null;

    constructor() {
        makeObservable(this, {
            isRunning: observable.ref,
            progress: observable.ref,
            progressMessage: observable.ref,
            results: observable.ref,
            batchResults: observable.ref,
            error: observable.ref,
            savedTests: observable.ref,
            isSaving: observable.ref,
            isLoadingSavedTests: observable.ref,
            runBacktest: action,
            cancelBacktest: action,
        });
    }

    async runBacktest(params: IBacktestParams): Promise<void> {
        if (this.isRunning) return;

        runInAction(() => {
            this.isRunning = true;
            this.progress = 0;
            this.progressMessage = 'Starting backtest...';
            this.results = null;
            this.batchResults = null;
            this.error = null;
            this._cancelled = false;
            this._lastParams = params;
        });

        const isBatch = params.batchProfitTargets && params.batchProfitTargets.length > 1;

        try {
            // Phase A: Data Collection (0-50%)
            const data = await preFetchBacktestData(
                params.tickers,
                params.startDate,
                params.endDate,
                params.minDTE,
                params.maxDTE,
                (p) => {
                    if (this._cancelled) return;
                    runInAction(() => {
                        this.progress = p.percent;
                        this.progressMessage = p.message;
                    });
                },
            );

            if (this._cancelled) {
                runInAction(() => {
                    this.isRunning = false;
                    this.progressMessage = 'Cancelled';
                });
                return;
            }

            if (isBatch) {
                // Phase B (Batch): Run multiple scenarios (50-100%)
                const batchResults = runBatchBacktest(
                    params,
                    data,
                    params.batchProfitTargets!,
                    (p) => {
                        if (this._cancelled) return;
                        runInAction(() => {
                            this.progress = p.percent;
                            this.progressMessage = p.message;
                        });
                    },
                );

                if (this._cancelled) {
                    runInAction(() => {
                        this.isRunning = false;
                        this.progressMessage = 'Cancelled';
                    });
                    return;
                }

                const totalTrades = batchResults.scenarios.reduce((sum, s) => sum + s.results.totalTrades, 0);
                runInAction(() => {
                    this.batchResults = batchResults;
                    // Set results to first scenario for backward compatibility
                    this.results = batchResults.scenarios[0]?.results ?? null;
                    this.progress = 100;
                    this.progressMessage = `Complete — ${batchResults.scenarios.length} scenarios, ${totalTrades} total trades in ${(batchResults.executionTimeMs / 1000).toFixed(1)}s`;
                    this.isRunning = false;
                });
            } else {
                // Phase B (Single): Simulation (50-100%)
                const results = runBacktestEngine(
                    params,
                    data,
                    (p) => {
                        if (this._cancelled) return;
                        runInAction(() => {
                            this.progress = p.percent;
                            this.progressMessage = p.message;
                        });
                    },
                );

                if (this._cancelled) {
                    runInAction(() => {
                        this.isRunning = false;
                        this.progressMessage = 'Cancelled';
                    });
                    return;
                }

                runInAction(() => {
                    this.results = results;
                    this.progress = 100;
                    this.progressMessage = `Complete — ${results.totalTrades} trades in ${(results.executionTimeMs / 1000).toFixed(1)}s`;
                    this.isRunning = false;
                });
            }

        } catch (err) {
            console.error('[BacktestService] Error:', err);
            runInAction(() => {
                this.error = err instanceof Error ? err.message : 'Unknown error';
                this.isRunning = false;
                this.progressMessage = 'Error';
            });
        }
    }

    cancelBacktest(): void {
        this._cancelled = true;
        runInAction(() => {
            this.progressMessage = 'Cancelling...';
        });
    }

    // ─── Save/Load ───────────────────────────────────────────────────────────

    async saveBacktest(name: string): Promise<string> {
        if (!this.results || !this._lastParams) throw new Error('No results to save');

        runInAction(() => { this.isSaving = true; });

        try {
            const r = this.results;
            const params = this._lastParams;

            const docData = {
                name: name || `Backtest ${new Date().toLocaleDateString()}`,
                createdAt: Timestamp.now(),
                tickers: params.tickers,
                startDate: params.startDate,
                endDate: params.endDate,
                // Summary metrics
                totalTrades: r.totalTrades,
                winRate: r.winRate,
                totalPL: r.totalPL,
                maxDrawdown: r.maxDrawdown,
                maxDrawdownPct: r.maxDrawdownPct,
                sharpeRatio: r.sharpeRatio,
                profitFactor: r.profitFactor,
                averagePL: r.averagePL,
                kellyFraction: r.kellyFraction,
                executionTimeMs: r.executionTimeMs,
                // Full data
                params: JSON.parse(JSON.stringify(params)),
                results: JSON.parse(JSON.stringify(r)),
            };

            const docRef = await addDoc(backtestsCol(), docData);

            // Refresh list
            await this.loadSavedTestsList();

            runInAction(() => { this.isSaving = false; });
            return docRef.id;

        } catch (err) {
            console.error('[BacktestService] Save error:', err);
            runInAction(() => { this.isSaving = false; });
            throw err;
        }
    }

    async loadSavedTestsList(): Promise<void> {
        runInAction(() => { this.isLoadingSavedTests = true; });

        try {
            const q = query(backtestsCol(), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);

            const tests: ISavedBacktestSummary[] = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.name || 'Unnamed',
                    createdAt: data.createdAt?.toMillis?.() || Date.now(),
                    tickers: data.tickers || [],
                    startDate: data.startDate || '',
                    endDate: data.endDate || '',
                    totalTrades: data.totalTrades || 0,
                    winRate: data.winRate || 0,
                    totalPL: data.totalPL || 0,
                    maxDrawdown: data.maxDrawdown || 0,
                    maxDrawdownPct: data.maxDrawdownPct || 0,
                    sharpeRatio: data.sharpeRatio || 0,
                    profitFactor: data.profitFactor || 0,
                    averagePL: data.averagePL || 0,
                    kellyFraction: data.kellyFraction || 0,
                    executionTimeMs: data.executionTimeMs || 0,
                };
            });

            runInAction(() => {
                this.savedTests = tests;
                this.isLoadingSavedTests = false;
            });

        } catch (err) {
            console.error('[BacktestService] Load list error:', err);
            runInAction(() => { this.isLoadingSavedTests = false; });
        }
    }

    async loadSavedTest(id: string): Promise<ISavedBacktest> {
        const snap = await getDoc(backtestDoc(id));
        if (!snap.exists()) throw new Error(`Backtest ${id} not found`);

        const data = snap.data();
        return {
            id: snap.id,
            name: data.name || 'Unnamed',
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            tickers: data.tickers || [],
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            totalTrades: data.totalTrades || 0,
            winRate: data.winRate || 0,
            totalPL: data.totalPL || 0,
            maxDrawdown: data.maxDrawdown || 0,
            maxDrawdownPct: data.maxDrawdownPct || 0,
            sharpeRatio: data.sharpeRatio || 0,
            profitFactor: data.profitFactor || 0,
            averagePL: data.averagePL || 0,
            kellyFraction: data.kellyFraction || 0,
            executionTimeMs: data.executionTimeMs || 0,
            params: data.params,
            results: data.results,
        };
    }

    async deleteSavedTest(id: string): Promise<void> {
        await deleteDoc(backtestDoc(id));
        await this.loadSavedTestsList();
    }
}

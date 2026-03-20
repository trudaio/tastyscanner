import {IDeltaAlertLeg, IDeltaAlertService} from "./delta-alert.interface";
import {ServiceBase} from "../service-base";
import {IServiceFactory} from "../service-factory.interface";
import {makeObservable, observable, autorun, runInAction, IReactionDisposer} from "mobx";

export class DeltaAlertService extends ServiceBase implements IDeltaAlertService {

    constructor(services: IServiceFactory) {
        super(services);
        makeObservable<this, '_alerts' | '_isLoading'>(this, {
            _alerts: observable.ref,
            _isLoading: observable.ref,
        });
    }

    private _alerts: IDeltaAlertLeg[] = [];
    private _isLoading = false;
    private _disposer: IReactionDisposer | null = null;
    private _subscribedSymbols: string[] = [];

    get alerts(): IDeltaAlertLeg[] {
        return this._alerts;
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    refresh(): void {
        this._cleanup();
        runInAction(() => { this._isLoading = true; });

        // Get open trades with per-leg delta
        const openTrades = this.services.tradeLog.entries.filter(e => e.status === 'open');

        // Collect all short legs with initial delta and streamer symbols
        const shortLegsToWatch: Array<{ trade: typeof openTrades[0]; leg: typeof openTrades[0]['legs'][0] }> = [];
        const symbolsToSubscribe: string[] = [];

        for (const trade of openTrades) {
            for (const leg of trade.legs) {
                // Only STO legs matter for risk monitoring
                if (leg.action !== 'STO') continue;
                // Need both initial delta and streamer symbol
                if (!leg.delta || !leg.streamerSymbol) continue;

                shortLegsToWatch.push({ trade, leg });
                symbolsToSubscribe.push(leg.streamerSymbol);
            }
        }

        if (symbolsToSubscribe.length === 0) {
            runInAction(() => {
                this._alerts = [];
                this._isLoading = false;
            });
            return;
        }

        // Subscribe to live greeks for these symbols
        this.services.marketDataProvider.subscribe(symbolsToSubscribe);
        this._subscribedSymbols = symbolsToSubscribe;

        // Set up reactive computation
        this._disposer = autorun(() => {
            const alerts: IDeltaAlertLeg[] = [];

            for (const { trade, leg } of shortLegsToWatch) {
                const greeks = this.services.marketDataProvider.getSymbolGreeks(leg.streamerSymbol!);
                if (!greeks) continue;

                const currentDelta = Math.abs(Math.round(greeks.delta * 100));
                const initialDelta = leg.delta!;
                const deltaRatio = initialDelta > 0 ? currentDelta / initialDelta : 0;

                // Show legs that have reached 1.5x or more their initial delta
                if (deltaRatio >= 1.5) {
                    alerts.push({
                        trade,
                        leg,
                        initialDelta,
                        currentDelta,
                        deltaRatio: Math.round(deltaRatio * 100) / 100,
                    });
                }
            }

            // Sort by delta ratio descending (most critical first)
            alerts.sort((a, b) => b.deltaRatio - a.deltaRatio);

            runInAction(() => {
                this._alerts = alerts;
                this._isLoading = false;
            });
        });
    }

    dispose(): void {
        this._cleanup();
    }

    private _cleanup(): void {
        if (this._disposer) {
            this._disposer();
            this._disposer = null;
        }
        if (this._subscribedSymbols.length > 0) {
            this.services.marketDataProvider.unsubscribe(this._subscribedSymbols);
            this._subscribedSymbols = [];
        }
    }
}

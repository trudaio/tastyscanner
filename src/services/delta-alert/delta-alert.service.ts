import {IDeltaAlertLeg, IDeltaAlertService} from "./delta-alert.interface";
import {ServiceBase} from "../service-base";
import {IServiceFactory} from "../service-factory.interface";
import {makeObservable, observable, autorun, runInAction, IReactionDisposer} from "mobx";
import {RawLocalStorageKeys} from "../storage/raw-local-storage/raw-local-storage-keys";
import type {IPositionRawData} from "../market-data-provider/market-data-provider.service.interface";

const BACKGROUND_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export class DeltaAlertService extends ServiceBase implements IDeltaAlertService {

    constructor(services: IServiceFactory) {
        super(services);

        // Load cached alerts from localStorage
        const cached = services.rawLocalStorage.getJson<IDeltaAlertLeg[]>(RawLocalStorageKeys.deltaAlerts);
        if (cached) {
            this._alerts = cached;
        }

        makeObservable<this, '_alerts' | '_isLoading'>(this, {
            _alerts: observable.ref,
            _isLoading: observable.ref,
        });
    }

    private _alerts: IDeltaAlertLeg[] = [];
    private _isLoading = false;
    private _disposer: IReactionDisposer | null = null;
    private _subscribedSymbols: string[] = [];
    private _backgroundTimerId: ReturnType<typeof setInterval> | null = null;

    get alerts(): IDeltaAlertLeg[] {
        return this._alerts;
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    startBackgroundMonitoring(): void {
        this.stopBackgroundMonitoring();
        this.refresh();
        this._backgroundTimerId = setInterval(() => this.refresh(), BACKGROUND_INTERVAL_MS);
    }

    stopBackgroundMonitoring(): void {
        if (this._backgroundTimerId) {
            clearInterval(this._backgroundTimerId);
            this._backgroundTimerId = null;
        }
    }

    refresh(): void {
        this._cleanup();
        runInAction(() => { this._isLoading = true; });

        const account = this.services.brokerAccount.currentAccount;
        if (!account) {
            runInAction(() => {
                this._alerts = [];
                this._isLoading = false;
            });
            return;
        }

        // Fetch ALL positions from the API (not just trade log)
        this.services.marketDataProvider.getPositions(account.accountNumber)
            .then(positions => this._processPositions(positions))
            .catch(err => {
                console.error('[DeltaAlert] Failed to fetch positions:', err);
                runInAction(() => { this._isLoading = false; });
            });
    }

    private _computeDte(expirationDate: string): number {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const exp = new Date(expirationDate + 'T00:00:00');
        return Math.max(0, Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    private _processPositions(positions: IPositionRawData[]): void {
        // Filter to short option legs only
        const shortOptions = positions.filter(p =>
            p.quantityDirection === 'Short' &&
            p.instrumentType === 'Equity Option' &&
            p.streamerSymbol
        );

        if (shortOptions.length === 0) {
            runInAction(() => {
                this._alerts = [];
                this._isLoading = false;
            });
            this._persistAlerts([]);
            return;
        }

        // Build lookup from trade log for initial deltas
        const initialDeltaMap = this._buildInitialDeltaMap();

        // Collect unique underlying symbols for price subscription
        const underlyingSymbols = [...new Set(shortOptions.map(p => p.underlyingSymbol))];

        // Subscribe to live greeks for option legs + quotes for underlyings
        const optionSymbols = shortOptions.map(p => p.streamerSymbol);
        const allSymbols = [...optionSymbols, ...underlyingSymbols];
        this.services.marketDataProvider.subscribe(allSymbols);
        this._subscribedSymbols = allSymbols;

        // Set up reactive computation
        this._disposer = autorun(() => {
            const threshold = this.services.settings.deltaAlertSettings.deltaThreshold;
            const alerts: IDeltaAlertLeg[] = [];

            for (const pos of shortOptions) {
                const greeks = this.services.marketDataProvider.getSymbolGreeks(pos.streamerSymbol);
                if (!greeks) continue;

                const currentDelta = Math.abs(Math.round(greeks.delta * 100));
                if (currentDelta === 0) continue;

                // Try to find initial delta from trade log
                const initialDelta = initialDeltaMap.get(pos.streamerSymbol) ?? null;

                let deltaRatio: number | null = null;
                let shouldAlert = false;

                if (initialDelta != null && initialDelta > 0) {
                    deltaRatio = Math.round((currentDelta / initialDelta) * 100) / 100;
                    shouldAlert = deltaRatio >= threshold;
                } else {
                    shouldAlert = currentDelta >= 40;
                    deltaRatio = null;
                }

                if (shouldAlert) {
                    // Get underlying price from trade or quote
                    const trade = this.services.marketDataProvider.getSymbolTrade(pos.underlyingSymbol);
                    const quote = this.services.marketDataProvider.getSymbolQuote(pos.underlyingSymbol);
                    const underlyingPrice = trade?.price ?? (quote ? (quote.bidPrice + quote.askPrice) / 2 : null);

                    // Calculate % distance: positive = OTM, negative = ITM
                    let strikeDistance: number | null = null;
                    if (underlyingPrice && underlyingPrice > 0) {
                        if (pos.optionType === 'P') {
                            // Put: OTM when strike < price
                            strikeDistance = Math.round(((pos.strikePrice - underlyingPrice) / underlyingPrice) * 10000) / 100;
                        } else {
                            // Call: OTM when strike > price
                            strikeDistance = Math.round(((pos.strikePrice - underlyingPrice) / underlyingPrice) * 10000) / 100;
                        }
                    }

                    alerts.push({
                        symbol: pos.underlyingSymbol,
                        streamerSymbol: pos.streamerSymbol,
                        optionType: pos.optionType,
                        strikePrice: pos.strikePrice,
                        expirationDate: pos.expirationDate,
                        dte: this._computeDte(pos.expirationDate),
                        underlyingPrice: underlyingPrice ? Math.round(underlyingPrice * 100) / 100 : null,
                        strikeDistance,
                        initialDelta,
                        currentDelta,
                        deltaRatio,
                    });
                }
            }

            // Sort: ratio-based first (by ratio desc), then absolute-based (by delta desc)
            alerts.sort((a, b) => {
                if (a.deltaRatio != null && b.deltaRatio != null) return b.deltaRatio - a.deltaRatio;
                if (a.deltaRatio != null) return -1;
                if (b.deltaRatio != null) return 1;
                return b.currentDelta - a.currentDelta;
            });

            runInAction(() => {
                this._alerts = alerts;
                this._isLoading = false;
            });

            this._persistAlerts(alerts);
        });
    }

    /**
     * Build a map of streamerSymbol → initial delta from the trade log.
     * Only includes STO (sell-to-open) legs from open trades.
     */
    private _buildInitialDeltaMap(): Map<string, number> {
        const map = new Map<string, number>();
        const openTrades = this.services.tradeLog.entries.filter(e => e.status === 'open');

        for (const trade of openTrades) {
            for (const leg of trade.legs) {
                if (leg.action === 'STO' && leg.streamerSymbol && leg.delta) {
                    map.set(leg.streamerSymbol, leg.delta);
                }
            }
        }

        return map;
    }

    dispose(): void {
        this.stopBackgroundMonitoring();
        this._cleanup();
    }

    private _persistAlerts(alerts: IDeltaAlertLeg[]): void {
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.deltaAlerts, alerts);
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

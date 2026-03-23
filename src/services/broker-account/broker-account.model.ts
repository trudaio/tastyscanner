import {IBrokerAccountViewModel, IBrokerOrder, IAccountBalances, IPortfolioGreeks, PORTFOLIO_DELTA_ALERT_THRESHOLD} from "./broker-account.service.interface";
import {IServiceFactory} from "../service-factory.interface";
import {autorun, computed, makeObservable, observable, runInAction} from "mobx";

export class BrokerAccountModel implements IBrokerAccountViewModel {
    constructor(public readonly accountNumber: string, private readonly services: IServiceFactory) {
        makeObservable(this, {
            balances: observable.ref,
            isLoadingBalances: observable.ref,
            portfolioGreeks: observable.ref,
            isLoadingPortfolioGreeks: observable.ref,
            isDeltaAlertActive: computed,
        });
    }

    balances: IAccountBalances | null = null;
    isLoadingBalances: boolean = false;
    portfolioGreeks: IPortfolioGreeks | null = null;
    isLoadingPortfolioGreeks: boolean = false;

    private _greeksDisposer: (() => void) | null = null;

    get isDeltaAlertActive(): boolean {
        return Math.abs(this.portfolioGreeks?.delta ?? 0) > PORTFOLIO_DELTA_ALERT_THRESHOLD;
    }

    async loadBalances(): Promise<void> {
        runInAction(() => {
            this.isLoadingBalances = true;
        });

        try {
            const rawBalances = await this.services.marketDataProvider.getAccountBalances(this.accountNumber);
            runInAction(() => {
                this.balances = {
                    netLiquidity: rawBalances.netLiquidity,
                    optionBuyingPower: rawBalances.optionBuyingPower,
                    stockBuyingPower: rawBalances.stockBuyingPower,
                    cashBalance: rawBalances.cashBalance,
                    pendingCash: rawBalances.pendingCash,
                    dayTradingBuyingPower: rawBalances.dayTradingBuyingPower,
                    maintenanceRequirement: rawBalances.maintenanceRequirement
                };
                this.isLoadingBalances = false;
            });
        } catch (error) {
            console.error('[BrokerAccountModel] Error loading balances:', error);
            runInAction(() => {
                this.isLoadingBalances = false;
            });
        }
    }

    async loadPortfolioGreeks(): Promise<void> {
        runInAction(() => {
            this.isLoadingPortfolioGreeks = true;
        });

        try {
            // Wait for DxLink feed to be connected before subscribing
            await this.services.marketDataProvider.waitForConnection();

            // Fetch all option positions for this account
            const positions = await this.services.marketDataProvider.getPositions(this.accountNumber);
            const optionPositions = positions.filter(p => p.instrumentType === 'Equity Option');

            console.log(`[BrokerAccountModel] Found ${optionPositions.length} option positions`);
            if (optionPositions.length > 0) {
                console.log(`[BrokerAccountModel] Sample: "${optionPositions[0].symbol}" → streamer: "${optionPositions[0].streamerSymbol}"`);
            }

            // Subscribe using streamerSymbol (dxFeed format), not TastyTrade symbol format
            const streamerSymbols = optionPositions.map(p => p.streamerSymbol);
            if (streamerSymbols.length > 0) {
                this.services.marketDataProvider.subscribe(streamerSymbols);
                console.log(`[BrokerAccountModel] Subscribed to ${streamerSymbols.length} streamer symbols, e.g.`, streamerSymbols.slice(0, 3));
            }

            // Dispose any previous autorun
            if (this._greeksDisposer) {
                this._greeksDisposer();
            }

            // Use MobX autorun so portfolio greeks update reactively whenever
            // streamer data arrives — no fixed timeout needed
            this._greeksDisposer = autorun(() => {
                let totalDelta = 0;
                let totalTheta = 0;
                let totalGamma = 0;
                let totalVega  = 0;

                for (const pos of optionPositions) {
                    // Look up by streamerSymbol — this matches the eventSymbol in dxFeed events
                    const greeks = this.services.marketDataProvider.getSymbolGreeks(pos.streamerSymbol);
                    if (!greeks) continue;

                    const direction = pos.quantityDirection === 'Short' ? -1 : 1;
                    const multiplier = pos.quantity * direction * 100;

                    totalDelta += greeks.delta * multiplier;
                    totalTheta += greeks.theta * multiplier;
                    totalGamma += greeks.gamma * multiplier;
                    totalVega  += greeks.vega  * multiplier;
                }

                console.log(`[BrokerAccountModel] Greeks → Δ:${totalDelta.toFixed(2)} Θ:${totalTheta.toFixed(2)} Γ:${totalGamma.toFixed(4)} V:${totalVega.toFixed(2)}`);

                runInAction(() => {
                    this.portfolioGreeks = {
                        delta: Math.round(totalDelta * 100) / 100,
                        theta: Math.round(totalTheta * 100) / 100,
                        gamma: Math.round(totalGamma * 10000) / 10000,
                        vega:  Math.round(totalVega  * 100) / 100,
                    };
                    this.isLoadingPortfolioGreeks = false;
                });
            });

        } catch (error) {
            console.error('[BrokerAccountModel] Error loading portfolio greeks:', error);
            runInAction(() => {
                this.isLoadingPortfolioGreeks = false;
            });
        }
    }

    async sendOrder(order: IBrokerOrder): Promise<void> {
        await this.services.marketDataProvider.sendOrder(this.accountNumber, {
            orderType: order.orderType,
            price: order.price,
            priceEffect: order.priceEffect,
            timeInForce: order.timeInForce,
            legs: order.legs.map(l => {
                return {
                    symbol: l.symbol,
                    action: l.action,
                    instrumentType: l.instrumentType,
                    quantity: l.quantity
                }
            })
        })
    }
}

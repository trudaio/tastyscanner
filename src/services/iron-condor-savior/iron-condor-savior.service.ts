import { makeObservable, observable, runInAction } from "mobx";
import { ServiceBase } from "../service-base";
import { IServiceFactory } from "../service-factory.interface";
import {
    IIronCondorSaviorService,
    ISaviorSearchParams,
    ISaviorIronCondor
} from "./iron-condor-savior.interface";

export class IronCondorSaviorService extends ServiceBase implements IIronCondorSaviorService {
    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            isLoading: observable.ref,
            searchParams: observable.ref,
            results: observable.ref,
            currentPrice: observable.ref
        });
    }

    isLoading: boolean = false;
    searchParams: ISaviorSearchParams | null = null;
    results: ISaviorIronCondor[] = [];
    currentPrice: number = 0;

    async search(params: ISaviorSearchParams): Promise<void> {
        runInAction(() => {
            this.isLoading = true;
            this.searchParams = params;
            this.results = [];
        });

        try {
            console.log(`[IC Savior] Searching for ${params.symbol}, DTE: ${params.minDTE}-${params.maxDTE}, Target: $${params.targetCredit}`);

            // Get current ticker price
            await this.services.tickers.setCurrentTicker(params.symbol);
            const ticker = this.services.tickers.currentTicker;
            const price = ticker?.currentPrice || 0;

            runInAction(() => {
                this.currentPrice = price;
            });

            if (!price) {
                console.log('[IC Savior] Could not get current price');
                runInAction(() => this.isLoading = false);
                return;
            }

            // Get options chain
            const chainData = await this.services.marketDataProvider.getOptionsChain(params.symbol);

            if (!chainData || chainData.length === 0) {
                console.log('[IC Savior] No options chain data');
                runInAction(() => this.isLoading = false);
                return;
            }

            const ironCondors: ISaviorIronCondor[] = [];

            // Process each chain
            for (const chain of chainData) {
                for (const exp of chain.expirations) {
                    // Filter by DTE range
                    if (exp.daysToExpiration < params.minDTE || exp.daysToExpiration > params.maxDTE) {
                        continue;
                    }

                    console.log(`[IC Savior] Processing expiration ${exp.expirationDate} (${exp.daysToExpiration} DTE)`);

                    // Get OTM puts and calls
                    const otmPuts = exp.strikes.filter(s => s.strikePrice < price).sort((a, b) => b.strikePrice - a.strikePrice);
                    const otmCalls = exp.strikes.filter(s => s.strikePrice > price).sort((a, b) => a.strikePrice - b.strikePrice);

                    if (otmPuts.length < 2 || otmCalls.length < 2) {
                        continue;
                    }

                    // Subscribe to get quotes
                    const streamerSymbols: string[] = [];
                    for (const strike of exp.strikes) {
                        streamerSymbols.push(strike.putStreamerSymbol, strike.callStreamerSymbol);
                    }
                    this.services.marketDataProvider.subscribe(streamerSymbols);

                    // Wait for data
                    await new Promise(resolve => setTimeout(resolve, 800));

                    // Build iron condors with different wing widths
                    const wingWidths = [1, 2, 3, 5, 10];

                    for (const wingWidth of wingWidths) {
                        // Try different short strike combinations
                        for (let putIdx = 0; putIdx < Math.min(5, otmPuts.length - 1); putIdx++) {
                            for (let callIdx = 0; callIdx < Math.min(5, otmCalls.length - 1); callIdx++) {
                                const shortPutStrike = otmPuts[putIdx];
                                const shortCallStrike = otmCalls[callIdx];

                                // Find long strikes at wing width distance
                                const longPutStrike = otmPuts.find(s =>
                                    Math.abs(shortPutStrike.strikePrice - s.strikePrice - wingWidth) < 0.5
                                );
                                const longCallStrike = otmCalls.find(s =>
                                    Math.abs(s.strikePrice - shortCallStrike.strikePrice - wingWidth) < 0.5
                                );

                                if (!longPutStrike || !longCallStrike) continue;

                                // Get quotes
                                const shortPutQuote = this.services.marketDataProvider.getSymbolQuote(shortPutStrike.putStreamerSymbol);
                                const longPutQuote = this.services.marketDataProvider.getSymbolQuote(longPutStrike.putStreamerSymbol);
                                const shortCallQuote = this.services.marketDataProvider.getSymbolQuote(shortCallStrike.callStreamerSymbol);
                                const longCallQuote = this.services.marketDataProvider.getSymbolQuote(longCallStrike.callStreamerSymbol);

                                if (!shortPutQuote || !longPutQuote || !shortCallQuote || !longCallQuote) continue;

                                // Get greeks
                                const shortPutGreeks = this.services.marketDataProvider.getSymbolGreeks(shortPutStrike.putStreamerSymbol);
                                const longPutGreeks = this.services.marketDataProvider.getSymbolGreeks(longPutStrike.putStreamerSymbol);
                                const shortCallGreeks = this.services.marketDataProvider.getSymbolGreeks(shortCallStrike.callStreamerSymbol);
                                const longCallGreeks = this.services.marketDataProvider.getSymbolGreeks(longCallStrike.callStreamerSymbol);

                                // Calculate credits
                                const shortPutMid = (shortPutQuote.bidPrice + shortPutQuote.askPrice) / 2;
                                const longPutMid = (longPutQuote.bidPrice + longPutQuote.askPrice) / 2;
                                const shortCallMid = (shortCallQuote.bidPrice + shortCallQuote.askPrice) / 2;
                                const longCallMid = (longCallQuote.bidPrice + longCallQuote.askPrice) / 2;

                                const putSpreadCredit = shortPutMid - longPutMid;
                                const callSpreadCredit = shortCallMid - longCallMid;
                                const totalCredit = putSpreadCredit + callSpreadCredit;

                                // Skip if credit is too low
                                if (totalCredit < 1) continue;

                                // Calculate metrics
                                const actualWingWidth = Math.max(
                                    shortPutStrike.strikePrice - longPutStrike.strikePrice,
                                    longCallStrike.strikePrice - shortCallStrike.strikePrice
                                );
                                const maxLoss = actualWingWidth - totalCredit;
                                const riskRewardRatio = maxLoss / totalCredit;

                                // Calculate POP using short strike deltas
                                let shortPutDelta = Math.abs(shortPutGreeks?.delta || 0.15);
                                let shortCallDelta = Math.abs(shortCallGreeks?.delta || 0.15);
                                // Normalize if deltas are in percentage form (> 1)
                                if (shortPutDelta > 1) shortPutDelta /= 100;
                                if (shortCallDelta > 1) shortCallDelta /= 100;
                                const pop = (1 - Math.max(shortPutDelta, shortCallDelta)) * 100;

                                // Calculate net delta and theta
                                const delta = (shortPutGreeks?.delta || 0) + (shortCallGreeks?.delta || 0)
                                            - (longPutGreeks?.delta || 0) - (longCallGreeks?.delta || 0);
                                const theta = (shortPutGreeks?.theta || 0) + (shortCallGreeks?.theta || 0)
                                            - (longPutGreeks?.theta || 0) - (longCallGreeks?.theta || 0);

                                const meetsTarget = totalCredit >= params.targetCredit;
                                const creditAboveTarget = totalCredit - params.targetCredit;

                                const ic: ISaviorIronCondor = {
                                    key: `${exp.expirationDate}-${longPutStrike.strikePrice}-${shortPutStrike.strikePrice}-${shortCallStrike.strikePrice}-${longCallStrike.strikePrice}`,
                                    expirationDate: exp.expirationDate,
                                    daysToExpiration: exp.daysToExpiration,
                                    longPutStrike: longPutStrike.strikePrice,
                                    shortPutStrike: shortPutStrike.strikePrice,
                                    putSpreadCredit,
                                    shortCallStrike: shortCallStrike.strikePrice,
                                    longCallStrike: longCallStrike.strikePrice,
                                    callSpreadCredit,
                                    totalCredit,
                                    wingsWidth: actualWingWidth,
                                    maxLoss,
                                    pop,
                                    delta,
                                    theta,
                                    riskRewardRatio,
                                    meetsTarget,
                                    creditAboveTarget,
                                    sendOrder: async (quantity: number) => {
                                        console.log(`[IC Savior] Sending order for ${quantity} contracts`);
                                        // Would integrate with broker service
                                    }
                                };

                                ironCondors.push(ic);
                            }
                        }
                    }

                    // Unsubscribe
                    this.services.marketDataProvider.unsubscribe(streamerSymbols);
                }
            }

            // Sort: first by meetsTarget (true first), then by POP (highest first)
            const sortedResults = ironCondors
                .sort((a, b) => {
                    // Prioritize ones that meet target
                    if (a.meetsTarget && !b.meetsTarget) return -1;
                    if (!a.meetsTarget && b.meetsTarget) return 1;
                    // Then by POP
                    return b.pop - a.pop;
                })
                .slice(0, 50); // Limit to top 50

            console.log(`[IC Savior] Found ${sortedResults.length} iron condors`);

            runInAction(() => {
                this.results = sortedResults;
                this.isLoading = false;
            });

        } catch (error) {
            console.error('[IC Savior] Error searching:', error);
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    clearResults(): void {
        runInAction(() => {
            this.searchParams = null;
            this.results = [];
            this.currentPrice = 0;
        });
    }
}

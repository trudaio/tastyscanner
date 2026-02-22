import { makeObservable, observable, runInAction } from "mobx";
import {
    IGreeksRawData,
    IOptionChainRawData,
    IMarketDataProviderService,
    IQuoteRawData,
    ITradeRawData,
    IWatchListRawData,
    ISymbolMetricsRawData,
    ISymbolEarningsRawData,
    ISymbolInfoRawData,
    ISearchSymbolItemRawData,
    IAccountRawData,
    IOrderRequest,
    IPositionRawData,
    IOrderRawData,
    ITransactionRawData,
    IAccountBalancesRawData
} from "./market-data-provider.service.interface";
import TastyTradeClient, {MarketDataSubscriptionType} from "@tastytrade/api"
import {Check} from "../../utils/type-checking";


export class TastyMarketDataProvider implements IMarketDataProviderService {
    constructor() {
        this._tastyClient = new TastyTradeClient({
            ...TastyTradeClient.ProdConfig,
            clientSecret: import.meta.env.VITE_CLIENT_SECRET,
            refreshToken: import.meta.env.VITE_REFRESH_TOKEN,
            oauthScopes: ['read', 'trade']
        });
        this._tastyClient.quoteStreamer.addEventListener(this._streamEventHandler);

        makeObservable(this, {
            quotes: observable,
            trades: observable,
            greeks: observable,
        });
    }

    public quotes: Record<string, any> = {};
    public trades: Record<string, any> = {};
    public greeks: Record<string, any> = {};

    private _connectionPromise: Promise<void> | null = null;

    async start(): Promise<void> {
        this._connectionPromise = this._tastyClient.quoteStreamer.connect();
        await this._connectionPromise;
    }

    async waitForConnection(): Promise<void> {
        if (this._connectionPromise) {
            await this._connectionPromise;
        }
    }

    getSymbolTrade(symbol: string): ITradeRawData | undefined {
        const trade = this.trades[symbol];
        if(!trade) {
            return undefined;
        }

        return {
            price: trade.price
        }
    }

    getSymbolQuote(symbol: string): IQuoteRawData | undefined {
        const quote = this.quotes[symbol];

        if(!quote) {
            return undefined;
        }

        return {
            bidPrice: quote.bidPrice,
            askPrice: quote.askPrice
        };

    }

    getSymbolGreeks(symbol: string): IGreeksRawData | undefined {
        const greeks = this.greeks[symbol];

        if(!greeks) {
            return undefined;
        }

        return {
            delta: greeks.delta,
            volatility: greeks.volatility,
            theta: greeks.theta,
            gamma: greeks.gamma,
            vega: greeks.vega,
            rho: greeks.rho,
            time: greeks.time

        }
    }

    async getSymbolInfo(symbol: string): Promise<ISymbolInfoRawData> {
        const response = await this._tastyClient.instrumentsService.getSingleEquity(symbol);
        return {
            listedMarket: response['listed-market'],
            description: response['description']
        }
        /*
        {
    "id": 7824,
    "active": true,
    "borrow-rate": "0.0",
    "bypass-manual-review": false,
    "country-of-incorporation": "US",
    "country-of-taxation": "USA",
    "cusip": "02079K305",
    "description": "ALPHABET INC CLASS A COMMON STOCK",
    "instrument-type": "Equity",
    "is-closing-only": false,
    "is-etf": false,
    "is-fractional-quantity-eligible": true,
    "is-fraud-risk": false,
    "is-illiquid": false,
    "is-index": false,
    "is-options-closing-only": false,
    "lendability": "Easy To Borrow",
    "listed-market": "XNAS",
    "market-time-instrument-collection": "Equity",
    "overnight-trading-permitted": true,
    "short-description": "ALPHABET INC",
    "streamer-symbol": "GOOGL",
    "symbol": "GOOGL",
    "option-tick-sizes": [
        {
            "threshold": "3.0",
            "value": "0.01"
        },
        {
            "value": "0.05"
        }
    ],
    "tick-sizes": [
        {
            "threshold": "1.0",
            "value": "0.0001"
        },
        {
            "value": "0.01"
        }
    ]
}
         */
    }

    private _tastyClient: TastyTradeClient;
    async getOptionsChain(symbol: string): Promise<IOptionChainRawData[]> {

        const optionsChain = await this._tastyClient.instrumentsService.getNestedOptionChain(symbol);
        const result: IOptionChainRawData[] = [];


        for(const optionChain of optionsChain) {
            result.push({
                expirations: optionChain.expirations.map((expiration: any) => {
                    return {
                        expirationDate: expiration["expiration-date"],
                        daysToExpiration: expiration["days-to-expiration"],
                        expirationType: expiration["expiration-type"],
                        settlementType: expiration["settlement-type"],
                        strikes: expiration["strikes"]?.map((strike: any) => {

                            return {
                                strikePrice: parseFloat(strike["strike-price"]),
                                callId: strike["call"],
                                callStreamerSymbol: strike["call-streamer-symbol"],
                                putId: strike["put"],
                                putStreamerSymbol: strike["put-streamer-symbol"]
                            };
                        }) ?? []
                    }
                })
            });
        }

        return result;
    }

    subscribe(symbols: string[]): void {
        this._tastyClient.quoteStreamer.subscribe(symbols, [
            MarketDataSubscriptionType.Quote,
            MarketDataSubscriptionType.Trade,
            //MarketDataSubscriptionType.Summary,
            //MarketDataSubscriptionType.Profile,
            MarketDataSubscriptionType.Greeks,
            //MarketDataSubscriptionType.Underlying
        ]);


    }

    unsubscribe(symbols: string[]): void {
        if(symbols.length === 0) {
            return;
        }
        this._tastyClient.quoteStreamer.unsubscribe(symbols);
        /*
        runInAction(() => {
            for(const symbol of symbols) {
                delete this.quotes[symbol];
                delete this.trades[symbol];
                delete this.greeks[symbol];
            }
        });

         */

    }

    private _streamEventHandler= (records: any[]) => {
        runInAction(() => {
            for(const record of records) {

                if(record.eventType === "Quote") {
                    this.quotes[record.eventSymbol] = record;
                } else if(record.eventType === "Trade") {
                    this.trades[record.eventSymbol] = record;
                } else if(record.eventType === "Greeks") {
                    //console.log(record);
                    this.greeks[record.eventSymbol] = record;
                }

            }
        })
    }


    async getUserWatchLists(): Promise<IWatchListRawData[]> {
        const result = await this._tastyClient.watchlistsService.getAllWatchlists();
        return result.map((wl: any) => {
            return {
                name: wl.name,
                entries: wl["watchlist-entries"].map((e: any) => e.symbol)
            }
        })
    }
    async getPlatformWatchLists(): Promise<IWatchListRawData[]> {
        const result = await this._tastyClient.watchlistsService.getPublicWatchlists();

        return result.map((wl: any) => {
            return {
                name: wl.name,
                entries: wl["watchlist-entries"].map((e: any) => e.symbol)
            }
        })

    }

    async getSymbolMetrics(symbol: string): Promise<ISymbolMetricsRawData | null> {
        const result = await this._tastyClient.marketMetricsService.getMarketMetrics({symbols: symbol});

        if(!Check.isArray(result) || result.length === 0) {
            return null;
        }

        const data = result[0] as any;

        const earningsRawData = data["earnings"];

        let earnings: ISymbolEarningsRawData | undefined;

        if(earningsRawData) {
            earnings = {
                expectedReportDate: earningsRawData["expected-report-date"],
                actualEarningsPerShare: earningsRawData["actual-eps"],
            }
        }
        return {
            beta: data["beta"],
            impliedVolatilityPercentile: data["implied-volatility-percentile"],
            liquidityRank: data["liquidity-rank"],
            impliedVolatilityIndex: data["implied-volatility-index"],
            impliedVolatilityIndexRank: data["implied-volatility-index-rank"],
            earnings: earnings
        }


        /*
    "implied-volatility-percentile": 0,
    "liquidity-rank": 0,
    "option-expiration-implied-volatilities": [
        {
            "expiration-date": "2025-12-31T11:30:50.667Z",
            "settlement-type": "string",
            "option-chain-type": "string",
            "implied-volatility": 0
        }
    ],
    "implied-volatility-rank": 0,
    "implied-volatility-index": 0,
    "liquidity": 0,
    "implied-volatility-index-5-day-change": 0,
    "symbol": "string",
    "liquidity-rating": 0

     */
    }

    async searchSymbol(query: string): Promise<ISearchSymbolItemRawData[]> {

        const result: any[] = (await this._tastyClient.symbolSearchService.getSymbolData(query)) ?? [];

        return result.map((r: any) => {
            return {
                symbol: r.symbol,
                description: r.description,
            }
        })

    }

    async getAccounts(): Promise<IAccountRawData[]> {
        const accounts: any[] = await this._tastyClient.accountsAndCustomersService.getCustomerAccounts()
        //this._tastyClient.orderService.createOrder("123")
        return accounts.map(acc => {
            return {
                accountNumber: acc.account["account-number"]
            }
        });
    }

    async sendOrder(accountNumber: string, order: IOrderRequest): Promise<void> {
        const orderData = {
            "order-type": order.orderType,
            "time-in-force": order.timeInForce,
            "price": order.price,
            "price-effect": order.priceEffect,
            "legs": order.legs.map(leg => {
                return {
                    "action": leg.action,
                    "instrument-type": leg.instrumentType,
                    "quantity": leg.quantity,
                    "symbol": leg.symbol
                }
            })
        }
        await this._tastyClient.orderService.createOrder(accountNumber, orderData);
    }

    async getPositions(accountNumber: string, underlyingSymbol?: string): Promise<IPositionRawData[]> {
        const queryParams: Record<string, string> = {};
        if (underlyingSymbol) {
            queryParams['underlying-symbol'] = underlyingSymbol;
        }

        const positions: any[] = await this._tastyClient.balancesAndPositionsService.getPositionsList(accountNumber, queryParams);

        return positions
            .filter((pos: any) => pos['instrument-type'] === 'Equity Option')
            .map((pos: any) => {
                // Parse the option symbol to extract strike price and option type
                // TastyTrade option symbols format: SYMBOL  YYMMDDCSTRIKE or SYMBOL  YYMMDDPSTRIKE
                const symbol = pos['symbol'] as string;
                // streamer-symbol is the dxFeed format (e.g. .SPY260220P580) used by the quote streamer
                const streamerSymbol = (pos['streamer-symbol'] as string | undefined) || symbol;
                const underlyingSymbol = pos['underlying-symbol'] as string;
                const quantity = Math.abs(parseFloat(pos['quantity'] || '0'));
                // quantity-direction is the string "Long" or "Short" from TastyTrade API
                const quantityDirection: 'Long' | 'Short' = pos['quantity-direction'] === 'Long' ? 'Long' : 'Short';

                // Extract expiration date and option type from symbol
                // Example: SPY   260212P00580000 -> expiration: 2026-02-12, type: P, strike: 580
                let strikePrice = 0;
                let optionType: 'C' | 'P' = 'C';
                let expirationDate = '';

                // Try to parse from symbol - format varies
                // Common format: ROOT + spaces + YYMMDD + C/P + strike*1000
                const symbolMatch = symbol.match(/(\w+)\s*(\d{6})([CP])(\d+)/);
                if (symbolMatch) {
                    const [, , dateStr, type, strikeStr] = symbolMatch;
                    const year = '20' + dateStr.substring(0, 2);
                    const month = dateStr.substring(2, 4);
                    const day = dateStr.substring(4, 6);
                    expirationDate = `${year}-${month}-${day}`;
                    optionType = type as 'C' | 'P';
                    strikePrice = parseFloat(strikeStr) / 1000;
                }

                return {
                    symbol,
                    streamerSymbol,
                    underlyingSymbol,
                    quantity,
                    quantityDirection,
                    instrumentType: pos['instrument-type'],
                    strikePrice,
                    optionType,
                    expirationDate
                };
            });
    }

    async getOrders(accountNumber: string, queryParams?: Record<string, any>): Promise<IOrderRawData[]> {
        const orders: any[] = await this._tastyClient.orderService.getOrders(accountNumber, queryParams || {});
        console.log(`[TastyMarketDataProvider] Fetched ${orders?.length || 0} orders`);
        return (orders || []).map((order: any) => ({
            id: order.id,
            'received-at': order['received-at'],
            'created-at': order['created-at'],
            status: order.status,
            'underlying-symbol': order['underlying-symbol'],
            legs: (order.legs || []).map((leg: any) => ({
                symbol: leg.symbol,
                action: leg.action,
                quantity: leg.quantity,
                fills: leg.fills
            }))
        }));
    }

    async getTransactions(accountNumber: string, queryParams?: Record<string, any>): Promise<ITransactionRawData[]> {
        const transactions: any[] = await this._tastyClient.transactionsService.getAccountTransactions(accountNumber, queryParams || {});
        console.log(`[TastyMarketDataProvider] Fetched ${transactions?.length || 0} transactions`);
        return (transactions || []).map((tx: any) => ({
            id: tx.id,
            'transaction-type': tx['transaction-type'],
            'transaction-sub-type': tx['transaction-sub-type'],
            'executed-at': tx['executed-at'],
            action: tx.action,
            symbol: tx.symbol,
            'underlying-symbol': tx['underlying-symbol'],
            quantity: tx.quantity,
            price: tx.price,
            value: tx.value,
            'net-value': tx['net-value'] || tx.value,
            'value-effect': tx['value-effect'],
            'order-id': tx['order-id'],
            'clearing-fees': tx['clearing-fees'] || '0',
            'regulatory-fees': tx['regulatory-fees'] || '0',
            'proprietary-index-option-fees': tx['proprietary-index-option-fees'] || '0',
            commission: tx.commission || '0'
        }));
    }

    async getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData> {
        try {
            const balances: any = await this._tastyClient.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
            console.log(`[TastyMarketDataProvider] Fetched balances for account ${accountNumber}`, balances);

            return {
                netLiquidity: parseFloat(balances['net-liquidating-value'] || '0'),
                optionBuyingPower: parseFloat(balances['derivative-buying-power'] || '0'),
                stockBuyingPower: parseFloat(balances['equity-buying-power'] || '0'),
                cashBalance: parseFloat(balances['cash-balance'] || '0'),
                pendingCash: parseFloat(balances['pending-cash'] || '0'),
                dayTradingBuyingPower: parseFloat(balances['day-trading-buying-power'] || '0'),
                maintenanceRequirement: parseFloat(balances['maintenance-requirement'] || '0')
            };
        } catch (error) {
            console.error('[TastyMarketDataProvider] Error fetching balances:', error);
            return {
                netLiquidity: 0,
                optionBuyingPower: 0,
                stockBuyingPower: 0,
                cashBalance: 0,
                pendingCash: 0,
                dayTradingBuyingPower: 0,
                maintenanceRequirement: 0
            };
        }
    }
}
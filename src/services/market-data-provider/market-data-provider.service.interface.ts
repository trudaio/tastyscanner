
export interface IMarketDataProviderService {
    start(): Promise<void>;
    waitForConnection(): Promise<void>;
    getOptionsChain(symbol: string): Promise<IOptionChainRawData[]>;
    subscribe(symbols: string[]): void;
    unsubscribe(symbols: string[]): void;
    getSymbolQuote(symbol: string): IQuoteRawData | undefined;
    getSymbolTrade(symbol: string): ITradeRawData | undefined;
    getSymbolGreeks(symbol: string): IGreeksRawData | undefined;
    getUserWatchLists(): Promise<IWatchListRawData[]>;
    getPlatformWatchLists(): Promise<IWatchListRawData[]>;
    getSymbolMetrics(symbol: string): Promise<ISymbolMetricsRawData | null>;
    getSymbolInfo(symbol: string): Promise<ISymbolInfoRawData>;
    searchSymbol(query: string): Promise<ISearchSymbolItemRawData[]>;
    getAccounts(): Promise<IAccountRawData[]>;
    getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData>;
    sendOrder(accountNumber: string, order: IOrderRequest): Promise<void>;
    getPositions(accountNumber: string, underlyingSymbol?: string): Promise<IPositionRawData[]>;
    getOrders(accountNumber: string, queryParams?: Record<string, any>): Promise<IOrderRawData[]>;
    getTransactions(accountNumber: string, queryParams?: Record<string, any>): Promise<ITransactionRawData[]>;
}

export interface IOptionChainRawData {
    expirations: IOptionsExpirationRawData[];
}

export interface IOptionsExpirationRawData {
    expirationDate: string;
    daysToExpiration: number;
    expirationType: string;
    settlementType: string;
    strikes: IOptionStrikeRawData[];
}

export interface IOptionStrikeRawData {
    strikePrice: number;
    callId: string;
    putId: string;
    callStreamerSymbol: string;
    putStreamerSymbol: string;
}

export interface ITradeRawData {
    price: number;
}

export interface IQuoteRawData {
    bidPrice: number;
    askPrice: number;
}

export interface IGreeksRawData {
    delta: number;
    volatility: number;
    theta: number;
    gamma: number;
    rho: number;
    vega: number;
    time: number;
}

export interface IWatchListRawData {
    name: string;
    entries: string[];
}

export interface ISymbolEarningsRawData {
    expectedReportDate: string;
    actualEarningsPerShare: string;
}

export interface ISymbolMetricsRawData {
    impliedVolatilityPercentile: number;
    liquidityRank: number;
    impliedVolatilityIndex: number;
    impliedVolatilityIndexRank: number;
    beta: number;
    earnings?: ISymbolEarningsRawData;
}

export interface ISymbolInfoRawData {
    description: string;
    listedMarket: string;
}

export interface ISearchSymbolItemRawData {
    symbol: string;
    description: string;
}

export interface IAccountRawData {
    accountNumber: string;
}

export interface IAccountBalancesRawData {
    netLiquidity: number;
    optionBuyingPower: number;
    stockBuyingPower: number;
    cashBalance: number;
    pendingCash: number;
    dayTradingBuyingPower: number;
    maintenanceRequirement: number;
}

export interface IOrderRequest {
    price: number;
    orderType: string;
    timeInForce: string;
    priceEffect: string;
    //automatedSource: boolean;
    legs: IOrderRequestLeg[];

}

export interface IOrderRequestLeg {
    action: string;
    instrumentType: string;
    quantity: number;
    symbol: string;
}

export interface IPositionRawData {
    symbol: string;
    streamerSymbol: string;
    underlyingSymbol: string;
    quantity: number;
    quantityDirection: 'Long' | 'Short';
    instrumentType: string;
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;
    averageOpenPrice: number;
    closePrice: number;
    multiplier: number;
}

export interface IOrderLegRawData {
    symbol: string;
    action: string;
    quantity: number;
    fills?: Array<{
        'fill-price': string;
        'filled-quantity': string;
    }>;
}

export interface IOrderRawData {
    id: number | string;
    'received-at'?: string;
    'created-at'?: string;
    status: string;
    'underlying-symbol'?: string;
    legs: IOrderLegRawData[];
}

export interface ITransactionRawData {
    id: number | string;
    'transaction-type': string;
    'transaction-sub-type': string;
    'executed-at': string;
    action: string;
    symbol: string;
    'underlying-symbol': string;
    quantity: string;
    price: string;
    value: string;
    'net-value': string;
    'value-effect': string;
    'order-id'?: number;
    'clearing-fees': string;
    'regulatory-fees': string;
    'proprietary-index-option-fees': string;
    commission: string;
}
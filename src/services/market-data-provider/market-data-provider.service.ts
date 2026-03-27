import {
    IAccountRawData,
    IAccountBalancesRawData,
    IGreeksRawData,
    IMarketDataProviderService,
    IOptionChainRawData, IOrderRawData, IOrderRequest, IPositionRawData,
    IQuoteRawData, ISearchSymbolItemRawData, ISymbolInfoRawData, ISymbolMetricsRawData,
    ITradeRawData, ITransactionRawData, IWatchListRawData
} from "./market-data-provider.service.interface";
import {TastyMarketDataProvider} from "./tasty-market-data-provider";
import {IBKRMarketDataProvider} from "./ibkr-market-data-provider";
import {BrokerType, type IBrokerCredentials, type IIBKRCredentials, type ITastyTradeCredentials} from "../broker-provider/broker-provider.interface";

export class MarketDataProviderService implements IMarketDataProviderService {

    constructor(credentials: IBrokerCredentials);
    /** @deprecated Use credentials object instead. Kept for backward compatibility. */
    constructor(clientSecret: string, refreshToken: string);
    constructor(credentialsOrSecret: IBrokerCredentials | string, refreshToken?: string) {
        if (typeof credentialsOrSecret === 'string') {
            // Legacy path: raw TastyTrade credentials
            this._currentProvider = new TastyMarketDataProvider(credentialsOrSecret, refreshToken!);
        } else if (credentialsOrSecret.brokerType === BrokerType.IBKR) {
            const creds = credentialsOrSecret as IIBKRCredentials;
            this._currentProvider = new IBKRMarketDataProvider(creds.gatewayUrl, creds.accountId);
        } else {
            const creds = credentialsOrSecret as ITastyTradeCredentials;
            this._currentProvider = new TastyMarketDataProvider(creds.clientSecret, creds.refreshToken);
        }
    }

    private _currentProvider: IMarketDataProviderService;

    async start(): Promise<void> {
        await this._currentProvider.start();
    }
    async waitForConnection(): Promise<void> {
        await this._currentProvider.waitForConnection();
    }
    async getOptionsChain(symbol: string): Promise<IOptionChainRawData[]> {
        return await this._currentProvider.getOptionsChain(symbol);
    }
    subscribe(symbols: string[]): void {
        this._currentProvider.subscribe(symbols);
    }
    unsubscribe(symbols: string[]): void {
        this._currentProvider.unsubscribe(symbols);
    }
    getSymbolQuote(symbol: string): IQuoteRawData | undefined {
        return this._currentProvider.getSymbolQuote(symbol);
    }
    getSymbolTrade(symbol: string): ITradeRawData | undefined {
        return this._currentProvider.getSymbolTrade(symbol);
    }
    getSymbolGreeks(symbol: string): IGreeksRawData | undefined {
        return this._currentProvider.getSymbolGreeks(symbol);
    }

    getUserWatchLists(): Promise<any> {
        return this._currentProvider.getUserWatchLists();
    }

    getPlatformWatchLists(): Promise<IWatchListRawData[]> {
        return this._currentProvider.getPlatformWatchLists();
    }

    getSymbolMetrics(symbol: string): Promise<ISymbolMetricsRawData | null> {
        return this._currentProvider.getSymbolMetrics(symbol);
    }
    async getSymbolInfo(symbol: string): Promise<ISymbolInfoRawData> {
        return this._currentProvider.getSymbolInfo(symbol);
    }

    searchSymbol(query: string): Promise<ISearchSymbolItemRawData[]> {
        return this._currentProvider.searchSymbol(query);
    }

    async getAccounts(): Promise<IAccountRawData[]> {
        return await this._currentProvider.getAccounts();
    }

    sendOrder(accountNumber: string, order: IOrderRequest): Promise<void> {
        return this._currentProvider.sendOrder(accountNumber, order);
    }

    getPositions(accountNumber: string, underlyingSymbol?: string): Promise<IPositionRawData[]> {
        return this._currentProvider.getPositions(accountNumber, underlyingSymbol);
    }

    getOrders(accountNumber: string, queryParams?: Record<string, any>): Promise<IOrderRawData[]> {
        return this._currentProvider.getOrders(accountNumber, queryParams);
    }

    getTransactions(accountNumber: string, queryParams?: Record<string, any>): Promise<ITransactionRawData[]> {
        return this._currentProvider.getTransactions(accountNumber, queryParams);
    }

    getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData> {
        return this._currentProvider.getAccountBalances(accountNumber);
    }
}

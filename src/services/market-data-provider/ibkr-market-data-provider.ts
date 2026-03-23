import { makeObservable, observable, runInAction } from 'mobx';
import { auth } from '../../firebase';
import { BrokerType, IBrokerProvider } from '../broker-provider/broker-provider.interface';
import {
    IMarketDataProviderService,
    IOptionChainRawData,
    IQuoteRawData,
    ITradeRawData,
    IGreeksRawData,
    IWatchListRawData,
    ISymbolMetricsRawData,
    ISymbolInfoRawData,
    ISearchSymbolItemRawData,
    IAccountRawData,
    IAccountBalancesRawData,
    IOrderRequest,
    IPositionRawData,
    IOrderRawData,
    ITransactionRawData,
} from './market-data-provider.service.interface';

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL as string;

async function getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

async function ibkrFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await getAuthToken();
    const resp = await fetch(`${FUNCTIONS_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options?.headers,
        },
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`IBKR proxy HTTP ${resp.status}: ${body}`);
    }
    return resp.json() as Promise<T>;
}

// ── Raw IBKR shapes (CP Gateway responses) ───────────────────────────────────

interface IIBKRPositionRaw {
    conid: number;
    contractDesc: string;
    position: number;
    ticker: string;
    assetClass: string;
    strike?: number;
    expiry?: string;
    putOrCall?: string;
    multiplier?: number;
    avgCost?: number;
    mktPrice?: number;
}

interface IIBKRAccountRaw {
    accountId: string;
}

interface IIBKRBalanceSummaryRaw {
    netliquidation?: { amount: number };
    optionbuyingpower?: { amount: number };
    buyingpower?: { amount: number };
    totalcashvalue?: { amount: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIBKRExpiry(expiry: string): string {
    // IBKR format: YYYYMMDD → ISO: YYYY-MM-DD
    if (expiry.length === 8) {
        return `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`;
    }
    return expiry;
}

function mapIBKRPosition(pos: IIBKRPositionRaw): IPositionRawData {
    const isOption = pos.assetClass === 'OPT' || pos.assetClass === 'FOP';
    const optionType = pos.putOrCall === 'P' ? 'P' : 'C';

    // Best-effort streamer symbol: Phase 2 will replace with conid-based streaming
    const streamerSymbol = pos.contractDesc?.trim() ?? pos.ticker;

    return {
        symbol: pos.contractDesc?.trim() ?? pos.ticker,
        streamerSymbol,
        underlyingSymbol: pos.ticker,
        quantity: Math.abs(pos.position),
        quantityDirection: pos.position >= 0 ? 'Long' : 'Short',
        instrumentType: isOption ? 'Equity Option' : 'Equity',
        strikePrice: pos.strike ?? 0,
        optionType,
        expirationDate: pos.expiry ? parseIBKRExpiry(pos.expiry) : '',
        averageOpenPrice: pos.avgCost ?? 0,
        closePrice: pos.mktPrice ?? 0,
        multiplier: pos.multiplier ?? (isOption ? 100 : 1),
    };
}

// ── IBKRMarketDataProvider ────────────────────────────────────────────────────

export class IBKRMarketDataProvider implements IMarketDataProviderService, IBrokerProvider {
    constructor() {
        makeObservable(this, {
            quotes: observable,
            trades: observable,
            greeks: observable,
        });
    }

    public quotes: Record<string, IQuoteRawData> = {};
    public trades: Record<string, ITradeRawData> = {};
    public greeks: Record<string, IGreeksRawData> = {};

    private _connected = false;

    // ── IBrokerProvider ──────────────────────────────────────────────────────

    getType(): BrokerType {
        return BrokerType.IBKR;
    }

    async connect(): Promise<void> {
        const result = await ibkrFetch<{ authenticated: boolean }>('/api/ibkr/auth-status');
        runInAction(() => { this._connected = result.authenticated; });
    }

    async disconnect(): Promise<void> {
        runInAction(() => { this._connected = false; });
    }

    isConnected(): boolean {
        return this._connected;
    }

    // ── IMarketDataProviderService ───────────────────────────────────────────

    async start(): Promise<void> {
        await this.connect();
    }

    async waitForConnection(): Promise<void> {
        // Phase 1: REST polling — no persistent connection needed
    }

    async getOptionsChain(_symbol: string): Promise<IOptionChainRawData[]> {
        // Phase 2: IBKR options chains via iserver/secdef/search
        return [];
    }

    subscribe(_symbols: string[]): void {
        // Phase 2: IBKR streaming via WebSocket (iserver/marketdata/snapshot)
    }

    unsubscribe(_symbols: string[]): void {
        // Phase 2
    }

    getSymbolQuote(symbol: string): IQuoteRawData | undefined {
        return this.quotes[symbol];
    }

    getSymbolTrade(symbol: string): ITradeRawData | undefined {
        return this.trades[symbol];
    }

    getSymbolGreeks(symbol: string): IGreeksRawData | undefined {
        return this.greeks[symbol];
    }

    async getUserWatchLists(): Promise<IWatchListRawData[]> {
        return [];
    }

    async getPlatformWatchLists(): Promise<IWatchListRawData[]> {
        return [];
    }

    async getSymbolMetrics(_symbol: string): Promise<ISymbolMetricsRawData | null> {
        return null;
    }

    async getSymbolInfo(_symbol: string): Promise<ISymbolInfoRawData> {
        return { description: '', listedMarket: '' };
    }

    async searchSymbol(_query: string): Promise<ISearchSymbolItemRawData[]> {
        return [];
    }

    async getAccounts(): Promise<IAccountRawData[]> {
        const accounts = await ibkrFetch<IIBKRAccountRaw[]>('/api/ibkr/accounts');
        return accounts.map(a => ({ accountNumber: a.accountId }));
    }

    async getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData> {
        const summary = await ibkrFetch<IIBKRBalanceSummaryRaw>(`/api/ibkr/balances/${accountNumber}`);
        return {
            netLiquidity: summary.netliquidation?.amount ?? 0,
            optionBuyingPower: summary.optionbuyingpower?.amount ?? 0,
            stockBuyingPower: summary.buyingpower?.amount ?? 0,
            cashBalance: summary.totalcashvalue?.amount ?? 0,
            pendingCash: 0,
            dayTradingBuyingPower: 0,
            maintenanceRequirement: 0,
        };
    }

    async sendOrder(_accountNumber: string, _order: IOrderRequest): Promise<void> {
        // Phase 2: IBKR order placement via iserver/account/{acct}/orders
    }

    async getPositions(accountNumber: string): Promise<IPositionRawData[]> {
        const positions = await ibkrFetch<IIBKRPositionRaw[]>(`/api/ibkr/positions/${accountNumber}`);
        return positions.map(mapIBKRPosition);
    }

    async getOrders(_accountNumber: string): Promise<IOrderRawData[]> {
        // Phase 2
        return [];
    }

    async getTransactions(_accountNumber: string): Promise<ITransactionRawData[]> {
        // Phase 2
        return [];
    }
}

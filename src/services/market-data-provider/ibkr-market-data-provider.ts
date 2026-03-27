import {makeObservable, observable, runInAction} from "mobx";
import {RateLimiter} from "../../utils/rate-limiter";
import type {
    IAccountBalancesRawData,
    IAccountRawData,
    IGreeksRawData,
    IMarketDataProviderService,
    IOptionChainRawData,
    IOrderRawData,
    IOrderRequest,
    IPositionRawData,
    IQuoteRawData,
    ISearchSymbolItemRawData,
    ISymbolInfoRawData,
    ISymbolMetricsRawData,
    ITradeRawData,
    ITransactionRawData,
    IWatchListRawData,
} from "./market-data-provider.service.interface";

const TICKLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * IBKR Client Portal API market data provider.
 *
 * Phase 1: session management + account/positions/balances.
 * All other methods are stubbed and will throw until implemented.
 */
export class IBKRMarketDataProvider implements IMarketDataProviderService {
    private readonly _baseUrl: string;
    private readonly _accountId: string;
    private readonly _rateLimiter = new RateLimiter(10, 1000);
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _connected = false;
    private _connectionPromise: Promise<void> | null = null;
    private _connectionResolve: (() => void) | null = null;

    // Observable maps for streamer data (same pattern as TastyMarketDataProvider)
    greeks: Record<string, IGreeksRawData> = {};
    quotes: Record<string, IQuoteRawData> = {};
    trades: Record<string, ITradeRawData> = {};

    constructor(gatewayUrl: string, accountId: string) {
        // Normalize URL: strip trailing slash
        this._baseUrl = gatewayUrl.replace(/\/+$/, '');
        this._accountId = accountId;

        makeObservable(this, {
            greeks: observable,
            quotes: observable,
            trades: observable,
        });
    }

    // ── Session Management ───────────────────────────────────────────────────

    async start(): Promise<void> {
        this._connectionPromise = new Promise<void>(resolve => {
            this._connectionResolve = resolve;
        });

        try {
            const status = await this._fetch<{ authenticated: boolean; connected: boolean }>(
                '/v1/api/iserver/auth/status', {method: 'POST'}
            );

            if (status.authenticated && status.connected) {
                this._markConnected();
            } else {
                // Try reauthenticate
                await this._fetch('/v1/api/iserver/reauthenticate', {method: 'POST'});
                this._markConnected();
            }
        } catch (err) {
            console.error('[IBKR] Failed to authenticate:', err);
            // Resolve anyway so the app doesn't hang; methods will fail individually
            this._connectionResolve?.();
        }

        // Start heartbeat to keep session alive
        this._heartbeatTimer = setInterval(() => {
            void this._fetch('/v1/api/tickle', {method: 'POST'}).catch(() => {});
        }, TICKLE_INTERVAL_MS);
    }

    async waitForConnection(): Promise<void> {
        if (this._connected) return;
        await this._connectionPromise;
    }

    private _markConnected(): void {
        this._connected = true;
        this._connectionResolve?.();
    }

    // ── Implemented: Account & Positions ─────────────────────────────────────

    async getAccounts(): Promise<IAccountRawData[]> {
        const accounts = await this._fetch<Array<{ accountId: string }>>('/v1/api/portfolio/accounts');
        return accounts.map(a => ({accountNumber: a.accountId}));
    }

    async getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData> {
        const summary = await this._fetch<Record<string, { amount: number }>>(
            `/v1/api/portfolio/${accountNumber}/summary`
        );
        return {
            netLiquidity: summary['netliquidation']?.amount ?? 0,
            optionBuyingPower: summary['buyingpower']?.amount ?? 0,
            stockBuyingPower: summary['buyingpower']?.amount ?? 0,
            cashBalance: summary['totalcashvalue']?.amount ?? 0,
            pendingCash: 0,
            dayTradingBuyingPower: summary['daytradesremaining']?.amount ?? 0,
            maintenanceRequirement: summary['maintenancemarginreq']?.amount ?? 0,
        };
    }

    async getPositions(accountNumber: string, _underlyingSymbol?: string): Promise<IPositionRawData[]> {
        const positions = await this._fetch<Array<{
            conid: number;
            contractDesc: string;
            ticker: string;
            position: number;
            strike: number;
            putOrCall: string;
            expiry: string;
            avgCost: number;
            mktPrice: number;
            multiplier: number;
            undConid: number;
        }>>(`/v1/api/portfolio/${accountNumber}/positions/0`);

        return positions.map(p => ({
            symbol: String(p.conid),
            streamerSymbol: String(p.conid), // IBKR uses conids for streaming
            underlyingSymbol: p.ticker ?? '',
            quantity: Math.abs(p.position),
            quantityDirection: p.position > 0 ? 'Long' as const : 'Short' as const,
            instrumentType: p.putOrCall ? 'Equity Option' : 'Equity',
            strikePrice: p.strike ?? 0,
            optionType: (p.putOrCall === 'P' ? 'P' : 'C') as 'C' | 'P',
            expirationDate: p.expiry ?? '',
            averageOpenPrice: p.avgCost ?? 0,
            closePrice: p.mktPrice ?? 0,
            multiplier: p.multiplier ?? 100,
        }));
    }

    // ── Stubbed Methods (Phase 2+) ──────────────────────────────────────────

    async getOptionsChain(_symbol: string): Promise<IOptionChainRawData[]> {
        throw new Error('IBKR: getOptionsChain not yet implemented');
    }

    subscribe(_symbols: string[]): void {
        // TODO: WebSocket streaming via wss://{gateway}/v1/api/ws
        console.warn('[IBKR] subscribe() not yet implemented');
    }

    unsubscribe(_symbols: string[]): void {
        console.warn('[IBKR] unsubscribe() not yet implemented');
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
        throw new Error('IBKR: getUserWatchLists not yet implemented');
    }

    async getPlatformWatchLists(): Promise<IWatchListRawData[]> {
        throw new Error('IBKR: getPlatformWatchLists not yet implemented');
    }

    async getSymbolMetrics(_symbol: string): Promise<ISymbolMetricsRawData | null> {
        throw new Error('IBKR: getSymbolMetrics not yet implemented');
    }

    async getSymbolInfo(_symbol: string): Promise<ISymbolInfoRawData> {
        throw new Error('IBKR: getSymbolInfo not yet implemented');
    }

    async searchSymbol(_query: string): Promise<ISearchSymbolItemRawData[]> {
        throw new Error('IBKR: searchSymbol not yet implemented');
    }

    async sendOrder(_accountNumber: string, _order: IOrderRequest): Promise<void> {
        throw new Error('IBKR: sendOrder not yet implemented');
    }

    async getOrders(_accountNumber: string, _queryParams?: Record<string, any>): Promise<IOrderRawData[]> {
        throw new Error('IBKR: getOrders not yet implemented');
    }

    async getTransactions(_accountNumber: string, _queryParams?: Record<string, any>): Promise<ITransactionRawData[]> {
        throw new Error('IBKR: getTransactions not yet implemented');
    }

    // ── Internal Helpers ────────────────────────────────────────────────────

    private async _fetch<T>(path: string, init?: RequestInit): Promise<T> {
        return this._rateLimiter.execute(async () => {
            const resp = await fetch(`${this._baseUrl}${path}`, {
                ...init,
                headers: {
                    'Content-Type': 'application/json',
                    ...init?.headers,
                },
            });
            if (!resp.ok) {
                throw new Error(`IBKR API ${path}: ${resp.status} ${resp.statusText}`);
            }
            return resp.json() as Promise<T>;
        });
    }
}

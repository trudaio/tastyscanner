/**
 * TastyApiClient — Backend singleton wrapping @tastytrade/api
 *
 * Differs from the frontend TastyMarketDataProvider:
 * - No MobX (plain JS objects for streamer data)
 * - No Firebase auth
 * - Uses process.env instead of import.meta.env
 * - Persists DxLink WebSocket for the server lifetime
 */

import { WebSocket as WS } from 'ws';
import TastyTradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// Polyfill WebSocket for Node.js environments that don't have it globally
if (!globalThis.WebSocket) {
    // @ts-expect-error — WS type differs slightly from browser WebSocket
    globalThis.WebSocket = WS;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GreeksData {
    delta: number;
    theta: number;
    gamma: number;
    vega: number;
    volatility: number;
    rho: number;
}

export interface QuoteData {
    bidPrice: number;
    askPrice: number;
}

export interface TradeData {
    price: number;
}

export interface AccountBalances {
    netLiquidity: number;
    optionBuyingPower: number;
    stockBuyingPower: number;
    cashBalance: number;
    pendingCash: number;
    dayTradingBuyingPower: number;
    maintenanceRequirement: number;
}

export interface PositionData {
    symbol: string;
    streamerSymbol: string;
    underlyingSymbol: string;
    quantity: number;
    quantityDirection: 'Long' | 'Short';
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;
}

export interface TransactionData {
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

export interface OrderLegData {
    symbol: string;
    action: string;
    quantity: number;
    fills?: Array<{ 'fill-price': string; 'filled-quantity': string }>;
}

export interface OrderData {
    id: number | string;
    'received-at'?: string;
    'created-at'?: string;
    status: string;
    'underlying-symbol'?: string;
    legs: OrderLegData[];
}

// ─── Client Class ─────────────────────────────────────────────────────────────

class TastyApiClient {
    private _client: TastyTradeClient | null = null;
    private _connectionPromise: Promise<void> | null = null;
    private _initialized = false;

    // Streamer data caches — updated directly by WebSocket events (no MobX needed)
    public quotes: Record<string, QuoteData> = {};
    public trades: Record<string, TradeData> = {};
    public greeks: Record<string, GreeksData> = {};

    public accountNumber = '';

    async initialize(): Promise<void> {
        if (this._initialized) return;

        const clientSecret = process.env.TASTY_CLIENT_SECRET;
        const refreshToken = process.env.TASTY_REFRESH_TOKEN;

        if (!clientSecret || !refreshToken) {
            throw new Error(
                'Missing TASTY_CLIENT_SECRET or TASTY_REFRESH_TOKEN env vars. ' +
                'Copy api/.env.example to api/.env and fill in your credentials.'
            );
        }

        this._client = new TastyTradeClient({
            ...TastyTradeClient.ProdConfig,
            clientSecret,
            refreshToken,
            oauthScopes: ['read', 'trade'],
        });

        // Streamer event handler — plain object mutation, no MobX
        this._client.quoteStreamer.addEventListener((records: unknown[]) => {
            for (const rec of records) {
                const r = rec as Record<string, unknown>;
                const sym = r['eventSymbol'] as string;
                if (!sym) continue;

                if (r['eventType'] === 'Quote') {
                    this.quotes[sym] = {
                        bidPrice: (r['bidPrice'] as number) ?? 0,
                        askPrice: (r['askPrice'] as number) ?? 0,
                    };
                } else if (r['eventType'] === 'Trade') {
                    this.trades[sym] = { price: (r['price'] as number) ?? 0 };
                } else if (r['eventType'] === 'Greeks') {
                    this.greeks[sym] = {
                        delta: (r['delta'] as number) ?? 0,
                        theta: (r['theta'] as number) ?? 0,
                        gamma: (r['gamma'] as number) ?? 0,
                        vega: (r['vega'] as number) ?? 0,
                        volatility: (r['volatility'] as number) ?? 0,
                        rho: (r['rho'] as number) ?? 0,
                    };
                }
            }
        });

        // Connect DxLink WebSocket — persistent for server lifetime
        console.log('[TastyAPI] Connecting DxLink WebSocket...');
        this._connectionPromise = this._client.quoteStreamer.connect();
        await this._connectionPromise;
        console.log('[TastyAPI] DxLink WebSocket connected');

        // Discover account number
        const accs = await this._client.accountsAndCustomersService.getCustomerAccounts() as unknown[];
        if (accs.length > 0) {
            const acc = accs[0] as { account: { 'account-number': string } };
            this.accountNumber = acc.account['account-number'];
            console.log(`[TastyAPI] Account: ${this.accountNumber}`);
        } else {
            throw new Error('No TastyTrade accounts found for these credentials');
        }

        this._initialized = true;
    }

    get raw(): TastyTradeClient {
        if (!this._client) throw new Error('TastyApiClient not initialized. Call initialize() first.');
        return this._client;
    }

    async waitForConnection(): Promise<void> {
        if (this._connectionPromise) await this._connectionPromise;
    }

    subscribe(symbols: string[]): void {
        if (symbols.length === 0) return;
        this._client?.quoteStreamer.subscribe(symbols, [
            MarketDataSubscriptionType.Quote,
            MarketDataSubscriptionType.Trade,
            MarketDataSubscriptionType.Greeks,
        ]);
    }

    unsubscribe(symbols: string[]): void {
        if (symbols.length > 0) this._client?.quoteStreamer.unsubscribe(symbols);
    }

    /**
     * Subscribe to symbols and wait until we receive greeks for at least one of them,
     * or until timeoutMs elapses. Useful for on-demand greeks in route handlers.
     */
    async subscribeAndWaitForGreeks(symbols: string[], timeoutMs = 6000): Promise<void> {
        if (symbols.length === 0) return;
        this.subscribe(symbols);
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (symbols.some(s => this.greeks[s] !== undefined)) return;
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // ─── REST API Wrappers ─────────────────────────────────────────────────────

    async getAccountBalances(): Promise<AccountBalances> {
        const b = await this.raw.balancesAndPositionsService.getAccountBalanceValues(
            this.accountNumber
        ) as Record<string, string>;
        return {
            netLiquidity: parseFloat(b['net-liquidating-value'] ?? '0'),
            optionBuyingPower: parseFloat(b['derivative-buying-power'] ?? '0'),
            stockBuyingPower: parseFloat(b['equity-buying-power'] ?? '0'),
            cashBalance: parseFloat(b['cash-balance'] ?? '0'),
            pendingCash: parseFloat(b['pending-cash'] ?? '0'),
            dayTradingBuyingPower: parseFloat(b['day-trading-buying-power'] ?? '0'),
            maintenanceRequirement: parseFloat(b['maintenance-requirement'] ?? '0'),
        };
    }

    async getPositions(): Promise<PositionData[]> {
        const raw = await this.raw.balancesAndPositionsService.getPositionsList(
            this.accountNumber, {}
        ) as unknown[];

        return (raw as Array<Record<string, string>>)
            .filter(p => p['instrument-type'] === 'Equity Option')
            .map(p => {
                const symbol = p['symbol'];
                const streamerSymbol = p['streamer-symbol'] ?? symbol;
                const quantity = Math.abs(parseFloat(p['quantity'] ?? '0'));
                const quantityDirection: 'Long' | 'Short' =
                    p['quantity-direction'] === 'Long' ? 'Long' : 'Short';

                let strikePrice = 0;
                let optionType: 'C' | 'P' = 'C';
                let expirationDate = '';

                // Parse TastyTrade option symbol format: ROOT  YYMMDDCP00STRIKE
                const m = symbol.match(/(\w+)\s*(\d{6})([CP])(\d+)/);
                if (m) {
                    const [, , dateStr, type, strikeStr] = m;
                    expirationDate = `20${dateStr.substring(0, 2)}-${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}`;
                    optionType = type as 'C' | 'P';
                    strikePrice = parseFloat(strikeStr) / 1000;
                }

                return {
                    symbol,
                    streamerSymbol,
                    underlyingSymbol: p['underlying-symbol'],
                    quantity,
                    quantityDirection,
                    strikePrice,
                    optionType,
                    expirationDate,
                };
            });
    }

    async getTransactions(queryParams: Record<string, string | number> = {}): Promise<TransactionData[]> {
        const raw = await this.raw.transactionsService.getAccountTransactions(
            this.accountNumber, queryParams
        ) as unknown[];
        return (raw as Array<Record<string, unknown>>).map(tx => ({
            id: tx['id'] as number | string,
            'transaction-type': (tx['transaction-type'] as string) ?? '',
            'transaction-sub-type': (tx['transaction-sub-type'] as string) ?? '',
            'executed-at': (tx['executed-at'] as string) ?? '',
            action: (tx['action'] as string) ?? '',
            symbol: (tx['symbol'] as string) ?? '',
            'underlying-symbol': (tx['underlying-symbol'] as string) ?? '',
            quantity: (tx['quantity'] as string) ?? '0',
            price: (tx['price'] as string) ?? '0',
            value: (tx['value'] as string) ?? '0',
            'net-value': (tx['net-value'] as string) ?? (tx['value'] as string) ?? '0',
            'value-effect': (tx['value-effect'] as string) ?? '',
            'order-id': tx['order-id'] as number | undefined,
            'clearing-fees': (tx['clearing-fees'] as string) ?? '0',
            'regulatory-fees': (tx['regulatory-fees'] as string) ?? '0',
            'proprietary-index-option-fees': (tx['proprietary-index-option-fees'] as string) ?? '0',
            commission: (tx['commission'] as string) ?? '0',
        }));
    }

    async getOrders(queryParams: Record<string, string | number> = {}): Promise<OrderData[]> {
        const raw = await this.raw.orderService.getOrders(
            this.accountNumber, queryParams
        ) as unknown[];
        return (raw as Array<Record<string, unknown>>).map(o => ({
            id: o['id'] as number | string,
            'received-at': o['received-at'] as string | undefined,
            'created-at': o['created-at'] as string | undefined,
            status: (o['status'] as string) ?? '',
            'underlying-symbol': o['underlying-symbol'] as string | undefined,
            legs: ((o['legs'] as unknown[]) ?? []).map(l => {
                const leg = l as Record<string, unknown>;
                return {
                    symbol: (leg['symbol'] as string) ?? '',
                    action: (leg['action'] as string) ?? '',
                    quantity: (leg['quantity'] as number) ?? 0,
                    fills: leg['fills'] as OrderLegData['fills'],
                };
            }),
        }));
    }

    /** Paginated transaction fetch — collects all pages */
    async getAllTransactions(startDate: string, endDate?: string): Promise<TransactionData[]> {
        const all: TransactionData[] = [];
        let pageOffset = 0;
        const pageSize = 250;
        let hasMore = true;

        while (hasMore) {
            const params: Record<string, string | number> = {
                'start-date': startDate,
                'per-page': pageSize,
                'page-offset': pageOffset,
            };
            if (endDate) params['end-date'] = endDate;

            try {
                const page = await this.getTransactions(params);
                if (Array.isArray(page) && page.length > 0) {
                    all.push(...page);
                    pageOffset += page.length;
                    hasMore = page.length === pageSize;
                } else {
                    hasMore = false;
                }
            } catch {
                hasMore = false;
            }
        }
        return all;
    }
}

// Module-level singleton — created once when the server starts
export const tastyClient = new TastyApiClient();

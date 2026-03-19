/**
 * TastyRestClient — Direct REST API client for TastyTrade
 *
 * Uses native Node.js fetch (v18+) instead of @tastytrade/api.
 * Reason: @tastytrade/api imports @dxfeed/dxlink-api which has a named-export
 * incompatibility with Node.js 22 strict ESM (DXLinkFeed not found error).
 *
 * This client implements:
 *   - OAuth 2.0 refresh_token grant → Bearer access token (auto-refreshed)
 *   - All REST endpoints needed by the API routes
 *
 * Streaming (DxLink WebSocket / greeks) is NOT implemented here.
 * The /positions/greeks endpoint returns zeroes until a streaming solution is added.
 */

const BASE_URL = 'https://api.tastyworks.com';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// Streamer data — stays empty in REST-only mode
export interface GreeksData {
    delta: number; theta: number; gamma: number; vega: number; volatility: number; rho: number;
}
export interface QuoteData { bidPrice: number; askPrice: number; }
export interface TradeData { price: number; }

// ─── TastyRest Client ─────────────────────────────────────────────────────────

class TastyRestClient {
    private _accessToken = '';
    private _tokenExpiry = 0;
    private _initialized = false;

    /** Streamer caches — always empty in REST-only mode */
    public readonly quotes: Record<string, QuoteData> = {};
    public readonly trades: Record<string, TradeData> = {};
    public readonly greeks: Record<string, GreeksData> = {};

    public accountNumber = '';
    public readonly streamingAvailable = false;

    // ─── Auth ────────────────────────────────────────────────────────────────

    private async refreshAccessToken(): Promise<void> {
        const clientSecret = process.env['TASTY_CLIENT_SECRET'];
        const refreshToken = process.env['TASTY_REFRESH_TOKEN'];

        if (!clientSecret || !refreshToken) {
            throw new Error(
                'Missing TASTY_CLIENT_SECRET or TASTY_REFRESH_TOKEN. ' +
                'Copy api/.env.example to api/.env and fill in your TastyTrade credentials.'
            );
        }

        const res = await fetch(`${BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refresh_token: refreshToken,
                client_secret: clientSecret,
                scope: 'read trade',
                grant_type: 'refresh_token',
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`TastyTrade OAuth token refresh failed [${res.status}]: ${body}`);
        }

        const data = await res.json() as { access_token: string; expires_in: number };
        this._accessToken = data.access_token;
        // Expire 60s early to avoid edge-case expiry mid-request
        this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        console.log(`[TastyRest] Access token refreshed, expires in ${data.expires_in}s`);
    }

    private async getToken(): Promise<string> {
        if (!this._accessToken || Date.now() >= this._tokenExpiry) {
            await this.refreshAccessToken();
        }
        return this._accessToken;
    }

    // ─── HTTP Helpers ─────────────────────────────────────────────────────────

    private async get<T>(path: string, queryParams?: Record<string, string | number>): Promise<T> {
        const token = await this.getToken();
        let url = `${BASE_URL}${path}`;
        if (queryParams && Object.keys(queryParams).length > 0) {
            const qs = new URLSearchParams(
                Object.entries(queryParams).map(([k, v]) => [k, String(v)] as [string, string])
            );
            url += `?${qs.toString()}`;
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`TastyTrade API [${res.status}] ${path}: ${body}`);
        }

        const json = await res.json() as Record<string, unknown>;
        return this.extractData(json) as T;
    }

    /**
     * Mirror the extractResponseData logic from @tastytrade/api:
     * - json.data.items → return items array
     * - json.data       → return data object
     * - else            → return json as-is
     */
    private extractData(json: Record<string, unknown>): unknown {
        const dataField = json['data'] as Record<string, unknown> | undefined;
        if (dataField && Array.isArray(dataField['items'])) return dataField['items'];
        if (dataField !== undefined) return dataField;
        return json;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        if (this._initialized) return;

        await this.refreshAccessToken();
        console.log('[TastyRest] OAuth token acquired');

        const accounts = await this.get<Array<{ account: { 'account-number': string } }>>('/customers/me/accounts');
        if (!accounts || accounts.length === 0) {
            throw new Error('No TastyTrade accounts found for these credentials');
        }
        this.accountNumber = accounts[0].account['account-number'];
        console.log(`[TastyRest] Account: ${this.accountNumber}`);

        this._initialized = true;
    }

    async getAccountBalances(): Promise<AccountBalances> {
        const b = await this.get<Record<string, string>>(`/accounts/${this.accountNumber}/balances`);
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
        const raw = await this.get<Array<Record<string, string>>>(`/accounts/${this.accountNumber}/positions`);

        return (raw ?? [])
            .filter(p => p['instrument-type'] === 'Equity Option')
            .map(p => {
                const symbol = p['symbol'] ?? '';
                const streamerSymbol = p['streamer-symbol'] ?? symbol;
                const quantity = Math.abs(parseFloat(p['quantity'] ?? '0'));
                const quantityDirection: 'Long' | 'Short' =
                    p['quantity-direction'] === 'Long' ? 'Long' : 'Short';

                let strikePrice = 0;
                let optionType: 'C' | 'P' = 'C';
                let expirationDate = '';

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
                    underlyingSymbol: p['underlying-symbol'] ?? '',
                    quantity,
                    quantityDirection,
                    strikePrice,
                    optionType,
                    expirationDate,
                };
            });
    }

    async getTransactions(queryParams: Record<string, string | number> = {}): Promise<TransactionData[]> {
        const raw = await this.get<Array<Record<string, unknown>>>(`/accounts/${this.accountNumber}/transactions`, queryParams);

        return (raw ?? []).map(tx => ({
            id: tx['id'] as number | string,
            'transaction-type': String(tx['transaction-type'] ?? ''),
            'transaction-sub-type': String(tx['transaction-sub-type'] ?? ''),
            'executed-at': String(tx['executed-at'] ?? ''),
            action: String(tx['action'] ?? ''),
            symbol: String(tx['symbol'] ?? ''),
            'underlying-symbol': String(tx['underlying-symbol'] ?? ''),
            quantity: String(tx['quantity'] ?? '0'),
            price: String(tx['price'] ?? '0'),
            value: String(tx['value'] ?? '0'),
            'net-value': String(tx['net-value'] ?? tx['value'] ?? '0'),
            'value-effect': String(tx['value-effect'] ?? ''),
            'order-id': tx['order-id'] as number | undefined,
            'clearing-fees': String(tx['clearing-fees'] ?? '0'),
            'regulatory-fees': String(tx['regulatory-fees'] ?? '0'),
            'proprietary-index-option-fees': String(tx['proprietary-index-option-fees'] ?? '0'),
            commission: String(tx['commission'] ?? '0'),
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

    async getOrders(queryParams: Record<string, string | number> = {}): Promise<OrderData[]> {
        const raw = await this.get<Array<Record<string, unknown>>>(`/accounts/${this.accountNumber}/orders`, queryParams);

        return (raw ?? []).map(o => ({
            id: o['id'] as number | string,
            'received-at': o['received-at'] as string | undefined,
            'created-at': o['created-at'] as string | undefined,
            status: String(o['status'] ?? ''),
            'underlying-symbol': o['underlying-symbol'] as string | undefined,
            legs: ((o['legs'] as unknown[]) ?? []).map(l => {
                const leg = l as Record<string, unknown>;
                return {
                    symbol: String(leg['symbol'] ?? ''),
                    action: String(leg['action'] ?? ''),
                    quantity: Number(leg['quantity'] ?? 0),
                    fills: leg['fills'] as OrderLegData['fills'],
                };
            }),
        }));
    }

    /**
     * No-op in REST-only mode — streaming not available.
     * Resolves immediately; greeks map stays empty.
     */
    async subscribeAndWaitForGreeks(_symbols: string[], _timeoutMs?: number): Promise<void> {
        // DxLink streaming is disabled in REST-only mode.
        // /positions/greeks will return zeroes.
    }
}

// Module-level singleton
export const tastyClient = new TastyRestClient();

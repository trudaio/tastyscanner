import { makeObservable, observable, runInAction } from 'mobx';
import { RateLimiter } from '../../utils/rate-limiter';
import type {
    IAccountBalancesRawData,
    IAccountRawData,
    IGreeksRawData,
    IMarketDataProviderService,
    IOptionChainRawData,
    IOptionStrikeRawData,
    IOptionsExpirationRawData,
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
} from './market-data-provider.service.interface';

/* ── Constants ──────────────────────────────────────────────────────────── */

const TICKLE_INTERVAL_MS = 5 * 60 * 1000;  // 5 min
const WS_RECONNECT_DELAY_MS = 3000;

// WebSocket field codes for market data
const FIELDS = {
    LAST:    '31',
    BID:     '84',
    ASK:     '85',
    DELTA:   '7308',
    GAMMA:   '7309',
    THETA:   '7310',
    VEGA:    '7311',
    IV:      '7607',  // Implied Volatility %
};

const SUBSCRIBE_FIELDS = Object.values(FIELDS).join(',');

/* ── Types ──────────────────────────────────────────────────────────────── */

interface IBKRConid {
    conid: number;
    symbol: string;
    secType: string;
    exchange: string;
    currency: string;
}

interface IBKROptionParams {
    conid: number;
    expirations: string[];   // e.g. ["20250321", "20250418"]
    strikes: number[];
    tradingClass: string;
}

interface IBKRStrike {
    call: string;   // conid as string
    put: string;
}

interface IBKRMarketDataSnapshot {
    conid: number;
    '31'?: string;  // last
    '84'?: string;  // bid
    '85'?: string;  // ask
    '7308'?: string; // delta
    '7309'?: string; // gamma
    '7310'?: string; // theta
    '7311'?: string; // vega
    '7607'?: string; // iv
}

/* ── Main class ─────────────────────────────────────────────────────────── */

/**
 * IBKR Client Portal Web API market data provider.
 *
 * Works with either:
 *   - Local CP Gateway at https://localhost:5000  (user runs gateway locally)
 *   - Cloud endpoint at https://api.ibkr.com      (OAuth, future)
 *
 * Authentication: CP Gateway handles session via browser cookie.
 * This class keeps the session alive via /tickle heartbeat.
 */
export class IBKRMarketDataProvider implements IMarketDataProviderService {
    private readonly _baseUrl: string;
    private readonly _accountId: string;
    private readonly _rateLimiter = new RateLimiter(10, 1000);
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _connected = false;
    private _connectionPromise: Promise<void> | null = null;
    private _connectionResolve: (() => void) | null = null;

    // WebSocket
    private _ws: WebSocket | null = null;
    private _wsSubscribed = new Set<string>();         // conid strings
    private _symbolToConid = new Map<string, number>();  // streamerSymbol → conid
    private _conidToSymbol = new Map<number, string>();  // conid → streamerSymbol

    // Observable market data maps (same pattern as TastyMarketDataProvider)
    greeks: Record<string, IGreeksRawData> = {};
    quotes: Record<string, IQuoteRawData> = {};
    trades: Record<string, ITradeRawData> = {};

    constructor(mode: 'gateway' | 'cloud', gatewayUrl: string, accountId: string) {
        this._baseUrl = mode === 'cloud'
            ? 'https://api.ibkr.com'
            : gatewayUrl.replace(/\/+$/, '');
        this._accountId = accountId;

        makeObservable(this, {
            greeks: observable,
            quotes: observable,
            trades: observable,
        });
    }

    // ── Session ──────────────────────────────────────────────────────────────

    async start(): Promise<void> {
        this._connectionPromise = new Promise<void>(resolve => {
            this._connectionResolve = resolve;
        });

        try {
            const status = await this._fetch<{ authenticated: boolean; connected: boolean }>(
                '/v1/api/iserver/auth/status', { method: 'POST' }
            );

            if (!status.authenticated || !status.connected) {
                await this._fetch('/v1/api/iserver/reauthenticate', { method: 'POST' });
            }
            this._markConnected();
        } catch (err) {
            console.error('[IBKR] Failed to authenticate:', err);
            this._connectionResolve?.();
        }

        this._heartbeatTimer = setInterval(() => {
            void this._fetch('/v1/api/tickle', { method: 'POST' }).catch(() => {});
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

    // ── WebSocket streaming ──────────────────────────────────────────────────

    subscribe(symbols: string[]): void {
        this._connectWs();
        for (const sym of symbols) {
            const conid = this._symbolToConid.get(sym);
            if (!conid) { console.warn(`[IBKR] subscribe: no conid for ${sym}`); continue; }
            const key = String(conid);
            if (this._wsSubscribed.has(key)) continue;
            this._wsSubscribed.add(key);
            this._wsSend(`smd+${conid}+{"fields":["${SUBSCRIBE_FIELDS.split(',').join('","')}"]}`);
        }
    }

    unsubscribe(symbols: string[]): void {
        for (const sym of symbols) {
            const conid = this._symbolToConid.get(sym);
            if (!conid) continue;
            const key = String(conid);
            if (!this._wsSubscribed.has(key)) continue;
            this._wsSubscribed.delete(key);
            this._wsSend(`umd+${conid}+{}`);
        }
    }

    private _connectWs(): void {
        if (this._ws && this._ws.readyState <= WebSocket.OPEN) return;

        const wsUrl = this._baseUrl.replace(/^http/, 'ws') + '/v1/api/ws';
        this._ws = new WebSocket(wsUrl);

        this._ws.onopen = () => {
            console.log('[IBKR WS] Connected');
            // Re-subscribe after reconnect
            for (const conid of this._wsSubscribed) {
                this._wsSend(`smd+${conid}+{"fields":["${SUBSCRIBE_FIELDS.split(',').join('","')}"]}`);
            }
        };

        this._ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data as string) as IBKRMarketDataSnapshot;
                if (data.conid) this._handleWsSnapshot(data);
            } catch { /* non-JSON ping frames */ }
        };

        this._ws.onclose = () => {
            console.warn('[IBKR WS] Disconnected — reconnecting in 3s');
            setTimeout(() => this._connectWs(), WS_RECONNECT_DELAY_MS);
        };

        this._ws.onerror = (err) => console.error('[IBKR WS] Error:', err);
    }

    private _wsSend(msg: string): void {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(msg);
        }
    }

    private _handleWsSnapshot(data: IBKRMarketDataSnapshot): void {
        const symbol = this._conidToSymbol.get(data.conid);
        if (!symbol) return;

        const bid   = parseFloat(data['84'] ?? 'NaN');
        const ask   = parseFloat(data['85'] ?? 'NaN');
        const last  = parseFloat(data['31'] ?? 'NaN');
        const delta = parseFloat(data['7308'] ?? 'NaN');
        const gamma = parseFloat(data['7309'] ?? 'NaN');
        const theta = parseFloat(data['7310'] ?? 'NaN');
        const vega  = parseFloat(data['7311'] ?? 'NaN');
        const iv    = parseFloat(data['7607'] ?? 'NaN');

        runInAction(() => {
            if (!isNaN(bid) && !isNaN(ask)) {
                this.quotes[symbol] = { bidPrice: bid, askPrice: ask };
            }
            if (!isNaN(last)) {
                this.trades[symbol] = { price: last };
            }
            if (!isNaN(delta) || !isNaN(theta)) {
                const prev = this.greeks[symbol] ?? { delta: 0, theta: 0, gamma: 0, vega: 0, volatility: 0, rho: 0, time: 0 };
                this.greeks[symbol] = {
                    ...prev,
                    delta:      isNaN(delta) ? prev.delta      : delta,
                    theta:      isNaN(theta) ? prev.theta      : theta,
                    gamma:      isNaN(gamma) ? prev.gamma      : gamma,
                    vega:       isNaN(vega)  ? prev.vega       : vega,
                    volatility: isNaN(iv)    ? prev.volatility : iv / 100,
                };
            }
        });
    }

    // ── Market data getters (from cache) ─────────────────────────────────────

    getSymbolQuote(symbol: string): IQuoteRawData | undefined   { return this.quotes[symbol]; }
    getSymbolTrade(symbol: string): ITradeRawData | undefined   { return this.trades[symbol]; }
    getSymbolGreeks(symbol: string): IGreeksRawData | undefined { return this.greeks[symbol]; }

    // ── Options chain ────────────────────────────────────────────────────────

    async getOptionsChain(symbol: string): Promise<IOptionChainRawData[]> {
        // Step 1: get underlying conid
        const searchResults = await this._fetch<IBKRConid[]>(
            `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&secType=STK`
        );
        const underlying = searchResults.find(r => r.symbol === symbol && r.secType === 'STK');
        if (!underlying) return [];

        const undConid = underlying.conid;

        // Step 2: get available option params (expirations + strikes)
        const params = await this._fetch<IBKROptionParams>(
            `/v1/api/iserver/secdef/option/params?conid=${undConid}&secType=OPT&exchange=SMART`
        );

        if (!params?.expirations?.length) return [];

        // Step 3: for each expiration, get strikes + conids
        const expirations: IOptionsExpirationRawData[] = [];

        // Limit to first 8 expirations to stay within rate limits
        const expirationsToFetch = params.expirations.slice(0, 8);

        for (const expDate of expirationsToFetch) {
            try {
                // Format: YYYYMMDD → YYYY-MM-DD
                const formatted = `${expDate.slice(0, 4)}-${expDate.slice(4, 6)}-${expDate.slice(6, 8)}`;
                const now = new Date();
                const exp = new Date(formatted);
                const dte = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                // Get strikes for this expiration
                const strikeData = await this._fetch<{ call: string[]; put: string[] }>(
                    `/v1/api/iserver/secdef/strikes?conid=${undConid}&secType=OPT&month=${expDate.slice(0, 6)}&exchange=SMART`
                );

                if (!strikeData?.call?.length) continue;

                // Map strikes — IBKR returns conids as strings per strike
                const strikes: IOptionStrikeRawData[] = strikeData.call.map((callConid, i) => {
                    const putConid = strikeData.put[i] ?? callConid;
                    const strikePrice = params.strikes[i] ?? 0;

                    // Register in conid↔symbol maps for streaming
                    const callSym = `${symbol}_${formatted}_C_${strikePrice}`;
                    const putSym  = `${symbol}_${formatted}_P_${strikePrice}`;
                    const cConid  = parseInt(callConid);
                    const pConid  = parseInt(putConid);
                    this._symbolToConid.set(callSym, cConid);
                    this._symbolToConid.set(putSym,  pConid);
                    this._conidToSymbol.set(cConid, callSym);
                    this._conidToSymbol.set(pConid, putSym);

                    return {
                        strikePrice,
                        callId:            callSym,
                        putId:             putSym,
                        callStreamerSymbol: callSym,
                        putStreamerSymbol:  putSym,
                    };
                });

                expirations.push({
                    expirationDate:  formatted,
                    daysToExpiration: dte,
                    expirationType:  'Regular',
                    settlementType:  'Closing',
                    strikes,
                });
            } catch (err) {
                console.warn(`[IBKR] getOptionsChain: failed to fetch ${expDate}`, err);
            }
        }

        return [{ expirations }];
    }

    // ── Symbol search ────────────────────────────────────────────────────────

    async searchSymbol(query: string): Promise<ISearchSymbolItemRawData[]> {
        const results = await this._fetch<IBKRConid[]>(
            `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(query)}&secType=STK`
        );
        return (results ?? []).map(r => ({
            symbol:      r.symbol,
            description: `${r.symbol} (${r.exchange})`,
        }));
    }

    // ── Symbol info & metrics ────────────────────────────────────────────────

    async getSymbolInfo(symbol: string): Promise<ISymbolInfoRawData> {
        const results = await this._fetch<IBKRConid[]>(
            `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&secType=STK`
        );
        const match = results?.[0];
        return {
            description:  match ? `${match.symbol} — ${match.exchange}` : symbol,
            listedMarket: match?.exchange ?? 'SMART',
        };
    }

    async getSymbolMetrics(symbol: string): Promise<ISymbolMetricsRawData | null> {
        try {
            const conid = await this._resolveConid(symbol);
            if (!conid) return null;

            // Snapshot for IV and other metrics
            const snapshot = await this._fetch<IBKRMarketDataSnapshot[]>(
                `/v1/api/iserver/marketdata/snapshot?conids=${conid}&fields=${SUBSCRIBE_FIELDS}`
            );
            const data = snapshot?.[0];
            if (!data) return null;

            const iv = parseFloat(data['7607'] ?? '0') / 100;

            return {
                impliedVolatilityPercentile:  iv * 100,
                impliedVolatilityIndexRank:   iv * 100,
                impliedVolatilityIndex:       iv,
                liquidityRank:               50, // not available via Web API without extra subscription
                beta:                        1,
            };
        } catch {
            return null;
        }
    }

    // ── Watchlists ───────────────────────────────────────────────────────────

    async getUserWatchLists(): Promise<IWatchListRawData[]> {
        try {
            const lists = await this._fetch<Array<{ id: string; name: string; instruments?: Array<{ ST: string }> }>>(
                '/v1/api/iserver/watchlists'
            );
            return (lists ?? []).map(l => ({
                name:    l.name,
                entries: (l.instruments ?? []).map(i => i.ST).filter(Boolean),
            }));
        } catch {
            return [];
        }
    }

    async getPlatformWatchLists(): Promise<IWatchListRawData[]> {
        return [];  // IBKR doesn't have platform-level watchlists in Web API
    }

    // ── Account ──────────────────────────────────────────────────────────────

    async getAccounts(): Promise<IAccountRawData[]> {
        const accounts = await this._fetch<Array<{ accountId: string }>>('/v1/api/portfolio/accounts');
        return (accounts ?? []).map(a => ({ accountNumber: a.accountId }));
    }

    async getAccountBalances(accountNumber: string): Promise<IAccountBalancesRawData> {
        const summary = await this._fetch<Record<string, { amount: number }>>(
            `/v1/api/portfolio/${accountNumber}/summary`
        );
        return {
            netLiquidity:            summary['netliquidation']?.amount ?? 0,
            optionBuyingPower:       summary['optionbuyingpower']?.amount ?? summary['buyingpower']?.amount ?? 0,
            stockBuyingPower:        summary['buyingpower']?.amount ?? 0,
            cashBalance:             summary['totalcashvalue']?.amount ?? 0,
            pendingCash:             0,
            dayTradingBuyingPower:   summary['daytradesremaining']?.amount ?? 0,
            maintenanceRequirement:  summary['maintenancemarginreq']?.amount ?? 0,
        };
    }

    async getPositions(accountNumber: string, _underlyingSymbol?: string): Promise<IPositionRawData[]> {
        const positions = await this._fetch<Array<{
            conid: number;
            ticker: string;
            position: number;
            strike: number;
            putOrCall: string;
            expiry: string;
            avgCost: number;
            mktPrice: number;
            multiplier: number;
        }>>(`/v1/api/portfolio/${accountNumber}/positions/0`);

        return (positions ?? []).map(p => ({
            symbol:            String(p.conid),
            streamerSymbol:    String(p.conid),
            underlyingSymbol:  p.ticker ?? '',
            quantity:          Math.abs(p.position),
            quantityDirection: p.position > 0 ? 'Long' as const : 'Short' as const,
            instrumentType:    p.putOrCall ? 'Equity Option' : 'Equity',
            strikePrice:       p.strike ?? 0,
            optionType:        (p.putOrCall === 'P' ? 'P' : 'C') as 'C' | 'P',
            expirationDate:    p.expiry ? `${p.expiry.slice(0, 4)}-${p.expiry.slice(4, 6)}-${p.expiry.slice(6, 8)}` : '',
            averageOpenPrice:  p.avgCost ?? 0,
            closePrice:        p.mktPrice ?? 0,
            multiplier:        p.multiplier ?? 100,
        }));
    }

    // ── Orders ───────────────────────────────────────────────────────────────

    async getOrders(accountNumber: string, _queryParams?: Record<string, unknown>): Promise<IOrderRawData[]> {
        const response = await this._fetch<{ orders?: Array<{
            orderId: number;
            status: string;
            ticker: string;
            secType: string;
            lastExecutionTime_r?: number;
            orderDesc: string;
            side: string;
            totalSize: number;
            price: number;
        }> }>(`/v1/api/iserver/account/orders?accountId=${accountNumber}`);

        return (response.orders ?? []).map(o => ({
            id:                o.orderId,
            'received-at':     o.lastExecutionTime_r ? new Date(o.lastExecutionTime_r).toISOString() : '',
            status:            o.status,
            'underlying-symbol': o.ticker,
            legs: [{
                symbol:   o.ticker,
                action:   o.side,
                quantity: o.totalSize,
            }],
        }));
    }

    async sendOrder(accountNumber: string, order: IOrderRequest): Promise<void> {
        // Convert IOrderRequest to IBKR format
        // For iron condors: multi-leg order via /iserver/account/{id}/orders

        const legs = order.legs.map(leg => ({
            conid:    this._symbolToConid.get(leg.symbol) ?? parseInt(leg.symbol),
            orderType: order.orderType === 'Limit' ? 'LMT' : 'MKT',
            side:      leg.action.includes('Buy') ? 'BUY' : 'SELL',
            quantity:  leg.quantity,
            secType:   'OPT',
        }));

        await this._fetch(`/v1/api/iserver/account/${accountNumber}/orders`, {
            method: 'POST',
            body: JSON.stringify({
                orders: [{
                    conidex:     `${legs[0]?.conid ?? 0}@SMART`,
                    orderType:   order.orderType === 'Limit' ? 'LMT' : 'MKT',
                    price:       order.price,
                    side:        order.priceEffect === 'Credit' ? 'SELL' : 'BUY',
                    tif:         order.timeInForce === 'Day' ? 'DAY' : 'GTC',
                    quantity:    order.legs[0]?.quantity ?? 1,
                    legs,
                }],
            }),
        });
    }

    // ── Transactions ─────────────────────────────────────────────────────────

    async getTransactions(accountNumber: string, queryParams?: Record<string, unknown>): Promise<ITransactionRawData[]> {
        const startDate = (queryParams?.['start-date'] as string) ?? this._daysAgo(365);
        const endDate   = (queryParams?.['end-date'] as string)   ?? this._today();

        const response = await this._fetch<{ transactions?: Array<{
            id: number;
            type: string;
            tradeDate: string;
            settleDate: string;
            description: string;
            amount: number;
            proceeds: number;
            commission: number;
            conid: number;
            symbol: string;
            underlyingSymbol: string;
            quantity: number;
            price: number;
            strike: number;
            putOrCall: string;
            expiry: string;
            side: string;
        }> }>(
            `/v1/api/pa/transactions?acctIds=${accountNumber}&fromDate=${startDate}&toDate=${endDate}`
        );

        return (response.transactions ?? []).map(tx => ({
            id:                           tx.id,
            'transaction-type':           tx.type,
            'transaction-sub-type':       tx.side?.includes('Open') ? 'Open' : 'Close',
            'executed-at':                tx.tradeDate ?? tx.settleDate,
            action:                       tx.side ?? '',
            symbol:                       tx.symbol ?? '',
            'underlying-symbol':          tx.underlyingSymbol ?? '',
            quantity:                     String(tx.quantity ?? 0),
            price:                        String(tx.price ?? 0),
            value:                        String(tx.proceeds ?? 0),
            'net-value':                  String((tx.proceeds ?? 0) - Math.abs(tx.commission ?? 0)),
            'value-effect':               (tx.proceeds ?? 0) > 0 ? 'Credit' : 'Debit',
            'order-id':                   tx.id,
            'clearing-fees':              '0',
            'regulatory-fees':            '0',
            'proprietary-index-option-fees': '0',
            commission:                   String(Math.abs(tx.commission ?? 0)),
        }));
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private async _resolveConid(symbol: string): Promise<number | null> {
        try {
            const results = await this._fetch<IBKRConid[]>(
                `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&secType=STK`
            );
            return results?.[0]?.conid ?? null;
        } catch {
            return null;
        }
    }

    private _today(): string {
        return new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    private _daysAgo(days: number): string {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0].replace(/-/g, '');
    }

    private async _fetch<T>(path: string, init?: RequestInit): Promise<T> {
        return this._rateLimiter.execute(async () => {
            const resp = await fetch(`${this._baseUrl}${path}`, {
                ...init,
                credentials: 'include',  // needed for CP Gateway cookie auth
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

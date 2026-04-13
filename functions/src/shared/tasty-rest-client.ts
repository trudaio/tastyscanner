// Minimal TastyTrade REST client for Firebase Functions
// NO DxLink / WebSocket — snapshots only

import * as https from 'https';

const BASE_URL = 'api.tastyworks.com';

export interface TastyCredentials {
    clientSecret: string;
    refreshToken: string;
}

export interface IOptionContract {
    symbol: string;
    streamerSymbol: string;
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;     // YYYY-MM-DD
}

export interface IOptionQuote {
    symbol: string;
    bid: number;
    ask: number;
    mid: number;
    delta: number | null;
    theta: number | null;
    gamma: number | null;
    vega: number | null;
    iv: number | null;
}

export interface IRawPosition {
    underlyingSymbol: string;
    symbol: string;
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;
    quantity: number;
    quantityDirection: 'Long' | 'Short';
    averageOpenPrice: number;
    closePrice: number;
    multiplier: number;
}

export interface IRawTransaction {
    id: number;
    'order-id': number;
    symbol: string;
    'underlying-symbol': string;
    'transaction-type': string;
    'transaction-sub-type': string;
    action: string;
    quantity: string;
    price: string;
    'executed-at': string;
    'strike-price'?: string;
    'expiration-date'?: string;
    'call-or-put'?: string;
}

function request<T>(
    method: 'GET' | 'POST',
    path: string,
    token: string | null,
    body?: Record<string, unknown> | string
): Promise<T> {
    return new Promise((resolve, reject) => {
        const opts: https.RequestOptions = {
            hostname: BASE_URL,
            path,
            method,
            headers: {
                'User-Agent': 'tastyscanner-functions/1.0',
                'Accept': 'application/json',
                ...(token ? { Authorization: token } : {}),
                ...(body ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
            },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (c: string) => { data += c; });
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) {
                    reject(new Error(`TastyTrade ${method} ${path} failed: ${res.statusCode} — ${data.substring(0, 300)}`));
                    return;
                }
                try { resolve(JSON.parse(data) as T); }
                catch (e) { reject(new Error(`Bad JSON from ${path}: ${data.substring(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

/** Exchange refresh token for access token */
export async function getAccessToken(creds: TastyCredentials): Promise<string> {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_secret: creds.clientSecret,
    }).toString();

    const resp = await request<{ access_token: string }>('POST', '/oauth/token', null, body);
    return `Bearer ${resp.access_token}`;
}

/** List customer accounts */
export async function getAccounts(token: string): Promise<Array<{ 'account-number': string; nickname?: string }>> {
    const resp = await request<{ data: { items: Array<{ account: { 'account-number': string; nickname?: string } }> } }>(
        'GET', '/customers/me/accounts', token,
    );
    return resp.data.items.map((i) => i.account);
}

/** Fetch options chain nested format (expirations with strikes) */
export async function getOptionsChain(token: string, underlying: string): Promise<{
    items: Array<{
        expirations: Array<{
            'expiration-date': string;
            'days-to-expiration': number;
            strikes: Array<{
                'strike-price': string;
                call: string;
                'call-streamer-symbol': string;
                put: string;
                'put-streamer-symbol': string;
            }>;
        }>;
    }>;
}> {
    const encodedUnderlying = encodeURIComponent(underlying);
    return request('GET', `/option-chains/${encodedUnderlying}/nested`, token);
}

/** Get market data snapshot for option symbols. Batch of up to 100 symbols per call. */
export async function getMarketDataSnapshot(token: string, symbols: string[]): Promise<Map<string, IOptionQuote>> {
    const result = new Map<string, IOptionQuote>();
    // Batch in groups of 100
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += 100) {
        batches.push(symbols.slice(i, i + 100));
    }

    for (const batch of batches) {
        const params = new URLSearchParams();
        for (const s of batch) {
            params.append('equity-option', s);
        }
        try {
            const resp = await request<{
                data: {
                    items: Array<{
                        symbol: string;
                        bid?: string;
                        ask?: string;
                        mid?: string;
                        delta?: string;
                        theta?: string;
                        gamma?: string;
                        vega?: string;
                        'implied-volatility-index'?: string;
                    }>;
                };
            }>('GET', `/market-data/by-type?${params.toString()}`, token);

            for (const item of resp.data.items) {
                const bid = parseFloat(item.bid ?? '0');
                const ask = parseFloat(item.ask ?? '0');
                const mid = item.mid ? parseFloat(item.mid) : (bid + ask) / 2;
                result.set(item.symbol, {
                    symbol: item.symbol,
                    bid, ask, mid,
                    delta: item.delta ? parseFloat(item.delta) : null,
                    theta: item.theta ? parseFloat(item.theta) : null,
                    gamma: item.gamma ? parseFloat(item.gamma) : null,
                    vega: item.vega ? parseFloat(item.vega) : null,
                    iv: item['implied-volatility-index'] ? parseFloat(item['implied-volatility-index']) : null,
                });
            }
        } catch (e) {
            console.error('[tasty] snapshot batch failed:', e);
        }
    }
    return result;
}

/** Get current underlying price (for SPX index or regular tickers) */
export async function getUnderlyingPrice(token: string, symbol: string): Promise<number | null> {
    try {
        const params = new URLSearchParams();
        if (symbol === 'SPX' || symbol.startsWith('$')) {
            params.append('index', symbol);
        } else {
            params.append('equity', symbol);
        }
        const resp = await request<{
            data: { items: Array<{ symbol: string; bid?: string; ask?: string; mid?: string; 'last-trade-price'?: string }> };
        }>('GET', `/market-data/by-type?${params.toString()}`, token);
        const item = resp.data.items[0];
        if (!item) return null;
        const last = item['last-trade-price'] ? parseFloat(item['last-trade-price']) : 0;
        if (last > 0) return last;
        const bid = parseFloat(item.bid ?? '0');
        const ask = parseFloat(item.ask ?? '0');
        return (bid + ask) / 2 || null;
    } catch (e) {
        console.error('[tasty] underlying price failed:', e);
        return null;
    }
}

/** Get current open positions for an account */
export async function getPositions(token: string, accountNumber: string): Promise<IRawPosition[]> {
    const resp = await request<{
        data: {
            items: Array<{
                symbol: string;
                'streamer-symbol'?: string;
                'underlying-symbol': string;
                quantity: string;
                'quantity-direction': string;
                'instrument-type': string;
                'strike-price'?: string;
                'option-type'?: string;
                'expiration-date'?: string;
                'average-open-price'?: string;
                'close-price'?: string;
                multiplier?: string;
            }>;
        };
    }>('GET', `/accounts/${accountNumber}/positions`, token);

    return resp.data.items
        .filter((p) => (p['instrument-type'] || '').includes('Option'))
        .map((p) => ({
            symbol: p.symbol,
            underlyingSymbol: p['underlying-symbol'],
            strikePrice: parseFloat(p['strike-price'] ?? '0'),
            optionType: (p['option-type'] === 'C' ? 'C' : 'P') as 'C' | 'P',
            expirationDate: p['expiration-date'] ?? '',
            quantity: Math.abs(parseFloat(p.quantity)),
            quantityDirection: p['quantity-direction'] === 'Long' ? 'Long' : 'Short',
            averageOpenPrice: parseFloat(p['average-open-price'] ?? '0'),
            closePrice: parseFloat(p['close-price'] ?? '0'),
            multiplier: parseInt(p.multiplier ?? '100', 10),
        }));
}

export interface IAccountBalances {
    netLiquidatingValue: number;
    derivativeBuyingPower: number;
    derivativeBuyingPowerPercentage: number; // 0-100, percentage of net liq used by derivatives
    cashBalance: number;
    maintenanceRequirement: number;
}

/** Fetch account balances for BPE check */
export async function getAccountBalances(token: string, accountNumber: string): Promise<IAccountBalances | null> {
    try {
        const resp = await request<{
            data: {
                'net-liquidating-value': string;
                'derivative-buying-power': string;
                'cash-balance': string;
                'maintenance-requirement': string;
            };
        }>('GET', `/accounts/${accountNumber}/balances`, token);
        const d = resp.data;
        const netLiq = parseFloat(d['net-liquidating-value'] || '0');
        const dbp = parseFloat(d['derivative-buying-power'] || '0');
        const maint = parseFloat(d['maintenance-requirement'] || '0');
        // BPE used = 1 - (available derivative BP / net liq)
        // Fixed 2026-04-13: previous formula `maint / netLiq` was wrong — maintenance includes
        // stock positions and doesn't represent derivative BPE usage correctly.
        const dbpPct = netLiq > 0 ? (1 - dbp / netLiq) * 100 : 0;
        return {
            netLiquidatingValue: netLiq,
            derivativeBuyingPower: dbp,
            derivativeBuyingPowerPercentage: Math.round(dbpPct * 100) / 100,
            cashBalance: parseFloat(d['cash-balance'] || '0'),
            maintenanceRequirement: maint,
        };
    } catch (e) {
        console.error('[tasty] getAccountBalances failed:', e);
        return null;
    }
}

/** Fetch transactions for an account within a date range */
export async function getTransactions(
    token: string,
    accountNumber: string,
    opts: { startDate?: string; endDate?: string; types?: string[] } = {},
): Promise<IRawTransaction[]> {
    const params = new URLSearchParams();
    params.set('per-page', '250');
    if (opts.startDate) params.set('start-date', opts.startDate);
    if (opts.endDate) params.set('end-date', opts.endDate);
    if (opts.types) for (const t of opts.types) params.append('types[]', t);

    const all: IRawTransaction[] = [];
    let page = 1;
    while (page < 20) { // hard cap
        params.set('page-offset', String((page - 1) * 250));
        try {
            const resp = await request<{
                data: { items: IRawTransaction[] };
                pagination?: { total_items: number; total_pages: number; current_page: number };
            }>('GET', `/accounts/${accountNumber}/transactions?${params.toString()}`, token);
            all.push(...resp.data.items);
            if (!resp.pagination || resp.pagination.current_page >= resp.pagination.total_pages) break;
            page++;
        } catch (e) {
            console.error('[tasty] transactions page', page, 'failed:', e);
            break;
        }
    }
    return all;
}

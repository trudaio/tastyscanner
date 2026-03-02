import { Router, Request, Response } from 'express';
import { tastyClient, PositionData, TransactionData, OrderData } from '../client.js';

export const ironCondorsRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDTE(expirationDate: string): number {
    if (!expirationDate) return 0;
    const exp = new Date(expirationDate + 'T21:00:00Z');
    return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
}

function isIronCondor(legs: PositionData[]): boolean {
    if (legs.length !== 4) return false;
    const puts = legs.filter(l => l.optionType === 'P');
    const calls = legs.filter(l => l.optionType === 'C');
    if (puts.length !== 2 || calls.length !== 2) return false;
    const hasLongShortPut = puts.some(p => p.quantityDirection === 'Long') && puts.some(p => p.quantityDirection === 'Short');
    const hasLongShortCall = calls.some(c => c.quantityDirection === 'Long') && calls.some(c => c.quantityDirection === 'Short');
    return hasLongShortPut && hasLongShortCall;
}

interface ParsedOption {
    underlying: string;
    expirationDate: string;
    optionType: 'C' | 'P';
    strikePrice: number;
}

function parseOptionSymbol(symbol: string): ParsedOption | null {
    // TastyTrade format: SPY   260212P00580000
    const m = symbol.match(/^(\w+)\s*(\d{6})([CP])(\d+)$/);
    if (!m) return null;
    const [, und, dateStr, type, strikeStr] = m;
    return {
        underlying: und.trim(),
        expirationDate: `20${dateStr.substring(0, 2)}-${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}`,
        optionType: type as 'C' | 'P',
        strikePrice: parseFloat(strikeStr) / 1000,
    };
}

/** Find the open credit for a set of IC legs from transaction history */
function findOpenCredit(
    legs: PositionData[],
    orders: OrderData[]
): number | null {
    const underlying = legs[0].underlyingSymbol;
    const expDate = legs[0].expirationDate;
    const legSymbols = new Set(legs.map(l => l.symbol.trim()));

    // Look for an order with matching legs
    for (const order of orders) {
        if (order['underlying-symbol'] !== underlying) continue;
        if (order.legs.length !== 4) continue;

        const orderLegSymbols = new Set(order.legs.map(l => l.symbol.trim()));
        const match = [...legSymbols].every(s => orderLegSymbols.has(s));
        if (!match) continue;

        // Check same expiration by parsing a leg symbol
        const parsed = parseOptionSymbol(order.legs[0].symbol);
        if (parsed?.expirationDate !== expDate) continue;

        // Calculate credit from fills
        let credit = 0;
        for (const leg of order.legs) {
            const fills = leg.fills ?? [];
            if (fills.length === 0) continue;
            const fillPrice = parseFloat(fills[0]['fill-price']) * Math.abs(leg.quantity) * 100;
            if (leg.action.includes('Sell')) credit += fillPrice;
            else credit -= fillPrice;
        }
        if (credit > 0) return parseFloat(credit.toFixed(2));
    }
    return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/iron-condors
 * Returns all currently open Iron Condor positions with structure, DTE, current
 * market value, and credit received (fetched from order history).
 */
ironCondorsRouter.get('/iron-condors', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            // Fetch positions and YTD orders in parallel
            const now = new Date();
            const ytdStart = `${now.getFullYear()}-01-01`;

            const [positions, transactions] = await Promise.all([
                tastyClient.getPositions(),
                tastyClient.getAllTransactions(ytdStart),
            ]);

            // Reconstruct orders from transactions for credit lookup
            const orderMap = new Map<number, OrderData>();
            const tradeTx = (transactions as TransactionData[]).filter(tx =>
                tx['transaction-type'] === 'Trade'
            );
            for (const tx of tradeTx) {
                const orderId = tx['order-id'];
                if (!orderId) continue;
                if (!orderMap.has(orderId)) {
                    orderMap.set(orderId, {
                        id: orderId,
                        'received-at': tx['executed-at'],
                        'created-at': tx['executed-at'],
                        status: 'Filled',
                        'underlying-symbol': tx['underlying-symbol'],
                        legs: [],
                    });
                }
                orderMap.get(orderId)!.legs.push({
                    symbol: tx['symbol'],
                    action: tx['transaction-sub-type'] || tx['action'],
                    quantity: parseInt(tx['quantity']) || 1,
                    fills: [{ 'fill-price': tx['price'], 'filled-quantity': tx['quantity'] }],
                });
            }
            const openingOrders = Array.from(orderMap.values()).filter(o =>
                o.legs.some(l => l.action.includes('Open'))
            );

            // Subscribe to streamer for current quotes
            const streamerSymbols = positions.map(p => p.streamerSymbol);
            if (streamerSymbols.length > 0) {
                await tastyClient.subscribeAndWaitForGreeks(streamerSymbols, 5000);
            }

            // Group positions by underlying + expiration
            const groups = new Map<string, PositionData[]>();
            for (const pos of positions) {
                const key = `${pos.underlyingSymbol}::${pos.expirationDate}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(pos);
            }

            const ironCondors = [];
            for (const [, legs] of groups) {
                if (!isIronCondor(legs)) continue;

                const underlying = legs[0].underlyingSymbol;
                const expDate = legs[0].expirationDate;
                const dte = calcDTE(expDate);
                const qty = legs[0].quantity;

                const puts = legs.filter(l => l.optionType === 'P').sort((a, b) => a.strikePrice - b.strikePrice);
                const calls = legs.filter(l => l.optionType === 'C').sort((a, b) => a.strikePrice - b.strikePrice);

                // Long = protection leg (outermost), Short = sold leg (inner)
                const longPut = puts.find(p => p.quantityDirection === 'Long')!;
                const shortPut = puts.find(p => p.quantityDirection === 'Short')!;
                const shortCall = calls.find(c => c.quantityDirection === 'Short')!;
                const longCall = calls.find(c => c.quantityDirection === 'Long')!;

                const putWing = shortPut.strikePrice - longPut.strikePrice;
                const callWing = longCall.strikePrice - shortCall.strikePrice;
                const maxWing = Math.max(putWing, callWing);

                // Current market value from streamer mid prices
                let currentValue: number | null = null;
                let hasQuotes = false;
                let tempVal = 0;
                for (const leg of legs) {
                    const q = tastyClient.quotes[leg.streamerSymbol];
                    if (!q) continue;
                    hasQuotes = true;
                    const mid = (q.bidPrice + q.askPrice) / 2;
                    const dir = leg.quantityDirection === 'Short' ? -1 : 1;
                    tempVal += mid * dir * 100 * leg.quantity;
                }
                if (hasQuotes) currentValue = parseFloat(tempVal.toFixed(2));

                // Net delta from streamer greeks
                let netDelta: number | null = null;
                let tempDelta = 0;
                let greeksCount = 0;
                for (const leg of legs) {
                    const g = tastyClient.greeks[leg.streamerSymbol];
                    if (!g) continue;
                    const dir = leg.quantityDirection === 'Short' ? -1 : 1;
                    tempDelta += (g.delta ?? 0) * dir * 100 * leg.quantity;
                    greeksCount++;
                }
                if (greeksCount > 0) netDelta = parseFloat(tempDelta.toFixed(2));

                // Credit received from opening order
                const openCredit = findOpenCredit(legs, openingOrders);

                // Current P&L: positive currentValue means we'd debit to close (cost)
                // P&L = credit_received - current_cost_to_close
                const currentPL = openCredit !== null && currentValue !== null
                    ? parseFloat((openCredit - (-currentValue)).toFixed(2))
                    : null;

                // Max profit = credit received per contract × 100
                const maxProfit = openCredit !== null
                    ? parseFloat((openCredit * qty).toFixed(2))
                    : null;

                // Max loss = (widest wing - credit) × 100 per contract
                const maxLoss = openCredit !== null
                    ? parseFloat(((maxWing * 100 - openCredit) * qty).toFixed(2))
                    : null;

                ironCondors.push({
                    symbol: underlying,
                    expiration_date: expDate,
                    dte,
                    quantity: qty,
                    legs: [
                        { role: 'long_put', strike: longPut.strikePrice, streamer_symbol: longPut.streamerSymbol },
                        { role: 'short_put', strike: shortPut.strikePrice, streamer_symbol: shortPut.streamerSymbol },
                        { role: 'short_call', strike: shortCall.strikePrice, streamer_symbol: shortCall.streamerSymbol },
                        { role: 'long_call', strike: longCall.strikePrice, streamer_symbol: longCall.streamerSymbol },
                    ],
                    put_wing: parseFloat(putWing.toFixed(2)),
                    call_wing: parseFloat(callWing.toFixed(2)),
                    credit_received: openCredit,
                    current_market_value: currentValue,
                    current_pl: currentPL,
                    max_profit: maxProfit,
                    max_loss: maxLoss,
                    net_delta: netDelta,
                    // POP approximation: 1 - (wing_width / distance_between_short_strikes)
                    pop_estimate: shortPut.strikePrice > 0 && shortCall.strikePrice > 0
                        ? parseFloat(Math.max(0, Math.min(100,
                            (1 - maxWing / (shortCall.strikePrice - shortPut.strikePrice)) * 100
                        )).toFixed(1))
                        : null,
                });
            }

            res.json({
                account_number: tastyClient.accountNumber,
                open_iron_condors: ironCondors.length,
                iron_condors: ironCondors,
            });
        } catch (err) {
            console.error('[Route /iron-condors]', err);
            res.status(500).json({ error: 'Failed to fetch iron condors', details: String(err) });
        }
    })();
});

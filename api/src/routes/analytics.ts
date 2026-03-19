/**
 * Iron Condor Analytics — ported from IronCondorAnalyticsService (no MobX/Firebase)
 *
 * Logic mirrors src/services/iron-condor-analytics/iron-condor-analytics.service.ts
 */
import { Router, Request, Response } from 'express';
import { tastyClient, TransactionData, OrderData } from '../client.js';

export const analyticsRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedOption {
    underlying: string;
    expirationDate: string;
    optionType: 'C' | 'P';
    strikePrice: number;
}

interface IronCondorTrade {
    id: string;
    ticker: string;
    expirationDate: string;
    openDate: string;
    closeDate: string | null;
    status: 'open' | 'closed' | 'expired';
    putBuyStrike: number;
    putSellStrike: number;
    callSellStrike: number;
    callBuyStrike: number;
    openCredit: number;
    closeDebit: number;
    profit: number;
    isProfitable: boolean;
    quantity: number;
    openOrderIds: string[];
    closeOrderIds: string[];
}

// ─── Logic (ported from IronCondorAnalyticsService) ──────────────────────────

function parseOptionSymbol(symbol: string): ParsedOption | null {
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

function buildOrdersFromTransactions(transactions: TransactionData[]): OrderData[] {
    const orderMap = new Map<number, OrderData>();
    const tradeTx = transactions.filter(tx =>
        tx['transaction-type'] === 'Trade' ||
        ['Sell to Open', 'Buy to Open', 'Sell to Close', 'Buy to Close'].includes(tx['transaction-sub-type'])
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
    return Array.from(orderMap.values());
}

function isIronCondorOrder(order: OrderData): boolean {
    if (!order.legs || order.legs.length !== 4) return false;
    const parsed = order.legs.map(l => parseOptionSymbol(l.symbol)).filter(Boolean) as ParsedOption[];
    if (parsed.length !== 4) return false;
    const puts = parsed.filter(p => p.optionType === 'P');
    const calls = parsed.filter(p => p.optionType === 'C');
    if (puts.length !== 2 || calls.length !== 2) return false;
    const putActions = order.legs.filter(l => parseOptionSymbol(l.symbol)?.optionType === 'P').map(l => l.action);
    const callActions = order.legs.filter(l => parseOptionSymbol(l.symbol)?.optionType === 'C').map(l => l.action);
    const validPuts = putActions.some(a => a.includes('Buy')) && putActions.some(a => a.includes('Sell'));
    const validCalls = callActions.some(a => a.includes('Buy')) && callActions.some(a => a.includes('Sell'));
    return validPuts && validCalls;
}

function extractICDetails(order: OrderData, isOpening: boolean): Partial<IronCondorTrade> | null {
    const legs = order.legs
        .map(l => ({ ...l, parsed: parseOptionSymbol(l.symbol) }))
        .filter(l => l.parsed !== null);

    const puts = legs.filter(l => l.parsed!.optionType === 'P').sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);
    const calls = legs.filter(l => l.parsed!.optionType === 'C').sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);

    if (puts.length < 2 || calls.length < 2) return null;

    let totalPrice = 0;
    for (const leg of order.legs) {
        if (leg.fills && leg.fills.length > 0) {
            const fillPrice = parseFloat(leg.fills[0]['fill-price']) * Math.abs(leg.quantity) * 100;
            if (leg.action.includes('Buy')) totalPrice -= fillPrice;
            else totalPrice += fillPrice;
        }
    }

    const result: Partial<IronCondorTrade> = {
        ticker: puts[0].parsed!.underlying,
        expirationDate: puts[0].parsed!.expirationDate,
        putBuyStrike: puts[0].parsed!.strikePrice,
        putSellStrike: puts[1].parsed!.strikePrice,
        callSellStrike: calls[0].parsed!.strikePrice,
        callBuyStrike: calls[1].parsed!.strikePrice,
        quantity: Math.abs(puts[0].quantity),
    };

    if (isOpening) {
        result.openCredit = Math.abs(totalPrice);
        result.openDate = (order['received-at'] ?? order['created-at'] ?? '').split('T')[0];
    } else {
        result.closeDebit = Math.abs(totalPrice);
        result.closeDate = (order['received-at'] ?? order['created-at'] ?? '').split('T')[0];
    }
    return result;
}

function isCreditSpread(order: OrderData): { type: 'put' | 'call'; details: Record<string, unknown> } | null {
    if (!order.legs || order.legs.length !== 2) return null;
    const legs = order.legs.map(l => ({ ...l, parsed: parseOptionSymbol(l.symbol) })).filter(l => l.parsed);
    if (legs.length !== 2) return null;
    const types = legs.map(l => l.parsed!.optionType);
    if (types[0] !== types[1]) return null;
    const actions = legs.map(l => l.action);
    if (!actions.some(a => a.includes('Buy')) || !actions.some(a => a.includes('Sell'))) return null;

    legs.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);
    let price = 0;
    for (const leg of order.legs) {
        if (leg.fills?.length) {
            const fp = parseFloat(leg.fills[0]['fill-price']) * Math.abs(leg.quantity) * 100;
            if (leg.action.includes('Buy')) price -= fp; else price += fp;
        }
    }

    return {
        type: types[0] === 'P' ? 'put' : 'call',
        details: {
            ticker: legs[0].parsed!.underlying,
            expirationDate: legs[0].parsed!.expirationDate,
            lowStrike: legs[0].parsed!.strikePrice,
            highStrike: legs[1].parsed!.strikePrice,
            quantity: Math.abs(legs[0].quantity),
            price,
            date: (order['received-at'] ?? order['created-at'] ?? '').split('T')[0],
            isOpening: actions.some(a => a.includes('Open')),
            orderId: order.id,
        },
    };
}

function matchSpreadPairs(spreads: Array<{ type: 'put' | 'call'; details: Record<string, unknown> }>): IronCondorTrade[] {
    const trades: IronCondorTrade[] = [];
    const usedIds = new Set<string | number>();
    const grouped = new Map<string, typeof spreads>();

    for (const s of spreads) {
        const key = `${s.details['ticker']}-${s.details['expirationDate']}-${String(s.details['isOpening'])}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(s);
    }

    let id = 1000;
    for (const [, group] of grouped) {
        const puts = group.filter(s => s.type === 'put' && !usedIds.has(s.details['orderId'] as string | number));
        const calls = group.filter(s => s.type === 'call' && !usedIds.has(s.details['orderId'] as string | number));

        for (const ps of puts) {
            for (const cs of calls) {
                if (usedIds.has(ps.details['orderId'] as string | number) || usedIds.has(cs.details['orderId'] as string | number)) continue;
                const pDate = new Date(ps.details['date'] as string);
                const cDate = new Date(cs.details['date'] as string);
                const dayDiff = Math.abs(pDate.getTime() - cDate.getTime()) / 86_400_000;
                if (dayDiff > 1 || !ps.details['isOpening'] || !cs.details['isOpening']) continue;

                usedIds.add(ps.details['orderId'] as string | number);
                usedIds.add(cs.details['orderId'] as string | number);

                const expDate = ps.details['expirationDate'] as string;
                const openCredit = (ps.details['price'] as number) + (cs.details['price'] as number);
                const isExpired = new Date(expDate) < new Date();

                trades.push({
                    id: `IC-2L-${id++}`,
                    ticker: ps.details['ticker'] as string,
                    expirationDate: expDate,
                    openDate: ps.details['date'] as string,
                    closeDate: null,
                    status: isExpired ? 'expired' : 'open',
                    putBuyStrike: ps.details['lowStrike'] as number,
                    putSellStrike: ps.details['highStrike'] as number,
                    callSellStrike: cs.details['lowStrike'] as number,
                    callBuyStrike: cs.details['highStrike'] as number,
                    openCredit,
                    closeDebit: 0,
                    profit: isExpired ? openCredit : 0,
                    isProfitable: isExpired ? openCredit > 0 : false,
                    quantity: ps.details['quantity'] as number,
                    openOrderIds: [String(ps.details['orderId']), String(cs.details['orderId'])],
                    closeOrderIds: [],
                });
            }
        }
    }
    return trades;
}

async function fetchYTDTrades(): Promise<IronCondorTrade[]> {
    const now = new Date();
    const startDate = `${now.getFullYear()}-01-01`;
    const allTx = await tastyClient.getAllTransactions(startDate);

    const orders = buildOrdersFromTransactions(allTx);
    const icOrders = orders.filter(isIronCondorOrder);
    const spreadPairs = matchSpreadPairs(orders.map(o => isCreditSpread(o)).filter(Boolean) as Array<{ type: 'put' | 'call'; details: Record<string, unknown> }>);

    // Group IC orders by ticker+expiration+strikes
    const tradeGroups = new Map<string, OrderData[]>();
    for (const order of icOrders) {
        const d = extractICDetails(order, true);
        if (!d?.ticker || !d.expirationDate) continue;
        const key = `${d.ticker}-${d.expirationDate}-${d.putBuyStrike}-${d.putSellStrike}-${d.callSellStrike}-${d.callBuyStrike}`;
        if (!tradeGroups.has(key)) tradeGroups.set(key, []);
        tradeGroups.get(key)!.push(order);
    }

    const trades: IronCondorTrade[] = [];
    let tradeId = 1;

    for (const [, group] of tradeGroups) {
        group.sort((a, b) =>
            new Date(a['received-at'] ?? a['created-at'] ?? '').getTime() -
            new Date(b['received-at'] ?? b['created-at'] ?? '').getTime()
        );

        const openingOrders = group.filter(o => o.legs.some(l => l.action.includes('Open')));
        const closingOrders = group.filter(o => o.legs.some(l => l.action.includes('Close')));

        for (const openOrder of openingOrders) {
            const openDetails = extractICDetails(openOrder, true);
            if (!openDetails) continue;

            const closeOrder = closingOrders.find(co => {
                const cd = extractICDetails(co, false);
                return cd &&
                    cd.putBuyStrike === openDetails.putBuyStrike &&
                    cd.putSellStrike === openDetails.putSellStrike &&
                    cd.callSellStrike === openDetails.callSellStrike &&
                    cd.callBuyStrike === openDetails.callBuyStrike;
            });

            const closeDetails = closeOrder ? extractICDetails(closeOrder, false) : null;
            const expDate = new Date(openDetails.expirationDate!);
            const isExpired = !closeOrder && expDate < now;
            const openCredit = openDetails.openCredit ?? 0;
            const closeDebit = closeDetails?.closeDebit ?? 0;
            const profit = isExpired ? openCredit : openCredit - closeDebit;

            trades.push({
                id: `IC-${tradeId++}`,
                ticker: openDetails.ticker!,
                expirationDate: openDetails.expirationDate!,
                openDate: openDetails.openDate as string,
                closeDate: (closeDetails?.closeDate as string) ?? null,
                status: closeOrder ? 'closed' : (isExpired ? 'expired' : 'open'),
                putBuyStrike: openDetails.putBuyStrike!,
                putSellStrike: openDetails.putSellStrike!,
                callSellStrike: openDetails.callSellStrike!,
                callBuyStrike: openDetails.callBuyStrike!,
                openCredit,
                closeDebit,
                profit,
                isProfitable: profit > 0,
                quantity: openDetails.quantity!,
                openOrderIds: [String(openOrder.id)],
                closeOrderIds: closeOrder ? [String(closeOrder.id)] : [],
            });
        }
    }

    // Add spread pairs not already captured by 4-leg detection
    for (const pt of spreadPairs) {
        const dup = trades.some(t =>
            t.ticker === pt.ticker &&
            t.expirationDate === pt.expirationDate &&
            t.putBuyStrike === pt.putBuyStrike &&
            t.putSellStrike === pt.putSellStrike
        );
        if (!dup) trades.push(pt);
    }

    return trades;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/analytics/summary
 * Returns YTD Iron Condor performance: win rate, P&L, best/worst trade, breakdown by ticker/month.
 */
analyticsRouter.get('/analytics/summary', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const trades = await fetchYTDTrades();
            const closedTrades = trades.filter(t => t.status === 'closed' || t.status === 'expired');
            const openTrades = trades.filter(t => t.status === 'open');
            const profitable = closedTrades.filter(t => t.isProfitable);
            const losing = closedTrades.filter(t => !t.isProfitable);

            const realizedProfit = closedTrades.reduce((s, t) => s + t.profit, 0);
            const openMaxProfit = openTrades.reduce((s, t) => s + t.openCredit, 0);
            const totalProfit = realizedProfit + openMaxProfit;
            const totalWins = profitable.reduce((s, t) => s + t.profit, 0);
            const totalLosses = losing.reduce((s, t) => s + t.profit, 0);
            const profits = closedTrades.map(t => t.profit);

            // By ticker
            const byTicker: Record<string, {
                ticker: string;
                total_trades: number;
                profitable_trades: number;
                win_rate: number;
                total_profit: number;
            }> = {};
            for (const trade of trades) {
                const t = trade.ticker;
                if (!byTicker[t]) byTicker[t] = { ticker: t, total_trades: 0, profitable_trades: 0, win_rate: 0, total_profit: 0 };
                byTicker[t].total_trades++;
                const tradeProfit = trade.status === 'open' ? trade.openCredit : trade.profit;
                if (tradeProfit > 0) byTicker[t].profitable_trades++;
                byTicker[t].total_profit += tradeProfit;
                byTicker[t].win_rate = parseFloat(((byTicker[t].profitable_trades / byTicker[t].total_trades) * 100).toFixed(1));
            }

            // By month
            const byMonth: Record<string, {
                month: string;
                total_trades: number;
                profitable_trades: number;
                win_rate: number;
                total_profit: number;
            }> = {};
            for (const trade of trades) {
                const month = trade.openDate.substring(0, 7);
                if (!byMonth[month]) byMonth[month] = { month, total_trades: 0, profitable_trades: 0, win_rate: 0, total_profit: 0 };
                byMonth[month].total_trades++;
                const tradeProfit = trade.status === 'open' ? trade.openCredit : trade.profit;
                if (tradeProfit > 0) byMonth[month].profitable_trades++;
                byMonth[month].total_profit += tradeProfit;
                byMonth[month].win_rate = parseFloat(((byMonth[month].profitable_trades / byMonth[month].total_trades) * 100).toFixed(1));
            }

            res.json({
                account_number: tastyClient.accountNumber,
                year_to_date: {
                    total_trades: trades.length,
                    open_trades: openTrades.length,
                    closed_trades: closedTrades.length,
                    profitable_trades: profitable.length,
                    losing_trades: losing.length,
                    win_rate: parseFloat((closedTrades.length > 0 ? (profitable.length / closedTrades.length) * 100 : 0).toFixed(1)),
                    total_profit: parseFloat(totalProfit.toFixed(2)),
                    realized_profit: parseFloat(realizedProfit.toFixed(2)),
                    open_max_profit: parseFloat(openMaxProfit.toFixed(2)),
                    total_wins: parseFloat(totalWins.toFixed(2)),
                    total_losses: parseFloat(totalLosses.toFixed(2)),
                    average_profit: parseFloat((trades.length > 0 ? totalProfit / trades.length : 0).toFixed(2)),
                    largest_win: parseFloat((profits.length > 0 ? Math.max(...profits) : 0).toFixed(2)),
                    largest_loss: parseFloat((profits.length > 0 ? Math.min(...profits) : 0).toFixed(2)),
                },
                by_ticker: Object.values(byTicker).sort((a, b) => b.total_profit - a.total_profit),
                by_month: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
                trades: trades.map(t => ({
                    ...t,
                    profit: parseFloat(t.profit.toFixed(2)),
                    open_credit: parseFloat(t.openCredit.toFixed(2)),
                    close_debit: parseFloat(t.closeDebit.toFixed(2)),
                })),
            });
        } catch (err) {
            console.error('[Route /analytics/summary]', err);
            res.status(500).json({ error: 'Failed to fetch analytics', details: String(err) });
        }
    })();
});

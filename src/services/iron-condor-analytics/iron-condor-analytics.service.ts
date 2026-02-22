import { makeObservable, observable, runInAction } from "mobx";
import { ServiceBase } from "../service-base";
import { IServiceFactory } from "../service-factory.interface";
import {
    IIronCondorAnalyticsService,
    IIronCondorTrade,
    IIronCondorSummary,
    ITickerSummary,
    IMonthSummary,
    IRawOrder,
    IRawTransaction
} from "./iron-condor-analytics.interface";
import { IOrderRawData, ITransactionRawData } from "../market-data-provider/market-data-provider.service.interface";

interface ParsedOptionSymbol {
    underlying: string;
    expirationDate: string;
    optionType: 'C' | 'P';
    strikePrice: number;
}

export class IronCondorAnalyticsService extends ServiceBase implements IIronCondorAnalyticsService {
    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            isLoading: observable.ref,
            lastFetchDate: observable.ref,
            trades: observable.ref
        });
    }

    isLoading: boolean = false;
    lastFetchDate: Date | null = null;
    trades: IIronCondorTrade[] = [];

    private parseOptionSymbol(symbol: string): ParsedOptionSymbol | null {
        // TastyTrade option symbol format: UNDERLYING  YYMMDDCP00STRIKE
        // Example: SPY   260212P00580000 -> SPY, 2026-02-12, P, 580
        const match = symbol.match(/^(\w+)\s*(\d{6})([CP])(\d+)$/);
        if (!match) {
            console.log(`[IC Analytics] Could not parse symbol: ${symbol}`);
            return null;
        }

        const [, underlying, dateStr, optionType, strikeStr] = match;
        const year = '20' + dateStr.substring(0, 2);
        const month = dateStr.substring(2, 4);
        const day = dateStr.substring(4, 6);

        return {
            underlying: underlying.trim(),
            expirationDate: `${year}-${month}-${day}`,
            optionType: optionType as 'C' | 'P',
            strikePrice: parseFloat(strikeStr) / 1000
        };
    }

    private isIronCondorOrder(order: IOrderRawData): boolean {
        // An iron condor has exactly 4 legs:
        // 1. BTO Put (lower strike) - protection
        // 2. STO Put (higher strike) - sell put spread
        // 3. STO Call (lower strike) - sell call spread
        // 4. BTO Call (higher strike) - protection

        if (!order.legs || order.legs.length !== 4) {
            return false;
        }

        const legs = order.legs.map(leg => {
            const parsed = this.parseOptionSymbol(leg.symbol);
            return {
                ...leg,
                parsed,
                action: leg.action
            };
        }).filter(leg => leg.parsed !== null);

        if (legs.length !== 4) {
            console.log(`[IC Analytics] Order ${order.id}: Only ${legs.length} legs parsed successfully`);
            return false;
        }

        // Check for 2 puts and 2 calls
        const puts = legs.filter(l => l.parsed!.optionType === 'P');
        const calls = legs.filter(l => l.parsed!.optionType === 'C');

        if (puts.length !== 2 || calls.length !== 2) {
            console.log(`[IC Analytics] Order ${order.id}: Not an iron condor - puts: ${puts.length}, calls: ${calls.length}`);
            return false;
        }

        // Check for correct actions (1 buy, 1 sell for each)
        const putActions = puts.map(p => p.action);
        const callActions = calls.map(c => c.action);

        const hasButAndSellPut = putActions.includes('Buy to Open') && putActions.includes('Sell to Open') ||
                                  putActions.includes('Buy to Close') && putActions.includes('Sell to Close');
        const hasBuyAndSellCall = callActions.includes('Buy to Open') && callActions.includes('Sell to Open') ||
                                   callActions.includes('Buy to Close') && callActions.includes('Sell to Close');

        if (!hasButAndSellPut || !hasBuyAndSellCall) {
            console.log(`[IC Analytics] Order ${order.id}: Wrong actions - putActions: ${putActions.join(', ')}, callActions: ${callActions.join(', ')}`);
            return false;
        }

        console.log(`[IC Analytics] Order ${order.id}: IS an iron condor!`);
        return true;
    }

    private isCreditSpread(order: IOrderRawData): { type: 'put' | 'call', details: any } | null {
        // Credit spread has 2 legs: 1 buy, 1 sell, same option type
        if (!order.legs || order.legs.length !== 2) return null;

        const legs = order.legs.map(leg => ({
            ...leg,
            parsed: this.parseOptionSymbol(leg.symbol)
        })).filter(leg => leg.parsed !== null);

        if (legs.length !== 2) return null;

        // Both legs must be same option type (both puts or both calls)
        const optionTypes = legs.map(l => l.parsed!.optionType);
        if (optionTypes[0] !== optionTypes[1]) return null;

        // One buy, one sell
        const actions = legs.map(l => l.action);
        const hasBuy = actions.some(a => a.includes('Buy'));
        const hasSell = actions.some(a => a.includes('Sell'));
        if (!hasBuy || !hasSell) return null;

        legs.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);

        // Calculate price
        let totalPrice = 0;
        for (const leg of order.legs) {
            if (leg.fills && leg.fills.length > 0) {
                const fillPrice = parseFloat(leg.fills[0]['fill-price']) * leg.quantity * 100;
                if (leg.action.includes('Buy')) {
                    totalPrice -= fillPrice;
                } else {
                    totalPrice += fillPrice;
                }
            }
        }

        const spreadType = optionTypes[0] === 'P' ? 'put' : 'call';
        return {
            type: spreadType as 'put' | 'call',
            details: {
                ticker: legs[0].parsed!.underlying,
                expirationDate: legs[0].parsed!.expirationDate,
                lowStrike: legs[0].parsed!.strikePrice,
                highStrike: legs[1].parsed!.strikePrice,
                quantity: Math.abs(legs[0].quantity),
                price: totalPrice,
                date: order['received-at']?.split('T')[0] || order['created-at']?.split('T')[0],
                isOpening: actions.some(a => a.includes('Open')),
                orderId: order.id
            }
        };
    }

    private findCreditSpreads(orders: IOrderRawData[]): Array<{ type: 'put' | 'call', details: any }> {
        const spreads: Array<{ type: 'put' | 'call', details: any }> = [];
        for (const order of orders) {
            const spread = this.isCreditSpread(order);
            if (spread) {
                spreads.push(spread);
            }
        }
        return spreads;
    }

    private buildOrdersFromTransactions(transactions: ITransactionRawData[]): IOrderRawData[] {
        // Group transactions by order-id to reconstruct orders
        const orderMap = new Map<number, IOrderRawData>();

        // Filter for trade transactions (not fees, dividends, etc.)
        const tradeTransactions = transactions.filter(tx =>
            tx['transaction-type'] === 'Trade' || tx['transaction-sub-type'] === 'Sell to Open' ||
            tx['transaction-sub-type'] === 'Buy to Open' || tx['transaction-sub-type'] === 'Sell to Close' ||
            tx['transaction-sub-type'] === 'Buy to Close'
        );

        console.log(`[IC Analytics] Trade transactions: ${tradeTransactions.length}`);

        for (const tx of tradeTransactions) {
            const orderId = tx['order-id'];
            if (!orderId) continue;

            if (!orderMap.has(orderId)) {
                orderMap.set(orderId, {
                    id: orderId,
                    'received-at': tx['executed-at'],
                    'created-at': tx['executed-at'],
                    status: 'Filled',
                    'underlying-symbol': tx['underlying-symbol'],
                    legs: []
                });
            }

            const order = orderMap.get(orderId)!;
            order.legs.push({
                symbol: tx.symbol,
                action: tx['transaction-sub-type'] || tx.action,
                quantity: parseInt(tx.quantity) || 1,
                fills: [{
                    'fill-price': tx.price,
                    'filled-quantity': tx.quantity
                }]
            });
        }

        const orders = Array.from(orderMap.values());
        console.log(`[IC Analytics] Reconstructed ${orders.length} orders from transactions`);

        // Log sample order
        if (orders.length > 0) {
            console.log(`[IC Analytics] Sample reconstructed order:`, JSON.stringify(orders[0], null, 2));
        }

        return orders;
    }

    private matchCreditSpreadPairs(spreads: Array<{ type: 'put' | 'call', details: any }>): IIronCondorTrade[] {
        const trades: IIronCondorTrade[] = [];
        const usedSpreadIds = new Set<string | number>();

        // Group by ticker + expiration + isOpening
        const grouped = new Map<string, Array<{ type: 'put' | 'call', details: any }>>();
        for (const spread of spreads) {
            const key = `${spread.details.ticker}-${spread.details.expirationDate}-${spread.details.isOpening}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(spread);
        }

        // For each group, try to pair a put spread with a call spread
        let tradeId = 1000; // Start high to avoid conflicts with 4-leg detection
        for (const [key, groupSpreads] of grouped) {
            const putSpreads = groupSpreads.filter(s => s.type === 'put' && !usedSpreadIds.has(s.details.orderId));
            const callSpreads = groupSpreads.filter(s => s.type === 'call' && !usedSpreadIds.has(s.details.orderId));

            // Match put spreads with call spreads (created on same day or within 1 day)
            for (const putSpread of putSpreads) {
                for (const callSpread of callSpreads) {
                    if (usedSpreadIds.has(putSpread.details.orderId) || usedSpreadIds.has(callSpread.details.orderId)) continue;

                    // Check if spreads are from same day (or within 1 day)
                    const putDate = new Date(putSpread.details.date);
                    const callDate = new Date(callSpread.details.date);
                    const dayDiff = Math.abs(putDate.getTime() - callDate.getTime()) / (1000 * 60 * 60 * 24);

                    if (dayDiff <= 1 && putSpread.details.isOpening && callSpread.details.isOpening) {
                        // This is an opening iron condor
                        usedSpreadIds.add(putSpread.details.orderId);
                        usedSpreadIds.add(callSpread.details.orderId);

                        const now = new Date();
                        const expDate = new Date(putSpread.details.expirationDate);
                        const openCredit = putSpread.details.price + callSpread.details.price;

                        trades.push({
                            id: `IC-2L-${tradeId++}`,
                            ticker: putSpread.details.ticker,
                            expirationDate: putSpread.details.expirationDate,
                            openDate: putSpread.details.date,
                            closeDate: null,
                            status: expDate < now ? 'expired' : 'open',
                            putBuyStrike: putSpread.details.lowStrike,
                            putSellStrike: putSpread.details.highStrike,
                            callSellStrike: callSpread.details.lowStrike,
                            callBuyStrike: callSpread.details.highStrike,
                            openCredit,
                            closeDebit: 0,
                            profit: expDate < now ? openCredit : 0,
                            isProfitable: expDate < now ? openCredit > 0 : false,
                            quantity: putSpread.details.quantity,
                            openOrderIds: [String(putSpread.details.orderId), String(callSpread.details.orderId)],
                            closeOrderIds: []
                        });
                    }
                }
            }
        }

        return trades;
    }

    private extractIronCondorDetails(order: IOrderRawData, isOpening: boolean): Partial<IIronCondorTrade> | null {
        const legs = order.legs.map(leg => ({
            ...leg,
            parsed: this.parseOptionSymbol(leg.symbol)
        })).filter(leg => leg.parsed !== null);

        const puts = legs.filter(l => l.parsed!.optionType === 'P');
        const calls = legs.filter(l => l.parsed!.optionType === 'C');

        // Sort by strike price
        puts.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);
        calls.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);

        const putBuy = puts[0];  // Lower strike put (BTO)
        const putSell = puts[1]; // Higher strike put (STO)
        const callSell = calls[0]; // Lower strike call (STO)
        const callBuy = calls[1];  // Higher strike call (BTO)

        // Calculate total price
        let totalPrice = 0;
        for (const leg of order.legs) {
            if (leg.fills && leg.fills.length > 0) {
                const fillPrice = parseFloat(leg.fills[0]['fill-price']) * leg.quantity * 100;
                if (leg.action.includes('Buy')) {
                    totalPrice -= fillPrice;
                } else {
                    totalPrice += fillPrice;
                }
            }
        }

        return {
            ticker: putBuy.parsed!.underlying,
            expirationDate: putBuy.parsed!.expirationDate,
            putBuyStrike: putBuy.parsed!.strikePrice,
            putSellStrike: putSell.parsed!.strikePrice,
            callSellStrike: callSell.parsed!.strikePrice,
            callBuyStrike: callBuy.parsed!.strikePrice,
            quantity: Math.abs(putBuy.quantity),
            [isOpening ? 'openCredit' : 'closeDebit']: Math.abs(totalPrice),
            [isOpening ? 'openDate' : 'closeDate']: order['received-at']?.split('T')[0] || order['created-at']?.split('T')[0]
        };
    }

    async fetchYTDTrades(): Promise<IIronCondorTrade[]> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) {
            console.error('[IC Analytics] No account selected');
            return [];
        }

        runInAction(() => {
            this.isLoading = true;
        });

        try {
            // Get start of current year
            const now = new Date();
            const year = now.getFullYear();
            const startDate = `${year}-01-01`;

            console.log(`[IC Analytics] Fetching transactions for account ${account.accountNumber} since ${startDate}`);

            // Use transactions API which has better date filtering support
            const allTransactions: ITransactionRawData[] = [];
            let hasMore = true;
            let pageOffset = 0;
            const pageSize = 250;

            while (hasMore) {
                try {
                    const transactions = await this.services.marketDataProvider.getTransactions(
                        account.accountNumber,
                        {
                            'start-date': startDate,
                            'per-page': pageSize,
                            'page-offset': pageOffset
                        }
                    );

                    console.log(`[IC Analytics] Page ${pageOffset}: fetched ${transactions?.length || 0} transactions`);

                    if (Array.isArray(transactions) && transactions.length > 0) {
                        allTransactions.push(...transactions);
                        pageOffset += transactions.length;
                        hasMore = transactions.length === pageSize;
                    } else {
                        hasMore = false;
                    }
                } catch (pageError) {
                    console.error(`[IC Analytics] Error fetching page ${pageOffset}:`, pageError);
                    hasMore = false;
                }
            }

            console.log(`[IC Analytics] Total transactions: ${allTransactions.length}`);

            // Log sample transaction for debugging
            if (allTransactions.length > 0) {
                console.log(`[IC Analytics] Sample transaction:`, JSON.stringify(allTransactions[0], null, 2));
                console.log(`[IC Analytics] Transaction types found:`, [...new Set(allTransactions.map(t => t['transaction-type']))].join(', '));
            }

            // Build orders from transactions (group by order-id)
            const ytdOrders = this.buildOrdersFromTransactions(allTransactions);
            console.log(`[IC Analytics] Built ${ytdOrders.length} orders from transactions`);

            // All orders from transactions are already filled
            const filledOrders = ytdOrders;
            console.log(`[IC Analytics] Filled orders: ${filledOrders.length}`);

            // Group orders by underlying symbol and expiration to match opening/closing trades
            const ironCondorOrders = filledOrders.filter(order => this.isIronCondorOrder(order));
            console.log(`[IC Analytics] Found ${ironCondorOrders.length} iron condor orders (4-leg)`);

            // Also look for iron condors entered as pairs of credit spreads
            const creditSpreads = this.findCreditSpreads(filledOrders);
            console.log(`[IC Analytics] Found ${creditSpreads.length} credit spread orders`);

            // Group credit spreads by ticker + expiration to find iron condor pairs
            const spreadPairs = this.matchCreditSpreadPairs(creditSpreads);
            console.log(`[IC Analytics] Found ${spreadPairs.length} iron condors from spread pairs`);

            // Group by ticker + expiration
            const tradeGroups = new Map<string, IOrderRawData[]>();

            for (const order of ironCondorOrders) {
                const details = this.extractIronCondorDetails(order, true);
                if (details && details.ticker && details.expirationDate) {
                    const key = `${details.ticker}-${details.expirationDate}-${details.putBuyStrike}-${details.putSellStrike}-${details.callSellStrike}-${details.callBuyStrike}`;
                    if (!tradeGroups.has(key)) {
                        tradeGroups.set(key, []);
                    }
                    tradeGroups.get(key)!.push(order);
                }
            }

            // Process trade groups into IronCondorTrade objects
            const trades: IIronCondorTrade[] = [];
            let tradeId = 1;

            for (const [key, orders] of tradeGroups) {
                // Sort orders by date
                orders.sort((a, b) =>
                    new Date(a['received-at'] || a['created-at'] || '').getTime() -
                    new Date(b['received-at'] || b['created-at'] || '').getTime()
                );

                // First order with "Open" action is opening, subsequent with "Close" is closing
                const openingOrders = orders.filter(o =>
                    o.legs.some(l => l.action.includes('Open'))
                );
                const closingOrders = orders.filter(o =>
                    o.legs.some(l => l.action.includes('Close'))
                );

                for (const openOrder of openingOrders) {
                    const openDetails = this.extractIronCondorDetails(openOrder, true);
                    if (!openDetails) continue;

                    // Find matching closing order (if any)
                    const closeOrder = closingOrders.find(co => {
                        const closeDetails = this.extractIronCondorDetails(co, false);
                        return closeDetails &&
                               closeDetails.putBuyStrike === openDetails.putBuyStrike &&
                               closeDetails.putSellStrike === openDetails.putSellStrike &&
                               closeDetails.callSellStrike === openDetails.callSellStrike &&
                               closeDetails.callBuyStrike === openDetails.callBuyStrike;
                    });

                    const closeDetails = closeOrder ? this.extractIronCondorDetails(closeOrder, false) : null;

                    // Determine if expired (expiration date has passed and no close order)
                    const expDate = new Date(openDetails.expirationDate!);
                    const isExpired = !closeOrder && expDate < now;

                    const openCredit = openDetails.openCredit || 0;
                    const closeDebit = closeDetails?.closeDebit || 0;
                    const profit = openCredit - closeDebit;

                    const trade: IIronCondorTrade = {
                        id: `IC-${tradeId++}`,
                        ticker: openDetails.ticker!,
                        expirationDate: openDetails.expirationDate!,
                        openDate: openDetails.openDate as string,
                        closeDate: closeDetails?.closeDate as string || null,
                        status: closeOrder ? 'closed' : (isExpired ? 'expired' : 'open'),
                        putBuyStrike: openDetails.putBuyStrike!,
                        putSellStrike: openDetails.putSellStrike!,
                        callSellStrike: openDetails.callSellStrike!,
                        callBuyStrike: openDetails.callBuyStrike!,
                        openCredit,
                        closeDebit,
                        profit: isExpired ? openCredit : profit,
                        isProfitable: isExpired ? openCredit > 0 : profit > 0,
                        quantity: openDetails.quantity!,
                        openOrderIds: [String(openOrder.id)],
                        closeOrderIds: closeOrder ? [String(closeOrder.id)] : []
                    };

                    trades.push(trade);
                    console.log(`[IC Analytics] Added trade (4-leg): ${trade.ticker} ${trade.expirationDate} - status: ${trade.status}, profit: $${trade.profit}`);
                }
            }

            // Add iron condors from spread pairs
            for (const pairTrade of spreadPairs) {
                // Check if this trade isn't already captured by 4-leg detection
                const isDuplicate = trades.some(t =>
                    t.ticker === pairTrade.ticker &&
                    t.expirationDate === pairTrade.expirationDate &&
                    t.putBuyStrike === pairTrade.putBuyStrike &&
                    t.putSellStrike === pairTrade.putSellStrike
                );
                if (!isDuplicate) {
                    trades.push(pairTrade);
                    console.log(`[IC Analytics] Added trade (2-leg pair): ${pairTrade.ticker} ${pairTrade.expirationDate} - status: ${pairTrade.status}, profit: $${pairTrade.profit}`);
                }
            }

            console.log(`[IC Analytics] Total trades found: ${trades.length}`);

            runInAction(() => {
                this.trades = trades;
                this.lastFetchDate = new Date();
            });

            return trades;

        } catch (error) {
            console.error('Error fetching YTD trades:', error);
            return [];
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async getSummary(): Promise<IIronCondorSummary> {
        if (this.trades.length === 0) {
            await this.fetchYTDTrades();
        }

        const trades = this.trades;
        const closedTrades = trades.filter(t => t.status === 'closed' || t.status === 'expired');
        const openTrades = trades.filter(t => t.status === 'open');
        const profitableTrades = closedTrades.filter(t => t.isProfitable);
        const losingTrades = closedTrades.filter(t => !t.isProfitable);

        // Calculate realized P&L from closed trades
        const realizedProfit = closedTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalWins = profitableTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = losingTrades.reduce((sum, t) => sum + t.profit, 0);

        // Calculate potential max profit from open trades (if held to expiration)
        const openMaxProfit = openTrades.reduce((sum, t) => sum + t.openCredit, 0);

        // Total P&L = realized + potential max profit from open positions
        const totalProfit = realizedProfit + openMaxProfit;

        const profits = closedTrades.map(t => t.profit);
        const largestWin = profits.length > 0 ? Math.max(...profits) : 0;
        const largestLoss = profits.length > 0 ? Math.min(...profits) : 0;

        // Group by ticker - include ALL trades (open and closed)
        const byTicker = new Map<string, ITickerSummary>();
        for (const trade of trades) {
            if (!byTicker.has(trade.ticker)) {
                byTicker.set(trade.ticker, {
                    ticker: trade.ticker,
                    totalTrades: 0,
                    profitableTrades: 0,
                    winRate: 0,
                    totalProfit: 0
                });
            }
            const summary = byTicker.get(trade.ticker)!;
            summary.totalTrades++;
            // For open trades, use openCredit as potential profit
            const tradeProfit = trade.status === 'open' ? trade.openCredit : trade.profit;
            if (tradeProfit > 0) summary.profitableTrades++;
            summary.totalProfit += tradeProfit;
            summary.winRate = (summary.profitableTrades / summary.totalTrades) * 100;
        }

        // Group by month - include ALL trades (open and closed)
        const byMonth = new Map<string, IMonthSummary>();
        for (const trade of trades) {
            const month = trade.openDate.substring(0, 7); // YYYY-MM
            if (!byMonth.has(month)) {
                byMonth.set(month, {
                    month,
                    totalTrades: 0,
                    profitableTrades: 0,
                    winRate: 0,
                    totalProfit: 0
                });
            }
            const summary = byMonth.get(month)!;
            summary.totalTrades++;
            // For open trades, use openCredit as potential profit
            const tradeProfit = trade.status === 'open' ? trade.openCredit : trade.profit;
            if (tradeProfit > 0) summary.profitableTrades++;
            summary.totalProfit += tradeProfit;
            summary.winRate = (summary.profitableTrades / summary.totalTrades) * 100;
        }

        return {
            yearToDate: {
                totalTrades: trades.length,
                openTrades: openTrades.length,
                closedTrades: closedTrades.length,
                profitableTrades: profitableTrades.length,
                losingTrades: losingTrades.length,
                winRate: closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0,
                totalProfit,
                totalWins,
                totalLosses,
                averageProfit: trades.length > 0 ? totalProfit / trades.length : 0,
                largestWin,
                largestLoss
            },
            byTicker,
            byMonth,
            trades
        };
    }

    async exportToFile(filename: string): Promise<void> {
        const summary = await this.getSummary();

        const data = {
            exportDate: new Date().toISOString(),
            summary: {
                ...summary.yearToDate
            },
            byTicker: Object.fromEntries(summary.byTicker),
            byMonth: Object.fromEntries(summary.byMonth),
            trades: summary.trades
        };

        // Store in localStorage for now (can be enhanced to use file system or SQL)
        localStorage.setItem(`iron-condor-analytics-${filename}`, JSON.stringify(data, null, 2));

        console.log(`Exported iron condor analytics to: iron-condor-analytics-${filename}`);
        console.log(JSON.stringify(data, null, 2));
    }
}

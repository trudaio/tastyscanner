import { makeObservable, observable, runInAction } from "mobx";
import { ServiceBase } from "../service-base";
import { IServiceFactory } from "../service-factory.interface";
import {
    IIronCondorAnalyticsService,
    IIronCondorTrade,
    IIronCondorSummary,
    IGuvidHistorySummary,
    IDailyICPL,
    ITickerSummary,
    IMonthSummary,
} from "./iron-condor-analytics.interface";
import { IOrderRawData, ITransactionRawData, IPositionRawData } from "../market-data-provider/market-data-provider.service.interface";
import { parseTastyTradeSymbol, normalizeUnderlying, IParsedOptionSymbol } from "../../utils/symbol-normalizer";

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

    private parseOptionSymbol(symbol: string): IParsedOptionSymbol | null {
        const result = parseTastyTradeSymbol(symbol);
        if (!result) {
            console.log(`[IC Analytics] Could not parse symbol: ${symbol}`);
        }
        return result;
    }

    /**
     * Extract ALL credit spread patterns from a single order, regardless of leg count.
     * This handles:
     *   - 2-leg orders (simple credit spread)
     *   - 4-leg orders (iron condor = put spread + call spread, OR roll = close spread + open spread)
     *   - 8-leg orders (double roll, e.g. GLD call spread roll for qty=2)
     *
     * Algorithm: group legs by {optionType, expirationDate, direction (Open vs Close)},
     * then within each group pair Buy + Sell legs into spreads.
     */
    private extractSpreadsFromOrder(order: IOrderRawData): Array<{ type: 'put' | 'call', details: any }> {
        if (!order.legs || order.legs.length < 2) return [];

        const parsedLegs = order.legs.map(leg => ({
            ...leg,
            parsed: this.parseOptionSymbol(leg.symbol)
        })).filter(leg => leg.parsed !== null);

        if (parsedLegs.length < 2) return [];

        // Group legs by {optionType, expirationDate, direction}
        const groups = new Map<string, typeof parsedLegs>();
        for (const leg of parsedLegs) {
            const isOpening = leg.action.includes('Open');
            const key = `${leg.parsed!.optionType}-${leg.parsed!.expirationDate}-${isOpening ? 'open' : 'close'}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(leg);
        }

        const spreads: Array<{ type: 'put' | 'call', details: any }> = [];
        let spreadIdx = 0;

        for (const [, groupLegs] of groups) {
            if (groupLegs.length < 2) continue;

            // Within each group, pair Buy + Sell legs by strike proximity
            const buyLegs = groupLegs.filter(l => l.action.includes('Buy'));
            const sellLegs = groupLegs.filter(l => l.action.includes('Sell'));

            if (buyLegs.length === 0 || sellLegs.length === 0) continue;

            // Sort both arrays by strike
            buyLegs.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);
            sellLegs.sort((a, b) => a.parsed!.strikePrice - b.parsed!.strikePrice);

            // Pair them: for each sell leg, find the closest unpaired buy leg
            const usedBuys = new Set<number>();
            for (const sellLeg of sellLegs) {
                let bestBuyIdx = -1;
                let bestDist = Infinity;
                for (let i = 0; i < buyLegs.length; i++) {
                    if (usedBuys.has(i)) continue;
                    const dist = Math.abs(buyLegs[i].parsed!.strikePrice - sellLeg.parsed!.strikePrice);
                    if (dist < bestDist && dist > 0) { // must be different strikes
                        bestDist = dist;
                        bestBuyIdx = i;
                    }
                }

                if (bestBuyIdx < 0) continue;
                usedBuys.add(bestBuyIdx);
                const buyLeg = buyLegs[bestBuyIdx];

                // Compute price for these two legs
                let totalPrice = 0;
                for (const leg of [sellLeg, buyLeg]) {
                    if (leg.fills && leg.fills.length > 0) {
                        const fillPrice = parseFloat(leg.fills[0]['fill-price']) * leg.quantity * 100;
                        if (leg.action.includes('Buy')) {
                            totalPrice -= fillPrice;
                        } else {
                            totalPrice += fillPrice;
                        }
                    }
                }

                const low = Math.min(sellLeg.parsed!.strikePrice, buyLeg.parsed!.strikePrice);
                const high = Math.max(sellLeg.parsed!.strikePrice, buyLeg.parsed!.strikePrice);
                const isOpening = sellLeg.action.includes('Open');
                const spreadType = sellLeg.parsed!.optionType === 'P' ? 'put' : 'call';

                // Use a compound spreadId to allow multiple spreads from one order
                const spreadId = `${order.id}-${spreadIdx++}`;

                spreads.push({
                    type: spreadType as 'put' | 'call',
                    details: {
                        ticker: sellLeg.parsed!.underlying,
                        expirationDate: sellLeg.parsed!.expirationDate,
                        lowStrike: low,
                        highStrike: high,
                        quantity: Math.abs(sellLeg.quantity),
                        price: totalPrice,
                        date: order['received-at']?.split('T')[0] || order['created-at']?.split('T')[0],
                        isOpening,
                        orderId: spreadId,      // compound ID for unique tracking
                        sourceOrderId: order.id  // original order ID
                    }
                });
            }
        }

        return spreads;
    }

    private findCreditSpreads(orders: IOrderRawData[]): Array<{ type: 'put' | 'call', details: any }> {
        const spreads: Array<{ type: 'put' | 'call', details: any }> = [];
        for (const order of orders) {
            const extracted = this.extractSpreadsFromOrder(order);
            spreads.push(...extracted);
        }
        console.log(`[IC Analytics] Extracted ${spreads.length} spreads from ${orders.length} orders (opening: ${spreads.filter(s => s.details.isOpening).length}, closing: ${spreads.filter(s => !s.details.isOpening).length})`);
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

    private matchCreditSpreadPairs(spreads: Array<{ type: 'put' | 'call', details: any }>): { trades: IIronCondorTrade[], usedIds: Set<string | number> } {
        const trades: IIronCondorTrade[] = [];
        const usedSpreadIds = new Set<string | number>();

        // Separate opening and closing spreads
        const openSpreads = spreads.filter(s => s.details.isOpening);
        const closeSpreads = spreads.filter(s => !s.details.isOpening);

        console.log(`[IC Analytics] matchCreditSpreadPairs: ${openSpreads.length} opening, ${closeSpreads.length} closing spreads`);

        // Group opening spreads by ticker + expiration
        const openByGroup = new Map<string, Array<{ type: 'put' | 'call', details: any }>>();
        for (const s of openSpreads) {
            const key = `${s.details.ticker}-${s.details.expirationDate}`;
            if (!openByGroup.has(key)) openByGroup.set(key, []);
            openByGroup.get(key)!.push(s);
        }

        // Group closing spreads by ticker + expiration
        const closeByGroup = new Map<string, Array<{ type: 'put' | 'call', details: any }>>();
        for (const s of closeSpreads) {
            const key = `${s.details.ticker}-${s.details.expirationDate}`;
            if (!closeByGroup.has(key)) closeByGroup.set(key, []);
            closeByGroup.get(key)!.push(s);
        }

        let tradeId = 1000;
        const now = new Date();

        for (const [groupKey, groupSpreads] of openByGroup) {
            const putOpens = groupSpreads.filter(s => s.type === 'put' && !usedSpreadIds.has(s.details.orderId));
            const callOpens = groupSpreads.filter(s => s.type === 'call' && !usedSpreadIds.has(s.details.orderId));

            for (const putOpen of putOpens) {
                for (const callOpen of callOpens) {
                    if (usedSpreadIds.has(putOpen.details.orderId) || usedSpreadIds.has(callOpen.details.orderId)) continue;

                    const putDate = new Date(putOpen.details.date);
                    const callDate = new Date(callOpen.details.date);
                    const dayDiff = Math.abs(putDate.getTime() - callDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (dayDiff > 30) continue;

                    usedSpreadIds.add(putOpen.details.orderId);
                    usedSpreadIds.add(callOpen.details.orderId);

                    const openCredit = putOpen.details.price + callOpen.details.price;
                    const expDate = new Date(putOpen.details.expirationDate);

                    // Look for matching closing spreads (same ticker + expiration + strikes)
                    const closingGroup = closeByGroup.get(groupKey) || [];

                    const closePut = closingGroup.find(s =>
                        s.type === 'put' &&
                        !usedSpreadIds.has(s.details.orderId) &&
                        s.details.lowStrike === putOpen.details.lowStrike &&
                        s.details.highStrike === putOpen.details.highStrike
                    );

                    const closeCall = closingGroup.find(s =>
                        s.type === 'call' &&
                        !usedSpreadIds.has(s.details.orderId) &&
                        s.details.lowStrike === callOpen.details.lowStrike &&
                        s.details.highStrike === callOpen.details.highStrike
                    );

                    let status: 'open' | 'closed' | 'expired' = 'open';
                    let closeDate: string | null = null;
                    let closeDebit = 0;
                    let profit = 0;

                    if (closePut && closeCall) {
                        // Both spreads were closed explicitly
                        usedSpreadIds.add(closePut.details.orderId);
                        usedSpreadIds.add(closeCall.details.orderId);
                        status = 'closed';
                        closeDate = closePut.details.date > closeCall.details.date
                            ? closePut.details.date : closeCall.details.date;
                        // Closing prices are typically negative (net debit), negate to get positive closeDebit
                        closeDebit = -(closePut.details.price + closeCall.details.price);
                        profit = openCredit - closeDebit;
                        console.log(`[IC Analytics] 2-leg IC CLOSED: ${putOpen.details.ticker} ${putOpen.details.expirationDate} credit=$${openCredit.toFixed(2)} debit=$${closeDebit.toFixed(2)} profit=$${profit.toFixed(2)}`);
                    } else if ((closePut || closeCall) && expDate < now) {
                        // Partial close: one side closed (via roll), other side expired worthless
                        if (closePut) usedSpreadIds.add(closePut.details.orderId);
                        if (closeCall) usedSpreadIds.add(closeCall.details.orderId);
                        status = 'closed';
                        const closedSpread = closePut || closeCall;
                        closeDate = closedSpread!.details.date;
                        // Only the closed side has a debit; the expired side cost 0
                        closeDebit = -(closedSpread!.details.price);
                        profit = openCredit - closeDebit;
                        const closedSide = closePut ? 'put' : 'call';
                        console.log(`[IC Analytics] 2-leg IC PARTIAL CLOSE (${closedSide} rolled, other expired): ${putOpen.details.ticker} ${putOpen.details.expirationDate} credit=$${openCredit.toFixed(2)} debit=$${closeDebit.toFixed(2)} profit=$${profit.toFixed(2)}`);
                    } else if (expDate < now) {
                        status = 'expired';
                        profit = openCredit;
                        console.log(`[IC Analytics] 2-leg IC EXPIRED: ${putOpen.details.ticker} ${putOpen.details.expirationDate} profit=$${profit.toFixed(2)}`);
                    }

                    const openDate = putOpen.details.date < callOpen.details.date
                        ? putOpen.details.date : callOpen.details.date;

                    trades.push({
                        id: `IC-2L-${tradeId++}`,
                        ticker: putOpen.details.ticker,
                        expirationDate: putOpen.details.expirationDate,
                        openDate,
                        closeDate,
                        status,
                        putBuyStrike: putOpen.details.lowStrike,
                        putSellStrike: putOpen.details.highStrike,
                        callSellStrike: callOpen.details.lowStrike,
                        callBuyStrike: callOpen.details.highStrike,
                        openCredit,
                        closeDebit,
                        currentPrice: 0,
                        profit,
                        isProfitable: profit > 0,
                        quantity: putOpen.details.quantity,
                        openOrderIds: [String(putOpen.details.orderId), String(callOpen.details.orderId)],
                        closeOrderIds: closePut && closeCall
                            ? [String(closePut.details.orderId), String(closeCall.details.orderId)]
                            : []
                    });
                }
            }
        }

        return { trades, usedIds: usedSpreadIds };
    }

    /**
     * Find the opening credit for IC legs by matching option symbols against transactions.
     */
    private findCreditFromTransactions(
        transactions: ITransactionRawData[],
        legSymbols: string[]
    ): number {
        let totalCredit = 0;
        for (const tx of transactions) {
            if (!legSymbols.includes(tx.symbol)) continue;
            if (!tx.action?.includes('Open')) continue;
            const value = parseFloat(tx.value) || 0;
            if (tx['value-effect'] === 'Credit') {
                totalCredit += value;
            } else {
                totalCredit -= value;
            }
        }
        return totalCredit;
    }

    /**
     * Detect open Iron Condors from the positions API as a fallback.
     * This catches ICs that were entered as individual legs, or spread pairs
     * entered more than 30 days apart, or opened before the YTD transaction window.
     */
    private async detectOpenICsFromPositions(
        accountNumber: string,
        existingOpenTrades: IIronCondorTrade[],
        allTransactions: ITransactionRawData[]
    ): Promise<IIronCondorTrade[]> {
        try {
            const positions = await this.services.marketDataProvider.getPositions(accountNumber);
            console.log(`[IC Analytics] Positions fallback: fetched ${positions.length} option positions`);

            // Group by underlying + expiration
            const groups = new Map<string, IPositionRawData[]>();
            for (const pos of positions) {
                const key = `${pos.underlyingSymbol}-${pos.expirationDate}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(pos);
            }

            const newTrades: IIronCondorTrade[] = [];
            let tradeId = 5000;

            for (const [, groupPos] of groups) {
                if (groupPos.length < 4) continue;

                // Separate into 4 categories
                const longPuts = groupPos
                    .filter(p => p.optionType === 'P' && p.quantityDirection === 'Long')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const shortPuts = groupPos
                    .filter(p => p.optionType === 'P' && p.quantityDirection === 'Short')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const shortCalls = groupPos
                    .filter(p => p.optionType === 'C' && p.quantityDirection === 'Short')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const longCalls = groupPos
                    .filter(p => p.optionType === 'C' && p.quantityDirection === 'Long')
                    .sort((a, b) => a.strikePrice - b.strikePrice);

                if (longPuts.length === 0 || shortPuts.length === 0 ||
                    shortCalls.length === 0 || longCalls.length === 0) continue;

                // Build put spreads: long put (lower strike) + short put (higher strike)
                const putSpreads: Array<{ longPut: IPositionRawData; shortPut: IPositionRawData }> = [];
                const usedShortPuts = new Set<number>();
                for (const lp of longPuts) {
                    for (let i = 0; i < shortPuts.length; i++) {
                        if (usedShortPuts.has(i)) continue;
                        const sp = shortPuts[i];
                        if (sp.strikePrice > lp.strikePrice) {
                            putSpreads.push({ longPut: lp, shortPut: sp });
                            usedShortPuts.add(i);
                            break;
                        }
                    }
                }

                // Build call spreads: short call (lower strike) + long call (higher strike)
                const callSpreads: Array<{ shortCall: IPositionRawData; longCall: IPositionRawData }> = [];
                const usedLongCalls = new Set<number>();
                for (const sc of shortCalls) {
                    for (let i = 0; i < longCalls.length; i++) {
                        if (usedLongCalls.has(i)) continue;
                        const lc = longCalls[i];
                        if (lc.strikePrice > sc.strikePrice) {
                            callSpreads.push({ shortCall: sc, longCall: lc });
                            usedLongCalls.add(i);
                            break;
                        }
                    }
                }

                // Pair put spreads with call spreads
                const count = Math.min(putSpreads.length, callSpreads.length);
                for (let i = 0; i < count; i++) {
                    const ps = putSpreads[i];
                    const cs = callSpreads[i];

                    // Check duplicate against ALL existing trades (open, closed, expired)
                    // to avoid re-adding trades already detected from transactions
                    const mappedUnderlying = normalizeUnderlying(ps.longPut.underlyingSymbol);
                    const isDuplicate = existingOpenTrades.some(t =>
                        t.ticker === mappedUnderlying &&
                        t.expirationDate === ps.longPut.expirationDate &&
                        t.putBuyStrike === ps.longPut.strikePrice &&
                        t.putSellStrike === ps.shortPut.strikePrice &&
                        t.callSellStrike === cs.shortCall.strikePrice &&
                        t.callBuyStrike === cs.longCall.strikePrice
                    );

                    if (isDuplicate) continue;

                    // Find credit from transactions
                    const legSymbols = [
                        ps.longPut.symbol,
                        ps.shortPut.symbol,
                        cs.shortCall.symbol,
                        cs.longCall.symbol
                    ];
                    const openCredit = this.findCreditFromTransactions(allTransactions, legSymbols);

                    const qty = Math.min(
                        ps.longPut.quantity,
                        ps.shortPut.quantity,
                        cs.shortCall.quantity,
                        cs.longCall.quantity
                    );

                    // Find open date from transactions (check both action and transaction-sub-type)
                    const openTx = allTransactions.find(tx =>
                        legSymbols.includes(tx.symbol) &&
                        (tx.action?.includes('Open') || tx['transaction-sub-type']?.includes('Open'))
                    );
                    const openDate = openTx?.['executed-at']?.split('T')[0] || '';

                    newTrades.push({
                        id: `IC-POS-${tradeId++}`,
                        ticker: mappedUnderlying,
                        expirationDate: ps.longPut.expirationDate,
                        openDate,
                        closeDate: null,
                        status: 'open',
                        putBuyStrike: ps.longPut.strikePrice,
                        putSellStrike: ps.shortPut.strikePrice,
                        callSellStrike: cs.shortCall.strikePrice,
                        callBuyStrike: cs.longCall.strikePrice,
                        openCredit,
                        currentPrice: 0,
                        closeDebit: 0,
                        profit: 0,
                        isProfitable: false,
                        quantity: qty,
                        openOrderIds: [],
                        closeOrderIds: []
                    });

                    console.log(`[IC Analytics] Positions fallback found: ${mappedUnderlying} ${ps.longPut.expirationDate} ${ps.longPut.strikePrice}/${ps.shortPut.strikePrice}/${cs.shortCall.strikePrice}/${cs.longCall.strikePrice} qty=${qty} credit=$${openCredit.toFixed(2)}`);
                }
            }

            console.log(`[IC Analytics] Positions fallback total: ${newTrades.length} additional ICs`);
            return newTrades;
        } catch (error) {
            console.error('[IC Analytics] Error in positions fallback:', error);
            return [];
        }
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
                        pageOffset++;  // page-offset is a page NUMBER, not item offset
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

            // ── Unified spread-based IC detection ──
            // Extract ALL spreads from ALL orders (handles 2-leg, 4-leg ICs, 4-leg rolls, 8-leg rolls)
            const creditSpreads = this.findCreditSpreads(ytdOrders);

            // Match put+call spread pairs into iron condors, with partial close support
            const { trades } = this.matchCreditSpreadPairs(creditSpreads);
            console.log(`[IC Analytics] Found ${trades.length} iron condors from unified spread detection`);

            // Final pass: mark open trades with past expiration as expired
            for (const trade of trades) {
                if (trade.status === 'open' && new Date(trade.expirationDate) < now) {
                    trade.status = 'expired';
                    trade.profit = trade.openCredit;
                    trade.isProfitable = trade.openCredit > 0;
                    console.log(`[IC Analytics] Marked as expired: ${trade.ticker} ${trade.expirationDate} profit=$${trade.profit.toFixed(2)}`);
                }
            }

            console.log(`[IC Analytics] Trades from transactions: ${trades.length} (open: ${trades.filter(t => t.status === 'open').length}, closed: ${trades.filter(t => t.status === 'closed').length}, expired: ${trades.filter(t => t.status === 'expired').length})`);

            // Fallback: detect open ICs from positions API
            // This catches ICs entered as individual legs, or spread pairs opened far apart
            // Pass ALL trades (not just open) to avoid re-adding closed/expired trades as open
            const positionICs = await this.detectOpenICsFromPositions(
                account.accountNumber,
                trades,
                allTransactions
            );
            trades.push(...positionICs);

            console.log(`[IC Analytics] Total trades found: ${trades.length} (${positionICs.length} from positions fallback)`);

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

    /**
     * Fetch open Iron Condors directly from positions API.
     * Uses averageOpenPrice for credit, closePrice for current value.
     * This is the primary method for the dashboard — no transaction history needed.
     */
    async fetchOpenICsFromPositions(): Promise<IIronCondorTrade[]> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) {
            console.error('[IC Analytics] No account selected');
            return [];
        }

        runInAction(() => { this.isLoading = true; });

        try {
            const positions = await this.services.marketDataProvider.getPositions(account.accountNumber);
            console.log(`[IC Analytics] Positions: fetched ${positions.length} option positions`);

            // Group by underlying + expiration
            const groups = new Map<string, typeof positions>();
            for (const pos of positions) {
                const key = `${pos.underlyingSymbol}-${pos.expirationDate}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(pos);
            }

            const trades: IIronCondorTrade[] = [];
            let tradeId = 1;

            for (const [, groupPos] of groups) {
                if (groupPos.length < 4) continue;

                const longPuts = groupPos
                    .filter(p => p.optionType === 'P' && p.quantityDirection === 'Long')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const shortPuts = groupPos
                    .filter(p => p.optionType === 'P' && p.quantityDirection === 'Short')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const shortCalls = groupPos
                    .filter(p => p.optionType === 'C' && p.quantityDirection === 'Short')
                    .sort((a, b) => a.strikePrice - b.strikePrice);
                const longCalls = groupPos
                    .filter(p => p.optionType === 'C' && p.quantityDirection === 'Long')
                    .sort((a, b) => a.strikePrice - b.strikePrice);

                if (!longPuts.length || !shortPuts.length || !shortCalls.length || !longCalls.length) continue;

                // Build put spreads: long put (lower) + short put (higher)
                const putSpreads: Array<{ lp: typeof longPuts[0]; sp: typeof shortPuts[0] }> = [];
                const usedSP = new Set<number>();
                for (const lp of longPuts) {
                    for (let i = 0; i < shortPuts.length; i++) {
                        if (usedSP.has(i)) continue;
                        if (shortPuts[i].strikePrice > lp.strikePrice) {
                            putSpreads.push({ lp, sp: shortPuts[i] });
                            usedSP.add(i);
                            break;
                        }
                    }
                }

                // Build call spreads: short call (lower) + long call (higher)
                const callSpreads: Array<{ sc: typeof shortCalls[0]; lc: typeof longCalls[0] }> = [];
                const usedLC = new Set<number>();
                for (const sc of shortCalls) {
                    for (let i = 0; i < longCalls.length; i++) {
                        if (usedLC.has(i)) continue;
                        if (longCalls[i].strikePrice > sc.strikePrice) {
                            callSpreads.push({ sc, lc: longCalls[i] });
                            usedLC.add(i);
                            break;
                        }
                    }
                }

                // Pair put spreads with call spreads
                const count = Math.min(putSpreads.length, callSpreads.length);
                for (let i = 0; i < count; i++) {
                    const { lp, sp } = putSpreads[i];
                    const { sc, lc } = callSpreads[i];

                    const multiplier = lp.multiplier || 100;
                    const qty = Math.min(lp.quantity, sp.quantity, sc.quantity, lc.quantity);

                    // Credit = (short prices - long prices) × multiplier × qty
                    const openCredit = (
                        sp.averageOpenPrice + sc.averageOpenPrice
                        - lp.averageOpenPrice - lc.averageOpenPrice
                    ) * multiplier * qty;

                    // Current price to close = (short close prices - long close prices) × multiplier × qty
                    const currentPrice = (
                        sp.closePrice + sc.closePrice
                        - lp.closePrice - lc.closePrice
                    ) * multiplier * qty;

                    const tickerMapped = normalizeUnderlying(lp.underlyingSymbol);

                    trades.push({
                        id: `IC-${tradeId++}`,
                        ticker: tickerMapped,
                        expirationDate: lp.expirationDate,
                        openDate: '',
                        closeDate: null,
                        status: 'open',
                        putBuyStrike: lp.strikePrice,
                        putSellStrike: sp.strikePrice,
                        callSellStrike: sc.strikePrice,
                        callBuyStrike: lc.strikePrice,
                        openCredit,
                        currentPrice,
                        closeDebit: 0,
                        profit: openCredit - currentPrice,
                        isProfitable: openCredit > currentPrice,
                        quantity: qty,
                        openOrderIds: [],
                        closeOrderIds: []
                    });
                }
            }

            // Sort by expiration
            trades.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

            console.log(`[IC Analytics] Detected ${trades.length} open ICs from positions`);

            runInAction(() => {
                this.isLoading = false;
                this.lastFetchDate = new Date();
            });

            return trades;
        } catch (error) {
            console.error('[IC Analytics] Error fetching ICs from positions:', error);
            runInAction(() => { this.isLoading = false; });
            return [];
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
            // Use openDate if available, fall back to expirationDate
            const dateSource = (trade.openDate && trade.openDate.length >= 7)
                ? trade.openDate : trade.expirationDate;
            const month = dateSource.substring(0, 7); // YYYY-MM
            if (!month || month.length < 7) continue; // Skip trades with no valid date
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

    async getHistorySummary(): Promise<IGuvidHistorySummary> {
        const summary = await this.getSummary();

        // Group closed/expired trades by close date to compute daily P&L
        const dailyMap = new Map<string, { totalPL: number; count: number }>();

        for (const trade of summary.trades) {
            if (trade.status === 'open') continue;

            // For expired trades with no explicit closeDate, use expirationDate
            const date = trade.closeDate || trade.expirationDate;
            if (!date) continue;

            const dateKey = date.substring(0, 10); // YYYY-MM-DD

            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, { totalPL: 0, count: 0 });
            }
            const day = dailyMap.get(dateKey)!;
            day.totalPL += trade.profit;
            day.count++;
        }

        // Convert to sorted array
        const dailyPL: IDailyICPL[] = Array.from(dailyMap.entries())
            .map(([date, data]) => ({
                date,
                totalPL: data.totalPL,
                tradesClosedCount: data.count,
                isProfitable: data.totalPL > 0,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const profitableDaysCount = dailyPL.filter(d => d.totalPL > 0).length;
        const unprofitableDaysCount = dailyPL.filter(d => d.totalPL < 0).length;

        return {
            ...summary,
            dailyPL,
            profitableDaysCount,
            unprofitableDaysCount,
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

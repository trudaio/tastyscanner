import { makeAutoObservable, runInAction } from 'mobx';
import {
    ITradingDashboardService,
    ITradingDashboardSummary,
    ITrade,
    IClosedPosition,
    ITickerPL,
    INetLiquidityPoint
} from './trading-dashboard.interface';
import { IServiceFactory } from '../service-factory.interface';
import { ITransactionRawData } from '../market-data-provider/market-data-provider.service.interface';

export class TradingDashboardService implements ITradingDashboardService {
    private _isLoading = false;
    private _summary: ITradingDashboardSummary | null = null;

    constructor(
        private services: IServiceFactory
    ) {
        makeAutoObservable(this);
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    get summary(): ITradingDashboardSummary | null {
        return this._summary;
    }

    async fetchTrades(startDate?: Date, endDate?: Date): Promise<ITradingDashboardSummary> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) {
            console.error('[Trading Dashboard] No account selected');
            throw new Error('No account selected');
        }

        runInAction(() => {
            this._isLoading = true;
        });

        try {
            // Default to YTD if no dates provided
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), 0, 1);
            const end = endDate || now;

            const startDateStr = start.toISOString().split('T')[0];
            const endDateStr = end.toISOString().split('T')[0];

            console.log(`[Trading Dashboard] Fetching transactions from ${startDateStr} to ${endDateStr}`);

            // Fetch all transactions with pagination
            const allTransactions: ITransactionRawData[] = [];
            let hasMore = true;
            let pageOffset = 0;
            const pageSize = 250;

            while (hasMore) {
                const transactions = await this.services.marketDataProvider.getTransactions(
                    account.accountNumber,
                    {
                        'start-date': startDateStr,
                        'end-date': endDateStr,
                        'per-page': pageSize,
                        'page-offset': pageOffset
                    }
                );

                if (Array.isArray(transactions) && transactions.length > 0) {
                    allTransactions.push(...transactions);
                    pageOffset += transactions.length;
                    hasMore = transactions.length === pageSize;
                } else {
                    hasMore = false;
                }
            }

            console.log(`[Trading Dashboard] Total transactions: ${allTransactions.length}`);

            // Calculate summary using TastyTrade-style calculation
            const summary = this.calculateTastyStyleSummary(allTransactions, start, end);

            runInAction(() => {
                this._summary = summary;
                this._isLoading = false;
            });

            return summary;
        } catch (error) {
            console.error('Error fetching trades:', error);
            runInAction(() => {
                this._isLoading = false;
            });
            throw error;
        }
    }

    private calculateTastyStyleSummary(
        transactions: ITransactionRawData[],
        startDate: Date,
        endDate: Date
    ): ITradingDashboardSummary {
        // Group transactions by underlying symbol
        const tickerData = new Map<string, {
            realizedGain: number;
            unrealizedGain: number;
            commissions: number;
            fees: number;
            trades: ITrade[];
            closedPositions: IClosedPosition[];
            openPositions: Map<string, { trades: ITrade[], totalValue: number }>;
        }>();

        // Track daily P/L for net liquidity chart
        const dailyPL = new Map<string, number>();

        // Parse all transactions
        for (const tx of transactions) {
            if (tx['transaction-type'] !== 'Trade') continue;

            const underlying = tx['underlying-symbol'] || this.extractUnderlying(tx.symbol);
            if (!underlying) continue;

            // Initialize ticker data if needed
            if (!tickerData.has(underlying)) {
                tickerData.set(underlying, {
                    realizedGain: 0,
                    unrealizedGain: 0,
                    commissions: 0,
                    fees: 0,
                    trades: [],
                    closedPositions: [],
                    openPositions: new Map()
                });
            }

            const data = tickerData.get(underlying)!;

            // Calculate fees for this transaction
            const clearingFees = parseFloat(tx['clearing-fees']) || 0;
            const regulatoryFees = parseFloat(tx['regulatory-fees']) || 0;
            const indexOptionFees = parseFloat(tx['proprietary-index-option-fees']) || 0;
            const commission = parseFloat(tx.commission) || 0;

            // Fees are typically negative (cost)
            const totalFees = clearingFees + regulatoryFees + indexOptionFees;
            data.fees += totalFees;
            data.commissions += commission;

            // Parse trade
            const trade: ITrade = {
                id: String(tx.id),
                symbol: tx.symbol,
                underlyingSymbol: underlying,
                executedAt: new Date(tx['executed-at']),
                action: tx.action || '',
                quantity: parseInt(tx.quantity) || 0,
                price: parseFloat(tx.price) || 0,
                value: parseFloat(tx.value) || 0,
                valueEffect: tx['value-effect'] as 'Credit' | 'Debit',
                instrumentType: 'Option',
                transactionType: tx['transaction-type'],
                transactionSubType: tx['transaction-sub-type'],
                commissions: commission,
                fees: totalFees
            };

            data.trades.push(trade);

            // Calculate realized P/L
            const isOpening = trade.action.includes('Open');
            const tradeValue = trade.valueEffect === 'Credit' ? trade.value : -trade.value;

            if (!isOpening) {
                // Closing trade - this contributes to realized gain
                // The value effect already tells us if it was a credit or debit
                data.realizedGain += tradeValue;

                // Track daily P/L
                const dateKey = trade.executedAt.toISOString().split('T')[0];
                dailyPL.set(dateKey, (dailyPL.get(dateKey) || 0) + tradeValue);

                // Create closed position record
                data.closedPositions.push({
                    symbol: trade.symbol,
                    underlyingSymbol: underlying,
                    openDate: trade.executedAt, // We don't have the exact open date here
                    closeDate: trade.executedAt,
                    openValue: 0,
                    closeValue: tradeValue,
                    realizedPL: tradeValue,
                    isWinner: tradeValue > 0,
                    quantity: trade.quantity
                });
            } else {
                // Opening trade
                data.realizedGain += tradeValue;

                // Track daily P/L for opening trades too (credit received / debit paid)
                const dateKey = trade.executedAt.toISOString().split('T')[0];
                dailyPL.set(dateKey, (dailyPL.get(dateKey) || 0) + tradeValue);
            }
        }

        // Aggregate totals
        let totalRealizedGain = 0;
        let totalUnrealizedGain = 0; // Would need current position prices
        let totalCommissions = 0;
        let totalFees = 0;
        let totalTrades = 0;
        let totalClosedPositions = 0;
        let winnersCount = 0;
        let losersCount = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let largestWin = 0;
        let largestLoss = 0;

        const plByTicker: ITickerPL[] = [];

        for (const [ticker, data] of tickerData) {
            totalRealizedGain += data.realizedGain;
            totalCommissions += data.commissions;
            totalFees += data.fees;
            totalTrades += data.trades.length;

            const tickerWinners = data.closedPositions.filter(p => p.isWinner);
            const tickerLosers = data.closedPositions.filter(p => !p.isWinner);

            winnersCount += tickerWinners.length;
            losersCount += tickerLosers.length;
            totalClosedPositions += data.closedPositions.length;

            const tickerWinsSum = tickerWinners.reduce((sum, p) => sum + p.realizedPL, 0);
            const tickerLossesSum = tickerLosers.reduce((sum, p) => sum + p.realizedPL, 0);

            totalWins += tickerWinsSum;
            totalLosses += Math.abs(tickerLossesSum);

            if (tickerWinners.length > 0) {
                const maxWin = Math.max(...tickerWinners.map(p => p.realizedPL));
                if (maxWin > largestWin) largestWin = maxWin;
            }
            if (tickerLosers.length > 0) {
                const minLoss = Math.min(...tickerLosers.map(p => p.realizedPL));
                if (minLoss < largestLoss) largestLoss = minLoss;
            }

            const yearGain = data.realizedGain + data.unrealizedGain;
            const plYTDWithFees = yearGain + data.commissions + data.fees;

            plByTicker.push({
                ticker,
                realizedGain: data.realizedGain,
                unrealizedGain: data.unrealizedGain,
                yearGain,
                commissions: data.commissions,
                fees: data.fees,
                plYTDWithFees,
                tradesCount: data.trades.length,
                winnersCount: tickerWinners.length,
                losersCount: tickerLosers.length,
                winRate: data.closedPositions.length > 0
                    ? (tickerWinners.length / data.closedPositions.length) * 100
                    : 0
            });
        }

        // Sort by realized gain (matching TastyTrade's default sort)
        plByTicker.sort((a, b) => b.realizedGain - a.realizedGain);

        // Calculate net liquidity history
        const netLiquidityHistory = this.calculateNetLiquidityHistory(dailyPL, startDate, endDate);

        const yearGain = totalRealizedGain + totalUnrealizedGain;
        const plYTDWithFees = yearGain + totalCommissions + totalFees;

        return {
            totalTrades,
            totalClosedPositions,
            winnersCount,
            losersCount,
            winRate: totalClosedPositions > 0 ? (winnersCount / totalClosedPositions) * 100 : 0,

            realizedGain: totalRealizedGain,
            unrealizedGain: totalUnrealizedGain,
            yearGain,
            commissions: totalCommissions,
            fees: totalFees,
            plYTDWithFees,

            avgWin: winnersCount > 0 ? totalWins / winnersCount : 0,
            avgLoss: losersCount > 0 ? -totalLosses / losersCount : 0,
            largestWin,
            largestLoss,
            profitFactor: totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? Infinity : 0),

            plByTicker,
            netLiquidityHistory,

            startDate,
            endDate,

            trades: Array.from(tickerData.values()).flatMap(d => d.trades),
            closedPositions: Array.from(tickerData.values()).flatMap(d => d.closedPositions)
        };
    }

    private extractUnderlying(symbol: string): string {
        if (!symbol) return '';
        // Option symbols: "SPY   240315P00500000" or just "SPY"
        const match = symbol.match(/^([A-Z/]+)/);
        return match ? match[1].replace('/', '') : symbol;
    }

    private calculateNetLiquidityHistory(
        dailyPL: Map<string, number>,
        startDate: Date,
        endDate: Date
    ): INetLiquidityPoint[] {
        const history: INetLiquidityPoint[] = [];
        let cumulativePL = 0;

        // Sort dates
        const sortedDates = Array.from(dailyPL.keys()).sort();

        // Add starting point
        history.push({
            date: new Date(startDate),
            netLiquidity: 0,
            cumulativePL: 0,
            dayPL: 0
        });

        // Add each day with activity
        for (const dateKey of sortedDates) {
            const dayPL = dailyPL.get(dateKey) || 0;
            cumulativePL += dayPL;

            history.push({
                date: new Date(dateKey),
                netLiquidity: cumulativePL, // Using cumulative P/L as proxy for net liquidity change
                cumulativePL,
                dayPL
            });
        }

        // Add end point if needed
        const lastDate = history[history.length - 1]?.date;
        if (lastDate && lastDate.getTime() < endDate.getTime()) {
            history.push({
                date: new Date(endDate),
                netLiquidity: cumulativePL,
                cumulativePL,
                dayPL: 0
            });
        }

        return history;
    }
}

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

/**
 * Position ledger entry — tracks opens/closes for a single option symbol
 * under a given underlying ticker, to properly match round-trips.
 */
interface ISymbolLedger {
    openQty: number;
    openValue: number;   // signed: credit = +, debit = -
    closeQty: number;
    closeValue: number;  // signed: credit = +, debit = -
    openTrades: ITrade[];
    closeTrades: ITrade[];
}

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
            const ytdStart = startDate || new Date(now.getFullYear(), 0, 1);
            const end = endDate || now;

            // Fetch from 90 days before the requested start to capture opening trades
            // for positions that were opened before YTD and closed within YTD
            const fetchStart = new Date(ytdStart);
            fetchStart.setDate(fetchStart.getDate() - 90);

            const fetchStartStr = fetchStart.toISOString().split('T')[0];
            const endDateStr = end.toISOString().split('T')[0];
            const ytdStartStr = ytdStart.toISOString().split('T')[0];

            console.log(`[Trading Dashboard] Fetching transactions from ${fetchStartStr} to ${endDateStr} (YTD start: ${ytdStartStr})`);

            // Fetch all transactions with pagination
            const allTransactions: ITransactionRawData[] = [];
            let hasMore = true;
            let pageOffset = 0;
            const pageSize = 250;

            while (hasMore) {
                const transactions = await this.services.marketDataProvider.getTransactions(
                    account.accountNumber,
                    {
                        'start-date': fetchStartStr,
                        'end-date': endDateStr,
                        'per-page': pageSize,
                        'page-offset': pageOffset
                    }
                );

                if (Array.isArray(transactions) && transactions.length > 0) {
                    allTransactions.push(...transactions);
                    pageOffset++;  // page-offset is a page NUMBER, not item offset
                    hasMore = transactions.length === pageSize;
                } else {
                    hasMore = false;
                }
            }

            console.log(`[Trading Dashboard] Total transactions fetched: ${allTransactions.length}`);

            let summary: ITradingDashboardSummary;
            try {
                summary = this._calculateSummary(allTransactions, ytdStart, end);
            } catch (calcError) {
                console.error('[Trading Dashboard] Calculation error:', calcError);
                throw calcError;
            }

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

    /**
     * Calculates P/L summary matching TastyTrade's Year-to-Date model:
     *
     * 1. Group transactions by (underlying, option-symbol)
     * 2. Match opens with closes per option symbol
     * 3. Realized = P/L from matched round-trips closed within the date range
     * 4. Commissions & fees are negative (costs)
     * 5. Includes Trade + Receive Deliver (expirations/assignments) transactions
     */
    private _calculateSummary(
        transactions: ITransactionRawData[],
        ytdStart: Date,
        endDate: Date
    ): ITradingDashboardSummary {

        // ── 1. Build position ledgers per (underlying → option-symbol) ──

        // Map<underlying, Map<optionSymbol, ISymbolLedger>>
        const ledgers = new Map<string, Map<string, ISymbolLedger>>();

        // Commissions & fees per ticker (only for YTD transactions)
        const tickerFees = new Map<string, { commissions: number; fees: number }>();

        // All YTD trades for raw data output
        const ytdTrades: ITrade[] = [];

        for (const tx of transactions) {
            const txType = tx['transaction-type'];
            // Include regular trades AND expirations/assignments
            if (txType !== 'Trade' && txType !== 'Receive Deliver') continue;

            const underlying = tx['underlying-symbol'] || this._extractUnderlying(tx.symbol);
            if (!underlying) continue;

            const optSymbol = tx.symbol;
            if (!optSymbol) continue;

            const action = tx.action || '';
            const quantity = parseInt(tx.quantity) || 0;
            const rawValue = parseFloat(tx.value) || 0;
            const signedValue = tx['value-effect'] === 'Credit' ? rawValue : -rawValue;
            const executedAt = tx['executed-at'] ? new Date(tx['executed-at']) : null;
            if (!executedAt || isNaN(executedAt.getTime())) continue; // skip invalid dates
            const isWithinYTD = executedAt >= ytdStart && executedAt <= endDate;

            // Determine if opening or closing
            const isOpening = action.includes('Open');
            const isClosing = action.includes('Close') || txType === 'Receive Deliver';

            // Initialize ledger maps
            if (!ledgers.has(underlying)) {
                ledgers.set(underlying, new Map());
            }
            const symbolMap = ledgers.get(underlying)!;
            if (!symbolMap.has(optSymbol)) {
                symbolMap.set(optSymbol, {
                    openQty: 0, openValue: 0,
                    closeQty: 0, closeValue: 0,
                    openTrades: [], closeTrades: []
                });
            }
            const ledger = symbolMap.get(optSymbol)!;

            // Build trade object
            const clearingFees = parseFloat(tx['clearing-fees']) || 0;
            const regulatoryFees = parseFloat(tx['regulatory-fees']) || 0;
            const indexOptionFees = parseFloat(tx['proprietary-index-option-fees']) || 0;
            const commission = parseFloat(tx.commission) || 0;

            const trade: ITrade = {
                id: String(tx.id),
                symbol: optSymbol,
                underlyingSymbol: underlying,
                executedAt,
                action,
                quantity,
                price: parseFloat(tx.price) || 0,
                value: rawValue,
                valueEffect: tx['value-effect'] as 'Credit' | 'Debit',
                instrumentType: 'Option',
                transactionType: txType,
                transactionSubType: tx['transaction-sub-type'],
                commissions: commission,
                fees: clearingFees + regulatoryFees + indexOptionFees
            };

            // Accumulate in ledger (ALL transactions, not just YTD, to match opens)
            if (isOpening) {
                ledger.openQty += quantity;
                ledger.openValue += signedValue;
                ledger.openTrades.push(trade);
            } else if (isClosing) {
                ledger.closeQty += quantity;
                ledger.closeValue += signedValue;
                ledger.closeTrades.push(trade);
            }

            // Only count fees/commissions and track trades for YTD period
            if (isWithinYTD) {
                if (!tickerFees.has(underlying)) {
                    tickerFees.set(underlying, { commissions: 0, fees: 0 });
                }
                const feeData = tickerFees.get(underlying)!;
                // Negate: commissions/fees are costs → store as negative
                feeData.commissions += -Math.abs(commission);
                feeData.fees += -(Math.abs(clearingFees) + Math.abs(regulatoryFees) + Math.abs(indexOptionFees));

                ytdTrades.push(trade);
            }
        }

        // ── 2. Calculate realized P/L from matched round-trips ──

        const dailyPL = new Map<string, number>();
        const allClosedPositions: IClosedPosition[] = [];

        // Per-ticker aggregation
        const tickerAgg = new Map<string, {
            realized: number;
            tradesCount: number;
            winners: number;
            losers: number;
        }>();

        for (const [underlying, symbolMap] of ledgers) {
            if (!tickerAgg.has(underlying)) {
                tickerAgg.set(underlying, { realized: 0, tradesCount: 0, winners: 0, losers: 0 });
            }
            const agg = tickerAgg.get(underlying)!;

            for (const [optSymbol, ledger] of symbolMap) {
                const matchedQty = Math.min(ledger.openQty, ledger.closeQty);
                if (matchedQty <= 0) continue;

                // Check if any close happened within YTD
                const ytdCloses = ledger.closeTrades.filter(
                    t => t.executedAt >= ytdStart && t.executedAt <= endDate
                );
                if (ytdCloses.length === 0) continue; // No closes in YTD → skip

                // Prorate the realized P/L for the matched (closed) portion
                const openRatio = ledger.openQty > 0 ? matchedQty / ledger.openQty : 0;
                const closeRatio = ledger.closeQty > 0 ? matchedQty / ledger.closeQty : 0;

                const realizedPL = (ledger.openValue * openRatio) + (ledger.closeValue * closeRatio);
                agg.realized += realizedPL;

                // Count YTD trades for this ticker
                const ytdSymbolTrades = [...ledger.openTrades, ...ledger.closeTrades]
                    .filter(t => t.executedAt >= ytdStart && t.executedAt <= endDate);
                agg.tradesCount += ytdSymbolTrades.length;

                // Win/loss tracking per option symbol round-trip
                if (realizedPL > 0) {
                    agg.winners++;
                } else if (realizedPL < 0) {
                    agg.losers++;
                }

                // Track daily P/L from the last close date
                const lastClose = ytdCloses[ytdCloses.length - 1];
                const dateKey = lastClose.executedAt.toISOString().split('T')[0];
                dailyPL.set(dateKey, (dailyPL.get(dateKey) || 0) + realizedPL);

                // Create closed position record
                allClosedPositions.push({
                    symbol: optSymbol,
                    underlyingSymbol: underlying,
                    openDate: ledger.openTrades[0]?.executedAt || lastClose.executedAt,
                    closeDate: lastClose.executedAt,
                    openValue: ledger.openValue * openRatio,
                    closeValue: ledger.closeValue * closeRatio,
                    realizedPL,
                    isWinner: realizedPL > 0,
                    quantity: matchedQty
                });
            }
        }

        // ── 3. Also count YTD trades for tickers with ONLY opens (no closes yet) ──

        for (const [underlying, symbolMap] of ledgers) {
            if (!tickerAgg.has(underlying)) {
                tickerAgg.set(underlying, { realized: 0, tradesCount: 0, winners: 0, losers: 0 });
            }
            const agg = tickerAgg.get(underlying)!;

            // If tradesCount is still 0, count the YTD-only trades
            if (agg.tradesCount === 0) {
                for (const [, ledger] of symbolMap) {
                    const ytdCount = [...ledger.openTrades, ...ledger.closeTrades]
                        .filter(t => t.executedAt >= ytdStart && t.executedAt <= endDate).length;
                    agg.tradesCount += ytdCount;
                }
            }
        }

        // ── 4. Build final ticker P/L array ──

        let totalRealizedGain = 0;
        let totalCommissions = 0;
        let totalFees = 0;
        let totalTrades = 0;
        let winnersCount = 0;
        let losersCount = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let largestWin = 0;
        let largestLoss = 0;

        const plByTicker: ITickerPL[] = [];

        // Collect all tickers that have any YTD activity
        const allTickers = new Set<string>();
        for (const [underlying] of tickerAgg) {
            const agg = tickerAgg.get(underlying)!;
            if (agg.tradesCount > 0 || agg.realized !== 0) {
                allTickers.add(underlying);
            }
        }
        for (const [underlying] of tickerFees) {
            allTickers.add(underlying);
        }

        for (const ticker of allTickers) {
            const agg = tickerAgg.get(ticker) || { realized: 0, tradesCount: 0, winners: 0, losers: 0 };
            const feeData = tickerFees.get(ticker) || { commissions: 0, fees: 0 };

            totalRealizedGain += agg.realized;
            totalCommissions += feeData.commissions;
            totalFees += feeData.fees;
            totalTrades += agg.tradesCount;
            winnersCount += agg.winners;
            losersCount += agg.losers;

            if (agg.realized > 0) {
                totalWins += agg.realized;
                if (agg.realized > largestWin) largestWin = agg.realized;
            } else if (agg.realized < 0) {
                totalLosses += Math.abs(agg.realized);
                if (agg.realized < largestLoss) largestLoss = agg.realized;
            }

            const yearGain = agg.realized; // unrealized = 0 (needs live market data)
            const plYTDWithFees = yearGain + feeData.commissions + feeData.fees;

            plByTicker.push({
                ticker,
                realizedGain: agg.realized,
                unrealizedGain: 0,
                yearGain,
                commissions: feeData.commissions,
                fees: feeData.fees,
                plYTDWithFees,
                tradesCount: agg.tradesCount,
                winnersCount: agg.winners,
                losersCount: agg.losers,
                winRate: (agg.winners + agg.losers) > 0
                    ? (agg.winners / (agg.winners + agg.losers)) * 100
                    : 0
            });
        }

        // Sort by year gain descending (matching TastyTrade)
        plByTicker.sort((a, b) => b.yearGain - a.yearGain);

        // ── 5. Net liquidity chart ──

        const netLiquidityHistory = this._calculateNetLiquidityHistory(dailyPL, ytdStart, endDate);

        const totalClosedPositions = winnersCount + losersCount;
        const yearGain = totalRealizedGain;
        const plYTDWithFees = yearGain + totalCommissions + totalFees;

        return {
            totalTrades,
            totalClosedPositions,
            winnersCount,
            losersCount,
            winRate: totalClosedPositions > 0 ? (winnersCount / totalClosedPositions) * 100 : 0,

            realizedGain: totalRealizedGain,
            unrealizedGain: 0,
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

            startDate: ytdStart,
            endDate,

            trades: ytdTrades,
            closedPositions: allClosedPositions
        };
    }

    private _extractUnderlying(symbol: string): string {
        if (!symbol) return '';
        // Option symbols: "SPY   240315P00500000" or "/GCJ6 ..."
        // Keep leading '/' for futures
        const match = symbol.match(/^(\/?[A-Z0-9]+)/);
        return match ? match[1] : symbol;
    }

    private _calculateNetLiquidityHistory(
        dailyPL: Map<string, number>,
        startDate: Date,
        endDate: Date
    ): INetLiquidityPoint[] {
        const history: INetLiquidityPoint[] = [];
        let cumulativePL = 0;

        const sortedDates = Array.from(dailyPL.keys()).sort();

        history.push({
            date: new Date(startDate),
            netLiquidity: 0,
            cumulativePL: 0,
            dayPL: 0
        });

        for (const dateKey of sortedDates) {
            const dayPL = dailyPL.get(dateKey) || 0;
            cumulativePL += dayPL;

            history.push({
                date: new Date(dateKey),
                netLiquidity: cumulativePL,
                cumulativePL,
                dayPL
            });
        }

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

export interface IIronCondorTrade {
    id: string;
    ticker: string;
    expirationDate: string;
    openDate: string;
    closeDate: string | null;
    status: 'open' | 'closed' | 'expired';

    // Put spread details
    putBuyStrike: number;
    putSellStrike: number;

    // Call spread details
    callSellStrike: number;
    callBuyStrike: number;

    // Financials
    openCredit: number;      // Credit received when opening
    closeDebit: number;      // Debit paid when closing (0 if expired worthless)
    currentPrice: number;    // Current cost to close (from positions close-price)
    profit: number;          // openCredit - closeDebit
    isProfitable: boolean;

    // Quantities
    quantity: number;

    // Related order/transaction IDs
    openOrderIds: string[];
    closeOrderIds: string[];
}

export interface IIronCondorSummary {
    yearToDate: {
        totalTrades: number;
        openTrades: number;
        closedTrades: number;
        profitableTrades: number;
        losingTrades: number;
        winRate: number;           // percentage
        totalProfit: number;       // sum of all profits (positive = net gain)
        totalWins: number;         // sum of profitable trades
        totalLosses: number;       // sum of losing trades
        averageProfit: number;     // average profit per trade
        largestWin: number;
        largestLoss: number;
    };
    byTicker: Map<string, ITickerSummary>;
    byMonth: Map<string, IMonthSummary>;
    trades: IIronCondorTrade[];
}

export interface ITickerSummary {
    ticker: string;
    totalTrades: number;
    profitableTrades: number;
    winRate: number;
    totalProfit: number;
}

export interface IMonthSummary {
    month: string;  // YYYY-MM format
    totalTrades: number;
    profitableTrades: number;
    winRate: number;
    totalProfit: number;
}

export interface IDailyICPL {
    date: string;              // YYYY-MM-DD
    totalPL: number;           // Sum of P&L for all ICs closed that day
    tradesClosedCount: number;
    isProfitable: boolean;     // totalPL > 0
}

export interface IGuvidHistorySummary extends IIronCondorSummary {
    dailyPL: IDailyICPL[];
    profitableDaysCount: number;
    unprofitableDaysCount: number;
}

export interface IIronCondorAnalyticsService {
    fetchYTDTrades(): Promise<IIronCondorTrade[]>;
    fetchOpenICsFromPositions(): Promise<IIronCondorTrade[]>;
    getSummary(): Promise<IIronCondorSummary>;
    getHistorySummary(): Promise<IGuvidHistorySummary>;
    exportToFile(filename: string): Promise<void>;
    readonly isLoading: boolean;
    readonly lastFetchDate: Date | null;
    readonly trades: IIronCondorTrade[];
}

// Raw transaction data from TastyTrade
export interface IRawTransaction {
    id: string;
    'transaction-type': string;
    'transaction-sub-type': string;
    description: string;
    'executed-at': string;
    'transaction-date': string;
    value: string;
    'net-value': string;
    'clearing-fees': string;
    'regulatory-fees': string;
    'proprietary-index-option-fees': string;
    'is-estimated-fee': boolean;
    'order-id': number;
    symbol: string;
    'underlying-symbol': string;
    action: string;
    quantity: string;
    price: string;
    'instrument-type': string;
    'expiration-date'?: string;
    'strike-price'?: string;
    'call-or-put'?: string;
}

export interface IRawOrder {
    id: number;
    'account-number': string;
    'time-in-force': string;
    'order-type': string;
    size: number;
    'underlying-symbol': string;
    'price': string;
    'price-effect': string;
    status: string;
    'cancelled-at': string | null;
    'created-at': string;
    'updated-at': string;
    'received-at': string;
    legs: IRawOrderLeg[];
}

export interface IRawOrderLeg {
    'instrument-type': string;
    symbol: string;
    quantity: number;
    action: string;
    'fills': IRawFill[];
}

export interface IRawFill {
    'fill-id': string;
    quantity: number;
    'fill-price': string;
    'filled-at': string;
}

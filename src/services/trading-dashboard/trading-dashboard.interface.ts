export interface ITrade {
    id: string;
    symbol: string;
    underlyingSymbol: string;
    executedAt: Date;
    action: 'Buy to Open' | 'Sell to Open' | 'Buy to Close' | 'Sell to Close' | string;
    quantity: number;
    price: number;
    value: number;
    valueEffect: 'Credit' | 'Debit';
    instrumentType: string;
    transactionType: string;
    transactionSubType: string;
    commissions: number;
    fees: number;
}

export interface IClosedPosition {
    symbol: string;
    underlyingSymbol: string;
    openDate: Date;
    closeDate: Date;
    openValue: number;
    closeValue: number;
    realizedPL: number;
    isWinner: boolean;
    quantity: number;
}

export interface ITickerPL {
    ticker: string;
    realizedGain: number;
    unrealizedGain: number;
    yearGain: number;          // realizedGain + unrealizedGain
    commissions: number;
    fees: number;
    plYTDWithFees: number;     // yearGain + commissions + fees
    tradesCount: number;
    winnersCount: number;
    losersCount: number;
    winRate: number;
}

export interface INetLiquidityPoint {
    date: Date;
    netLiquidity: number;      // Account net liquidity value
    cumulativePL: number;      // Cumulative P/L from start
    dayPL: number;             // P/L for the day
}

export interface ITradingDashboardSummary {
    // Overall metrics
    totalTrades: number;
    totalClosedPositions: number;
    winnersCount: number;
    losersCount: number;
    winRate: number;

    // P/L metrics matching TastyTrade
    realizedGain: number;
    unrealizedGain: number;
    yearGain: number;          // realizedGain + unrealizedGain
    commissions: number;
    fees: number;
    plYTDWithFees: number;     // yearGain + commissions + fees

    // Additional metrics
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number;

    // By ticker
    plByTicker: ITickerPL[];

    // Net liquidity evolution
    netLiquidityHistory: INetLiquidityPoint[];

    // Date range
    startDate: Date;
    endDate: Date;

    // Raw data
    trades: ITrade[];
    closedPositions: IClosedPosition[];
}

export interface ITradingDashboardService {
    fetchTrades(startDate?: Date, endDate?: Date): Promise<ITradingDashboardSummary>;
    readonly isLoading: boolean;
    readonly summary: ITradingDashboardSummary | null;
}

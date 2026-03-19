export interface ITradeLogEntry {
    id: string;
    timestamp: number;          // Unix ms
    symbol: string;
    strategyName: string;
    dte: number;
    credit: number;
    maxProfit: number;
    maxLoss: number;
    pop: number;
    expectedValue: number;
    alpha: number;
    delta: number;
    theta: number;
    riskRewardRatio: number;
    quantity: number;
    limitPrice: number;
    bpe: number;                // Buying Power Effect
    icType: string;             // symmetric / bullish / bearish
    legs: ITradeLogLeg[];
    status: TradeLogStatus;
    closedAt?: number;
    closePrice?: number;
    realizedPnl?: number;
    notes?: string;
}

export interface ITradeLogLeg {
    action: string;
    optionType: string;
    strikePrice: number;
    expirationDate: string;
    midPrice: number;
}

export type TradeLogStatus = 'open' | 'closed' | 'expired';

export interface ITradeLogService {
    readonly entries: ITradeLogEntry[];
    logTrade(entry: Omit<ITradeLogEntry, 'id' | 'timestamp' | 'status'>): Promise<ITradeLogEntry>;
    closeTrade(id: string, closePrice: number, realizedPnl: number, notes?: string): void;
    deleteEntry(id: string): void;
    clearAll(): void;
    discordWebhookUrl: string;
}

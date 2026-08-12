// Guvid Paper Trading — view types
// Mirrors functions/src/shared/paper-account.ts (keep in sync)

export interface IPaperAccount {
    startingCapital: number;
    realizedPl: number;
    wins: number;
    losses: number;
    tradesOpened: number;
    tradesClosed: number;
    createdAt: string;
    lastUpdated: string;
    peakEquity?: number;
}

export interface IPaperTradeLeg {
    type: string;          // 'BTO' | 'STO'
    optionType: string;    // 'P' | 'C'
    strike: number;
}

export interface IPaperTrade {
    id?: string;
    ticker: string;
    strategy: string;
    expiration: string;
    legs: IPaperTradeLeg[];
    credit: number;
    quantity: number;
    wings: number;
    maxProfit: number;
    maxLoss: number;
    pop: number;
    ev: number;
    alpha: number;
    rr: number;
    delta: number;
    theta: number;
    exitPl: number | null;
    exitDate: string | null;
    closedBy: 'target' | 'dte' | 'stop' | 'stress' | 'kill' | 'user' | null;
    status: 'open' | 'closed';
    rationale: string;
    confidenceScore: number;
    riskVerdict?: 'APPROVE' | 'MODIFY' | 'REJECT';
    riskReason?: string;
    openDate: string;
    dteAtEntry: number;
    marketContext: { underlyingPrice: number; vix: number; ivRank: number };
    currentClose: number | null;
    unrealizedPl: number | null;
    profitPct: number | null;
    correct: boolean | null;
    /** Guvidelul ladder fields (skew-driven structure). */
    structure?: 'SYMMETRIC' | 'PUT-TILTED' | 'CALL-TILTED';
    putWing?: number;
    callWing?: number;
    skewPts?: number | null;
    skewPct?: number | null;
}

export interface IEquityPoint {
    date: string;
    realizedPl: number;
    unrealizedPl: number;
    equity: number;
    openCount: number;
}

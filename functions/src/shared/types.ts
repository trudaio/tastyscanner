// Shared types for competition v2 — mirrored in browser src/services/competition
// Keep in sync with src/services/competition/competition.service.ts

export type StrategyProfileType = 'Conservative' | 'Neutral' | 'Aggressive';

export interface IMarketContext {
    underlyingPrice: number;
    vix: number;
    ivRank: number;
}

export interface ICompetitionLeg {
    type: string;
    optionType: string;
    strike: number;
}

export interface ICompetitionTradeV2 {
    ticker: string;
    strategy: string;
    expiration: string;
    legs: ICompetitionLeg[];
    credit: number;              // per-share
    quantity: number;
    wings: number;
    maxProfit: number;           // dollars (credit × 100 × qty)
    maxLoss: number;             // dollars ((wings - credit) × 100 × qty)
    pop: number;
    ev: number;
    alpha: number;
    rr: number;
    delta: number;
    theta: number;
    exitPl: number | null;       // dollars, filled on close
    exitDate: string | null;     // ISO date
    closedBy: 'target' | 'dte' | 'user' | null;
    status: 'open' | 'closed';
}

export interface IAiCompetitionTrade extends ICompetitionTradeV2 {
    rationale: string;
    confidenceScore: number;     // 0-100
    rulesApplied: string[];
    experimentVariant: string | null;
    // Phase 1 LLM additions:
    llmModel?: string;            // "claude-opus-4-6"
    llmAuditLogId?: string;       // ref to aiAuditLog entry
    deviatesFromRules?: boolean;
    deviationReason?: string | null;
    requiresApproval?: boolean;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    approvedAt?: string | null;
    customStrategy?: boolean;     // true if Claude proposed variant outside rule-picker candidates
    // Phase 2 multi-agent additions:
    riskVerdict?: 'APPROVE' | 'MODIFY' | 'REJECT';
    riskReason?: string;
    riskConcerns?: string[];
    riskConfidence?: number;
    riskAuditLogId?: string;
}

export interface IUserFeedback {
    pickRating: number;       // 1-5 stars
    rationaleRating: number;  // 1-5 stars
    comment: string;
    submittedAt: string;
}

/** Strong negative signal — user would NEVER take this pick. Stronger than a loss. */
export interface IUserVeto {
    reason: string;
    vetoedAt: string;
}

export interface ICompetitionRoundV2 {
    id?: string;
    roundNumber: number;
    date: string;                // YYYY-MM-DD
    userEmail: string;
    expirationDate: string;
    ticker: 'SPX' | 'QQQ';
    userTrade: ICompetitionTradeV2 | null;
    aiTrade: IAiCompetitionTrade;
    winner: 'User' | 'AI' | 'Draw' | 'Pending' | 'GhostOnly';
    ghost: boolean;
    marketContext: IMarketContext;
    userScore: number | null;
    aiScore: number | null;
    winnerDecidedAt: string | null;
    createdAt: string;           // ISO
    revealedAt: string | null;   // ISO — when poker reveal happened
    userFeedback?: IUserFeedback;
    userVeto?: IUserVeto;
}

export interface IWeeklyMemo {
    weekId: string;              // YYYY-WW
    weekStart: string;
    weekEnd: string;
    memoText: string;
    roundsAnalyzed: number;
    aiWins: number;
    aiLosses: number;
    aiCumulativeScore: number;
    auditLogId: string;
    createdAt: string;
}

export interface IAiState {
    version: number;
    lastUpdated: string;
    weights: {
        popWeight: number;
        evWeight: number;
        alphaWeight: number;
    };
    ruleAdjustments: IRuleAdjustment[];
    explorationRate: number;
    totalRounds: number;
    wins: number;
    losses: number;
    draws: number;
    ghostRounds: number;
}

export interface IRuleAdjustment {
    id: string;
    condition: string;           // e.g. "POP<70 AND wings==5"
    effect: number;              // positive = bonus, negative = penalty
    samplesSeen: number;
    winRate: number;
}

export interface IFeatureVector {
    ticker: 'SPX' | 'QQQ';
    wings: number;
    dte_at_entry: number;
    delta_short_put: number;
    delta_short_call: number;
    pop: number;
    credit_ratio: number;
    ev_dollars: number;
    vix_at_entry: number;
    ivrank_at_entry: number;
    days_held: number;
    closed_by: string;
    symmetric: boolean;
    experiment_variant: string | null;
}

export interface ILearningLogEntry {
    roundId: string;
    timestamp: string;
    featureVector: IFeatureVector;
    outcome: 'win' | 'loss' | 'draw' | 'vetoed';
    userScore: number;
    aiScore: number;
    adjustmentsApplied: string[];
    postMortem: string;
}

// Default AI state — seeded with Catalin's rules
export const DEFAULT_AI_STATE: IAiState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    weights: {
        popWeight: 0.6,
        evWeight: 0.25,
        alphaWeight: 0.15,
    },
    ruleAdjustments: [],
    explorationRate: 0.2,
    totalRounds: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    ghostRounds: 0,
};

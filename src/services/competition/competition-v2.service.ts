// Competition v2 — browser-side service for autonomous AI competition
// Mirrors functions/src/shared/types.ts

import {
    collection, doc, getDocs, setDoc, updateDoc, query, orderBy, onSnapshot, Unsubscribe, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';

export interface IMarketContextV2 {
    underlyingPrice: number;
    vix: number;
    ivRank: number;
}

export interface ICompetitionLegV2 {
    type: string;
    optionType: string;
    strike: number;
}

export interface ICompetitionTradeV2 {
    ticker: string;
    strategy: string;
    expiration: string;
    legs: ICompetitionLegV2[];
    credit: number;              // per-share
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
    closedBy: 'target' | 'dte' | 'user' | null;
    status: 'open' | 'closed';
}

export interface IAiCompetitionTrade extends ICompetitionTradeV2 {
    rationale: string;
    confidenceScore: number;
    rulesApplied: string[];
    experimentVariant: string | null;
    llmModel?: string;
    llmAuditLogId?: string;
    deviatesFromRules?: boolean;
    deviationReason?: string | null;
    requiresApproval?: boolean;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    approvedAt?: string | null;
    customStrategy?: boolean;
    riskVerdict?: 'APPROVE' | 'MODIFY' | 'REJECT';
    riskReason?: string;
    riskConcerns?: string[];
    riskConfidence?: number;
    riskAuditLogId?: string;
}

export interface IUserFeedback {
    pickRating: number;
    rationaleRating: number;
    comment: string;
    submittedAt: string;
}

export interface IUserVeto {
    reason: string;
    vetoedAt: string;
}

export interface ICompetitionRoundV2 {
    id?: string;
    roundNumber: number;
    date: string;
    userEmail: string;
    expirationDate: string;
    ticker: 'SPX' | 'QQQ';
    userTrade: ICompetitionTradeV2 | null;
    aiTrade: IAiCompetitionTrade;
    winner: 'User' | 'AI' | 'Draw' | 'Pending' | 'GhostOnly';
    ghost: boolean;
    marketContext: IMarketContextV2;
    userScore: number | null;
    aiScore: number | null;
    winnerDecidedAt: string | null;
    createdAt: string;
    revealedAt: string | null;
    userFeedback?: IUserFeedback;
    userVeto?: IUserVeto;
}

export interface IAiState {
    version: number;
    lastUpdated: string;
    weights: {
        popWeight: number;
        evWeight: number;
        alphaWeight: number;
    };
    ruleAdjustments: Array<{
        id: string;
        condition: string;
        effect: number;
        samplesSeen: number;
        winRate: number;
    }>;
    explorationRate: number;
    totalRounds: number;
    wins: number;
    losses: number;
    draws: number;
    ghostRounds: number;
}

function getV2Collection() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return collection(db, 'users', user.uid, 'competitionV2');
}

/** Submit user's pick for a given expiration. Creates the round; AI will attach its pick when aiDailySubmit runs.
 *  Doc ID includes strike signature so multiple ICs on same expiration don't overwrite. */
export async function submitUserPick(
    round: Omit<ICompetitionRoundV2, 'id' | 'createdAt' | 'revealedAt' | 'aiTrade'> & {
        aiTrade?: IAiCompetitionTrade;
    },
): Promise<string> {
    const ref = getV2Collection();
    const date = round.date;
    // Uniquify by short-strike pair: allows multiple ICs on same exp same day
    const userTrade = round.userTrade;
    const shortPut = userTrade?.legs.find((l) => l.type === 'STO' && l.optionType === 'P')?.strike ?? 0;
    const shortCall = userTrade?.legs.find((l) => l.type === 'STO' && l.optionType === 'C')?.strike ?? 0;
    const roundId = `${date}_${round.ticker}_${round.expirationDate}_${shortPut}p${shortCall}c`;

    const baseRound: ICompetitionRoundV2 = {
        ...round,
        aiTrade: round.aiTrade ?? ({
            // placeholder — aiDailySubmit will replace when it runs
            ticker: round.ticker,
            strategy: 'PENDING',
            expiration: round.expirationDate,
            legs: [],
            credit: 0, quantity: 0, wings: 0,
            maxProfit: 0, maxLoss: 0,
            pop: 0, ev: 0, alpha: 0, rr: 0,
            delta: 0, theta: 0,
            exitPl: null, exitDate: null, closedBy: null, status: 'open',
            rationale: 'AI has not picked yet — will be submitted at 10:30 AM ET',
            confidenceScore: 0,
            rulesApplied: [],
            experimentVariant: null,
        }),
        ghost: false,
        winner: 'Pending',
        userScore: null,
        aiScore: null,
        winnerDecidedAt: null,
        createdAt: new Date().toISOString(),
        revealedAt: null,
    };

    await setDoc(doc(ref, roundId), baseRound);
    return roundId;
}

export async function getRoundsV2(): Promise<ICompetitionRoundV2[]> {
    const ref = getV2Collection();
    const q = query(ref, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ICompetitionRoundV2));
}

export function subscribeRoundsV2(callback: (rounds: ICompetitionRoundV2[]) => void): Unsubscribe {
    const ref = getV2Collection();
    const q = query(ref, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ICompetitionRoundV2)));
    });
}

export async function getAiState(): Promise<IAiState | null> {
    const user = auth.currentUser;
    if (!user) return null;
    const ref = doc(db, 'users', user.uid, 'aiState', 'current');
    const snap = await getDocs(query(collection(db, 'users', user.uid, 'aiState'), where('version', '>=', 0)));
    void ref;
    if (snap.empty) return null;
    return snap.docs[0].data() as IAiState;
}

/** Approve or reject an AI pick that requires manual approval */
export async function setApproval(roundId: string, status: 'approved' | 'rejected'): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const ref = doc(db, 'users', user.uid, 'competitionV2', roundId);
    const update: Record<string, unknown> = {
        'aiTrade.approvalStatus': status,
        'aiTrade.approvedAt': new Date().toISOString(),
    };
    if (status === 'rejected') {
        update.ghost = true;
        update.winner = 'GhostOnly';
    }
    await updateDoc(ref, update);
}

/** Veto an AI pick (strong negative signal — "I'd never take this") */
export async function vetoAiPick(roundId: string, reason: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const ref = doc(db, 'users', user.uid, 'competitionV2', roundId);
    await updateDoc(ref, {
        userVeto: {
            reason: reason.trim() || '(no reason given)',
            vetoedAt: new Date().toISOString(),
        },
    });
}

/** Submit user feedback on a closed round */
export async function submitFeedback(
    roundId: string,
    feedback: { pickRating: number; rationaleRating: number; comment: string },
): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const ref = doc(db, 'users', user.uid, 'competitionV2', roundId);
    await updateDoc(ref, {
        userFeedback: {
            ...feedback,
            submittedAt: new Date().toISOString(),
        },
    });
}

export function calculateDeadline(): { daysRemaining: number; deadline: string } {
    const deadline = new Date('2026-06-13T16:00:00Z');
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    return {
        daysRemaining: Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000))),
        deadline: deadline.toISOString().split('T')[0],
    };
}

export function computeLeaderboard(rounds: ICompetitionRoundV2[]): {
    userWins: number; aiWins: number; draws: number;
    userCumulativeScore: number; aiCumulativeScore: number;
    ghostRounds: number;
    pending: number;
} {
    let userWins = 0, aiWins = 0, draws = 0, ghostRounds = 0, pending = 0;
    let userCumulative = 0, aiCumulative = 0;

    for (const r of rounds) {
        if (r.ghost || r.winner === 'GhostOnly') { ghostRounds++; continue; }
        if (r.winner === 'Pending') { pending++; continue; }
        if (r.winner === 'User') userWins++;
        else if (r.winner === 'AI') aiWins++;
        else if (r.winner === 'Draw') draws++;

        userCumulative += r.userScore ?? 0;
        aiCumulative += r.aiScore ?? 0;
    }

    return {
        userWins, aiWins, draws, ghostRounds, pending,
        userCumulativeScore: Math.round(userCumulative * 1000) / 1000,
        aiCumulativeScore: Math.round(aiCumulative * 1000) / 1000,
    };
}

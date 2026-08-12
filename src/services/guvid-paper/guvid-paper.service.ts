// Guvid Paper Trading — browser-side read service
// Mirrors functions/src/shared/paper-account.ts (keep in sync)

import {
    collection, doc, limit, onSnapshot, orderBy, query, Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';

export interface IPaperAccount {
    startingCapital: number;
    realizedPl: number;
    wins: number;
    losses: number;
    tradesOpened: number;
    tradesClosed: number;
    createdAt: string;
    lastUpdated: string;
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
    closedBy: 'target' | 'dte' | 'user' | null;
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
}

export interface IEquityPoint {
    date: string;
    realizedPl: number;
    unrealizedPl: number;
    equity: number;
    openCount: number;
}

function requireUid(): string {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.uid;
}

export function subscribePaperAccount(callback: (account: IPaperAccount | null) => void): Unsubscribe {
    const uid = requireUid();
    const ref = doc(db, 'users', uid, 'guvidPaper', 'account');
    return onSnapshot(ref, (snap) => {
        callback(snap.exists() ? (snap.data() as IPaperAccount) : null);
    });
}

/** Most recent 250 trades (newest first). Open trades are always recent
 *  (entries are 25-45 DTE), so they're guaranteed inside the window. */
export function subscribePaperTrades(callback: (trades: IPaperTrade[]) => void): Unsubscribe {
    const uid = requireUid();
    const ref = collection(db, 'users', uid, 'guvidPaperTrades');
    const q = query(ref, orderBy('openDate', 'desc'), limit(250));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as IPaperTrade)));
    });
}

/** Last ~1 year of daily equity points, oldest first. */
export function subscribePaperEquity(callback: (points: IEquityPoint[]) => void): Unsubscribe {
    const uid = requireUid();
    const ref = collection(db, 'users', uid, 'guvidPaperEquity');
    const q = query(ref, orderBy('date', 'desc'), limit(365));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data() as IEquityPoint).reverse());
    });
}

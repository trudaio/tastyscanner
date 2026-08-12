// Guvid Paper Trading — virtual account helpers
// The paper account is seeded ONCE with the user's real net liquidity at the
// moment of first run. From then on it evolves only through Guvid's own
// virtual trades — it never re-syncs with the real account.

import * as admin from 'firebase-admin';
import type { IAiCompetitionTrade, IMarketContext } from './types';

export interface IPaperAccount {
    startingCapital: number;     // real net liq at first run (never changes)
    realizedPl: number;          // cumulative P&L of closed paper trades
    wins: number;                // closed trades with exitPl > 0
    losses: number;              // closed trades with exitPl <= 0
    tradesOpened: number;
    tradesClosed: number;
    createdAt: string;           // ISO
    lastUpdated: string;         // ISO
}

/** A Guvid paper trade — same shape as the AI competition trade plus
 *  paper-account bookkeeping fields. */
export interface IPaperTrade extends IAiCompetitionTrade {
    id?: string;
    openDate: string;            // YYYY-MM-DD
    dteAtEntry: number;
    marketContext: IMarketContext;
    /** Latest observed cost to close (per share), refreshed by guvidPaperClose. */
    currentClose: number | null;
    /** Latest unrealized P&L in dollars for open trades. */
    unrealizedPl: number | null;
    /** Latest % of max profit captured (0-100+) for open trades. */
    profitPct: number | null;
    /** Set on close: was this a correct (profitable) position? */
    correct: boolean | null;
}

export interface IEquityPoint {
    date: string;                // YYYY-MM-DD
    realizedPl: number;
    unrealizedPl: number;
    equity: number;              // startingCapital + realizedPl + unrealizedPl
    openCount: number;
}

const ACCOUNT_PATH = (uid: string) =>
    admin.firestore().collection('users').doc(uid).collection('guvidPaper').doc('account');

export const tradesCollection = (uid: string) =>
    admin.firestore().collection('users').doc(uid).collection('guvidPaperTrades');

export const equityCollection = (uid: string) =>
    admin.firestore().collection('users').doc(uid).collection('guvidPaperEquity');

/** Load the paper account; seed it with the real net liq on first run.
 *  Returns null when the account doesn't exist yet AND no valid net liq is
 *  available to seed it (fail-safe: never seed the account with a bad number). */
export async function getOrCreatePaperAccount(uid: string, realNetLiq: number): Promise<IPaperAccount | null> {
    const ref = ACCOUNT_PATH(uid);
    const doc = await ref.get();
    if (doc.exists) return doc.data() as IPaperAccount;

    if (realNetLiq <= 0) {
        console.error(`[paper-account] Cannot seed paper account with net liq ${realNetLiq} — skipping run`);
        return null;
    }
    const account: IPaperAccount = {
        startingCapital: Math.round(realNetLiq * 100) / 100,
        realizedPl: 0,
        wins: 0,
        losses: 0,
        tradesOpened: 0,
        tradesClosed: 0,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
    };
    await ref.set(account);
    console.log(`[paper-account] Seeded paper account for ${uid} with $${account.startingCapital}`);
    return account;
}

export async function updatePaperAccount(uid: string, patch: Partial<IPaperAccount>): Promise<void> {
    await ACCOUNT_PATH(uid).update({ ...patch, lastUpdated: new Date().toISOString() });
}

export function paperEquity(account: IPaperAccount): number {
    return account.startingCapital + account.realizedPl;
}

export async function getOpenPaperTrades(uid: string): Promise<IPaperTrade[]> {
    const snap = await tradesCollection(uid).where('status', '==', 'open').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as IPaperTrade));
}

/** BPE % of the paper account: capital tied up as max loss of open trades. */
export function paperBpePercentage(openTrades: IPaperTrade[], equity: number): number {
    if (equity <= 0) return 100;
    const used = openTrades.reduce((s, t) => s + t.maxLoss, 0);
    return Math.round((used / equity) * 10000) / 100;
}

/**
 * Position sizing against the paper account: max loss per trade capped at
 * 5% of current equity (Catalin's documented rule).
 * Returns 0 when even 1 contract exceeds the cap.
 */
export function sizePaperQuantity(perContractMaxLoss: number, equity: number): number {
    if (perContractMaxLoss <= 0 || equity <= 0) return 0;
    const budget = equity * 0.05;
    const qty = Math.floor(budget / perContractMaxLoss);
    return Math.max(0, Math.min(qty, 10)); // hard cap 10 contracts per trade
}

/**
 * Calendar days until expiration, measured in the America/New_York trading
 * calendar. DST-safe — a hardcoded UTC offset ("-05:00") makes DTE drift by
 * one day for the ~8 months the US runs on EDT.
 */
export function daysUntilExpiration(expirationDate: string): number {
    // en-CA locale formats as YYYY-MM-DD; both sides parse as UTC midnight
    const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return Math.round((Date.parse(expirationDate) - Date.parse(todayEt)) / 86_400_000);
}

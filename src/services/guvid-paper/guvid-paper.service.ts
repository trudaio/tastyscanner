// Guvid Paper Trading — browser-side read service

import {
    collection, doc, limit, onSnapshot, orderBy, query, Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { IEquityPoint, IPaperAccount, IPaperTrade } from './guvid-paper.service.interface';

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

import { doc, setDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { IronCondorModel } from '../../models/iron-condor.model';
import type { IPositionViewModel } from '../positions/positions.service.interface';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ITradeJournalEntry,
    ITradeJournalService,
    ITradeJournalEntrySnapshot,
} from './trade-journal.service.interface';

const ORPHAN_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TradeJournalService implements ITradeJournalService {
    constructor(private readonly services: IServiceFactory) {}

    async captureEntry(ic: IronCondorModel, ticker: string, tradeId: string): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            const vixData = this.services.watchlistData.getTickerData('VIX');
            const tickerData = this.services.watchlistData.getTickerData(ticker);

            const expirationDate = ic.btoPut.strike.expiration.expirationDate;
            const dte = Math.max(0, Math.round(
                (new Date(expirationDate + 'T00:00:00Z').getTime() - Date.now()) / (24 * 3600 * 1000)
            ));

            const snapshot: ITradeJournalEntrySnapshot = {
                delta: round(ic.netDelta, 2),
                theta: round(ic.netTheta, 2),
                gamma: round(ic.netGamma, 4),
                vega: round(ic.netVega, 2),
                iv: round(ic.avgShortIV, 4),
                ivRank: tickerData?.ivRank ?? 0,
                vix: vixData?.lastPrice ?? null,
                underlyingPrice: ic.underlyingPrice,
                pop: round(ic.pop, 2),
                dte,
            };

            const entry: Omit<ITradeJournalEntry, 'createdAt'> & { createdAt: unknown } = {
                tradeId,
                status: 'pending',
                createdAt: serverTimestamp(),
                confirmedAt: null,
                ticker,
                expirationDate,
                strikes: {
                    putLong: ic.btoPut.strikePrice,
                    putShort: ic.stoPut.strikePrice,
                    callShort: ic.stoCall.strikePrice,
                    callLong: ic.btoCall.strikePrice,
                },
                entry: snapshot,
            };

            const ref = doc(db, 'users', uid, 'tradeJournal', tradeId);
            await setDoc(ref, entry);
        } catch (err) {
            // Best-effort: never block the order send.
            this.services.logger.warning('[TradeJournal] captureEntry failed', err);
        }
    }

    async markOrphan(tradeId: string): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            await updateDoc(doc(db, 'users', uid, 'tradeJournal', tradeId), { status: 'orphan' });
        } catch (err) {
            this.services.logger.warning('[TradeJournal] markOrphan failed', err);
        }
    }

    async promotePending(positions: IPositionViewModel[]): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            const snap = await getDocs(collection(db, 'users', uid, 'tradeJournal'));
            const now = Date.now();

            for (const d of snap.docs) {
                const entry = d.data() as ITradeJournalEntry;
                if (entry.status !== 'pending') continue;

                const hasMatch = positions.some(p =>
                    p.underlyingSymbol === entry.ticker &&
                    p.expirationDate === entry.expirationDate &&
                    (p.strikePrice === entry.strikes.putLong
                     || p.strikePrice === entry.strikes.putShort
                     || p.strikePrice === entry.strikes.callShort
                     || p.strikePrice === entry.strikes.callLong)
                );

                if (hasMatch) {
                    await updateDoc(doc(db, 'users', uid, 'tradeJournal', entry.tradeId), {
                        status: 'confirmed',
                        confirmedAt: serverTimestamp(),
                    });
                    continue;
                }

                const ageMs = now - (entry.createdAt?.toMillis?.() ?? now);
                if (ageMs > ORPHAN_TIMEOUT_MS) {
                    await updateDoc(doc(db, 'users', uid, 'tradeJournal', entry.tradeId), {
                        status: 'orphan',
                    });
                }
            }
        } catch (err) {
            this.services.logger.warning('[TradeJournal] promotePending failed', err);
        }
    }

    async getAll(): Promise<ITradeJournalEntry[]> {
        const uid = auth.currentUser?.uid;
        if (!uid) return [];
        const snap = await getDocs(collection(db, 'users', uid, 'tradeJournal'));
        return snap.docs.map(d => d.data() as ITradeJournalEntry);
    }
}

function round(n: number, decimals: number): number {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
}

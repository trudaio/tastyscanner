// src/services/trade-journal/trade-journal.service.interface.ts
import type { Timestamp } from 'firebase/firestore';
import type { IronCondorModel } from '../../models/iron-condor.model';
import type { IPositionViewModel } from '../positions/positions.service.interface';

export type TradeJournalStatus = 'pending' | 'confirmed' | 'orphan';

export interface ITradeJournalStrikes {
    putLong: number;
    putShort: number;
    callShort: number;
    callLong: number;
}

export interface ITradeJournalEntrySnapshot {
    delta: number;            // Net IC delta (2 decimals)
    theta: number;            // Net IC theta (2 decimals; > 0 for short IC)
    gamma: number;            // Net IC gamma (4 decimals)
    vega: number;             // Net IC vega (2 decimals)
    iv: number;               // Mean of putShort.iv and callShort.iv (%)
    ivRank: number;           // Ticker IV Rank at entry (%)
    vix: number | null;       // Spot VIX (null if unavailable)
    underlyingPrice: number;  // Underlying spot at entry
    pop: number;              // POP % from IronCondorModel
    dte: number;              // Integer days to expiration
}

export interface ITradeJournalEntry {
    tradeId: string;                       // UUID, doc ID in Firestore
    status: TradeJournalStatus;
    createdAt: Timestamp;
    confirmedAt: Timestamp | null;
    ticker: string;
    expirationDate: string;                // YYYY-MM-DD
    strikes: ITradeJournalStrikes;
    entry: ITradeJournalEntrySnapshot;
}

export interface ITradeJournalService {
    captureEntry(ic: IronCondorModel, ticker: string, tradeId: string): Promise<void>;
    markOrphan(tradeId: string): Promise<void>;
    promotePending(positions: IPositionViewModel[]): Promise<void>;
    getAll(): Promise<ITradeJournalEntry[]>;
}

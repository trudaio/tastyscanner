import type { IIronCondorViewModel } from '../../models/iron-condor.view-model.interface';

export type TradeProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'stale';

export interface ITradeProposalScores {
    pop: number;
    ev: number;
    alpha: number;
    credit: number;
}

export interface ITradeProposal {
    id: string;
    ticker: string;
    /** Live IC model. Only present in the current session — not persisted to storage. */
    ironCondor?: IIronCondorViewModel;
    scannedAt: Date;
    expiresAt: Date;
    status: TradeProposalStatus;
    scores: ITradeProposalScores;
}

export interface INewProposal {
    ticker: string;
    ironCondor: IIronCondorViewModel;
    scores: ITradeProposalScores;
    /** Defaults to +2 hours from now if omitted. */
    expiresAt?: Date;
}

export interface ITradeProposalService {
    readonly proposals: ITradeProposal[];
    /** Ingest new proposals from ScannerService. */
    addProposals(proposals: INewProposal[]): void;
    /** Execute the IC order and mark proposal as executed. */
    approveProposal(id: string): Promise<void>;
    /** Mark proposal as rejected. */
    rejectProposal(id: string): void;
    /** Mark all pending proposals past their expiresAt as expired. Called automatically every 5 min. */
    expireStale(): void;
}

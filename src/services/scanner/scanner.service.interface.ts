export type OpportunityStatus = 'pending' | 'approved' | 'executed' | 'rejected' | 'expired';

export interface IOpportunitySpread {
    readonly shortStrike: number;
    readonly longStrike: number;
}

export interface IOpportunity {
    readonly id: string;
    readonly ticker: string;
    readonly ivRank: number;
    readonly expiration: string;
    readonly dte: number;
    readonly putSpread: IOpportunitySpread;
    readonly callSpread: IOpportunitySpread;
    readonly credit: number;
    readonly maxRisk: number;
    readonly pop: number;
    readonly score: number;
    status: OpportunityStatus;
    expiresAt?: Date;
}

export interface IScannerService {
    readonly opportunities: IOpportunity[];
    readonly isScanning: boolean;
    readonly lastScanTime: Date | null;
    readonly autoScanEnabled: boolean;
    setAutoScanEnabled(enabled: boolean): void;
    runScan(): Promise<void>;
    approveOpportunity(id: string): Promise<void>;
    rejectOpportunity(id: string): void;
}

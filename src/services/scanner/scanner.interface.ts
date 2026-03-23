import type { IIronCondorViewModel } from '../../models/iron-condor.view-model.interface';
import type { TickerModel } from '../../models/ticker.model';

export interface IOpportunity {
    ticker: TickerModel;
    ironCondor: IIronCondorViewModel;
    /** Composite score: alpha * POP * IVR/100 */
    score: number;
    ivRank: number;
    estimatedCredit: number;
    scanTime: Date;
}

export interface IScannerService {
    readonly opportunities: IOpportunity[];
    readonly isScanning: boolean;
    readonly lastScanTime: Date | null;

    /** Scan all watchlist tickers: fetch IV ranks → filter ≥30 → build ICs → score → rank. */
    runScan(): Promise<void>;
    /** Scan a single ticker and return the best IC opportunity, or null if none qualify. */
    scanTicker(symbol: string): Promise<IOpportunity | null>;
}

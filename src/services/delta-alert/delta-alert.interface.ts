import {ITradeLogEntry, ITradeLogLeg} from "../trade-log/trade-log.interface";

export interface IDeltaAlertLeg {
    readonly trade: ITradeLogEntry;
    readonly leg: ITradeLogLeg;
    readonly initialDelta: number;
    readonly currentDelta: number;
    readonly deltaRatio: number;  // currentDelta / initialDelta
}

export interface IDeltaAlertService {
    readonly alerts: IDeltaAlertLeg[];
    readonly isLoading: boolean;
    refresh(): void;
    dispose(): void;
}

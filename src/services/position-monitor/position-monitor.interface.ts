import { IIronCondorTrade } from '../iron-condor-analytics/iron-condor-analytics.interface';

export type AlertStatus = 'none' | 'profit_target' | 'stop_loss' | 'dte_warning' | 'roll_needed';

export type ActivityType =
    | 'profit_target_hit'
    | 'stop_loss_hit'
    | 'dte_warning'
    | 'roll_needed'
    | 'alert_dismissed'
    | 'monitoring_started'
    | 'monitoring_stopped';

export interface IMonitorRules {
    profitTargetPct: number;     // default 75 — close when profit >= this %
    stopLossPct: number;         // default 100 — exit when loss >= this % of credit
    dteWarningDays: number;      // default 21 — warn when DTE <= this
    rollDays: number;            // default 14 — roll urgently when DTE <= this
    pollIntervalSeconds: number; // default 30
}

export interface IMonitoredPosition extends IIronCondorTrade {
    profitPct: number;
    dte: number;
    alertStatus: AlertStatus;
    alertDismissedAt?: number;
}

export interface IMonitorActivity {
    id: string;
    timestamp: number;
    type: ActivityType;
    ticker: string;
    message: string;
}

export interface IPositionMonitorService {
    readonly isMonitoring: boolean;
    readonly isLoading: boolean;
    readonly rules: IMonitorRules;
    readonly monitoredPositions: IMonitoredPosition[];
    readonly activityLog: IMonitorActivity[];
    readonly activeAlertCount: number;
    startMonitoring(): void;
    stopMonitoring(): void;
    updateRules(rules: Partial<IMonitorRules>): void;
    dismissAlert(positionId: string): void;
    clearActivityLog(): void;
}

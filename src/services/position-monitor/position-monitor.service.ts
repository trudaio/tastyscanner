import { makeObservable, observable, action, runInAction } from 'mobx';
import { ServiceBase } from '../service-base';
import { IServiceFactory } from '../service-factory.interface';
import {
    IMonitorActivity,
    IMonitorRules,
    IMonitoredPosition,
    IPositionMonitorService,
    AlertStatus,
} from './position-monitor.interface';

const STORAGE_KEY = 'positionMonitorRules';

const DEFAULT_RULES: IMonitorRules = {
    profitTargetPct: 75,
    stopLossPct: 100,
    dteWarningDays: 21,
    rollDays: 14,
    pollIntervalSeconds: 30,
};

function computeDte(expirationDate: string): number {
    const exp = new Date(expirationDate + 'T16:00:00');
    const now = new Date();
    return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function computeProfitPct(openCredit: number, currentPrice: number): number {
    if (openCredit <= 0) return 0;
    return ((openCredit - currentPrice) / openCredit) * 100;
}

export class PositionMonitorService extends ServiceBase implements IPositionMonitorService {

    constructor(services: IServiceFactory) {
        super(services);
        makeObservable<this,
            '_isMonitoring' | '_isLoading' | '_rules' | '_monitoredPositions' | '_activityLog' | '_dismissedIds'
        >(this, {
            _isMonitoring: observable.ref,
            _isLoading: observable.ref,
            _rules: observable.ref,
            _monitoredPositions: observable.ref,
            _activityLog: observable.ref,
            _dismissedIds: observable,
            startMonitoring: action,
            stopMonitoring: action,
            updateRules: action,
            dismissAlert: action,
            clearActivityLog: action,
        });

        this._rules = this._loadRules();
    }

    private _isMonitoring = false;
    private _isLoading = false;
    private _rules: IMonitorRules = { ...DEFAULT_RULES };
    private _monitoredPositions: IMonitoredPosition[] = [];
    private _activityLog: IMonitorActivity[] = [];
    private _dismissedIds = new Map<string, number>();
    private _intervalId: ReturnType<typeof setInterval> | null = null;

    get isMonitoring(): boolean { return this._isMonitoring; }
    get isLoading(): boolean { return this._isLoading; }
    get rules(): IMonitorRules { return this._rules; }
    get monitoredPositions(): IMonitoredPosition[] { return this._monitoredPositions; }
    get activityLog(): IMonitorActivity[] { return this._activityLog; }

    get activeAlertCount(): number {
        return this._monitoredPositions.filter(
            p => p.alertStatus !== 'none' && !this._dismissedIds.has(p.id)
        ).length;
    }

    startMonitoring(): void {
        if (this._isMonitoring) return;
        this._isMonitoring = true;
        this._addActivity('monitoring_started', 'System', 'Position monitoring started');
        void this._poll();
        this._intervalId = setInterval(() => { void this._poll(); }, this._rules.pollIntervalSeconds * 1000);
    }

    stopMonitoring(): void {
        if (!this._isMonitoring) return;
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._isMonitoring = false;
        this._addActivity('monitoring_stopped', 'System', 'Position monitoring stopped');
    }

    updateRules(rules: Partial<IMonitorRules>): void {
        const updated = { ...this._rules, ...rules };
        this._rules = updated;
        this._saveRules(updated);

        // Restart interval if poll interval changed while monitoring
        if (rules.pollIntervalSeconds !== undefined && this._isMonitoring) {
            if (this._intervalId !== null) clearInterval(this._intervalId);
            this._intervalId = setInterval(() => { void this._poll(); }, updated.pollIntervalSeconds * 1000);
        }
    }

    dismissAlert(positionId: string): void {
        this._dismissedIds.set(positionId, Date.now());
        this._addActivity('alert_dismissed', positionId, `Alert dismissed for position ${positionId}`);
        // Refresh displayed status
        runInAction(() => {
            this._monitoredPositions = this._monitoredPositions.map(p => {
                if (p.id !== positionId) return p;
                return { ...p, alertStatus: 'none' as AlertStatus, alertDismissedAt: Date.now() };
            });
        });
    }

    clearActivityLog(): void {
        this._activityLog = [];
    }

    private async _poll(): Promise<void> {
        runInAction(() => { this._isLoading = true; });
        try {
            const trades = await this.services.ironCondorAnalytics.fetchOpenICsFromPositions();
            const rules = this._rules;

            runInAction(() => {
                const updated: IMonitoredPosition[] = trades.map(trade => {
                    const profitPct = computeProfitPct(trade.openCredit, trade.currentPrice);
                    const dte = computeDte(trade.expirationDate);
                    const alertStatus = this._computeAlertStatus(profitPct, dte, trade.openCredit, trade.currentPrice, rules);

                    // Check if this is a new alert (not previously dismissed)
                    const prev = this._monitoredPositions.find(p => p.id === trade.id);
                    const wasDismissed = this._dismissedIds.has(trade.id);
                    const isNewAlert = alertStatus !== 'none' && !wasDismissed &&
                        (!prev || prev.alertStatus === 'none');

                    if (isNewAlert) {
                        const msg = this._buildAlertMessage(alertStatus, trade.ticker, profitPct, dte);
                        this._addActivityInner(alertStatus === 'profit_target' ? 'profit_target_hit' :
                            alertStatus === 'stop_loss' ? 'stop_loss_hit' :
                            alertStatus === 'roll_needed' ? 'roll_needed' : 'dte_warning',
                            trade.ticker, msg);
                    }

                    const effectiveAlertStatus = wasDismissed ? 'none' as AlertStatus : alertStatus;

                    return {
                        ...trade,
                        profitPct: Math.round(profitPct * 100) / 100,
                        dte,
                        alertStatus: effectiveAlertStatus,
                        alertDismissedAt: this._dismissedIds.get(trade.id),
                    };
                });

                this._monitoredPositions = updated;
                this._isLoading = false;
            });
        } catch {
            runInAction(() => { this._isLoading = false; });
        }
    }

    private _computeAlertStatus(
        profitPct: number,
        dte: number,
        openCredit: number,
        currentPrice: number,
        rules: IMonitorRules
    ): AlertStatus {
        // Profit target
        if (profitPct >= rules.profitTargetPct) return 'profit_target';

        // Stop loss: loss exceeds stopLossPct% of credit received
        if (openCredit > 0) {
            const lossPct = ((currentPrice - openCredit) / openCredit) * 100;
            if (lossPct >= rules.stopLossPct) return 'stop_loss';
        }

        // Roll urgently
        if (dte <= rules.rollDays) return 'roll_needed';

        // DTE warning
        if (dte <= rules.dteWarningDays) return 'dte_warning';

        return 'none';
    }

    private _buildAlertMessage(status: AlertStatus, ticker: string, profitPct: number, dte: number): string {
        switch (status) {
            case 'profit_target': return `${ticker}: profit target hit at ${profitPct.toFixed(1)}% — consider closing`;
            case 'stop_loss': return `${ticker}: stop loss triggered — evaluate exit`;
            case 'roll_needed': return `${ticker}: ${dte} DTE — roll urgently`;
            case 'dte_warning': return `${ticker}: ${dte} DTE — consider rolling or closing`;
            default: return `${ticker}: alert triggered`;
        }
    }

    private _addActivity(type: IMonitorActivity['type'], ticker: string, message: string): void {
        runInAction(() => { this._addActivityInner(type, ticker, message); });
    }

    private _addActivityInner(type: IMonitorActivity['type'], ticker: string, message: string): void {
        const entry: IMonitorActivity = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            type,
            ticker,
            message,
        };
        // Prepend, keep last 200 entries
        this._activityLog = [entry, ...this._activityLog].slice(0, 200);
    }

    private _loadRules(): IMonitorRules {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return { ...DEFAULT_RULES, ...(JSON.parse(raw) as Partial<IMonitorRules>) };
        } catch { /* ignore */ }
        return { ...DEFAULT_RULES };
    }

    private _saveRules(rules: IMonitorRules): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
        } catch { /* ignore */ }
    }
}

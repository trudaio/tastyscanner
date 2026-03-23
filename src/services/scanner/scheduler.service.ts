import { makeObservable, observable, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type { ISchedulerService } from './scheduler.interface';

/** Market open time in ET: 9:30 AM */
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
/** Market close time in ET: 4:00 PM */
const MARKET_CLOSE_HOUR = 16;
/** Initial scan trigger: 9:35 AM ET (5 min after open for prices to stabilize) */
const SCAN_TRIGGER_HOUR = 9;
const SCAN_TRIGGER_MINUTE = 35;
/** Auto-scan interval during market hours (30 minutes) */
const AUTO_SCAN_INTERVAL_MINUTES = 30;
/** How often to poll the schedule check (1 minute) */
const POLL_INTERVAL_MS = 60 * 1000;

export class SchedulerService implements ISchedulerService {
    isScheduled = false;
    nextScanTime: Date | null = null;

    private _pollIntervalId: ReturnType<typeof setInterval> | null = null;
    /** Track the last minute we triggered a scan to avoid double-firing. */
    private _lastScanMinuteKey = '';

    constructor(private readonly _services: IServiceFactory) {
        makeObservable(this, {
            isScheduled: observable,
            nextScanTime: observable.ref,
        });
    }

    startScheduler(): void {
        if (this.isScheduled) return;
        runInAction(() => { this.isScheduled = true; });

        this._updateNextScanTime();
        // Poll every minute to check if it's time to scan
        this._pollIntervalId = setInterval(() => {
            void this._tick();
        }, POLL_INTERVAL_MS);
    }

    stopScheduler(): void {
        if (this._pollIntervalId !== null) {
            clearInterval(this._pollIntervalId);
            this._pollIntervalId = null;
        }
        runInAction(() => {
            this.isScheduled = false;
            this.nextScanTime = null;
        });
    }

    async triggerManualScan(): Promise<void> {
        await this._services.scanner.runScan();
        this._updateNextScanTime();
    }

    private async _tick(): Promise<void> {
        const et = this._getETComponents();
        const minuteKey = `${et.dayOfWeek}-${et.hours}-${et.minutes}`;

        if (minuteKey === this._lastScanMinuteKey) return;
        if (!this._isMarketOpenNow(et)) {
            this._updateNextScanTime();
            return;
        }

        const totalMinutes = et.hours * 60 + et.minutes;
        const openTotalMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
        const triggerTotalMinutes = SCAN_TRIGGER_HOUR * 60 + SCAN_TRIGGER_MINUTE;
        const elapsedSinceOpen = totalMinutes - openTotalMinutes;

        // Trigger at 9:35 AM or every 30 minutes after market open
        const shouldScan =
            totalMinutes === triggerTotalMinutes ||
            (elapsedSinceOpen > 0 && elapsedSinceOpen % AUTO_SCAN_INTERVAL_MINUTES === 0);

        if (shouldScan && !this._services.scanner.isScanning) {
            this._lastScanMinuteKey = minuteKey;
            await this._services.scanner.runScan();
            this._updateNextScanTime();
        }
    }

    private _isMarketOpenNow(et: IETComponents): boolean {
        if (et.dayOfWeek === 0 || et.dayOfWeek === 6) return false; // weekend
        const total = et.hours * 60 + et.minutes;
        return total >= MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE &&
            total < MARKET_CLOSE_HOUR * 60;
    }

    private _updateNextScanTime(): void {
        const next = this._computeNextScanTime();
        runInAction(() => { this.nextScanTime = next; });
    }

    private _computeNextScanTime(): Date {
        const et = this._getETComponents();
        const totalMinutes = et.hours * 60 + et.minutes;
        const openTotal = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
        const triggerTotal = SCAN_TRIGGER_HOUR * 60 + SCAN_TRIGGER_MINUTE;
        const closeTotal = MARKET_CLOSE_HOUR * 60;

        // Find minutes until next scan within today or next weekday
        let daysAhead = 0;
        let targetMinutes: number | null = null;

        for (let d = 0; d <= 7; d++) {
            const checkDay = (et.dayOfWeek + d) % 7;
            if (checkDay === 0 || checkDay === 6) continue; // skip weekends

            if (d === 0) {
                // Today: find the next 30-min slot after now
                const elapsedSinceOpen = totalMinutes - openTotal;
                if (totalMinutes < triggerTotal) {
                    targetMinutes = triggerTotal;
                } else if (totalMinutes < closeTotal) {
                    const nextSlot = Math.ceil((elapsedSinceOpen + 1) / AUTO_SCAN_INTERVAL_MINUTES)
                        * AUTO_SCAN_INTERVAL_MINUTES + openTotal;
                    if (nextSlot < closeTotal) {
                        targetMinutes = nextSlot;
                    }
                }
            } else {
                targetMinutes = triggerTotal;
                daysAhead = d;
            }

            if (targetMinutes !== null) break;
        }

        const now = new Date();
        const etOffsetMs = this._getETOffsetMs();
        // Reconstruct next scan as UTC Date
        // Start from today midnight UTC, adjust for ET offset, add days + targetMinutes
        const todayMidnightUTC = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
        ));
        const nextUTC = new Date(
            todayMidnightUTC.getTime() +
            daysAhead * 24 * 60 * 60 * 1000 +
            (targetMinutes ?? triggerTotal) * 60 * 1000 +
            etOffsetMs
        );
        return nextUTC;
    }

    /** Returns the current time broken down in Eastern Time. */
    private _getETComponents(): IETComponents {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);

        const byType: Record<string, string> = {};
        for (const p of parts) byType[p.type] = p.value;

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return {
            dayOfWeek: dayNames.indexOf(byType['weekday'] ?? 'Mon'),
            hours: parseInt(byType['hour'] ?? '0', 10),
            minutes: parseInt(byType['minute'] ?? '0', 10),
        };
    }

    /** Returns the UTC offset for Eastern Time in milliseconds (negative = behind UTC). */
    private _getETOffsetMs(): number {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const etHour = parseInt(new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            hour12: false,
        }).formatToParts(now).find(p => p.type === 'hour')?.value ?? '0', 10);

        const offsetHours = utcHour - etHour;
        return offsetHours * 60 * 60 * 1000;
    }
}

interface IETComponents {
    dayOfWeek: number; // 0=Sun, 6=Sat
    hours: number;
    minutes: number;
}

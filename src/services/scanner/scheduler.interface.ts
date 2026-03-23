export interface ISchedulerService {
    readonly isScheduled: boolean;
    readonly nextScanTime: Date | null;

    /** Start the scheduler: triggers scan at 9:35 AM ET and every 30 min during market hours. */
    startScheduler(): void;
    /** Stop all scheduled scan timers. */
    stopScheduler(): void;
    /** Manually trigger an immediate scan. */
    triggerManualScan(): Promise<void>;
}

import { makeObservable, observable, action, runInAction } from 'mobx';
import type { IServiceFactory } from '../service-factory.interface';
import type { IOpportunity, IScannerService } from './scanner.service.interface';
import { RawLocalStorageKeys } from '../storage/raw-local-storage/raw-local-storage-keys';

/**
 * ScannerService stub — Phase 1 scaffold.
 * GUV-86 will implement the full IV screener + IC builder logic.
 * This stub provides the observable shape needed by ScannerPage.
 */
export class ScannerService implements IScannerService {
    opportunities: IOpportunity[] = [];
    isScanning = false;
    lastScanTime: Date | null = null;
    autoScanEnabled = false;

    private readonly _services: IServiceFactory;

    constructor(services: IServiceFactory) {
        this._services = services;

        makeObservable(this, {
            opportunities: observable,
            isScanning: observable,
            lastScanTime: observable,
            autoScanEnabled: observable,
            setAutoScanEnabled: action,
            runScan: action,
            rejectOpportunity: action,
        });

        // Restore auto-scan preference
        const saved = this._services.rawLocalStorage.getItem(RawLocalStorageKeys.scannerAutoScanEnabled);
        if (saved === 'true') {
            this.autoScanEnabled = true;
        }
    }

    setAutoScanEnabled(enabled: boolean): void {
        this.autoScanEnabled = enabled;
        this._services.rawLocalStorage.setItem(RawLocalStorageKeys.scannerAutoScanEnabled, String(enabled));
    }

    async runScan(): Promise<void> {
        if (this.isScanning) return;

        runInAction(() => {
            this.isScanning = true;
        });

        try {
            // GUV-86 will replace this with real IV screening + IC building
            await new Promise<void>((resolve) => setTimeout(resolve, 1500));

            runInAction(() => {
                this.lastScanTime = new Date();
            });
        } finally {
            runInAction(() => {
                this.isScanning = false;
            });
        }
    }

    async approveOpportunity(id: string): Promise<void> {
        const opp = this.opportunities.find((o) => o.id === id);
        if (!opp) return;

        runInAction(() => {
            opp.status = 'approved';
        });

        // GUV-86 will wire this to IronCondorModel.sendOrder()
        this._services.logger.info(`[ScannerService] Approved opportunity ${id} — order submission pending GUV-86`);
    }

    rejectOpportunity(id: string): void {
        const idx = this.opportunities.findIndex((o) => o.id === id);
        if (idx !== -1) {
            this.opportunities.splice(idx, 1);
        }
    }
}

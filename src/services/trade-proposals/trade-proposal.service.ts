import { makeObservable, observable, action, runInAction } from 'mobx';
import { ServiceBase } from '../service-base';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ITradeProposal,
    ITradeProposalService,
    INewProposal,
    TradeProposalStatus,
} from './trade-proposal.interface';
import { RawLocalStorageKeys } from '../storage/raw-local-storage/raw-local-storage-keys';

const EXPIRE_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const DEFAULT_EXPIRY_MS  = 2 * 60 * 60 * 1000; // 2 hours
const MAX_POSITION_PCT   = 5; // max 5% of net liquidity per trade (CLAUDE.md)

/** Serializable form stored in localStorage — no live ironCondor reference. */
interface IStoredProposal {
    id: string;
    ticker: string;
    scannedAt: string;
    expiresAt: string;
    status: TradeProposalStatus;
    scores: { pop: number; ev: number; alpha: number; credit: number };
}

export class TradeProposalService extends ServiceBase implements ITradeProposalService {

    proposals: ITradeProposal[] = [];

    private _intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            proposals: observable,
            addProposals: action,
            rejectProposal: action,
            expireStale: action,
        });
        this._loadFromStorage();
        this._intervalId = setInterval(() => this.expireStale(), EXPIRE_INTERVAL_MS);
    }

    addProposals(newProposals: INewProposal[]): void {
        const now = new Date();
        const updated = [...this.proposals];

        for (const p of newProposals) {
            const expDate = p.ironCondor.stoPut.expirationDate;
            const existingIdx = updated.findIndex(
                x => x.ticker === p.ticker &&
                     x.ironCondor?.stoPut.expirationDate === expDate &&
                     x.status === 'pending'
            );
            if (existingIdx !== -1) {
                // Upsert: refresh scores, timestamp, and live IC reference in place
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    ironCondor: p.ironCondor,
                    scannedAt: now,
                    expiresAt: p.expiresAt ?? new Date(now.getTime() + DEFAULT_EXPIRY_MS),
                    scores: { ...p.scores },
                };
            } else {
                updated.push({
                    id: `${p.ticker}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
                    ticker: p.ticker,
                    ironCondor: p.ironCondor,
                    scannedAt: now,
                    expiresAt: p.expiresAt ?? new Date(now.getTime() + DEFAULT_EXPIRY_MS),
                    status: 'pending' as TradeProposalStatus,
                    scores: { ...p.scores },
                });
            }
        }

        this.proposals = updated;
        this._saveToStorage();
    }

    async approveProposal(id: string): Promise<void> {
        const proposal = this.proposals.find(p => p.id === id);
        if (!proposal || proposal.status !== 'pending') return;

        if (!proposal.ironCondor) {
            this.services.logger.warning(
                'TradeProposalService: live IC model unavailable after page refresh — marking proposal stale'
            );
            runInAction(() => {
                const idx = this.proposals.findIndex(p => p.id === id);
                if (idx !== -1) {
                    this.proposals = [
                        ...this.proposals.slice(0, idx),
                        { ...this.proposals[idx], status: 'stale' as TradeProposalStatus },
                        ...this.proposals.slice(idx + 1),
                    ];
                }
            });
            this._saveToStorage();
            return;
        }

        const netLiq = this.services.brokerAccount.currentAccount?.balances?.netLiquidity ?? 0;
        const maxRisk = netLiq * (MAX_POSITION_PCT / 100);
        const maxRiskPerContract = proposal.ironCondor.maxLoss;
        const quantity = maxRisk > 0 && maxRiskPerContract > 0
            ? Math.max(1, Math.floor(maxRisk / maxRiskPerContract))
            : 1;

        await proposal.ironCondor.sendOrder({
            quantity,
            timeInForce: 'Day',
            orderType: 'Limit',
        });

        runInAction(() => {
            const idx = this.proposals.findIndex(p => p.id === id);
            if (idx !== -1) {
                this.proposals = [
                    ...this.proposals.slice(0, idx),
                    { ...this.proposals[idx], status: 'executed' as TradeProposalStatus },
                    ...this.proposals.slice(idx + 1),
                ];
            }
        });
        this._saveToStorage();
    }

    rejectProposal(id: string): void {
        const idx = this.proposals.findIndex(p => p.id === id);
        if (idx === -1 || this.proposals[idx].status !== 'pending') return;
        this.proposals = [
            ...this.proposals.slice(0, idx),
            { ...this.proposals[idx], status: 'rejected' as TradeProposalStatus },
            ...this.proposals.slice(idx + 1),
        ];
        this._saveToStorage();
    }

    expireStale(): void {
        const now = new Date();
        let changed = false;
        const updated = this.proposals.map(p => {
            if (p.status === 'pending' && p.expiresAt <= now) {
                changed = true;
                return { ...p, status: 'expired' as TradeProposalStatus };
            }
            return p;
        });
        if (changed) {
            this.proposals = updated;
            this._saveToStorage();
        }
    }

    private _loadFromStorage(): void {
        const stored = this.services.rawLocalStorage.getJson<IStoredProposal[]>(
            RawLocalStorageKeys.tradeProposals
        );
        if (!stored || !Array.isArray(stored)) return;

        runInAction(() => {
            this.proposals = stored.map(s => ({
                id: s.id,
                ticker: s.ticker,
                ironCondor: undefined,
                scannedAt: new Date(s.scannedAt),
                expiresAt: new Date(s.expiresAt),
                status: s.status,
                scores: s.scores,
            }));
        });
        // Expire anything that already passed
        this.expireStale();
    }

    private _saveToStorage(): void {
        const storable: IStoredProposal[] = this.proposals.map(p => ({
            id: p.id,
            ticker: p.ticker,
            scannedAt: p.scannedAt.toISOString(),
            expiresAt: p.expiresAt.toISOString(),
            status: p.status,
            scores: { ...p.scores },
        }));
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.tradeProposals, storable);
    }
}

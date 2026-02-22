import { makeObservable, observable, runInAction } from "mobx";
import { ServiceBase } from "../service-base";
import { IServiceFactory } from "../service-factory.interface";
import {
    IPositionsService,
    IPositionViewModel,
    IPositionConflict,
    IStrategyLegForConflictCheck
} from "./positions.service.interface";

export class PositionsService extends ServiceBase implements IPositionsService {
    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            positions: observable.ref,
            isLoading: observable.ref
        });
    }

    positions: IPositionViewModel[] = [];
    isLoading: boolean = false;

    async loadPositions(underlyingSymbol: string): Promise<void> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) {
            return;
        }

        runInAction(() => {
            this.isLoading = true;
        });

        try {
            const rawPositions = await this.services.marketDataProvider.getPositions(
                account.accountNumber,
                underlyingSymbol
            );

            runInAction(() => {
                this.positions = rawPositions.map(pos => ({
                    symbol: pos.symbol,
                    underlyingSymbol: pos.underlyingSymbol,
                    quantity: pos.quantity,
                    quantityDirection: pos.quantityDirection,
                    strikePrice: pos.strikePrice,
                    optionType: pos.optionType,
                    expirationDate: pos.expirationDate
                }));
            });
        } catch (error) {
            console.error('Failed to load positions:', error);
            runInAction(() => {
                this.positions = [];
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    clearPositions(): void {
        runInAction(() => {
            this.positions = [];
        });
    }

    getPositionsForExpiration(expirationDate: string): IPositionViewModel[] {
        return this.positions.filter(pos => pos.expirationDate === expirationDate);
    }

    checkStrategyConflict(strategyLegs: IStrategyLegForConflictCheck[]): IPositionConflict | null {
        if (this.positions.length === 0 || strategyLegs.length === 0) {
            return null;
        }

        // Get the expiration date from strategy legs (they should all be the same)
        const strategyExpiration = strategyLegs[0].expirationDate;
        const positionsForExpiration = this.getPositionsForExpiration(strategyExpiration);

        if (positionsForExpiration.length === 0) {
            return null;
        }

        // Check for same strike and expiration conflicts only
        const sameStrikeConflicts: IPositionViewModel[] = [];
        for (const leg of strategyLegs) {
            const conflictingPosition = positionsForExpiration.find(
                pos => pos.strikePrice === leg.strikePrice && pos.optionType === leg.optionType
            );
            if (conflictingPosition && !sameStrikeConflicts.includes(conflictingPosition)) {
                sameStrikeConflicts.push(conflictingPosition);
            }
        }

        if (sameStrikeConflicts.length > 0) {
            const strikes = sameStrikeConflicts.map(p => `${p.strikePrice}${p.optionType}`).join(', ');
            return {
                type: 'same-strike',
                message: `Existing position at: ${strikes}`,
                existingPositions: sameStrikeConflicts
            };
        }

        return null;
    }
}

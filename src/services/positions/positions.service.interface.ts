import { IPositionRawData } from "../market-data-provider/market-data-provider.service.interface";

export interface IPositionViewModel {
    symbol: string;
    underlyingSymbol: string;
    quantity: number;
    quantityDirection: 'Long' | 'Short';
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;
}

export interface IPositionConflict {
    type: 'same-strike';
    message: string;
    existingPositions: IPositionViewModel[];
}

export interface IPositionsService {
    readonly positions: IPositionViewModel[];
    readonly isLoading: boolean;
    loadPositions(underlyingSymbol: string): Promise<void>;
    clearPositions(): void;
    getPositionsForExpiration(expirationDate: string): IPositionViewModel[];
    checkStrategyConflict(strategyLegs: IStrategyLegForConflictCheck[]): IPositionConflict | null;
}

export interface IStrategyLegForConflictCheck {
    strikePrice: number;
    optionType: 'C' | 'P';
    expirationDate: string;
    action: 'BTO' | 'STO';
}

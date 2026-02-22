
export interface ISettingsService {
    readonly strategyFilters: IStrategyFiltersViewModel;
}


export type ByEarningsDate = 'before' | 'after' | 'all';

export interface IStrategyFiltersViewModel {
    minDelta: number;
    maxDelta: number;
    maxRiskRewardRatio: number;
    minDaysToExpiration: number;
    maxDaysToExpiration: number;
    maxBidAskSpread: number;
    wings: number[];
    readonly availableWings: number[];
    byEarningsDate: ByEarningsDate;
    readonly lastUpdate: number;
}


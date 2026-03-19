
export interface ISettingsService {
    readonly strategyFilters: IStrategyFiltersViewModel;
}


export type ByEarningsDate = 'before' | 'after' | 'all';

/**
 * IC type bias:
 * - symmetric: equal wings on both sides (standard IC)
 * - bullish:   wider put spread, narrower call spread (more room on the downside)
 * - bearish:   wider call spread, narrower put spread (more room on the upside)
 */
export type IcType = 'symmetric' | 'bullish' | 'bearish';

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
    /** Minimum probability of profit (%). Condors below this are hidden. */
    minPop: number;
    /** Minimum Expected Value per contract ($). Condors below this are hidden. */
    minExpectedValue: number;
    /** Minimum Alpha (%). Condors below this are hidden. */
    minAlpha: number;
    /** IC type bias — controls wing asymmetry suggestion */
    icType: IcType;
    /** Minimum credit received ($). Condors below this are hidden. */
    minCredit: number;
}


export type StrategyProfileType = 'conservative' | 'neutral' | 'aggressive';

export interface IStrategyProfile {
    type: StrategyProfileType;
    name: string;
    color: string;
    wings: number[];
    minDelta: number;
    maxDelta: number;
    minDTE: number;
    maxDTE: number;
    minPOP: number;
    maxRiskRewardRatio: number;
    maxBidAskSpread: number;
    minCredit: number;
    scoring: {
        popWeight: number;
        evWeight: number;
        alphaWeight: number;
    };
    exitProfitPercent: number;
}

export const STRATEGY_PROFILES: Record<StrategyProfileType, IStrategyProfile> = {
    conservative: {
        type: 'conservative',
        name: 'Conservative',
        color: '#4dff91',
        wings: [10],
        minDelta: 13,
        maxDelta: 18,
        minDTE: 28,
        maxDTE: 47,
        minPOP: 75,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 1,
        scoring: { popWeight: 0.70, evWeight: 0.20, alphaWeight: 0.10 },
        exitProfitPercent: 50,
    },
    neutral: {
        type: 'neutral',
        name: 'Neutral',
        color: '#4a9eff',
        wings: [10],
        minDelta: 11,
        maxDelta: 24,
        minDTE: 19,
        maxDTE: 47,
        minPOP: 60,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 1,
        scoring: { popWeight: 0.60, evWeight: 0.25, alphaWeight: 0.15 },
        exitProfitPercent: 75,
    },
    aggressive: {
        type: 'aggressive',
        name: 'Aggressive',
        color: '#ff8c00',
        wings: [5],
        minDelta: 15,
        maxDelta: 24,
        minDTE: 19,
        maxDTE: 35,
        minPOP: 60,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 1,
        scoring: { popWeight: 0.40, evWeight: 0.35, alphaWeight: 0.25 },
        exitProfitPercent: 90,
    },
};

export function computeCompositeScore(
    ic: { pop: number; expectedValue: number; alpha: number },
    profile: IStrategyProfile
): number {
    const normalizedEV = Math.min(Math.max(ic.expectedValue / 10, -10), 10);
    const normalizedAlpha = Math.min(Math.max(ic.alpha, -10), 10);
    return (ic.pop * profile.scoring.popWeight)
         + (normalizedEV * profile.scoring.evWeight)
         + (normalizedAlpha * profile.scoring.alphaWeight);
}

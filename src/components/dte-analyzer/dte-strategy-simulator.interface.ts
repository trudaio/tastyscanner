export interface IStrategyDefinition {
    id: string;
    label: string;
    entryDte: number;
    exitDte: number;
    delta: number;       // target delta for this strategy
    color: string;
}

export interface IStrategyResult {
    strategy: IStrategyDefinition;
    // Entry leg
    entryDte: number;
    entryStrike: number;
    entryPremium: number;
    entryDelta: number;
    entryTheta: number;
    entryGamma: number;
    // Exit leg
    exitDte: number;
    exitPremium: number;
    exitDelta: number;
    exitTheta: number;
    exitGamma: number;
    // Computed
    capturedPremium: number;
    capturePercent: number;
    daysInTrade: number;
    capturedPerDay: number;
    thetaEfficiency: number;
    gammaRisk: number;
    riskAdjustedScore: number;
    found: boolean;
}

export const DEFAULT_STRATEGIES: IStrategyDefinition[] = [
    { id: 'conservative', label: 'Conservative', entryDte: 45, exitDte: 25, delta: 16, color: '#1a73e8' },
    { id: 'standard', label: 'Standard', entryDte: 35, exitDte: 21, delta: 16, color: '#16a34a' },
    { id: 'aggressive', label: 'Aggressive', entryDte: 21, exitDte: 5, delta: 16, color: '#e53935' },
];

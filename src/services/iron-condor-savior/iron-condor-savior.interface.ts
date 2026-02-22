export interface ISaviorSearchParams {
    symbol: string;
    minDTE: number;
    maxDTE: number;
    targetCredit: number; // The credit needed to cover the loss
}

export interface ISaviorIronCondor {
    readonly key: string;
    readonly expirationDate: string;
    readonly daysToExpiration: number;

    // Put spread
    readonly longPutStrike: number;
    readonly shortPutStrike: number;
    readonly putSpreadCredit: number;

    // Call spread
    readonly shortCallStrike: number;
    readonly longCallStrike: number;
    readonly callSpreadCredit: number;

    // Totals
    readonly totalCredit: number;
    readonly wingsWidth: number;
    readonly maxLoss: number;

    // Greeks & Metrics
    readonly pop: number;
    readonly delta: number;
    readonly theta: number;
    readonly riskRewardRatio: number;

    // Does it meet target?
    readonly meetsTarget: boolean;
    readonly creditAboveTarget: number; // How much extra credit above target

    // For sending order
    sendOrder(quantity: number): Promise<void>;
}

export interface IIronCondorSaviorService {
    // State
    readonly isLoading: boolean;
    readonly searchParams: ISaviorSearchParams | null;
    readonly results: ISaviorIronCondor[];
    readonly currentPrice: number;

    // Actions
    search(params: ISaviorSearchParams): Promise<void>;
    clearResults(): void;
}

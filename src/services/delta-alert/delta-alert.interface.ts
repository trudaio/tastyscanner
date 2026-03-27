export interface IDeltaAlertLeg {
    readonly symbol: string;          // underlying symbol (e.g. "SPY")
    readonly streamerSymbol: string;   // dxFeed symbol for the option leg
    readonly optionType: 'C' | 'P';
    readonly strikePrice: number;
    readonly expirationDate: string;
    readonly dte: number;              // days to expiration
    readonly underlyingPrice: number | null;  // current underlying price
    readonly strikeDistance: number | null;    // % distance from underlying (negative = ITM)
    readonly initialDelta: number | null;  // from trade log, null if unknown
    readonly currentDelta: number;
    readonly deltaRatio: number | null;    // currentDelta / initialDelta, null if no initial
}

export interface IDeltaAlertService {
    readonly alerts: IDeltaAlertLeg[];
    readonly isLoading: boolean;
    refresh(): void;
    dispose(): void;
    startBackgroundMonitoring(): void;
    stopBackgroundMonitoring(): void;
}

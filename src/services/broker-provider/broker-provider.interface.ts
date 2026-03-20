// ── Broker type enum ─────────────────────────────────────────────────────────
export enum BrokerType {
    TastyTrade = 'tastytrade',
    IBKR = 'ibkr',
}

// ── Per-broker credential shapes ─────────────────────────────────────────────
export interface ITastyTradeCredentials {
    brokerType: BrokerType.TastyTrade;
    clientSecret: string;
    refreshToken: string;
}

export interface IIBKRCredentials {
    brokerType: BrokerType.IBKR;
    gatewayUrl: string;
    accountId: string;
}

/** Discriminated union — narrow via .brokerType */
export type IBrokerCredentials = ITastyTradeCredentials | IIBKRCredentials;

// ── Generic broker session abstraction ───────────────────────────────────────
export interface IBrokerProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getType(): BrokerType;
}

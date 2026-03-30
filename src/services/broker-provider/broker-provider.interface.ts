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
    /** 'gateway' = CP Gateway running locally at gatewayUrl (no OAuth needed)
     *  'cloud'   = IBKR Cloud API at api.ibkr.com (OAuth 2.0) */
    mode: 'gateway' | 'cloud';
    gatewayUrl: string;   // used when mode === 'gateway', e.g. https://localhost:5000
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

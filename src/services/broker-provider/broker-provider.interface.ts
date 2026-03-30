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
    /** 'gateway' = CP Gateway running locally at gatewayUrl (cookie auth)
     *  'cloud'   = IBKR Cloud API at api.ibkr.com (OAuth Bearer token) */
    mode: 'gateway' | 'cloud';
    gatewayUrl: string;   // used when mode === 'gateway', e.g. https://localhost:5000
    accountId: string;
    /** OAuth access token — only used in cloud mode */
    accessToken?: string;
    /** OAuth refresh token — only used in cloud mode, stored encrypted in Firestore */
    ibkrRefreshToken?: string;
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

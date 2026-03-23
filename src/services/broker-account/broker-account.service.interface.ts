export interface IAccountBalances {
    netLiquidity: number;
    optionBuyingPower: number;
    stockBuyingPower: number;
    cashBalance: number;
    pendingCash: number;
    dayTradingBuyingPower: number;
    maintenanceRequirement: number;
}

export interface IPortfolioGreeks {
    delta: number;
    theta: number;
    gamma: number;
    vega: number;
}

/** Portfolio delta alert threshold. Notify when |portfolio delta| exceeds this value. */
export const PORTFOLIO_DELTA_ALERT_THRESHOLD = 50;

export interface IBrokerAccountViewModel {
    accountNumber: string;
    balances: IAccountBalances | null;
    isLoadingBalances: boolean;
    portfolioGreeks: IPortfolioGreeks | null;
    isLoadingPortfolioGreeks: boolean;
    /** True when |portfolio delta| > PORTFOLIO_DELTA_ALERT_THRESHOLD (default 50). */
    isDeltaAlertActive: boolean;
    sendOrder(order: IBrokerOrder): Promise<void>;
    loadBalances(): Promise<void>;
    loadPortfolioGreeks(): Promise<void>;
}

export type OrderType = "Limit" | "Market" | "Marketable Limit" | "Notional Market" | "Stop or Stop Limit"
export type PriceEffect = "Credit" | "Debit";
export type TimeInForce = "Day" | "Ext" | "Ext Overnight"  | "GTC" | "GTC Ext" | "GTC Ext Overnight" | "GTD" | "IOC";
export interface IBrokerOrder {
    price: number;
    priceEffect: PriceEffect;
    orderType: OrderType;
    timeInForce: TimeInForce;
    legs: IBrokerOrderLeg[];

}

export interface IBrokerOrderLeg {
    action: "Allocate" | "Buy" | "Buy to Close" | "Buy to Open" | "Sell" | "Sell to Close" | "Sell to Open";
    instrumentType: "Cryptocurrency" | "Equity" | "Equity Offering" | "Equity Option" | "Fixed Income Security" | "Future" | "Future Option" | "Liquidity Pool";
    quantity: number;
    symbol: string;
}

export interface IBrokerAccountService {
    readonly accounts: IBrokerAccountViewModel[];
    readonly currentAccount: IBrokerAccountViewModel | null;
    setCurrentAccount(accountNumber: string): void;
    reload(): Promise<void>;
}
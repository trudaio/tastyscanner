import {OrderType, TimeInForce} from "../services/broker-account/broker-account.service.interface";
import {IOptionsStrategyLegViewModel} from "./options-strategy-leg.view-model.interface";
import {IPositionConflict} from "../services/positions/positions.service.interface";


export interface IOptionsStrategyViewModel {
    readonly strategyName: string;
    readonly key: string;
    readonly wingsWidth: number;
    readonly credit: number;
    readonly riskRewardRatio: number;
    readonly pop: number;
    readonly delta: number;
    readonly theta: number;
    readonly legs: IOptionsStrategyLegViewModel[];
    readonly positionConflict: IPositionConflict | null;
    /** Max profit per contract (credit × 100) */
    readonly maxProfit: number;
    /** Max loss per contract ((wingsWidth - credit) × 100) */
    readonly maxLoss: number;
    /**
     * Expected Value per contract.
     * EV = (POP/100 × maxProfit) - ((1 - POP/100) × maxLoss)
     * Positive EV = trade has statistical edge.
     */
    readonly expectedValue: number;
    /**
     * Alpha = EV / maxLoss × 100 (EV as % of max risk).
     * Measures return per unit of risk. Higher is better.
     */
    readonly alpha: number;
    sendOrder(options: IOptionsStrategySendOrderParams): Promise<void>;
}


export interface IOptionsStrategySendOrderParams {
    quantity: number;
    price?: number;
    timeInForce: TimeInForce;
    orderType: OrderType;
}
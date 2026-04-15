import {OptionModel} from "./option.model";
import {IIronCondorViewModel} from "./iron-condor.view-model.interface";
import {IServiceFactory} from "../services/service-factory.interface";
import {IOptionsStrategySendOrderParams} from "./options-strategy.view-model.interface";
import {OptionsStrategyLegModel} from "./options-strategy-leg.model";
import {IPositionConflict, IStrategyLegForConflictCheck} from "../services/positions/positions.service.interface";

export class IronCondorModel implements IIronCondorViewModel {
    constructor(public readonly wingsWidth: number,
                public readonly btoPut: OptionModel,
                public readonly stoPut: OptionModel,
                public readonly stoCall: OptionModel,
                public readonly btoCall: OptionModel,
                private readonly services: IServiceFactory) {
    }

    get strategyName(): string {
        return "Iron Condor";
    }

    get key(): string {
        return `${this.wingsWidth}${this.btoPut.strikePrice}${this.stoPut.strikePrice}${this.stoCall.strikePrice}${this.btoCall.strikePrice}`;
    }

    get credit(): number {
        const val = this.stoPut.midPrice + this.stoCall.midPrice - this.btoCall.midPrice - this.btoPut.midPrice;
        return Math.round(val * 100) / 100;
    }

    get riskRewardRatio(): number {
        if (this.credit <= 0) return 999;
        const rr = (this.wingsWidth - this.credit) / this.credit;
        return Math.round(rr * 100) / 100;
    }


    //https://www.tastylive.com/shows/options-jive/episodes/calculating-pop-for-various-strategies-08-23-2017#:~:text=For%20Various%20Strategies-,Aug%2023%2C%202017,look%20at%20calculating%20POP%20in:
    get pop(): number {
        const putBreakEven = this.stoPut.strikePrice - this.credit;
        const callBreakEven = this.stoCall.strikePrice + this.credit;

        const breakEvenPut = this.stoPut.strike.expiration.getStrikeBelow(putBreakEven)?.put
        const breakEvenCall = this.stoCall.strike.expiration.getStrikeAbove(callBreakEven)?.call;


        const putBreakEventDelta = breakEvenPut?.absoluteDeltaPercent ?? 50;
        const callBreakEventDelta = breakEvenCall?.absoluteDeltaPercent ?? 50;

        return 100 - Math.max(putBreakEventDelta, callBreakEventDelta);


    }

    /**
     * Net position delta for a short IC.
     * Short leg contributes -option.delta; long leg contributes +option.delta.
     */
    get netDelta(): number {
        return this.btoPut.delta + this.btoCall.delta - this.stoPut.delta - this.stoCall.delta;
    }

    /**
     * Net position theta. For a short IC with realistic raw option thetas
     * (all negative per convention), this returns a POSITIVE value — theta
     * is being collected. Long legs keep sign; short legs flip.
     */
    get netTheta(): number {
        return this.btoPut.theta + this.btoCall.theta - this.stoPut.theta - this.stoCall.theta;
    }

    /** Net position gamma (negative for short IC — we're short gamma). */
    get netGamma(): number {
        return this.btoPut.gamma + this.btoCall.gamma - this.stoPut.gamma - this.stoCall.gamma;
    }

    /** Net position vega (negative for short IC — we benefit from IV crush). */
    get netVega(): number {
        return this.btoPut.vega + this.btoCall.vega - this.stoPut.vega - this.stoCall.vega;
    }

    /** Mean of IV across the two short strikes (the ones that define the credit). */
    get avgShortIV(): number {
        return (this.stoPut.iv + this.stoCall.iv) / 2;
    }

    /** Underlying spot price at the time of IC construction. */
    get underlyingPrice(): number {
        return this.btoPut.strike.ticker.currentPrice;
    }

    get legs(): OptionsStrategyLegModel[] {
        return [
            new OptionsStrategyLegModel(this.btoPut, "BTO"),
            new OptionsStrategyLegModel(this.stoPut, "STO"),
            new OptionsStrategyLegModel(this.stoCall, "STO"),
            new OptionsStrategyLegModel(this.btoCall, "BTO"),
        ]
    }

    async sendOrder(orderParams: IOptionsStrategySendOrderParams): Promise<void> {
        const account = this.services.brokerAccount.currentAccount;
        //TODO show error
        if (!account) {
            return;
        }

        const tradeId = crypto.randomUUID();
        if (orderParams.ticker) {
            await this.services.tradeJournal.captureEntry(this, orderParams.ticker, tradeId);
        }

        try {
            await account.sendOrder({
                price: orderParams.price ?? this.credit,
                priceEffect: "Credit",
                timeInForce: orderParams.timeInForce,
                orderType: orderParams.orderType,
                legs: [
                    { instrumentType: "Equity Option", action: "Buy to Open",  quantity: orderParams.quantity, symbol: this.btoPut.id  },
                    { instrumentType: "Equity Option", action: "Sell to Open", quantity: orderParams.quantity, symbol: this.stoPut.id  },
                    { instrumentType: "Equity Option", action: "Sell to Open", quantity: orderParams.quantity, symbol: this.stoCall.id },
                    { instrumentType: "Equity Option", action: "Buy to Open",  quantity: orderParams.quantity, symbol: this.btoCall.id },
                ],
            });
        } catch (err) {
            if (orderParams.ticker) {
                await this.services.tradeJournal.markOrphan(tradeId);
            }
            throw err;
        }
    }

    get maxProfit(): number {
        return Math.round(this.credit * 100 * 100) / 100;
    }

    get maxLoss(): number {
        return Math.round((this.wingsWidth - this.credit) * 100 * 100) / 100;
    }

    get expectedValue(): number {
        const popDecimal = this.pop / 100;
        const ev = (popDecimal * this.maxProfit) - ((1 - popDecimal) * this.maxLoss);
        return Math.round(ev * 100) / 100;
    }

    get alpha(): number {
        if (this.maxLoss === 0) return 0;
        return Math.round((this.expectedValue / this.maxLoss) * 10000) / 100;
    }

    get delta(): number {
        return  Math.round((this.stoPut.absoluteRawDelta + this.btoCall.absoluteRawDelta - this.btoPut.absoluteRawDelta - this.stoCall.absoluteRawDelta) * 10000) / 100;
    }

    get theta(): number {
        return Math.round((this.btoPut.theta + this.btoCall.theta - this.stoPut.theta - this.stoCall.theta) * 10000) / 100;
    }

    get positionConflict(): IPositionConflict | null {
        const strategyLegs: IStrategyLegForConflictCheck[] = [
            { strikePrice: this.btoPut.strikePrice, optionType: 'P', expirationDate: this.btoPut.expirationDate, action: 'BTO' },
            { strikePrice: this.stoPut.strikePrice, optionType: 'P', expirationDate: this.stoPut.expirationDate, action: 'STO' },
            { strikePrice: this.stoCall.strikePrice, optionType: 'C', expirationDate: this.stoCall.expirationDate, action: 'STO' },
            { strikePrice: this.btoCall.strikePrice, optionType: 'C', expirationDate: this.btoCall.expirationDate, action: 'BTO' },
        ];
        return this.services.positions.checkStrategyConflict(strategyLegs);
    }

}
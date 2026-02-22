import {TickerModel} from "./ticker.model";
import {IOptionViewModel} from "./option.view-model.interface";
import {Check} from "../utils/type-checking";
import {OptionStrikeModel} from "./option-strike.model";
import {
    IGreeksRawData,
    IQuoteRawData,
    ITradeRawData
} from "../services/market-data-provider/market-data-provider.service.interface";
import {IServiceFactory} from "../services/service-factory.interface";
import {computed, makeObservable} from "mobx";

export abstract class OptionModel implements IOptionViewModel {
    constructor(public readonly id: string,
                public readonly streamerSymbol: string,
                public readonly strike: OptionStrikeModel) {

        makeObservable(this, {
            tradeData: computed,
            quoteData: computed,
            greeksData: computed
        })
    }

    abstract get isOutOfMoney(): boolean;
    abstract get optionType(): string;

    protected get ticker(): TickerModel {
        return this.strike.ticker;
    }

    get services(): IServiceFactory {
        return this.ticker.services;
    }

    get tradeData(): ITradeRawData | undefined {
        return this.ticker.getSymbolTrade(this.streamerSymbol);
    }

    get quoteData(): IQuoteRawData | undefined {
        return this.ticker.getSymbolQuote(this.streamerSymbol);
    }

    get greeksData(): IGreeksRawData | undefined {
        return this.ticker.getSymbolGreeks(this.streamerSymbol);
    }


    get expirationDate(): string {
        return this.strike.expiration.expirationDate;
    }

    get daysToExpiration(): number {
        return this.strike.expiration.daysToExpiration;
    }

    get strikePrice(): number {
        return this.strike.strikePrice;
    }

    get lastPrice(): number {
        const p = this.tradeData?.price || 0;
        if(Check.isNumber(p)) {
            return p;
        }

        return 0;
    }

    get bidPrice(): number {
        return this.quoteData?.bidPrice ?? 0;
    }

    get askPrice(): number {
        return this.quoteData?.askPrice ?? 0;
    }

    get midPrice(): number {
        return Math.round(((this.bidPrice + this.askPrice) / 2) * 100) / 100;
    }


    get bidAskSpread(): number {
        if(this.bidPrice === 0) {
            return 999999;
        }
        return ((this.askPrice - this.bidPrice) / this.bidPrice) * 100;
    }

    get rawDelta(): number {
        return this.greeksData?.delta ?? 0;


    }
    get absoluteRawDelta(): number {
        return Math.abs(this.rawDelta);
    }

    get deltaPercent(): number {
        const delta = this.greeksData?.delta;
        if(Check.isNullOrUndefined(delta)) {
            return 0;
        }
        return Math.round(this.rawDelta * 100);
    }

    get absoluteDeltaPercent(): number {
        return Math.abs(this.deltaPercent);
    }

    get theta(): number {
        return this.greeksData?.theta ?? 0;
    }

    get volatility(): number {
        return this.greeksData?.volatility ?? 0;
    }
}

export class PutOptionModel extends OptionModel {
    get optionType(): string {
        return "P";
    }

    get isOutOfMoney(): boolean {
        return this.strike.strikePrice < this.ticker.currentPrice;
    }
}

export class CallOptionModel extends OptionModel {
    get optionType(): string {
        return "C";
    }
    get isOutOfMoney(): boolean {
        return this.strike.strikePrice > this.ticker.currentPrice;
    }
}
import {OptionModel} from "./option.model";
import {TickerModel} from "./ticker.model";
import {OptionStrikeModel} from "./option-strike.model";
import {
    IOptionsExpirationVewModel,
    OptionExpirationSettlementType,
    OptionExpirationTypeEnum
} from "./options-expiration.view-model.interface";
import {IronCondorModel} from "./iron-condor.model";
import {computed, makeObservable } from "mobx";
import {StrategiesBuilder} from "./strategies-builder";
import {IServiceFactory} from "../services/service-factory.interface";
import {IOptionsExpirationRawData} from "../services/market-data-provider/market-data-provider.service.interface";
import {PutCreditSpreadModel} from "./put-credit-spread.model";
import {IOptionsStrategyViewModel} from "./options-strategy.view-model.interface";

export class OptionsExpirationModel implements IOptionsExpirationVewModel {
    constructor(private readonly rawData: IOptionsExpirationRawData,
                public readonly ticker: TickerModel) {
        for(const strike of rawData.strikes) {
            this._strikesMap[strike.strikePrice] = new OptionStrikeModel(strike.strikePrice, this, strike.callId, strike.callStreamerSymbol, strike.putId, strike.putStreamerSymbol);
        }

        this._sortedStrikes = Object.values(this._strikesMap).sort((a, b) => a.strikePrice - b.strikePrice);

        this._strategiesBuilder = new StrategiesBuilder(this);

        makeObservable(this, {
            ironCondors: computed,
            putCreditSpreads: computed,
            callCreditSpreads: computed
        });
    }

    private readonly _strategiesBuilder: StrategiesBuilder;

    public get services(): IServiceFactory {
        return this.ticker.services;
    }

    get key(): string {
        return `${this.ticker.symbol}-${this.expirationDate}-${this.daysToExpiration}-${this.expirationType}-${this.settlementType}`;
    }

    get expirationDate(): string {
        return this.rawData.expirationDate;
    }

    get daysToExpiration(): number {
        return this.rawData.daysToExpiration;
    }

    get expirationType(): OptionExpirationTypeEnum {
        return this.rawData.expirationType as OptionExpirationTypeEnum;
    }

    get settlementType(): OptionExpirationSettlementType {
        return this.rawData.settlementType as OptionExpirationSettlementType;
    }

    private readonly _strikesMap: Record<number, OptionStrikeModel> = {};
    private readonly _sortedStrikes: OptionStrikeModel[];

    public get strikes(): OptionStrikeModel[] {
        return this._sortedStrikes;
    }

    getAllSymbols(): string[] {
        return this.strikes.map(s => s.call.streamerSymbol)
                           .concat(this.strikes.map(s => s.put.streamerSymbol));
    }

    public getOTMPuts(): OptionModel[] {
        return this.strikes.filter(s => s.put.isOutOfMoney)
                           .map(s => s.put);
    }

    public getOTMCalls(): OptionModel[] {
        return this.strikes.filter(s => s.call.isOutOfMoney)
                           .map(s => s.call);
    }

    getStrikeByPrice(strikePrice: number): OptionStrikeModel | undefined {
        return this._strikesMap[strikePrice];
    }

    private _filterStrategies<T extends IOptionsStrategyViewModel>(strategies: T[]): T[] {
        return strategies.filter(s => s.riskRewardRatio > 0 && s.riskRewardRatio <= this.services.settings.strategyFilters.maxRiskRewardRatio);
    }

    get ironCondors(): IronCondorModel[] {
        return this._filterStrategies(this._strategiesBuilder.buildIronCondors());
    }

    get putCreditSpreads(): PutCreditSpreadModel[] {
        return this._filterStrategies(this._strategiesBuilder.buildPutCreditSpreads());
    }

    get callCreditSpreads(): PutCreditSpreadModel[] {
        return this._filterStrategies(this._strategiesBuilder.buildCallCreditSpreads());
    }

    getStrikeBelow(strikePrice: number): OptionStrikeModel | null {
        return this._findClosestStrike(strikePrice, true);
    }

    getStrikeAbove(strikePrice: number): OptionStrikeModel | null {
        return this._findClosestStrike(strikePrice, false);
    }

    private _findClosestStrike(strikePrice: number, findGreatest: boolean): OptionStrikeModel | null {

        const strikes = this.strikes;

        if (strikes.length === 0) return null;

        let left = 0;
        let right = strikes.length - 1;
        let result: OptionStrikeModel | null = null;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);

            if (findGreatest) {
                //Find the highest strike that is less than or equal with strikePrice
                if (strikes[mid].strikePrice <= strikePrice) {
                    result = strikes[mid];
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            } else {
                // Find the lower strike that is bigger than or equal with strikePrice
                if (strikes[mid].strikePrice >= strikePrice) {
                    result = strikes[mid];
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }
        }

        return result;
    }



}
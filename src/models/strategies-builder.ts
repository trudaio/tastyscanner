import {OptionsExpirationModel} from "./options-expiration.model";
import {IronCondorModel} from "./iron-condor.model";
import {OptionModel} from "./option.model";
import {IServiceFactory} from "../services/service-factory.interface";
import {PutCreditSpreadModel} from "./put-credit-spread.model";
import {CallCreditSpreadModel} from "./call-credit-spread.model";
import {CreditSpreadModel} from "./credit-spread.model";
import {OptionStrikeModel} from "./option-strike.model";


export class StrategiesBuilder {
    constructor(private readonly expiration: OptionsExpirationModel) {
    }

    get services(): IServiceFactory {
        return this.expiration.services;
    }

    get minDelta(): number {
        return this.services.settings.strategyFilters.minDelta;
    }

    get maxDelta(): number {
        return this.services.settings.strategyFilters.maxDelta;
    }

    get wings(): number[] {
        return this.services.settings.strategyFilters.wings;
    }

    private _filterByDelta(options: OptionModel[]): OptionModel[] {
        return options.filter(o => o.absoluteDeltaPercent >= this.minDelta && o.absoluteDeltaPercent <= this.maxDelta && o.midPrice > 0)
            .sort((a, b) => b.absoluteDeltaPercent - a.absoluteDeltaPercent);
    }

    getPutsByDelta(): OptionModel[] {
        return this._filterByDelta(this.expiration.getOTMPuts());
    }

    getCallsByDelta(): OptionModel[] {
        return this._filterByDelta(this.expiration.getOTMCalls());
    }

    buildIronCondors(): IronCondorModel[] {
        const puts = this.getPutsByDelta().groupByKey(put => put.absoluteDeltaPercent.toString());
        const calls = this.getCallsByDelta().groupByKey(call => call.absoluteDeltaPercent.toString());

        const putsDeltas = Object.keys(puts).map(d => parseFloat(d)).sort((a, b) => b - a);
        const callsDeltas = Object.keys(calls).map(d => parseFloat(d)).sort((a, b) => b - a);

        const condors: IronCondorModel[] = [];

        const maxIndex = Math.min(putsDeltas.length, callsDeltas.length) - 1;

        for(let i = 0; i <= maxIndex; i++) {
            const stoPuts = puts[putsDeltas[i].toString()];
            const stoCalls = calls[callsDeltas[i].toString()];
            for(const stoPut of stoPuts) {
                for(const stoCall of stoCalls) {
                    for(const wingWidth of this.wings) {
                        const btoPut = this.expiration.getStrikeByPrice(stoPut.strike.strikePrice - wingWidth)?.put;
                        if(!btoPut) {
                            continue;
                        }
                        const btoCall = this.expiration.getStrikeByPrice(stoCall.strike.strikePrice + wingWidth)?.call;
                        if(!btoCall) {
                            continue;
                        }
                        if(this._hasGoodBidAskSpread([btoPut, stoPut, stoCall, btoCall])) {
                            condors.push(new IronCondorModel(wingWidth, btoPut, stoPut, stoCall, btoCall, this.services));
                        }

                    }
                }
            }
        }

        return condors.sort((a, b) => a.riskRewardRatio - b.riskRewardRatio);

    }

    buildPutCreditSpreads(): PutCreditSpreadModel[] {
        return this._buildCreditSpreads(this.getPutsByDelta(),
                                        -1,
                                        strike => strike.put,
                                        (spreadSize, stoOption, btoOption) => new PutCreditSpreadModel(spreadSize, stoOption, btoOption, this.services));

    }

    buildCallCreditSpreads(): CallCreditSpreadModel[] {

        return this._buildCreditSpreads(this.getCallsByDelta(),
                                        1,
                                        strike => strike.call,
                                        (spreadSize, stoOption, btoOption) => new CallCreditSpreadModel(spreadSize, stoOption, btoOption, this.services));


    }

    private _buildCreditSpreads<TCreditSpread extends CreditSpreadModel>(options: OptionModel[],
                                                                         wingIncrementSign: -1 | 1,
                                                                         getStrikeOption: (strike: OptionStrikeModel) => OptionModel,
                                                                         createSpread:(spreadSize: number, stoOption: OptionModel, btoOption: OptionModel) => TCreditSpread): TCreditSpread[] {
        const creditSpreads: TCreditSpread[] = [];

        for(let i = 0; i < options.length; i++) {
            const stoOption = options[i];
            if(stoOption.midPrice <= 0) {
                continue;
            }
            for(const wingWidth of this.wings) {
                const strike = this.expiration.getStrikeByPrice(stoOption.strike.strikePrice + (wingIncrementSign * wingWidth));
                if(!strike) {
                    continue;
                }
                const btoOption =  getStrikeOption(strike);
                if(!btoOption || btoOption.midPrice <= 0) {
                    continue;
                }

                if(this._hasGoodBidAskSpread([stoOption, btoOption])) {
                    creditSpreads.push(createSpread(wingWidth, stoOption, btoOption));
                }

            }
        }

        return creditSpreads.sort((a, b) => a.riskRewardRatio - b.riskRewardRatio);
    }

    private _hasGoodBidAskSpread(options: OptionModel[]): boolean {
        return !options.some(o => o.bidAskSpread < 0 || o.bidAskSpread > this.services.settings.strategyFilters.maxBidAskSpread)
    }

}
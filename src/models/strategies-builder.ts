import {OptionsExpirationModel} from "./options-expiration.model";
import {IronCondorModel} from "./iron-condor.model";
import {OptionModel} from "./option.model";
import {IServiceFactory} from "../services/service-factory.interface";
import {PutCreditSpreadModel} from "./put-credit-spread.model";
import {CallCreditSpreadModel} from "./call-credit-spread.model";
import {CreditSpreadModel} from "./credit-spread.model";
import {OptionStrikeModel} from "./option-strike.model";
import {IcType} from "../services/settings/settings.service.interface";


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

    /**
     * Returns the wing widths for put and call sides based on icType.
     * - symmetric: same width for both sides
     * - bullish: wider put wing (more protection downside), narrower call wing
     * - bearish: wider call wing (more protection upside), narrower put wing
     */
    private _getAsymmetricWings(baseWing: number, icType: IcType): { putWing: number; callWing: number } {
        const availableWings = this.services.settings.strategyFilters.availableWings;
        const idx = availableWings.indexOf(baseWing);

        if (icType === 'symmetric' || availableWings.length < 2) {
            return { putWing: baseWing, callWing: baseWing };
        }

        const widerWing = availableWings[Math.min(idx + 1, availableWings.length - 1)];
        const narrowerWing = availableWings[Math.max(idx - 1, 0)];

        if (icType === 'bullish') {
            // Bullish = wider put side (protection on downside), narrower call side
            return { putWing: widerWing, callWing: narrowerWing };
        } else {
            // Bearish = wider call side (protection on upside), narrower put side
            return { putWing: narrowerWing, callWing: widerWing };
        }
    }

    buildIronCondors(): IronCondorModel[] {
        const puts = this.getPutsByDelta().groupByKey(put => put.absoluteDeltaPercent.toString());
        const calls = this.getCallsByDelta().groupByKey(call => call.absoluteDeltaPercent.toString());

        const putsDeltas = Object.keys(puts).map(d => parseFloat(d)).sort((a, b) => b - a);
        const callsDeltas = Object.keys(calls).map(d => parseFloat(d)).sort((a, b) => b - a);

        const condors: IronCondorModel[] = [];
        const filters = this.services.settings.strategyFilters;
        const icType = filters.icType;

        const maxIndex = Math.min(putsDeltas.length, callsDeltas.length) - 1;

        for(let i = 0; i <= maxIndex; i++) {
            const stoPuts = puts[putsDeltas[i].toString()];
            const stoCalls = calls[callsDeltas[i].toString()];
            for(const stoPut of stoPuts) {
                for(const stoCall of stoCalls) {
                    for(const baseWing of this.wings) {
                        const { putWing, callWing } = this._getAsymmetricWings(baseWing, icType);

                        const btoPut = this.expiration.getStrikeByPrice(stoPut.strike.strikePrice - putWing)?.put;
                        if(!btoPut) {
                            continue;
                        }
                        const btoCall = this.expiration.getStrikeByPrice(stoCall.strike.strikePrice + callWing)?.call;
                        if(!btoCall) {
                            continue;
                        }
                        if(this._hasGoodBidAskSpread([btoPut, stoPut, stoCall, btoCall])) {
                            // Use the max wing width as the wingsWidth (for BPE/risk display)
                            const maxWing = Math.max(putWing, callWing);
                            condors.push(new IronCondorModel(maxWing, btoPut, stoPut, stoCall, btoCall, this.services));
                        }
                    }
                }
            }
        }

        // Apply EV / Alpha / POP filters
        const filtered = condors.filter(c => {
            if (filters.minPop > 0 && c.pop < filters.minPop) return false;
            if (filters.minExpectedValue !== 0 && c.expectedValue < filters.minExpectedValue) return false;
            if (filters.minAlpha !== 0 && c.alpha < filters.minAlpha) return false;
            return true;
        });

        // Sort by alpha descending (best statistical edge first)
        return filtered.sort((a, b) => b.alpha - a.alpha);
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
import {OptionsExpirationModel} from "./options-expiration.model";
import {IronCondorModel} from "./iron-condor.model";
import {OptionModel} from "./option.model";
import {IServiceFactory} from "../services/service-factory.interface";
import {PutCreditSpreadModel} from "./put-credit-spread.model";
import {CallCreditSpreadModel} from "./call-credit-spread.model";
import {CreditSpreadModel} from "./credit-spread.model";
import {OptionStrikeModel} from "./option-strike.model";
import {WingMode} from "../services/settings/settings.service.interface";
import {IcBuildStats} from "./options-expiration.view-model.interface";


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
        // absoluteDeltaPercent > 0 also guards against options whose greeks
        // haven't streamed yet (delta reads as 0) — never short a strike with
        // no risk data, even when minDelta is set to 0.
        return options.filter(o => o.absoluteDeltaPercent > 0
                && o.absoluteDeltaPercent >= this.minDelta && o.absoluteDeltaPercent <= this.maxDelta && o.midPrice > 0)
            .sort((a, b) => b.absoluteDeltaPercent - a.absoluteDeltaPercent);
    }

    getPutsByDelta(): OptionModel[] {
        return this._filterByDelta(this.expiration.getOTMPuts());
    }

    getCallsByDelta(): OptionModel[] {
        return this._filterByDelta(this.expiration.getOTMCalls());
    }

    /**
     * Returns the wing widths for put and call sides based on the wing mode:
     * - equal:     both sides get the selected base width
     * - widerPut:  put wing one step wider than selected (more room below)
     * - widerCall: call wing one step wider than selected (more room above)
     */
    private _getWingVariant(baseWing: number, wingMode: WingMode): { putWing: number; callWing: number } {
        if (wingMode === 'equal') {
            return { putWing: baseWing, callWing: baseWing };
        }

        const availableWings = this.services.settings.strategyFilters.availableWings;
        const idx = availableWings.indexOf(baseWing);
        const widerWing = idx >= 0
            ? availableWings[Math.min(idx + 1, availableWings.length - 1)]
            : baseWing;

        return wingMode === 'widerPut'
            ? { putWing: widerWing, callWing: baseWing }
            : { putWing: baseWing, callWing: widerWing };
    }

    /** Stage counters of the most recent buildIronCondors() run — lets the UI
     *  explain WHICH filter rejected everything when 0 ICs survive. Written
     *  during the build; read right after ironCondors is evaluated. */
    public lastIcBuildStats: IcBuildStats | null = null;

    buildIronCondors(): IronCondorModel[] {
        const stats: IcBuildStats = {
            deltaPuts: 0, deltaCalls: 0, pairs: 0, wingStrikeMissing: 0, spreadFail: 0,
            built: 0, popFail: 0, evFail: 0, alphaFail: 0, creditFail: 0, rrFail: 0,
        };
        this.lastIcBuildStats = stats;

        const putsList = this.getPutsByDelta();
        const callsList = this.getCallsByDelta();
        stats.deltaPuts = putsList.length;
        stats.deltaCalls = callsList.length;

        const puts = putsList.groupByKey(put => put.absoluteDeltaPercent.toString());
        const calls = callsList.groupByKey(call => call.absoluteDeltaPercent.toString());

        const putsDeltas = Object.keys(puts).map(d => parseFloat(d)).sort((a, b) => b - a);
        const callsDeltas = Object.keys(calls).map(d => parseFloat(d)).sort((a, b) => b - a);

        const condors: IronCondorModel[] = [];
        const filters = this.services.settings.strategyFilters;
        const icType = filters.icType;

        // Build (shortPutDelta, shortCallDelta) pairs according to IC type bias:
        //   symmetric → all combos where |shortPutDelta − shortCallDelta| ≤ 3 (near delta-neutral)
        //   bullish   → all combos where shortPutDelta − shortCallDelta ≥ 5 (net positive delta ≥ +5)
        //   bearish   → all combos where shortCallDelta − shortPutDelta ≥ 5 (net negative delta ≤ −5)
        // NOTE: symmetric must pair by delta VALUE, not by list index — put and call
        // delta lists rarely align (skew), so index-pairing matched e.g. a 30Δ put
        // with a 17Δ call and never produced 16Δ/16Δ.
        const SYMMETRIC_DELTA_TOLERANCE = 3;
        const deltaPairs: Array<[number, number]> = [];
        if (icType === 'symmetric') {
            for (const pd of putsDeltas) {
                for (const cd of callsDeltas) {
                    if (Math.abs(pd - cd) <= SYMMETRIC_DELTA_TOLERANCE) deltaPairs.push([pd, cd]);
                }
            }
        } else {
            for (const pd of putsDeltas) {
                for (const cd of callsDeltas) {
                    if (icType === 'bullish' && pd - cd >= 5) deltaPairs.push([pd, cd]);
                    if (icType === 'bearish' && cd - pd >= 5) deltaPairs.push([pd, cd]);
                }
            }
        }

        // Wing variants come from the explicit Wings balance filter (equal /
        // wider put / wider call), independent of the IC type delta bias.
        const wingVariants: Array<{ putWing: number; callWing: number }> = [];
        const seenWings = new Set<string>();
        for (const baseWing of this.wings) {
            const variant = this._getWingVariant(baseWing, filters.wingMode);
            const key = `${variant.putWing}x${variant.callWing}`;
            if (!seenWings.has(key)) {
                seenWings.add(key);
                wingVariants.push(variant);
            }
        }

        stats.pairs = deltaPairs.length;

        for (const [putDelta, callDelta] of deltaPairs) {
            const stoPuts = puts[putDelta.toString()];
            const stoCalls = calls[callDelta.toString()];
            if (!stoPuts || !stoCalls) continue;

            for (const stoPut of stoPuts) {
                for (const stoCall of stoCalls) {
                    for (const { putWing, callWing } of wingVariants) {
                        const btoPut = this.expiration.getStrikeByPrice(stoPut.strike.strikePrice - putWing)?.put;
                        const btoCall = this.expiration.getStrikeByPrice(stoCall.strike.strikePrice + callWing)?.call;
                        if (!btoPut || !btoCall) {
                            stats.wingStrikeMissing++;
                            continue;
                        }

                        if (this._hasGoodBidAskSpread([btoPut, stoPut, stoCall, btoCall])) {
                            const maxWing = Math.max(putWing, callWing);
                            condors.push(new IronCondorModel(maxWing, btoPut, stoPut, stoCall, btoCall, this.services));
                        } else {
                            stats.spreadFail++;
                        }
                    }
                }
            }
        }
        stats.built = condors.length;

        // Apply EV / Alpha / POP / Credit filters, evaluating each metric ONCE
        // per condor — pop/expectedValue/alpha are uncached getter chains with
        // strike lookups, and Array.sort would otherwise recompute them on
        // every comparison.
        const snapshots = condors.map(c => ({
            condor: c, pop: c.pop, expectedValue: c.expectedValue, alpha: c.alpha, credit: c.credit,
        }));
        const filtered = snapshots.filter(s => {
            if (filters.minPop > 0 && s.pop < filters.minPop) { stats.popFail++; return false; }
            if (filters.minExpectedValue !== 0 && s.expectedValue < filters.minExpectedValue) { stats.evFail++; return false; }
            if (filters.minAlpha !== 0 && s.alpha < filters.minAlpha) { stats.alphaFail++; return false; }
            if (filters.minCredit > 0 && s.credit < filters.minCredit) { stats.creditFail++; return false; }
            return true;
        });

        // Sort by alpha descending (best statistical edge first)
        return filtered.sort((a, b) => b.alpha - a.alpha).map(s => s.condor);
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
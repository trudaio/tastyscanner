import {IOptionStrikeViewModel} from "./option-strike.view-model.interface";
import {IIronCondorViewModel} from "./iron-condor.view-model.interface";
import {ICreditSpreadViewModel} from "./credit-spread.view-model.interface";

export enum OptionExpirationTypeEnum {
    Weekly = "Weekly",
    Regular = "Regular",
    Quarterly = "Quarterly",
    EndOfMonth = "End-Of-Month"

}

export type OptionExpirationSettlementType = 'AM' | 'PM';

/** Stage-by-stage counters from the last Iron Condor build — used to tell
 *  the user WHICH filter rejected everything when an expiration shows 0. */
export interface IcBuildStats {
    deltaPuts: number;
    deltaCalls: number;
    pairs: number;
    wingStrikeMissing: number;
    spreadFail: number;
    built: number;
    popFail: number;
    evFail: number;
    alphaFail: number;
    creditFail: number;
    rrFail: number;
}

export interface IOptionsExpirationVewModel {
    readonly key: string;
    readonly expirationDate: string;
    readonly daysToExpiration: number;
    readonly settlementType: OptionExpirationSettlementType;
    readonly expirationType: OptionExpirationTypeEnum;
    readonly strikes: IOptionStrikeViewModel[];
    readonly hasStreamingData: boolean;
    readonly icBuildStats: IcBuildStats | null;
    readonly ironCondors: IIronCondorViewModel[];
    readonly putCreditSpreads: ICreditSpreadViewModel[];
    readonly callCreditSpreads: ICreditSpreadViewModel[];
}
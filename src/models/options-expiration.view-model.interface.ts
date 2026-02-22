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

export interface IOptionsExpirationVewModel {
    readonly key: string;
    readonly expirationDate: string;
    readonly daysToExpiration: number;
    readonly settlementType: OptionExpirationSettlementType;
    readonly expirationType: OptionExpirationTypeEnum;
    readonly strikes: IOptionStrikeViewModel[];
    readonly ironCondors: IIronCondorViewModel[];
    readonly putCreditSpreads: ICreditSpreadViewModel[];
    readonly callCreditSpreads: ICreditSpreadViewModel[];
}
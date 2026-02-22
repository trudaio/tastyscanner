import {IOptionViewModel} from "./option.view-model.interface";

export type StrategyLegType = 'BTO' | 'STO';

export interface IOptionsStrategyLegViewModel {
    readonly key: string;
    readonly option: IOptionViewModel;
    readonly legType: StrategyLegType;
    readonly isSell: boolean;
    readonly isBuy: boolean;
}

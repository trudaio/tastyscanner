import {IOptionViewModel} from "./option.view-model.interface";

export interface IOptionStrikeViewModel {
    readonly strikePrice: number;
    readonly call: IOptionViewModel;
    readonly put: IOptionViewModel;
}
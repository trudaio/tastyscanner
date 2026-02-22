import {IOptionsStrategyViewModel} from "./options-strategy.view-model.interface";
import {IOptionViewModel} from "./option.view-model.interface";

export interface ICreditSpreadViewModel extends IOptionsStrategyViewModel {
    readonly stoOption: IOptionViewModel;
    readonly btoOption: IOptionViewModel;
}

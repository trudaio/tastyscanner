import {IOptionViewModel} from "./option.view-model.interface";
import {IOptionsStrategyViewModel} from "./options-strategy.view-model.interface";

export interface IIronCondorViewModel extends IOptionsStrategyViewModel {
    readonly btoPut: IOptionViewModel;
    readonly stoPut: IOptionViewModel;
    readonly stoCall: IOptionViewModel;
    readonly btoCall: IOptionViewModel;
}
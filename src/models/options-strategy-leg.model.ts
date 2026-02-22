import {IOptionViewModel} from "./option.view-model.interface";
import {IOptionsStrategyLegViewModel, StrategyLegType} from "./options-strategy-leg.view-model.interface";

export class OptionsStrategyLegModel implements IOptionsStrategyLegViewModel {
    constructor(public readonly option: IOptionViewModel,
                public readonly legType: StrategyLegType) {
    }

    get key(): string {
        return `${this.option.strikePrice}_${this.option.optionType}_${this.legType}`;
    }

    get isSell(): boolean {
        return this.legType === 'STO';
    }

    get isBuy(): boolean {
        return this.legType === 'BTO';
    }
}
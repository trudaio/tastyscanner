import {OptionModel} from "./option.model";
import {CreditSpreadModel} from "./credit-spread.model";
import {IServiceFactory} from "../services/service-factory.interface";
import {OptionsStrategyLegModel} from "./options-strategy-leg.model";

export class CallCreditSpreadModel extends CreditSpreadModel {
    constructor(wingsWidth: number,
                stoCall: OptionModel,
                btoCall: OptionModel,
                services: IServiceFactory) {
        super(wingsWidth, stoCall, btoCall, services);
    }

    get strategyName(): string {
        return "CALL credit spread";
    }

    get optionType(): 'C' | 'P' {
        return 'C';
    }

    get legs(): OptionsStrategyLegModel[] {
        return [
            new OptionsStrategyLegModel(this.stoOption, "STO"),
            new OptionsStrategyLegModel(this.btoOption, "BTO")
        ];
    }

}
import {CallOptionModel, OptionModel, PutOptionModel} from "./option.model";
import {IOptionStrikeViewModel} from "./option-strike.view-model.interface";
import {OptionsExpirationModel} from "./options-expiration.model";
import {TickerModel} from "./ticker.model";


export class OptionStrikeModel implements IOptionStrikeViewModel {
    constructor(public readonly strikePrice: number,
                public readonly expiration: OptionsExpirationModel,
                callId: string,
                callStreamerSymbol: string,
                putId: string,
                putStreamerSymbol: string) {
        this.call = new CallOptionModel(callId, callStreamerSymbol, this);
        this.put = new PutOptionModel(putId, putStreamerSymbol, this);
    }

    public readonly call: OptionModel;
    public readonly put: OptionModel;

    get ticker(): TickerModel {
        return this.expiration.ticker;
    }
}
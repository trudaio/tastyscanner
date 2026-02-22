import {ITickerViewModel} from "../../models/ticker.view-model.interface";
import {IOptionsExpirationVewModel} from "../../models/options-expiration.view-model.interface";
import {Check} from "../../utils/type-checking";

export enum EarningsDatePositionEnum {
    None,
    Before,
    After
}

export function getEarningsDateRenderPosition(ticker: ITickerViewModel, expirations: IOptionsExpirationVewModel[], expirationIndex: number): EarningsDatePositionEnum {
    if(Check.isNullOrUndefined(ticker.daysUntilEarnings)) {
        return EarningsDatePositionEnum.None;
    }

    const earningsDate = new Date(ticker.earningsDate);

    if(earningsDate.getTime() < Date.now()) {
        return EarningsDatePositionEnum.None;
    }

    const daysUntilEarnings = ticker.daysUntilEarnings;
    const currentExpiration = expirations[expirationIndex];

    if(expirationIndex === 0) {
        if(daysUntilEarnings <= currentExpiration.daysToExpiration) {
            return EarningsDatePositionEnum.Before;
        }
    }

    const nextExpiration = expirations[expirationIndex + 1];

    if(nextExpiration) {
        if(daysUntilEarnings > currentExpiration.daysToExpiration && daysUntilEarnings <= nextExpiration.daysToExpiration) {
            return EarningsDatePositionEnum.After;
        }

    } else {
        if(daysUntilEarnings > currentExpiration.daysToExpiration) {
            return EarningsDatePositionEnum.After;
        }
    }


    return EarningsDatePositionEnum.None;

}
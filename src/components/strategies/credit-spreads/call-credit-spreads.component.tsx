import React from "react";
import {observer} from "mobx-react";
import {ITickerViewModel} from "../../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../../models/options-strategy.view-model.interface";
import {AllExpirationsStrategiesComponent} from "../all-expirations-strategies.component";


export const CallCreditSpreadsComponent: React.FC<{ticker: ITickerViewModel; onTrade: (strategy: IOptionsStrategyViewModel) => void;}> = observer((props) => {

    return (
        <AllExpirationsStrategiesComponent ticker={props.ticker}
                                           getExpirations={() => props.ticker.getExpirationsWithCallCreditSpreads()}
                                           getExpirationStrategies={(expiration) => expiration.callCreditSpreads}
                                           noStrategiesAvailableMessage="No call credit spreads available"
                                           onTrade={props.onTrade}/>
    );

})
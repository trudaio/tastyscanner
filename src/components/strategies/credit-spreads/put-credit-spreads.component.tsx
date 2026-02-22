import React from "react";
import {observer} from "mobx-react";
import {ITickerViewModel} from "../../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../../models/options-strategy.view-model.interface";
import {AllExpirationsStrategiesComponent} from "../all-expirations-strategies.component";


export const PutCreditSpreadsComponent: React.FC<{ticker: ITickerViewModel; onTrade: (strategy: IOptionsStrategyViewModel) => void;}> = observer((props) => {

    return (
        <AllExpirationsStrategiesComponent ticker={props.ticker}
                                           getExpirations={() => props.ticker.getExpirationsWithPutCreditSpreads()}
                                           getExpirationStrategies={(expiration) => expiration.putCreditSpreads}
                                           noStrategiesAvailableMessage="No put credit spreads available"
                                           onTrade={props.onTrade}/>
    );

})
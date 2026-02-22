import React from 'react';
import {observer} from "mobx-react-lite";
import {ITickerViewModel} from "../../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../../models/options-strategy.view-model.interface";
import {AllExpirationsStrategiesComponent} from "../all-expirations-strategies.component";



export const IronCondorsComponent: React.FC<{ticker: ITickerViewModel; onTrade: (strategy: IOptionsStrategyViewModel) => void;}> = observer((props) => {

    return (
        <AllExpirationsStrategiesComponent ticker={props.ticker}
                                           getExpirations={() => props.ticker.getExpirationsWithIronCondors()}
                                           getExpirationStrategies={(expiration) => expiration.ironCondors}
                                           noStrategiesAvailableMessage="No iron condors available"
                                           onTrade={props.onTrade}/>
    )

})
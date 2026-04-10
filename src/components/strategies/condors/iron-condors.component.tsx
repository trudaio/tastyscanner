import React from 'react';
import {observer} from "mobx-react-lite";
import {ITickerViewModel} from "../../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../../models/options-strategy.view-model.interface";
import {AllExpirationsStrategiesComponent} from "../all-expirations-strategies.component";
import {useServices} from "../../../hooks/use-services.hook";
import {NoEdgeBannerComponent} from "./no-edge-banner.component";
import {BestPopSummaryComponent} from "./best-pop-summary.component";

interface IronCondorsProps {
    ticker: ITickerViewModel;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
    onGuvidChallenge?: (strategy: IOptionsStrategyViewModel) => Promise<void>;
    bestPopMode?: boolean;
}

export const IronCondorsComponent: React.FC<IronCondorsProps> = observer((props) => {
    const services = useServices();
    const filters = services.settings.strategyFilters;
    const expirations = props.ticker.getExpirationsWithIronCondors();

    // "No Edge" signal: no expirations pass filters AND at least one EV/Alpha/POP filter is active
    const hasActiveEdgeFilters = filters.minExpectedValue > 0 || filters.minAlpha > 0 || filters.minPop > 0;
    const noEdge = expirations.length === 0 && hasActiveEdgeFilters;

    if (noEdge) {
        return <NoEdgeBannerComponent symbol={props.ticker.symbol} />;
    }

    if (props.bestPopMode) {
        return <BestPopSummaryComponent ticker={props.ticker} onTrade={props.onTrade} />;
    }

    return (
        <AllExpirationsStrategiesComponent ticker={props.ticker}
                                           getExpirations={() => expirations}
                                           getExpirationStrategies={(expiration) => expiration.ironCondors}
                                           noStrategiesAvailableMessage="No iron condors available"
                                           onTrade={props.onTrade}
                                           onGuvidChallenge={props.onGuvidChallenge}/>
    )
})
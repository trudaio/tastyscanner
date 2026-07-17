import React from 'react';
import {observer} from "mobx-react-lite";
import {IOptionsExpirationVewModel} from "../../../models/options-expiration.view-model.interface";
import {ITickerViewModel} from "../../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../../models/options-strategy.view-model.interface";
import {AllExpirationsStrategiesComponent} from "../all-expirations-strategies.component";
import {useServices} from "../../../hooks/use-services.hook";
import {NoEdgeBannerComponent} from "./no-edge-banner.component";
import {BestPopSummaryComponent} from "./best-pop-summary.component";

interface IronCondorsProps {
    ticker: ITickerViewModel;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
    bestPopMode?: boolean;
}

/** Human explanation for an expiration with zero ICs: which build stage /
 *  filter rejected everything. Reads icBuildStats populated by ironCondors. */
function getIcEmptyReason(expiration: IOptionsExpirationVewModel): string | null {
    if (expiration.ironCondors.length > 0) {
        return null;
    }
    const s = expiration.icBuildStats;
    if (!s) {
        return null;
    }
    if (s.deltaPuts === 0 && s.deltaCalls === 0) return 'no options inside the delta range (greeks may still be loading)';
    if (s.deltaPuts === 0) return 'no PUTs inside the delta range';
    if (s.deltaCalls === 0) return 'no CALLs inside the delta range';
    if (s.pairs === 0) return 'no put/call delta pairs for this IC type — widen the delta range';
    if (s.built === 0) {
        return s.spreadFail >= s.wingStrikeMissing
            ? `bid/ask spread rejected all ${s.spreadFail} combos — raise Max bid/ask spread`
            : `wing strikes missing at selected widths (${s.wingStrikeMissing} combos) — try other wing sizes`;
    }
    const rejections: Array<[string, number]> = [
        ['Min POP', s.popFail],
        ['Min Expected Value', s.evFail],
        ['Min Alpha', s.alphaFail],
        ['Min credit', s.creditFail],
        ['Max risk/reward', s.rrFail],
    ];
    rejections.sort((a, b) => b[1] - a[1]);
    return `${s.built} combos built, all rejected — mainly by ${rejections[0][0]} (${rejections[0][1]})`;
}

export const IronCondorsComponent: React.FC<IronCondorsProps> = observer((props) => {
    const services = useServices();
    const filters = services.settings.strategyFilters;
    // Show every expiration inside the DTE range — including those with 0 qualifying ICs —
    // so the user can tell "expiration exists but nothing passes filters" from "expiration missing".
    const expirations = props.ticker.getFilteredExpirations();
    const hasAnyCondors = expirations.some(expiration => expiration.ironCondors.length > 0);

    // "No Edge" signal: no ICs pass filters AND at least one EV/Alpha/POP filter
    // is active AND quotes have actually arrived — before streaming warms up
    // every list is empty and the banner would falsely hide the loading states.
    const hasAnyStreamingData = expirations.some(expiration => expiration.hasStreamingData);
    const hasActiveEdgeFilters = filters.minExpectedValue > 0 || filters.minAlpha > 0 || filters.minPop > 0;
    const noEdge = !hasAnyCondors && hasActiveEdgeFilters && hasAnyStreamingData;

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
                                           getEmptyReason={getIcEmptyReason}
                                           onTrade={props.onTrade}/>
    )
})
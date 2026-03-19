import React, {useCallback, useEffect, useState} from "react";
import {observer} from "mobx-react";
import {IOptionsExpirationVewModel} from "../../models/options-expiration.view-model.interface";
import {NoOptionsStrategyAvailableBox} from "./boxes/no-options-strategy-available.box";
import {IonAccordionGroup} from "@ionic/react";
import {OptionsExpirationStrategiesComponent} from "./options-expiration-strategies.component";
import {getEarningsDateRenderPosition} from "./helper-functions";
import {ITickerViewModel} from "../../models/ticker.view-model.interface";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {NullableString} from "../../utils/nullable-types";
import {reaction} from "mobx";
import {useServices} from "../../hooks/use-services.hook";
import styled from "styled-components";

const ResultsStack = styled.div`
    display: grid;
    gap: 12px;
`;

const EmptyStateTitle = styled.h3`
    margin: 0;
    color: var(--app-text);
    font-size: 1.08rem;
    letter-spacing: -0.02em;
`;

const EmptyStateCopy = styled.p`
    margin: 0;
    color: var(--app-text-soft);
    max-width: 58ch;
`;

const EmptyStateTips = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
`;

const EmptyStateTip = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 0.82rem;
    font-weight: 700;
`;

interface AllExpirationsStrategiesComponentProps {
    ticker: ITickerViewModel;
    getExpirations: () => IOptionsExpirationVewModel[];
    getExpirationStrategies: (expiration: IOptionsExpirationVewModel) => IOptionsStrategyViewModel[];
    noStrategiesAvailableMessage: string;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
}
export const AllExpirationsStrategiesComponent: React.FC<AllExpirationsStrategiesComponentProps> = observer((props) => {
    const services = useServices();
    const [expandedExpirationKey, setExpandedExpirationKey] = useState<NullableString>(null);
    const [expandedExpirationStrategies, setExpandedExpirationStrategies] = useState<IOptionsStrategyViewModel[]>([]);

    const expirations = props.getExpirations();

    const {getExpirationStrategies} = props;

    const setCurrentStrategies = useCallback((expirationKey: NullableString) => {
        const expiration = expirations.find(exp => exp.key === expirationKey);
        if(expiration) {
            setExpandedExpirationStrategies(getExpirationStrategies(expiration));
        }
    }, [expirations, getExpirationStrategies])

    useEffect(() => {
        const r = reaction(() => services.settings.strategyFilters.lastUpdate,
            () => {
                setCurrentStrategies(expandedExpirationKey);
            });
        return () => r();
    }, [setCurrentStrategies, expandedExpirationKey, services.settings.strategyFilters.lastUpdate]);

    useEffect(() => {
        if (expirations.length === 0) {
            if (expandedExpirationKey !== null) {
                setExpandedExpirationKey(null);
                setExpandedExpirationStrategies([]);
            }
            return;
        }

        const hasCurrentExpiration = expirations.some(expiration => expiration.key === expandedExpirationKey);
        if (!hasCurrentExpiration) {
            const nextExpiration = expirations[0];
            setExpandedExpirationKey(nextExpiration.key);
            setExpandedExpirationStrategies(getExpirationStrategies(nextExpiration));
        }
    }, [expirations, expandedExpirationKey, getExpirationStrategies]);

    if(expirations.length === 0) {
        const filters = services.settings.strategyFilters;
        const hasActiveEdgeFilters = filters.minExpectedValue > 0 || filters.minAlpha > 0 || filters.minPop > 0;

        return (
            <NoOptionsStrategyAvailableBox>
                <EmptyStateTitle>Nu exista setup-uri eligibile acum</EmptyStateTitle>
                <EmptyStateCopy>{props.noStrategiesAvailableMessage}</EmptyStateCopy>
                <EmptyStateTips>
                    <EmptyStateTip>Delta {filters.minDelta} - {filters.maxDelta}</EmptyStateTip>
                    <EmptyStateTip>DTE {filters.minDaysToExpiration} - {filters.maxDaysToExpiration}</EmptyStateTip>
                    <EmptyStateTip>Spread max {filters.maxBidAskSpread}%</EmptyStateTip>
                    {hasActiveEdgeFilters ? <EmptyStateTip>Filtre EV / Alpha / POP active</EmptyStateTip> : null}
                </EmptyStateTips>
            </NoOptionsStrategyAvailableBox>
        )
    }



    return  (
        <ResultsStack>
            <IonAccordionGroup
                value={expandedExpirationKey ?? undefined}
                onIonChange={(e) => {
                    setExpandedExpirationKey(e.detail.value);
                    setCurrentStrategies(e.detail.value);
                }}
            >
                {expirations.map((expiration, index) => <OptionsExpirationStrategiesComponent
                    key={expiration.key}
                    ticker={props.ticker}
                    expiration={expiration}
                    strategies={expiration.key === expandedExpirationKey ? expandedExpirationStrategies : getExpirationStrategies(expiration)}
                    onTrade={props.onTrade}
                    earningsDatePosition={getEarningsDateRenderPosition(props.ticker, expirations, index)}/>)}
            </IonAccordionGroup>
        </ResultsStack>
    )
})

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

    if(expirations.length === 0) {
        return (
            <NoOptionsStrategyAvailableBox>
                {props.noStrategiesAvailableMessage}
            </NoOptionsStrategyAvailableBox>
        )
    }



    return  (
        <IonAccordionGroup onIonChange={(e) => {
            setExpandedExpirationKey(e.detail.value);
            setCurrentStrategies(e.detail.value);
        }}>
            {expirations.map((expiration, index) => <OptionsExpirationStrategiesComponent
                key={expiration.key}
                ticker={props.ticker}
                expiration={expiration}
                strategies={expiration.key === expandedExpirationKey ? expandedExpirationStrategies : getExpirationStrategies(expiration)}
                onTrade={props.onTrade}
                earningsDatePosition={getEarningsDateRenderPosition(props.ticker, expirations, index)}/>)}
        </IonAccordionGroup>
    )
})
import React, {useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {useServices} from "../hooks/use-services.hook";
import {IonAccordion, IonAccordionGroup } from "@ionic/react";
import { IonItem, IonLabel } from "@ionic/react";
import styled from "styled-components";
import {IWatchListRawData} from "../services/market-data-provider/market-data-provider.service.interface";
import {TickerMenuItemComponent} from "./ticker-menu-item.component";

const AccordionHeaderBox = styled(IonItem)`
  cursor: pointer;
`

const TickersBox = styled.div`
  padding: 16px 0;
`

const WatchListComponent: React.FC<{watchList: IWatchListRawData}> = observer((props) => {
    const entries = props.watchList.entries.sort((e1, e2) => e1.localeCompare(e2))
    return (
        <IonAccordion value={props.watchList.name}>
            <AccordionHeaderBox slot="header" color="light">
                <IonLabel>{props.watchList.name}</IonLabel>
            </AccordionHeaderBox>

            <TickersBox slot="content">
                {entries.map((ticker) => {
                    return (
                        <TickerMenuItemComponent key={ticker} tickerSymbol={ticker}/>
                    );
                })}
            </TickersBox>
        </IonAccordion>
    )
});


export const WatchListsComponent: React.FC = observer(() => {
    const [watchLists, setWatchLists] = useState<IWatchListRawData[]>();
    const services = useServices();
    const isInitialized = services.isInitialized; // MobX observable — re-renders and re-runs effect when credentials are set

    useEffect(() => {
        if (!isInitialized) return;
        services.marketDataProvider.getUserWatchLists().then(data => {
            setWatchLists(data);

            // Collect all unique symbols from all watchlists
            if (data && data.length > 0) {
                const allSymbols = new Set<string>();
                for (const watchList of data) {
                    for (const symbol of watchList.entries) {
                        allSymbols.add(symbol);
                    }
                }
                const symbolsArray = Array.from(allSymbols);
                console.log(`[WatchLists] Starting auto-refresh for ${symbolsArray.length} symbols`);
                services.watchlistData.startAutoRefresh(symbolsArray);
            }
        });

        // Cleanup on unmount
        return () => {
            services.watchlistData.stopAutoRefresh();
        };
    }, [isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <IonAccordionGroup>
            {watchLists?.map((watchList) => (<WatchListComponent key={watchList.name} watchList={watchList}/>) )}
        </IonAccordionGroup>
    )
})

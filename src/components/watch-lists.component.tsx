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
  --background: var(--app-subtle-surface);
  --padding-start: 14px;
  --padding-end: 14px;
  --min-height: 54px;
  border-radius: 16px;
  border: 1px solid var(--app-border);
  margin-bottom: 8px;
`

const TickersBox = styled.div`
  display: grid;
  gap: 8px;
  padding: 8px 0 12px;
`

const EmptyState = styled.div`
  margin: 0 0 8px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px dashed var(--app-border);
  background: var(--app-subtle-surface);
  color: var(--app-text-muted);
  font-size: 0.84rem;
  line-height: 1.55;
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
    const [expandedValue, setExpandedValue] = useState<string | undefined>(undefined);
    const services = useServices();
    const isInitialized = services.isInitialized; // MobX observable — re-renders and re-runs effect when credentials are set

    useEffect(() => {
        if (!isInitialized) {
            setWatchLists(undefined);
            return;
        }
        services.marketDataProvider.getUserWatchLists().then(data => {
            setWatchLists(data);
            setExpandedValue(data?.[0]?.name);

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
        }).catch(() => {
            setWatchLists([]);
        });

        // Cleanup on unmount
        return () => {
            services.watchlistData.stopAutoRefresh();
        };
    }, [isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            {!isInitialized && (
                <EmptyState>
                    Configureaza credentialele brokerului pentru a incarca watch lists live.
                </EmptyState>
            )}
            {isInitialized && watchLists?.length === 0 && (
                <EmptyState>
                    Nu exista watch lists disponibile in acest moment. Dupa conectare, listele apar automat aici.
                </EmptyState>
            )}
            <IonAccordionGroup value={expandedValue} onIonChange={e => setExpandedValue(e.detail.value)}>
            {watchLists?.map((watchList) => (<WatchListComponent key={watchList.name} watchList={watchList}/>) )}
            </IonAccordionGroup>
        </>
    )
})

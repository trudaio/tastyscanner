import React, {useEffect, useState} from "react";
import {observer} from "mobx-react";
import {useServices} from "../../hooks/use-services.hook";
import {
    IonContent,
    IonHeader,
    IonIcon,
    IonPage,
    IonSpinner,
    IonTab,
    IonTabBar,
    IonTabButton,
    IonTabs,
    IonTitle,
    IonToolbar
} from "@ionic/react";
import styled from "styled-components";
import {IronCondorsComponent} from "./condors/iron-condors.component";
import {PutCreditSpreadsComponent} from "./credit-spreads/put-credit-spreads.component";
import {CallCreditSpreadsComponent} from "./credit-spreads/call-credit-spreads.component";
import {RawLocalStorageKeys} from "../../services/storage/raw-local-storage/raw-local-storage-keys";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {SendOrderDialogComponent} from "./send-order-dialog.component";

const SpinnerContainerBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
`

const CONDORS_TAB = 'condors';
const PUT_CREDIT_SPREAD_TAB = 'putCreditSpreads';
const CALL_CREDIT_SPREAD_TAB = 'callCreditSpreads';
const STRATEGIES_TABS_CSS_CLASS = "strategies-tabs";

const TabHeaderTitleBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;;
`

const LegendContainerBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    flex-grow: 1;
    gap: 8px;
    width: 100%;
    font-size: 0.8rem;

    @media (max-width: 480px) {
        display: none;
    }
`

const LegendBox = styled.div`
    padding: 8px;
    border-radius: 8px;
    min-width: 80px;
    text-align: center;
`

const BestRiskRewardLegendBox = styled(LegendBox)`
    background-color: var(--ion-color-primary-tint);
    color: var(--ion-color-primary-contrast);
`

const BestPopLegendBox = styled(LegendBox)`
    background-color: var(--ion-color-warning-tint);
    color: var(--ion-color-warning-contrast);
`



const TabHeaderComponent: React.FC<{title: string}> = observer((props) => {
    return (
        <IonHeader>
            <IonToolbar>
                <IonTitle>
                    <TabHeaderTitleBox>
                        <span>
                            {props.title}
                        </span>
                        <LegendContainerBox>
                            <BestRiskRewardLegendBox>
                                Best risk/reward
                            </BestRiskRewardLegendBox>
                            <BestPopLegendBox>
                                Best POP
                            </BestPopLegendBox>
                        </LegendContainerBox>

                    </TabHeaderTitleBox>

                </IonTitle>
            </IonToolbar>
        </IonHeader>
    )
})


export const TickerOptionsStrategiesComponent: React.FC = observer(() => {
    const services = useServices();
    const [currentStrategy, setCurrentStrategy] = useState<IOptionsStrategyViewModel | null>(null);

    const ticker = services.tickers.currentTicker;
    const currentTab = services.rawLocalStorage.getItem(RawLocalStorageKeys.currentStrategyTab) || CONDORS_TAB;

    useEffect(() => {
        const tabs = document.querySelector(`.${STRATEGIES_TABS_CSS_CLASS}`) as HTMLIonTabsElement;
        tabs?.select(currentTab);
    });

    if(!ticker) {
        return null;
    }

    if(ticker.isLoading) {
        return (
            <SpinnerContainerBox>
                <IonSpinner name="circles"/>
            </SpinnerContainerBox>

        )
    }

    const onTrade = async (strategy: IOptionsStrategyViewModel) => {
        setCurrentStrategy(strategy);
    }



    return (
        <IonTabs className={STRATEGIES_TABS_CSS_CLASS}>

            <IonTabBar slot="top"
                       onIonTabsDidChange={e => services.rawLocalStorage.setItem(RawLocalStorageKeys.currentStrategyTab, e.detail.tab)}>
                <IonTabButton tab={CONDORS_TAB}>
                    <IonIcon />
                    Iron Condors
                </IonTabButton>
                <IonTabButton tab={PUT_CREDIT_SPREAD_TAB}>
                    <IonIcon />
                    PUT Credit Spreads
                </IonTabButton>
                <IonTabButton tab={CALL_CREDIT_SPREAD_TAB}>
                    <IonIcon />
                    CALL Credit Spreads
                </IonTabButton>
            </IonTabBar>

            <IonTab tab={CONDORS_TAB}>
                <IonPage id={CONDORS_TAB}>
                    <TabHeaderComponent title={"Iron Condors"}/>
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <IronCondorsComponent ticker={ticker} onTrade={onTrade} />
                    </IonContent>
                </IonPage>

            </IonTab>

            <IonTab tab={PUT_CREDIT_SPREAD_TAB}>
                <IonPage id={PUT_CREDIT_SPREAD_TAB}>
                    <TabHeaderComponent title={"PUT Credit Spreads"}/>
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <PutCreditSpreadsComponent ticker={ticker} onTrade={onTrade}/>
                    </IonContent>
                </IonPage>

            </IonTab>

            <IonTab tab={CALL_CREDIT_SPREAD_TAB}>
                <IonPage id={CALL_CREDIT_SPREAD_TAB}>
                    <TabHeaderComponent title={"CALL Credit Spreads"}/>
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <CallCreditSpreadsComponent ticker={ticker} onTrade={onTrade}/>
                    </IonContent>
                </IonPage>

            </IonTab>

            {currentStrategy && <SendOrderDialogComponent isOpen={Boolean(currentStrategy)}
                                                          strategy={currentStrategy}
                                                          symbol={ticker.symbol}
                                                          onDitDismiss={() => setCurrentStrategy(null)}/>}
        </IonTabs>

    )
})
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
import { ellipseOutline, funnelOutline, removeCircleOutline } from "ionicons/icons";
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
    min-height: 260px;
`

const CONDORS_TAB = 'condors';
const PUT_CREDIT_SPREAD_TAB = 'putCreditSpreads';
const CALL_CREDIT_SPREAD_TAB = 'callCreditSpreads';
const STRATEGIES_TABS_CSS_CLASS = "strategies-tabs";

const TabHeaderTitleBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
`

const TabsShell = styled(IonTabs)`
    display: block;
    overflow: hidden;
    border-radius: 24px;
    border: 1px solid var(--app-border);
    background: var(--app-panel-surface);
    box-shadow: var(--app-shadow);
`;

const StyledTabBar = styled(IonTabBar)`
    --background: var(--app-panel-solid);
    --border: 0;
    padding: 12px;
    gap: 8px;
    border-bottom: 1px solid var(--app-border);
    flex-wrap: wrap;
`;

const StyledTabButton = styled(IonTabButton)`
    --background: transparent;
    --background-focused: rgba(103, 168, 255, 0.1);
    --background-focused-opacity: 1;
    --color: var(--app-text-muted);
    --color-selected: var(--app-text);
    min-height: 54px;
    border-radius: 16px;
    font-size: 0.84rem;
    font-weight: 700;
    border: 1px solid transparent;
    flex: 1 1 180px;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;

    &.tab-selected {
        --color: var(--app-text);
        background: linear-gradient(135deg, rgba(103, 168, 255, 0.14), rgba(125, 226, 209, 0.08));
        border-color: var(--app-border-strong);
        box-shadow: 0 12px 24px rgba(57, 91, 148, 0.12);
    }
`;

const TabHeaderBox = styled(IonHeader)`
    box-shadow: none;
`;

const TabToolbar = styled(IonToolbar)`
    --background: transparent;
    --min-height: 70px;
    --padding-start: 16px;
    --padding-end: 16px;
`;

const TabTitle = styled.span`
    color: var(--app-text);
    font-size: 1rem;
    font-weight: 800;
`;

const TabSubtitle = styled.div`
    color: var(--app-text-muted);
    font-size: 0.82rem;
    line-height: 1.5;
    margin-top: 4px;
`;

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
    padding: 8px 12px;
    border-radius: 999px;
    min-width: 80px;
    text-align: center;
    font-weight: 700;
    border: 1px solid var(--app-border);
`

const BestRiskRewardLegendBox = styled(LegendBox)`
    background-color: rgba(103, 168, 255, 0.14);
    color: var(--app-text);
`

const BestPopLegendBox = styled(LegendBox)<{ $active?: boolean }>`
    background-color: rgba(244, 162, 97, 0.14);
    color: var(--app-text);
    cursor: pointer;
    border: 2px solid ${p => p.$active ? 'rgba(244, 162, 97, 0.42)' : 'transparent'};
    opacity: ${p => p.$active ? 1 : 0.7};
    transition: all 0.2s ease;
    user-select: none;
    &:hover { opacity: 1; }
`

const TabButtonContent = styled.div`
    display: grid;
    justify-items: center;
    gap: 4px;
`;

const TabButtonLabel = styled.span`
    font-size: 0.84rem;
    font-weight: 800;
`;

const TabButtonHint = styled.span`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    font-weight: 600;
`;



interface TabHeaderProps {
    title: string;
    subtitle: string;
    bestPopMode?: boolean;
    onToggleBestPop?: () => void;
}

const TabHeaderComponent: React.FC<TabHeaderProps> = observer((props) => {
    return (
        <TabHeaderBox>
            <TabToolbar>
                <IonTitle>
                    <TabHeaderTitleBox>
                        <div>
                            <TabTitle>{props.title}</TabTitle>
                            <TabSubtitle>{props.subtitle}</TabSubtitle>
                        </div>
                        <LegendContainerBox>
                            <BestRiskRewardLegendBox>
                                Best risk/reward
                            </BestRiskRewardLegendBox>
                            <BestPopLegendBox
                                $active={props.bestPopMode}
                                onClick={props.onToggleBestPop}
                            >
                                Best POP
                            </BestPopLegendBox>
                        </LegendContainerBox>

                    </TabHeaderTitleBox>

                </IonTitle>
            </TabToolbar>
        </TabHeaderBox>
    )
})


export const TickerOptionsStrategiesComponent: React.FC = observer(() => {
    const services = useServices();
    const [currentStrategy, setCurrentStrategy] = useState<IOptionsStrategyViewModel | null>(null);
    const [bestPopMode, setBestPopMode] = useState(false);

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
        <TabsShell className={STRATEGIES_TABS_CSS_CLASS}>

            <StyledTabBar slot="top"
                       onIonTabsDidChange={e => services.rawLocalStorage.setItem(RawLocalStorageKeys.currentStrategyTab, e.detail.tab)}>
                <StyledTabButton tab={CONDORS_TAB}>
                    <TabButtonContent>
                        <IonIcon icon={ellipseOutline} />
                        <TabButtonLabel>Iron Condors</TabButtonLabel>
                        <TabButtonHint>neutral premium</TabButtonHint>
                    </TabButtonContent>
                </StyledTabButton>
                <StyledTabButton tab={PUT_CREDIT_SPREAD_TAB}>
                    <TabButtonContent>
                        <IonIcon icon={funnelOutline} />
                        <TabButtonLabel>PUT Credit Spreads</TabButtonLabel>
                        <TabButtonHint>bullish bias</TabButtonHint>
                    </TabButtonContent>
                </StyledTabButton>
                <StyledTabButton tab={CALL_CREDIT_SPREAD_TAB}>
                    <TabButtonContent>
                        <IonIcon icon={removeCircleOutline} />
                        <TabButtonLabel>CALL Credit Spreads</TabButtonLabel>
                        <TabButtonHint>bearish bias</TabButtonHint>
                    </TabButtonContent>
                </StyledTabButton>
            </StyledTabBar>

            <IonTab tab={CONDORS_TAB}>
                <IonPage id={CONDORS_TAB}>
                    <TabHeaderComponent
                        title={"Iron Condors"}
                        subtitle={"Compara expirari si gaseste structurile neutre cu raport mai bun intre edge, credit si risc."}
                        bestPopMode={bestPopMode}
                        onToggleBestPop={() => setBestPopMode(v => !v)}
                    />
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <IronCondorsComponent ticker={ticker} onTrade={onTrade} bestPopMode={bestPopMode} />
                    </IonContent>
                </IonPage>

            </IonTab>

            <IonTab tab={PUT_CREDIT_SPREAD_TAB}>
                <IonPage id={PUT_CREDIT_SPREAD_TAB}>
                    <TabHeaderComponent
                        title={"PUT Credit Spreads"}
                        subtitle={"Vezi mai repede spread-urile bullish cu credit acceptabil si cost de protectie controlat."}
                    />
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <PutCreditSpreadsComponent ticker={ticker} onTrade={onTrade}/>
                    </IonContent>
                </IonPage>

            </IonTab>

            <IonTab tab={CALL_CREDIT_SPREAD_TAB}>
                <IonPage id={CALL_CREDIT_SPREAD_TAB}>
                    <TabHeaderComponent
                        title={"CALL Credit Spreads"}
                        subtitle={"Separa rapid setup-urile bearish si foloseste acelasi context de risc fara sa schimbi workspace-ul."}
                    />
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <CallCreditSpreadsComponent ticker={ticker} onTrade={onTrade}/>
                    </IonContent>
                </IonPage>

            </IonTab>

            {currentStrategy && <SendOrderDialogComponent isOpen={Boolean(currentStrategy)}
                                                          strategy={currentStrategy}
                                                          symbol={ticker.symbol}
                                                          onDitDismiss={() => setCurrentStrategy(null)}/>}
        </TabsShell>

    )
})

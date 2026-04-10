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
import {saveCompetitionRound, buildTradeFromStrategy, getCompetitionRounds} from "../../services/competition/competition.service";
import {auth} from "../../firebase";

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

const BestPopLegendBox = styled(LegendBox)<{ $active?: boolean }>`
    background-color: var(--ion-color-warning-tint);
    color: var(--ion-color-warning-contrast);
    cursor: pointer;
    border: 2px solid ${p => p.$active ? 'var(--ion-color-warning-shade)' : 'transparent'};
    opacity: ${p => p.$active ? 1 : 0.7};
    transition: all 0.2s ease;
    user-select: none;
    &:hover { opacity: 1; }
`



interface TabHeaderProps {
    title: string;
    bestPopMode?: boolean;
    onToggleBestPop?: () => void;
}

const TabHeaderComponent: React.FC<TabHeaderProps> = observer((props) => {
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
                            <BestPopLegendBox
                                $active={props.bestPopMode}
                                onClick={props.onToggleBestPop}
                            >
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

    const onGuvidChallenge = async (userStrategy: IOptionsStrategyViewModel) => {
        if (!ticker) return;
        const userEmail = auth.currentUser?.email || 'unknown';

        // Find the expiration that matches the user's pick
        const userExpDate = userStrategy.legs[0]?.option.expirationDate;
        const expirations = ticker.getExpirationsWithIronCondors();
        const matchedExp = expirations.find(e => e.expirationDate === userExpDate);

        // Guvidul picks: best scoring IC on the same expiration (excluding user's pick)
        let guvidStrategy: IOptionsStrategyViewModel | null = null;
        if (matchedExp) {
            const ics = matchedExp.ironCondors;
            let bestScore = -Infinity;
            for (const ic of ics) {
                if (ic.key === userStrategy.key) continue; // skip user's pick
                if (ic.positionConflict) continue; // skip conflicts
                const pop = ic.pop;
                const ev = ic.expectedValue;
                const alpha = ic.alpha;
                const score = (pop * 0.6) + (Math.min(Math.max(ev / 10, -10), 10) * 0.25) + (Math.min(Math.max(alpha, -10), 10) * 0.15);
                if (score > bestScore) {
                    bestScore = score;
                    guvidStrategy = ic;
                }
            }
        }

        if (!guvidStrategy) guvidStrategy = userStrategy; // fallback

        // Get round number
        let roundNum = 1;
        try {
            const existing = await getCompetitionRounds();
            roundNum = existing.length + 1;
        } catch { /* first round */ }

        const today = new Date().toISOString().split('T')[0];
        await saveCompetitionRound({
            round: roundNum,
            date: today,
            userEmail,
            userTrade: buildTradeFromStrategy(userStrategy as any, ticker.symbol),
            guvidTrade: buildTradeFromStrategy(guvidStrategy as any, ticker.symbol),
            winner: 'Pending'
        });
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
                    <TabHeaderComponent title={"Iron Condors"} bestPopMode={bestPopMode} onToggleBestPop={() => setBestPopMode(v => !v)}/>
                    <IonContent style={{ '--padding-bottom': '160px' } as React.CSSProperties}>
                        <IronCondorsComponent ticker={ticker} onTrade={onTrade} onGuvidChallenge={onGuvidChallenge} bestPopMode={bestPopMode} />
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
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
import {saveCompetitionRound, buildTradeFromStrategy, getCompetitionRounds, IMarketContext} from "../../services/competition/competition.service";
import { submitUserPick, type ICompetitionTradeV2 } from "../../services/competition/competition-v2.service";
import {auth} from "../../firebase";
import {computeCompositeScore, STRATEGY_PROFILES} from "../../models/strategy-profile";

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
        if (!ticker) throw new Error('No ticker selected');
        const userEmail = auth.currentUser?.email || 'unknown';

        const userExpDate = userStrategy.legs[0]?.option.expirationDate;
        if (!userExpDate) throw new Error('No expiration date on strategy legs');

        console.log('[GuvidChallenge] User picked:', userStrategy.strategyName, '| Exp:', userExpDate);

        // Capture market context (used by aiDailySubmit when it picks tomorrow)
        services.marketDataProvider.subscribe(['$VIX.X']);
        const underlyingPrice = ticker.currentPrice || 0;
        const ivRank = ticker.ivRank || 0;
        let vix = 0;
        const vixQuote = services.marketDataProvider.getSymbolQuote('$VIX.X');
        if (vixQuote) {
            vix = Math.round(((vixQuote.bidPrice + vixQuote.askPrice) / 2) * 100) / 100;
        }
        const marketContext = { underlyingPrice, vix, ivRank };

        // Build V2 user trade format
        const legs = userStrategy.legs.map(l => ({
            type: l.legType,
            optionType: l.option.optionType,
            strike: l.option.strikePrice,
        }));
        const btoPut = legs.find(l => l.type === 'BTO' && l.optionType === 'P');
        const stoPut = legs.find(l => l.type === 'STO' && l.optionType === 'P');
        const stoCall = legs.find(l => l.type === 'STO' && l.optionType === 'C');
        const btoCall = legs.find(l => l.type === 'BTO' && l.optionType === 'C');
        const strategyStr = `IC ${btoPut?.strike}/${stoPut?.strike}p ${stoCall?.strike}/${btoCall?.strike}c`;
        const wings = (stoPut?.strike ?? 0) - (btoPut?.strike ?? 0);
        const credit = userStrategy.credit;
        const quantity = 1;
        const maxProfit = credit * 100 * quantity;
        const maxLoss = (wings - credit) * 100 * quantity;

        const userTrade: ICompetitionTradeV2 = {
            ticker: ticker.symbol,
            strategy: strategyStr,
            expiration: userExpDate,
            legs,
            credit: Math.round(credit * 100) / 100,
            quantity,
            wings,
            maxProfit,
            maxLoss,
            pop: userStrategy.pop,
            ev: Math.round(userStrategy.expectedValue * 100) / 100,
            alpha: Math.round(userStrategy.alpha * 100) / 100,
            rr: userStrategy.riskRewardRatio,
            delta: userStrategy.delta,
            theta: userStrategy.theta,
            exitPl: null, exitDate: null, closedBy: null,
            status: 'open',
        };

        const today = new Date().toISOString().split('T')[0];

        // Submit to V2 collection — aiDailySubmit will attach AI's pick at next 10:30 AM ET
        const roundId = await submitUserPick({
            roundNumber: 0,
            date: today,
            userEmail,
            expirationDate: userExpDate,
            ticker: ticker.symbol as 'SPX' | 'QQQ',
            userTrade,
            winner: 'Pending',
            ghost: false,
            marketContext,
            userScore: null,
            aiScore: null,
            winnerDecidedAt: null,
        });

        // Suppress unused-var warning for legacy v1 helpers (still imported for backward compat)
        void saveCompetitionRound; void buildTradeFromStrategy; void getCompetitionRounds;
        void STRATEGY_PROFILES; void computeCompositeScore;
        const _legacyTypeRef: IMarketContext | null = null; void _legacyTypeRef;

        console.log('[GuvidChallenge] V2 round saved:', roundId, '— AI will respond at next 10:30 AM ET');
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
                        <IronCondorsComponent ticker={ticker} onTrade={onTrade} bestPopMode={bestPopMode} />
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
                                                          onDitDismiss={() => setCurrentStrategy(null)}
                                                          onGuvidChallenge={onGuvidChallenge}/>}
        </IonTabs>

    )
})
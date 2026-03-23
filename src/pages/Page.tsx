import React, {useState, useEffect, useMemo} from "react";
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
    IonAccordion,
    IonAccordionGroup,
    IonItem,
    IonLabel
} from '@ionic/react';
import ExploreContainer from '../components/ExploreContainer';
import {observer} from "mobx-react-lite";
import {useServices} from "../hooks/use-services.hook";
import styled, {css} from 'styled-components';
import {SymbolSearchDropDownComponent} from "../components/symbol-search-drop-down.component";
import {TickerChartComponent} from "../components/ticker-chart.component";
import {PositionsVisualizationComponent, BreakEvenPoint} from "../components/positions-visualization/positions-visualization.component";
import {Check} from "../utils/type-checking";
import {IIronCondorTrade} from "../services/iron-condor-analytics/iron-condor-analytics.interface";

const PageTitleBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    white-space: nowrap;
`
const computeIvrBadgeColor = (ivr: number) => {
    if (ivr >= 50) return css`
        background: #1a4a2a;
        color: #66bb6a;
        border: 1px solid #66bb6a44;
    `;
    if (ivr >= 30) return css`
        background: #3a3010;
        color: #ffd54f;
        border: 1px solid #ffd54f44;
    `;
    return css`
        background: #3a1010;
        color: #ef5350;
        border: 1px solid #ef535044;
    `;
}

const IVRankBadge = styled.span<{$ivr: number}>`
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 10px;
    white-space: nowrap;
    ${props => computeIvrBadgeColor(props.$ivr)}
`

const IVRankBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
`


const TickerDescriptionBox = styled.span`
    flex-grow: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;

    @media (max-width: 600px) {
        display: none;
    }
`

const HeaderSeparator = styled.span`
    @media (max-width: 600px) {
        display: none;
    }
`

const HeaderBetaGroup = styled.span`
    display: flex;
    align-items: center;
    gap: 4px;
    @media (max-width: 600px) {
        display: none;
    }
`

const PositionsHeaderBox = styled(IonItem)`
    cursor: pointer;
    --background: var(--ion-color-tertiary-shade);
    --color: var(--ion-color-tertiary-contrast);
`

const PositionsContainerBox = styled.div`
    padding: 16px;
    background-color: #0d0d1a;
`

const PositionsBadge = styled.span`
    background-color: var(--ion-color-danger);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    margin-left: 8px;
`

const DesktopOnlyBox = styled.div`
    @media (max-width: 600px) {
        display: none;
    }
`





const Page: React.FC = observer(() => {
    const services = useServices();
    const ticker = services.tickers.currentTicker;
    const positions = services.positions.positions;
    const [isPositionsExpanded, setIsPositionsExpanded] = useState(false);
    const [ironCondorTrades, setIronCondorTrades] = useState<IIronCondorTrade[]>([]);

    // Fetch iron condor trades for break-even calculation
    useEffect(() => {
        if (ticker && isPositionsExpanded) {
            services.ironCondorAnalytics.fetchYTDTrades().then(trades => {
                // Filter trades for the current ticker that are open
                const tickerTrades = trades.filter(t =>
                    t.ticker === ticker.symbol && t.status === 'open'
                );
                setIronCondorTrades(tickerTrades);
            });
        }
    }, [ticker, isPositionsExpanded, services.ironCondorAnalytics]);

    // Calculate break-even points from iron condor trades
    const breakEvenPoints = useMemo((): BreakEvenPoint[] => {
        if (!ticker || ironCondorTrades.length === 0) return [];

        return ironCondorTrades.map(trade => {
            // Credit per share = total credit / (quantity * 100 contracts)
            const creditPerShare = trade.openCredit / (trade.quantity * 100);

            return {
                expirationDate: trade.expirationDate,
                lowerBreakEven: trade.putSellStrike - creditPerShare,
                upperBreakEven: trade.callSellStrike + creditPerShare,
                shortPutStrike: trade.putSellStrike,
                shortCallStrike: trade.callSellStrike,
                creditPerShare
            };
        });
    }, [ticker, ironCondorTrades]);

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton/>
                    </IonButtons>
                    <IonTitle>
                        <PageTitleBox>
                            <SymbolSearchDropDownComponent/>
                            <span>{ticker?.currentPrice?.toFixed(2)}</span>
                            <HeaderSeparator>|</HeaderSeparator>
                            <IVRankBox>
                                <IVRankBadge $ivr={ticker?.ivRank ?? 0}>
                                    IVR {ticker?.ivRank}
                                </IVRankBadge>
                            </IVRankBox>
                            <HeaderBetaGroup>
                                <span>|</span>
                                <span>Beta:</span>
                                <span>{ticker?.beta?.toFixed(2)}</span>
                            </HeaderBetaGroup>
                            <TickerDescriptionBox>
                                {ticker?.description}
                            </TickerDescriptionBox>
                        </PageTitleBox>

                    </IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen>
                <TickerChartComponent ticker={ticker}/>

                {/* Positions Visualization - desktop only */}
                <DesktopOnlyBox>
                    {ticker && positions.length > 0 && (
                        <IonAccordionGroup onIonChange={(e) => {
                            setIsPositionsExpanded(!Check.isNullOrUndefined(e.detail.value));
                        }}>
                            <IonAccordion value="positions">
                                <PositionsHeaderBox slot="header">
                                    <IonLabel>
                                        My Positions
                                        <PositionsBadge>{positions.length}</PositionsBadge>
                                    </IonLabel>
                                </PositionsHeaderBox>
                                <PositionsContainerBox slot="content">
                                    {isPositionsExpanded && (
                                        <PositionsVisualizationComponent
                                            positions={positions}
                                            currentPrice={ticker.currentPrice}
                                            breakEvenPoints={breakEvenPoints}
                                        />
                                    )}
                                </PositionsContainerBox>
                            </IonAccordion>
                        </IonAccordionGroup>
                    )}
                </DesktopOnlyBox>

                <ExploreContainer />
            </IonContent>
        </IonPage>
    );
});

export default Page;

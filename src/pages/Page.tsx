import React, { useEffect, useMemo, useState } from "react";
import {
    IonAccordion,
    IonAccordionGroup,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
} from '@ionic/react';
import styled, { css } from 'styled-components';
import { observer } from "mobx-react-lite";
import ExploreContainer from '../components/ExploreContainer';
import { useServices } from "../hooks/use-services.hook";
import { SymbolSearchDropDownComponent } from "../components/symbol-search-drop-down.component";
import { TickerChartComponent } from "../components/ticker-chart.component";
import {
    BreakEvenPoint,
    PositionsVisualizationComponent,
} from "../components/positions-visualization/positions-visualization.component";
import { Check } from "../utils/type-checking";
import { IIronCondorTrade } from "../services/iron-condor-analytics/iron-condor-analytics.interface";

const HeaderShell = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
`;

const HeaderTitleStack = styled.div`
    display: grid;
    gap: 6px;
    min-width: 0;
    flex: 1;
`;

const HeaderOverline = styled.div`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 800;
`;

const HeaderSearchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;

    @media (max-width: 720px) {
        flex-direction: column;
        align-items: stretch;
    }
`;

const HeaderLead = styled.div`
    color: var(--app-text-soft);
    font-size: 0.95rem;
    line-height: 1.65;
    max-width: 64ch;
`;

const TickerDescriptionBox = styled.span`
    color: var(--app-text-muted);
    font-size: 0.92rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 32ch;

    @media (max-width: 720px) {
        max-width: 100%;
        white-space: normal;
    }
`;

const MetaRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const computeIvrColor = (ivr: number) => {
    if (ivr <= 30) {
        return css`
            color: var(--ion-color-danger);
        `;
    }
    if (ivr > 40) {
        return css`
            color: var(--ion-color-success);
        `;
    }
    return css`
        color: var(--ion-color-warning);
    `;
};

const MetaPill = styled.div<{ $ivr?: number }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid rgba(162, 184, 219, 0.14);
    color: ${props => props.$ivr === undefined ? 'var(--app-text-soft)' : undefined};
    ${props => props.$ivr !== undefined && computeIvrColor(props.$ivr)}
    font-size: 0.83rem;
    font-weight: 700;
`;

const MetaLabel = styled.span`
    color: var(--app-text-muted);
    font-weight: 600;
`;

const PositionsHeaderBox = styled(IonItem)`
    cursor: pointer;
    --background: linear-gradient(135deg, rgba(244, 162, 97, 0.16), rgba(103, 168, 255, 0.08));
    --color: var(--app-text);
    --padding-start: 18px;
    --padding-end: 18px;
    --min-height: 62px;
    margin: 0 16px;
    border: 1px solid rgba(244, 162, 97, 0.14);

    @media (max-width: 720px) {
        margin: 0 12px;
    }
`;

const PositionsContainerBox = styled.div`
    padding: 16px;
    margin: 0 16px 0;
    background: var(--app-panel-surface);
    border: 1px solid var(--app-border);
    border-top: none;
    border-bottom-left-radius: 18px;
    border-bottom-right-radius: 18px;

    @media (max-width: 720px) {
        margin: 0 12px 0;
    }
`;

const PositionsLabelWrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;

    @media (max-width: 720px) {
        flex-direction: column;
        align-items: flex-start;
    }
`;

const PositionsHint = styled.span`
    color: var(--app-text-muted);
    font-size: 0.82rem;
    font-weight: 500;
`;

const PositionsTitle = styled.span`
    color: var(--app-text);
    font-weight: 700;
`;

const PositionsBadge = styled.span`
    background-color: rgba(255, 107, 126, 0.18);
    color: var(--app-text);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
`;

const EmptyStateWrap = styled.div`
    min-height: calc(100vh - 240px);
    padding: 28px 24px 48px;
    display: flex;
    align-items: center;

    @media (max-width: 720px) {
        min-height: auto;
        padding: 20px 16px 32px;
    }
`;

const EmptyStateCard = styled.section`
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 24px;
    width: min(100%, 1160px);
    margin: 0 auto;
    padding: 28px;
    border-radius: 28px;
    border: 1px solid var(--app-hero-border);
    background: var(--app-hero-surface);
    box-shadow: var(--app-shadow);

    @media (max-width: 720px) {
        padding: 22px;
        border-radius: 22px;
    }
`;

const EmptyStateHero = styled.div`
    display: grid;
    gap: 10px;
    max-width: 70ch;
`;

const EmptyEyebrow = styled.div`
    color: var(--ion-color-secondary);
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
`;

const EmptyTitle = styled.h2`
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.5rem, 2vw, 2.1rem);
    line-height: 1.1;
    letter-spacing: -0.03em;
`;

const EmptyDescription = styled.p`
    margin: 0;
    color: var(--app-text-soft);
    font-size: 1.02rem;
    line-height: 1.65;
    max-width: 60ch;
`;

const EmptyGrid = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
    gap: 18px;

    @media (max-width: 980px) {
        grid-template-columns: 1fr;
    }
`;

const EmptyPanel = styled.div`
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: 20px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
`;

const EmptyPanelTitle = styled.div`
    color: var(--app-text);
    font-size: 0.98rem;
    font-weight: 800;
`;

const EmptyList = styled.div`
    display: grid;
    gap: 10px;
`;

const EmptyListItem = styled.div`
    display: grid;
    gap: 2px;
    color: var(--app-text-soft);
    font-size: 0.94rem;
    line-height: 1.5;
`;

const EmptyListLabel = styled.span`
    color: var(--app-text);
    font-weight: 700;
`;

const QuickPicksRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
`;

const QuickPickButton = styled.button`
    border: 1px solid rgba(103, 168, 255, 0.2);
    border-radius: 999px;
    background: rgba(103, 168, 255, 0.1);
    color: var(--app-text);
    font-size: 0.88rem;
    font-weight: 700;
    padding: 10px 14px;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);

    &:hover {
        transform: translateY(-1px);
        border-color: rgba(125, 226, 209, 0.34);
        background: rgba(125, 226, 209, 0.12);
    }
`;

const Page: React.FC = observer(() => {
    const services = useServices();
    const ticker = services.tickers.currentTicker;
    const positions = services.positions.positions;
    const [isPositionsExpanded, setIsPositionsExpanded] = useState(false);
    const [ironCondorTrades, setIronCondorTrades] = useState<IIronCondorTrade[]>([]);
    const quickPickSymbols = ['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA'];

    useEffect(() => {
        if (ticker && isPositionsExpanded) {
            services.ironCondorAnalytics.fetchYTDTrades().then(trades => {
                const tickerTrades = trades.filter(t => t.ticker === ticker.symbol && t.status === 'open');
                setIronCondorTrades(tickerTrades);
            });
        }
    }, [ticker, isPositionsExpanded, services.ironCondorAnalytics]);

    const breakEvenPoints = useMemo((): BreakEvenPoint[] => {
        if (!ticker || ironCondorTrades.length === 0) return [];

        return ironCondorTrades.map(trade => {
            const creditPerShare = trade.openCredit / (trade.quantity * 100);

            return {
                expirationDate: trade.expirationDate,
                lowerBreakEven: trade.putSellStrike - creditPerShare,
                upperBreakEven: trade.callSellStrike + creditPerShare,
                shortPutStrike: trade.putSellStrike,
                shortCallStrike: trade.callSellStrike,
                creditPerShare,
            };
        });
    }, [ticker, ironCondorTrades]);

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>
                        <HeaderShell>
                            <HeaderTitleStack>
                                <HeaderOverline>Scanner</HeaderOverline>
                                <HeaderSearchRow>
                                    <SymbolSearchDropDownComponent />
                                    <TickerDescriptionBox>{ticker?.description ?? 'Selecteaza un simbol pentru a incepe scanarea.'}</TickerDescriptionBox>
                                </HeaderSearchRow>
                                {!ticker ? (
                                    <HeaderLead>
                                        Incepe cu un simbol lichid si vezi imediat structurile disponibile, filtrele active si contextul de risc fara sa iesi din acelasi workspace.
                                    </HeaderLead>
                                ) : null}
                                <MetaRow>
                                    <MetaPill>
                                        <MetaLabel>Pret</MetaLabel>
                                        <span>{ticker?.currentPrice?.toFixed(2) ?? '—'}</span>
                                    </MetaPill>
                                    <MetaPill $ivr={ticker?.ivRank ?? 0}>
                                        <MetaLabel>IVR</MetaLabel>
                                        <span>{ticker?.ivRank ?? '—'}</span>
                                    </MetaPill>
                                    <MetaPill>
                                        <MetaLabel>Beta</MetaLabel>
                                        <span>{ticker?.beta?.toFixed(2) ?? '—'}</span>
                                    </MetaPill>
                                </MetaRow>
                            </HeaderTitleStack>
                        </HeaderShell>
                    </IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen>
                <TickerChartComponent ticker={ticker} />

                {ticker && positions.length > 0 && (
                    <IonAccordionGroup onIonChange={(e) => {
                        setIsPositionsExpanded(!Check.isNullOrUndefined(e.detail.value));
                    }}>
                        <IonAccordion value="positions">
                            <PositionsHeaderBox slot="header">
                                <IonLabel>
                                    <PositionsLabelWrap>
                                        <PositionsTitle>Pozitii deschise</PositionsTitle>
                                        <PositionsHint>Break-even si expunere pe simbolul curent</PositionsHint>
                                    </PositionsLabelWrap>
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

                {!ticker ? (
                    <EmptyStateWrap>
                        <EmptyStateCard>
                            <EmptyStateHero>
                                <EmptyEyebrow>Scanner Ready</EmptyEyebrow>
                                <EmptyTitle>Alege un ticker si transforma panoul gol intr-un workflow real de selectie.</EmptyTitle>
                                <EmptyDescription>
                                    Header-ul iti da cautarea, meniul din stanga tine filtrele aproape, iar dupa selectarea simbolului workspace-ul se umple cu chain-uri, strategii si context de management.
                                </EmptyDescription>
                            </EmptyStateHero>

                            <EmptyGrid>
                                <EmptyPanel>
                                    <EmptyPanelTitle>Quick start</EmptyPanelTitle>
                                    <QuickPicksRow>
                                        {quickPickSymbols.map(symbol => (
                                            <QuickPickButton
                                                key={symbol}
                                                type="button"
                                                onClick={() => {
                                                    void services.tickers.setCurrentTicker(symbol);
                                                }}
                                            >
                                                {symbol}
                                            </QuickPickButton>
                                        ))}
                                    </QuickPicksRow>
                                </EmptyPanel>

                                <EmptyPanel>
                                    <EmptyPanelTitle>Ce urmeaza dupa selectie</EmptyPanelTitle>
                                    <EmptyList>
                                        <EmptyListItem>
                                            <EmptyListLabel>1. Search</EmptyListLabel>
                                            Cauti simbolul din header sau alegi unul din quick picks.
                                        </EmptyListItem>
                                        <EmptyListItem>
                                            <EmptyListLabel>2. Filter</EmptyListLabel>
                                            Ajustezi delta, DTE, wing width si edge direct din sidebar.
                                        </EmptyListItem>
                                        <EmptyListItem>
                                            <EmptyListLabel>3. Evaluate</EmptyListLabel>
                                            Compari iron condors, spreads si riscul pe simbolul curent.
                                        </EmptyListItem>
                                    </EmptyList>
                                </EmptyPanel>
                            </EmptyGrid>
                        </EmptyStateCard>
                    </EmptyStateWrap>
                ) : null}

                <ExploreContainer />
            </IonContent>
        </IonPage>
    );
});

export default Page;

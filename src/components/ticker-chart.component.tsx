import React, { useEffect, useId, useState } from "react";
import { IonIcon } from "@ionic/react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { chevronDownOutline, pulseOutline } from "ionicons/icons";
import { ITickerViewModel } from "../models/ticker.view-model.interface";
import { TradingViewWidgetComponent } from "./trading-view-widget.component";

const ChartSection = styled.section`
    margin: 16px 24px 24px;
    border: 1px solid var(--app-border);
    border-radius: 20px;
    overflow: hidden;
    background: var(--app-panel-surface);
    box-shadow: var(--app-shadow);

    @media (max-width: 720px) {
        margin: 12px 16px 18px;
        border-radius: 18px;
    }
`;

const ChartToggleButton = styled.button<{ $expanded: boolean }>`
    width: 100%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 18px;
    background:
        linear-gradient(135deg, rgba(103, 168, 255, 0.1), rgba(125, 226, 209, 0.06)),
        var(--app-panel-solid);
    color: var(--app-text);
    cursor: pointer;
    text-align: left;
    border-bottom: ${props => props.$expanded ? "1px solid var(--app-border)" : "none"};

    @media (max-width: 720px) {
        padding: 16px;
    }
`;

const HeaderCopy = styled.div`
    min-width: 0;
    display: grid;
    gap: 6px;
`;

const HeaderTopline = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
`;

const HeaderTitle = styled.div`
    color: var(--app-text);
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

const HeaderBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
    color: var(--app-text-soft);
    font-size: 0.76rem;
    font-weight: 700;
`;

const HeaderDescription = styled.div`
    color: var(--app-text-muted);
    font-size: 0.88rem;
    line-height: 1.5;
`;

const ToggleIconWrap = styled.span<{ $expanded: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 999px;
    border: 1px solid var(--app-border);
    background: var(--app-subtle-surface-2);
    color: var(--app-text);
    transform: rotate(${props => props.$expanded ? "180deg" : "0deg"});
    transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
`;

const ChartBody = styled.div`
    padding: 14px;
    background: var(--app-panel-solid);

    @media (max-width: 720px) {
        padding: 10px;
    }
`;

const ChartViewport = styled.div`
    min-height: 380px;
    height: clamp(380px, 62vh, 760px);
    border-radius: 16px;
    border: 1px solid var(--app-border);
    overflow: hidden;
    background: var(--app-surface-2);

    @media (max-width: 720px) {
        min-height: 320px;
        height: 58vh;
        border-radius: 14px;
    }
`;

export const TickerChartComponent: React.FC<{ ticker: ITickerViewModel | null }> = observer(({ ticker }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const contentId = useId();

    useEffect(() => {
        setIsExpanded(true);
    }, [ticker?.symbol]);

    if (!ticker) {
        return null;
    }

    return (
        <ChartSection>
            <ChartToggleButton
                type="button"
                $expanded={isExpanded}
                aria-expanded={isExpanded}
                aria-controls={contentId}
                onClick={() => setIsExpanded(value => !value)}
            >
                <HeaderCopy>
                    <HeaderTopline>
                        <HeaderTitle>Chart</HeaderTitle>
                        <HeaderBadge>
                            <IonIcon icon={pulseOutline} />
                            TradingView
                        </HeaderBadge>
                    </HeaderTopline>
                    <HeaderDescription>
                        Daily view pentru {ticker.symbol}, cu Bollinger Bands si Stoch RSI, intr-un panel clar si stabil.
                    </HeaderDescription>
                </HeaderCopy>

                <ToggleIconWrap $expanded={isExpanded}>
                    <IonIcon icon={chevronDownOutline} />
                </ToggleIconWrap>
            </ChartToggleButton>

            {isExpanded ? (
                <ChartBody id={contentId}>
                    <ChartViewport>
                        <TradingViewWidgetComponent
                            symbol={ticker.symbol}
                            listedMarket={ticker.listedMarket}
                        />
                    </ChartViewport>
                </ChartBody>
            ) : null}
        </ChartSection>
    );
});

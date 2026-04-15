import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import { IonIcon, IonSpinner } from '@ionic/react';
import { chevronDown, chevronForward } from 'ionicons/icons';
import { useServices } from '../../hooks/use-services.hook';
import { TechnicalsChartComponent } from './technicals-chart.component';

const LS_KEY = 'technicalsPanelExpanded';

const Wrapper = styled.div`
    margin: 8px 16px 8px;
    border: 1px solid var(--ion-color-light-shade);
    border-radius: 8px;
    background: var(--ion-background-color);
`;

const Header = styled.button<{ $expanded: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    background: ${(p) => p.$expanded ? 'var(--ion-color-light)' : 'transparent'};
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ion-text-color);
    transition: background 0.15s ease;

    &:hover { background: var(--ion-color-light); }
`;

const Title = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Hint = styled.span`
    font-size: 0.78rem;
    color: var(--ion-color-medium);
    font-weight: 400;
`;

const Body = styled.div<{ $expanded: boolean }>`
    overflow: hidden;
    max-height: ${(p) => p.$expanded ? '520px' : '0px'};
    transition: max-height 0.25s ease;
    padding: ${(p) => p.$expanded ? '12px 14px 14px' : '0 14px'};
`;

const ErrorBox = styled.div`
    padding: 16px;
    text-align: center;
    color: var(--ion-color-medium);
    font-size: 0.88rem;
`;

const SpinnerBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
`;

interface Props {
    ticker: string;
}

export const TechnicalsPanelComponent: React.FC<Props> = observer(({ ticker }) => {
    const services = useServices();

    const [expanded, setExpanded] = useState<boolean>(() => {
        const raw = localStorage.getItem(LS_KEY);
        return raw === null ? true : raw === 'true';
    });

    useEffect(() => {
        if (ticker) services.technicals.watch(ticker);
    }, [ticker, services.technicals]);

    useEffect(() => {
        localStorage.setItem(LS_KEY, String(expanded));
    }, [expanded]);

    const t = services.technicals.getTechnicals(ticker);
    const loading = services.technicals.isLoading(ticker);
    const error = services.technicals.getError(ticker);

    return (
        <Wrapper>
            <Header $expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                <Title>
                    <IonIcon icon={expanded ? chevronDown : chevronForward} />
                    <span>Technical Analysis</span>
                    <Hint>RSI(14) · BB(20, 2σ) · ATR(14) · 90d</Hint>
                </Title>
                <Hint>{expanded ? 'click to hide' : 'click to show'}</Hint>
            </Header>
            <Body $expanded={expanded}>
                {expanded && !t && loading && (
                    <SpinnerBox><IonSpinner name="dots" /></SpinnerBox>
                )}
                {expanded && !t && !loading && (
                    <ErrorBox>{error ? `Technical data unavailable: ${error}` : 'No technical data available for this ticker.'}</ErrorBox>
                )}
                {expanded && t && <TechnicalsChartComponent technicals={t} />}
            </Body>
        </Wrapper>
    );
});

import React from "react";
import {observer} from "mobx-react-lite";
import styled, {css} from "styled-components";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {IonButton} from "@ionic/react";


const StrategyFooterBox = styled.div`
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    row-gap: 8px;
    column-gap: 10px;
    font-size: 13px;
    color: var(--app-text);

    @media (max-width: 480px) {
        grid-template-columns: auto 1fr;
        column-gap: 6px;
        font-size: 12px;
    }
`

const ButtonBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    grid-column: 1 / -1;
`

const MetricLabel = styled.span`
    color: var(--app-text-muted);
    font-weight: 700;
`

const MetricValue = styled.span`
    color: var(--app-text);
    font-weight: 800;
`

const EvValueBox = styled.span<{ $positive: boolean }>`
    ${props => props.$positive
        ? css`color: var(--ion-color-success);`
        : css`color: var(--ion-color-danger);`
    }
`

const AlphaValueBox = styled.span<{ $positive: boolean }>`
    ${props => props.$positive
        ? css`color: var(--ion-color-success);`
        : css`color: var(--ion-color-danger);`
    }
`

export const OptionsStrategyFooterComponent: React.FC<{strategy: IOptionsStrategyViewModel; onOpenTradeDialog: () => void}> = observer((props) => {
    const { strategy } = props;
    const evPositive = strategy.expectedValue >= 0;
    const alphaPositive = strategy.alpha >= 0;

    return (
        <StrategyFooterBox>
            <MetricLabel>Risk/Reward</MetricLabel>
            <MetricValue>{strategy.riskRewardRatio}</MetricValue>
            <MetricLabel>POP</MetricLabel>
            <MetricValue>{`${strategy.pop}%`}</MetricValue>
            <MetricLabel>BPE</MetricLabel>
            <MetricValue>{`$${strategy.maxLoss.toFixed(0)}`}</MetricValue>
            <MetricLabel>Credit</MetricLabel>
            <MetricValue>{`${strategy.credit.toFixed(2)}$`}</MetricValue>
            <MetricLabel>EV</MetricLabel>
            <EvValueBox $positive={evPositive}>
                {`${evPositive ? '+' : ''}${strategy.expectedValue.toFixed(2)}$`}
            </EvValueBox>
            <MetricLabel>Alpha</MetricLabel>
            <AlphaValueBox $positive={alphaPositive}>
                {`${alphaPositive ? '+' : ''}${strategy.alpha.toFixed(2)}%`}
            </AlphaValueBox>
            <MetricLabel>Delta</MetricLabel>
            <MetricValue>{strategy.delta}</MetricValue>
            <MetricLabel>Theta</MetricLabel>
            <MetricValue>{strategy.theta}</MetricValue>
            <ButtonBox>
                <IonButton color={"success"} onClick={() => props.onOpenTradeDialog()}>
                    Trade
                </IonButton>
            </ButtonBox>
        </StrategyFooterBox>
    )
})

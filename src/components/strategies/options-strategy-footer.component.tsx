import React from "react";
import {observer} from "mobx-react-lite";
import styled, {css} from "styled-components";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {IonButton} from "@ionic/react";


const StrategyFooterBox = styled.div`
    display: grid;
    grid-template-columns: 1fr 0.5fr 1fr 1fr;
    row-gap: 8px;
    column-gap: 16px;
    font-weight: bold;

    @media (max-width: 480px) {
        grid-template-columns: 1fr 0.5fr;
        column-gap: 8px;
        font-size: 13px;
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
            <span>Risk/Reward:</span>
            <span>{strategy.riskRewardRatio}</span>
            <span>POP:</span>
            <span>{`${strategy.pop}%`}</span>
            <span>BPE:</span>
            <span>{`$${strategy.maxLoss.toFixed(0)}`}</span>
            <span>Credit:</span>
            <span>{`${strategy.credit.toFixed(2)}$`}</span>
            <span>EV:</span>
            <EvValueBox $positive={evPositive}>
                {`${evPositive ? '+' : ''}${strategy.expectedValue.toFixed(2)}$`}
            </EvValueBox>
            <span>Alpha:</span>
            <AlphaValueBox $positive={alphaPositive}>
                {`${alphaPositive ? '+' : ''}${strategy.alpha.toFixed(2)}%`}
            </AlphaValueBox>
            <span>Delta:</span>
            <span>{strategy.delta}</span>
            <span>Theta:</span>
            <span>{strategy.theta}</span>
            <ButtonBox>
                <IonButton color={"success"} onClick={() => props.onOpenTradeDialog()}>
                    Trade
                </IonButton>
            </ButtonBox>
        </StrategyFooterBox>
    )
})
import React from "react";
import {observer} from "mobx-react-lite";
import styled from "styled-components";
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


export const OptionsStrategyFooterComponent: React.FC<{strategy: IOptionsStrategyViewModel; onOpenTradeDialog: () => void}> = observer((props) => {
    // Buying Power Effect = (wing width - credit received) × 100 per contract
    const bpe = ((props.strategy.wingsWidth - props.strategy.credit) * 100).toFixed(0);

    return (
        <StrategyFooterBox>
            <span>Risk/Reward:</span>
            <span>{props.strategy.riskRewardRatio}</span>
            <span>POP:</span>
            <span>{`${props.strategy.pop}%`}</span>
            <span>BPE:</span>
            <span>{`$${bpe}`}</span>
            <span>Credit:</span>
            <span>{`${props.strategy.credit.toFixed(2)}$`}</span>
            <span>Delta:</span>
            <span>{props.strategy.delta}</span>
            <span>Theta:</span>
            <span>{props.strategy.theta}</span>
            <ButtonBox>
                <IonButton color={"success"} onClick={() => props.onOpenTradeDialog()}>
                    Trade
                </IonButton>
            </ButtonBox>

        </StrategyFooterBox>
    )
})
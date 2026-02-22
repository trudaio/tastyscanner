import React from "react";
import {observer} from "mobx-react";
import styled from "styled-components";
import {OptionsStrategyLegBaseBox} from "./boxes/options-strategy-leg-base.box";
import {IOptionsStrategyLegViewModel} from "../../models/options-strategy-leg.view-model.interface";
import {DELTA_SYMBOL} from "../../utils/global-constants";


const OptionPriceBox = styled.span`
    text-align: right;
`

const StrikePriceBox = styled.span`
    text-align: center;
    width: 100%;
`


const StrategyLegBox = styled(OptionsStrategyLegBaseBox)<{$isSell: boolean}>`
    background-color: ${props => props.$isSell ? 'var(--ion-color-danger)' : 'var(--ion-color-success)'};
    color: ${props => props.$isSell ? 'var(--ion-color-danger-contrast)' : 'var(--ion-color-success-contrast)'};
`

export const OptionsStrategyLegComponent: React.FC<{leg: IOptionsStrategyLegViewModel}> = observer((props) => {
    const isSellOption = props.leg.legType === "STO";
    const price = isSellOption ? props.leg.option.midPrice : -1 * props.leg.option.midPrice

    return (
        <StrategyLegBox $isSell={isSellOption}>
            <span>{props.leg.legType}</span>
            <span>{props.leg.option.optionType}</span>
            <StrikePriceBox>{props.leg.option.strikePrice}</StrikePriceBox>
            <OptionPriceBox>{`${price.toFixed(2)}$`}</OptionPriceBox>
            <span>{props.leg.option.deltaPercent + DELTA_SYMBOL}</span>
            <span>{props.leg.option.bidAskSpread.toFixed(2) + '%'}</span>
        </StrategyLegBox>
    )
})

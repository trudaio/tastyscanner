import React from "react";
import {observer} from "mobx-react";
import styled from "styled-components";
import {OptionsStrategyLegBaseBox} from "./boxes/options-strategy-leg-base.box";
import {DELTA_SYMBOL} from "../../utils/global-constants";

const HeaderBox = styled(OptionsStrategyLegBaseBox)`
    background-color: var(--ion-color-medium);
    color: var(--ion-color-medium-contrast);
`


export const OptionsStrategyHeaderComponent: React.FC = observer(() => {
    return (
        <HeaderBox>
            <span></span>
            <span></span>
            <span>strike</span>
            <span>price</span>
            <span>{DELTA_SYMBOL}</span>
            <span>spread</span>
        </HeaderBox>
    )
})
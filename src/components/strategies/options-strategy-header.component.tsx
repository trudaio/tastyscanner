import React from "react";
import {observer} from "mobx-react";
import styled from "styled-components";
import {OptionsStrategyLegBaseBox} from "./boxes/options-strategy-leg-base.box";
import {DELTA_SYMBOL} from "../../utils/global-constants";

const HeaderBox = styled(OptionsStrategyLegBaseBox)`
    background: var(--app-subtle-surface-2);
    color: var(--app-text-muted);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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

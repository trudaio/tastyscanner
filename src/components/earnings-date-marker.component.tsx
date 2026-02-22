import React from "react";
import {observer} from "mobx-react";
import styled, {css} from "styled-components";
import {ITickerViewModel} from "../models/ticker.view-model.interface";
import {EarningsDatePositionEnum} from "./strategies/helper-functions";

const ContainerBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    padding: 8px 0;
`

const LineBox= styled.div<{$isLowEarningDays: boolean}>`
    flex-grow: 1;
    height: 2px;
    ${props => props.$isLowEarningDays 
            ? css`
                background-color: var(--ion-color-danger);
            `  
            : css`
                background-color: var(--ion-color-medium);
            `
    };
    
`

const EarningsDateBox = styled.div<{$isLowEarningDays: boolean}>`
    
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 0.8rem;
    ${props => props.$isLowEarningDays
            ? css`
                background-color: var(--ion-color-danger);
                color: var(--ion-color-danger-contrast);
            `
            : css`
                background-color: var(--ion-color-medium);
                color: var(--ion-color-medium-contrast);
            `
    };
`

export const EarningsDateMarkerComponent: React.FC<{earningsDate: string; daysUntilEarnings: number}> = observer((props) => {
    return (
        <ContainerBox>
            <LineBox $isLowEarningDays={props.daysUntilEarnings <= 20}/>
            <EarningsDateBox $isLowEarningDays={props.daysUntilEarnings <= 20}>
                {`Earnings date: ${props.earningsDate} (${props.daysUntilEarnings} days)`}
            </EarningsDateBox>
        </ContainerBox>
    )
});

export const EarningsDateMarkerBeforeExpirationComponent: React.FC<{ticker: ITickerViewModel; position: EarningsDatePositionEnum}> = observer((props) => {
    if(props.position !== EarningsDatePositionEnum.Before) {
        return null;
    }

    return (
        <EarningsDateMarkerComponent earningsDate={props.ticker.earningsDate} daysUntilEarnings={props.ticker.daysUntilEarnings ?? 0}/>
    )

})

export const EarningsDateMarkerAfterExpirationComponent: React.FC<{ticker: ITickerViewModel; position: EarningsDatePositionEnum}> = observer((props) => {
    if(props.position !== EarningsDatePositionEnum.After) {
        return null;
    }

    return (
        <EarningsDateMarkerComponent earningsDate={props.ticker.earningsDate} daysUntilEarnings={props.ticker.daysUntilEarnings ?? 0}/>
    )

})
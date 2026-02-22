import React, {useState} from "react";
import {ITickerViewModel} from "../models/ticker.view-model.interface";
import {IonAccordion, IonAccordionGroup, IonItem} from "@ionic/react";
import {Check} from "../utils/type-checking";
import {TradingViewWidgetComponent} from "./trading-view-widget.component";
import styled from "styled-components";
import {observer} from "mobx-react";

const TickerChartHeaderBox = styled(IonItem)`
    cursor: pointer;
    --background: var(--ion-color-light-shade);
    --color: var(--ion-color-light-contrast);
`
const TickerChartContainerBox = styled.div`
    height: calc(100vh - 200px);
`


export const TickerChartComponent: React.FC<{ticker: ITickerViewModel | null}> = observer((props) => {
    const [isExpanded, setIsExpanded] = useState(false);
    if(!props.ticker) {
        return null;
    }
    return (
        <IonAccordionGroup onIonChange={(e) => {
            setIsExpanded(!Check.isNullOrUndefined(e.detail.value));
        }}>
            <IonAccordion>
                <TickerChartHeaderBox slot="header">Chart</TickerChartHeaderBox>
                <TickerChartContainerBox slot="content">
                    {isExpanded && <TradingViewWidgetComponent symbol={props.ticker.symbol} listedMarket={props.ticker.listedMarket}/>}
                </TickerChartContainerBox>
            </IonAccordion>
        </IonAccordionGroup>
    )

})
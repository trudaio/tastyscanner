import { observer } from "mobx-react";
import React from "react";
import {useServices} from "../hooks/use-services.hook";
import {IonItem, IonMenuToggle} from "@ionic/react";
import styled from "styled-components";

const MenuItemBox = styled(IonItem)`
  cursor: pointer;
`

const TickerSymbolBox = styled.span`
  font-weight: bold;
  min-width: 50px;
`

const MenuItemContentBox = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
`

const PriceBox = styled.span`
  font-size: 12px;
  color: #aaa;
  min-width: 60px;
  text-align: right;
`

const IVRankBox = styled.span<{ $ivRank: number | null }>`
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 35px;
  text-align: center;
  background: ${props => {
    if (props.$ivRank === null) return '#333';
    if (props.$ivRank >= 50) return '#1a4a2a'; // High IV - green (ideal for selling)
    if (props.$ivRank >= 30) return '#3a3010'; // Medium IV - yellow (acceptable)
    return '#3a1010'; // Low IV - red (avoid)
  }};
  color: ${props => {
    if (props.$ivRank === null) return '#666';
    if (props.$ivRank >= 50) return '#66bb6a';
    if (props.$ivRank >= 30) return '#ffd54f';
    return '#ef5350';
  }};
`

export const TickerMenuItemComponent: React.FC<{tickerSymbol: string}> = observer((props) => {
    const services = useServices();
    const tickerData = services.watchlistData.getTickerData(props.tickerSymbol);

    const onClick = async () => {
        await services.tickers.setCurrentTicker(props.tickerSymbol);
    }

    const formatPrice = (price: number | null) => {
        if (price === null) return '--';
        return price.toFixed(2);
    }

    const formatIVRank = (ivRank: number | null) => {
        if (ivRank === null) return '--';
        return Math.round(ivRank);
    }

    return  <IonMenuToggle autoHide={false} onClick={onClick}>
        <MenuItemBox className={props.tickerSymbol === services.tickers.currentTicker?.symbol ? 'selected' : ''} lines="none" detail={false}>
            <MenuItemContentBox>
                <TickerSymbolBox>{props.tickerSymbol}</TickerSymbolBox>
                <PriceBox>{formatPrice(tickerData?.lastPrice ?? null)}</PriceBox>
                <IVRankBox $ivRank={tickerData?.ivRank ?? null}>
                    {formatIVRank(tickerData?.ivRank ?? null)}
                </IVRankBox>
            </MenuItemContentBox>
        </MenuItemBox>
    </IonMenuToggle>
})

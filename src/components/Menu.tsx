import React from "react";
import {
  IonAccordion,
  IonAccordionGroup,
  IonContent, IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,

  //IonNote,
} from '@ionic/react';

import './Menu.css';
import {observer} from "mobx-react-lite";
import {useServices} from "../hooks/use-services.hook";
import styled from "styled-components";
import {StrategyFiltersComponent} from "./strategy-filters.component";
import {WatchListsComponent} from "./watch-lists.component";
import {TickerMenuItemComponent} from "./ticker-menu-item.component";
import {BrokerAccountsComponent} from "./broker-accounts.component";
import {AccountInfoComponent} from "./account-info.component";
import {alertCircleOutline, bookOutline, filterOutline, gridOutline, personCircleOutline, shieldOutline, statsChartOutline, keyOutline, flaskOutline, receiptOutline} from "ionicons/icons";
import {useHistory} from "react-router-dom";
import { auth } from '../firebase';

const MenuHeaderContentBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 16px;
  align-items: flex-start;
  padding: 0 0 16px 0;
`

const TickersBox = styled.div`
  padding: 16px 0;
`

const FiltersBox = styled.div`
  
`

const MenuTitleBox = styled.a`
  width: 100%;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ion-color-light-shade);
  text-decoration: none;
  color: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;

  &:hover {
    color: var(--ion-color-primary);
  }
`

const MenuLogo = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: contain;
`


const FiltersAccordionHeaderBox = styled(IonItem)`
  cursor: pointer;
`

const IonListBox = styled(IonList)`
  &&& {
    padding-top: 0;
  }
`

const WatchListsLabelBox = styled.div`
  padding: 12px;
  width: 100%;
  font-weight: bold;
  font-size: 1rem;
  background-color: var(--ion-color-medium);
  color: var(--ion-color-medium-contrast);
  margin-top: 20px;
  
  border-radius: 4px;
`

const Menu: React.FC = observer(() => {
  const services = useServices();

  const tickers = services.tickers.recentTickers;



  return (
    <IonMenu contentId="main" type="overlay">
      <IonContent>
        <IonListBox id="inbox-list">
          <IonListHeader>
            <MenuHeaderContentBox>
              <MenuTitleBox href="/app">
                <MenuLogo src="/logo-guvidul.svg" alt="Guvidul" />
                Operatiunea Guvidul
              </MenuTitleBox>
              <BrokerAccountsComponent/>
            </MenuHeaderContentBox>

          </IonListHeader>
          <AccountInfoComponent/>
          <IonAccordionGroup>
            <IonAccordion>
              <FiltersAccordionHeaderBox slot="header" color="light">
                <IonIcon slot="start" icon={filterOutline}/>
                <IonLabel>Filters</IonLabel>
              </FiltersAccordionHeaderBox>
              <FiltersBox slot="content">
                <StrategyFiltersComponent/>
              </FiltersBox>
            </IonAccordion>
          </IonAccordionGroup>

        </IonListBox>

        <IonAccordionGroup>
          <IonAccordion value="recentTickers">
            <FiltersAccordionHeaderBox slot="header" color="light">
              <IonLabel>Recent symbols</IonLabel>
            </FiltersAccordionHeaderBox>

            <TickersBox slot="content">
              {tickers.map((ticker) => {
                return (
                    <TickerMenuItemComponent key={ticker.symbol} tickerSymbol={ticker.symbol} />
                );
              })}
            </TickersBox>
          </IonAccordion>
        </IonAccordionGroup>

        <IonItem button routerLink="/dashboard" routerDirection="forward" lines="none" style={{ marginTop: '16px' }}>
          <IonIcon slot="start" icon={gridOutline} />
          <IonLabel>Guvid Management</IonLabel>
        </IonItem>

        <IonItem button routerLink="/guvid-history" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={statsChartOutline} />
          <IonLabel>Guvid History</IonLabel>
        </IonItem>

        <IonItem button routerLink="/transaction-history" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={receiptOutline} />
          <IonLabel>Istoric Tranzactii</IonLabel>
        </IonItem>

        <IonItem button routerLink="/backtest" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={flaskOutline} />
          <IonLabel>Backtest</IonLabel>
        </IonItem>

        <IonItem button routerLink="/delta-alert" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={alertCircleOutline} />
          <IonLabel>Delta Alert</IonLabel>
        </IonItem>

        {/* IC Savior — temporarily hidden, will revisit later
        <IonItem button routerLink="/iron-condor-savior" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={shieldOutline} />
          <IonLabel>🛟 IC Savior</IonLabel>
        </IonItem>
        */}


<IonItem button routerLink="/guide" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={bookOutline} />
          <IonLabel>Greeks Guide</IonLabel>
        </IonItem>

        <IonItem button routerLink="/account" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={personCircleOutline} />
          <IonLabel>My Account</IonLabel>
        </IonItem>

        {auth.currentUser?.uid === '7OcSxAkz8eahmOJD2ddu4ElBPsf2' && (
          <IonItem button routerLink="/superadmin" routerDirection="forward" lines="none">
            <IonIcon slot="start" icon={keyOutline} />
            <IonLabel>SuperAdmin</IonLabel>
          </IonItem>
        )}

        <WatchListsLabelBox>
          WATCH LISTS
        </WatchListsLabelBox>

        <WatchListsComponent/>

      </IonContent>
    </IonMenu>
  );
});

export default Menu;

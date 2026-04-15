import React, { useEffect, useState } from "react";
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
import {alertCircleOutline, analyticsOutline, bookOutline, filterOutline, personCircleOutline, keyOutline, trophyOutline, layersOutline, barChartOutline, warningOutline, notificationsOutline, timerOutline, flaskOutline, eyeOutline, statsChartOutline, calendarOutline} from "ionicons/icons";
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
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    auth.currentUser?.getIdTokenResult().then(result => {
      setIsSuperadmin(result.claims['role'] === 'superadmin');
    });
  }, []);

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
          <IonIcon slot="start" icon={layersOutline} />
          <IonLabel>Guvid Management</IonLabel>
        </IonItem>

        <IonItem button routerLink="/guvid-history" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={barChartOutline} />
          <IonLabel>Guvid History</IonLabel>
        </IonItem>

        <IonItem button routerLink="/guvid-vs-user" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={trophyOutline} />
          <IonLabel>Guvidul vs User</IonLabel>
        </IonItem>

        <IonItem button routerLink="/guvid-visualization" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={eyeOutline} />
          <IonLabel>Guvid Visualization</IonLabel>
        </IonItem>

        <IonItem button routerLink="/economic-calendar" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={calendarOutline} />
          <IonLabel>Economic Calendar</IonLabel>
        </IonItem>

        <IonItem button routerLink="/risk-exposer" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={warningOutline} />
          <IonLabel>Risk Exposer</IonLabel>
        </IonItem>

        <IonItem button routerLink="/delta-alert" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={notificationsOutline} />
          <IonLabel>Delta Alert</IonLabel>
        </IonItem>

        <IonItem button routerLink="/dte-analyzer" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={timerOutline} />
          <IonLabel>DTE Analyzer</IonLabel>
        </IonItem>

        <IonItem button routerLink="/strategy-simulator" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={flaskOutline} />
          <IonLabel>Strategy Simulator</IonLabel>
        </IonItem>

        {/* IC Savior — temporarily hidden, will revisit later
        <IonItem button routerLink="/iron-condor-savior" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={shieldOutline} />
          <IonLabel>🛟 IC Savior</IonLabel>
        </IonItem>
        */}


<IonItem button routerLink="/guide" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={bookOutline} />
          <IonLabel>Guvid Guide</IonLabel>
        </IonItem>

        <IonItem button routerLink="/scenario-study" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={statsChartOutline} />
          <IonLabel>Scenario Study</IonLabel>
        </IonItem>

        <IonItem button routerLink="/account" routerDirection="forward" lines="none">
          <IonIcon slot="start" icon={personCircleOutline} />
          <IonLabel>My Account</IonLabel>
        </IonItem>

        {/* SuperAdmin hidden from menu — access via URL only (/superadmin) */}

        <WatchListsLabelBox>
          WATCH LISTS
        </WatchListsLabelBox>

        <WatchListsComponent/>

      </IonContent>
    </IonMenu>
  );
});

export default Menu;

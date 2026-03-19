import React, { useEffect, useMemo, useState } from "react";
import {
  IonAccordion,
  IonAccordionGroup,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
} from '@ionic/react';
import {
  bookOutline,
  filterOutline,
  flaskOutline,
  gridOutline,
  keyOutline,
  moonOutline,
  pulseOutline,
  personCircleOutline,
  statsChartOutline,
  sunnyOutline,
} from "ionicons/icons";
import styled from "styled-components";
import { observer } from "mobx-react-lite";
import { useHistory, useLocation } from "react-router-dom";
import './Menu.css';
import { useServices } from "../hooks/use-services.hook";
import { StrategyFiltersComponent } from "./strategy-filters.component";
import { WatchListsComponent } from "./watch-lists.component";
import { TickerMenuItemComponent } from "./ticker-menu-item.component";
import { BrokerAccountsComponent } from "./broker-accounts.component";
import { AccountInfoComponent } from "./account-info.component";
import { auth } from '../firebase';
import { AppTheme, getStoredTheme, setStoredTheme } from "../theme/theme-preference";

const MenuHeaderContentBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 18px;
  align-items: stretch;
  padding: 0 0 14px 0;
`;

const TickersBox = styled.div`
  padding: 8px 0 2px;
`;

const AccordionContentBox = styled.div`
  width: 100%;
`;

const MenuTitleBox = styled.button`
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--app-hero-border);
  border-radius: 18px;
  background: var(--app-hero-surface);
  text-decoration: none;
  color: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.22);

  &:hover {
    border-color: var(--app-border-strong);
  }
`;

const MenuLogo = styled.img`
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: contain;
  background: var(--app-subtle-surface-2);
  padding: 6px;
`;

const MenuTitleText = styled.div`
  display: grid;
  gap: 4px;
`;

const MenuEyebrow = styled.div`
  color: var(--app-text-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 800;
`;

const MenuName = styled.div`
  color: var(--app-text);
  font-size: 1.02rem;
  line-height: 1.2;
`;

const FiltersAccordionHeaderBox = styled(IonItem)`
  cursor: pointer;
  --background: transparent;
  --padding-start: 14px;
  --padding-end: 14px;
  --min-height: 54px;
  margin-bottom: 8px;
`;

const IonListBox = styled(IonList)`
  &&& {
    padding-top: 0;
  }
`;

const SectionLabel = styled.div`
  padding: 18px 8px 10px;
  color: var(--app-text-muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
`;

const WatchListsLabelBox = styled(SectionLabel)`
  padding-top: 22px;
`;

const NavDescription = styled.div`
  color: var(--app-text-muted);
  font-size: 0.85rem;
  line-height: 1.55;
  padding: 0 10px 12px;
`;

const ControlsSummaryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 10px 14px;
`;

const SummaryChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 7px 11px;
  border-radius: 999px;
  background: var(--app-subtle-surface-2);
  border: 1px solid var(--app-border);
  color: var(--app-text);
  font-size: 0.78rem;
  font-weight: 700;
`;

const ThemeRail = styled.div`
  display: grid;
  gap: 8px;
`;

const ThemeLabel = styled.div`
  padding: 0 8px;
  color: var(--app-text-muted);
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const ThemeButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const ThemeButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid ${p => p.$active ? 'rgba(103, 168, 255, 0.28)' : 'var(--app-border)'};
  background: ${p => p.$active ? 'rgba(103, 168, 255, 0.16)' : 'var(--app-subtle-surface)'};
  color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-soft)'};
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: ${p => p.$active ? '0 10px 24px rgba(103, 168, 255, 0.12)' : 'none'};

  &:hover {
    border-color: var(--app-border-strong);
    background: ${p => p.$active ? 'rgba(103, 168, 255, 0.18)' : 'var(--app-hover-surface)'};
  }
`;

const navItems = [
  { path: '/dashboard', label: 'Management pozitii', description: 'Pozitii deschise si sugestii de management', icon: gridOutline },
  { path: '/guvid-history', label: 'Istoric Guvid', description: 'Istoric, win rate si performanta agregata', icon: statsChartOutline },
  { path: '/trading-dashboard', label: 'Trading dashboard', description: 'P&L agregat, calendar zilnic si distributie pe simbol', icon: pulseOutline },
  { path: '/backtest', label: 'Backtest', description: 'Testeaza reguli si compara rezultate', icon: flaskOutline },
  { path: '/guide', label: 'Ghid Greeks', description: 'Referinta rapida pentru metrici si interpretare', icon: bookOutline },
  { path: '/account', label: 'Contul meu', description: 'Credentiale, parola si configurare cont', icon: personCircleOutline },
];

const Menu: React.FC = observer(() => {
  const services = useServices();
  const history = useHistory();
  const location = useLocation();
  const tickers = services.tickers.recentTickers;
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme());
  const [expandedScannerSection, setExpandedScannerSection] = useState<string | undefined>('filters');
  const [expandedTickerSection, setExpandedTickerSection] = useState<string | undefined>(undefined);
  const filterSummary = useMemo(() => {
    const filters = services.settings.strategyFilters;
    return [
      `Delta ${filters.minDelta}-${filters.maxDelta}`,
      `DTE ${filters.minDaysToExpiration}-${filters.maxDaysToExpiration}`,
      `${filters.wings.join(', ')}$ wings`,
    ];
  }, [services.settings.strategyFilters.lastUpdate]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppTheme>;
      setTheme(customEvent.detail ?? getStoredTheme());
    };

    window.addEventListener('app-theme-change', onThemeChange as EventListener);
    return () => window.removeEventListener('app-theme-change', onThemeChange as EventListener);
  }, []);

  const stopAccordionToggle = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleAccordionGroupChange = (
    event: CustomEvent<{ value: string | string[] | null | undefined }>,
    setExpanded: React.Dispatch<React.SetStateAction<string | undefined>>,
  ) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName !== 'ION-ACCORDION-GROUP') {
      return;
    }

    const nextValue = event.detail.value;
    setExpanded(typeof nextValue === 'string' ? nextValue : undefined);
  };

  return (
    <IonMenu contentId="main" type="overlay">
      <IonContent>
        <IonListBox id="inbox-list">
          <IonListHeader>
            <MenuHeaderContentBox>
              <MenuTitleBox type="button" onClick={() => history.push('/app')}>
                <MenuLogo src="/logo-guvidul.svg" alt="Guvidul" />
                <MenuTitleText>
                  <MenuEyebrow>Workspace</MenuEyebrow>
                  <MenuName>Operatiunea Guvidul</MenuName>
                </MenuTitleText>
              </MenuTitleBox>
              <BrokerAccountsComponent />
              <ThemeRail>
                <ThemeLabel>Appearance</ThemeLabel>
                <ThemeButtons>
                  <ThemeButton type="button" $active={theme === 'dark'} onClick={() => setStoredTheme('dark')}>
                    <IonIcon icon={moonOutline} />
                    Dark
                  </ThemeButton>
                  <ThemeButton type="button" $active={theme === 'light'} onClick={() => setStoredTheme('light')}>
                    <IonIcon icon={sunnyOutline} />
                    Light
                  </ThemeButton>
                </ThemeButtons>
              </ThemeRail>
            </MenuHeaderContentBox>
          </IonListHeader>

          <AccountInfoComponent />

          <SectionLabel>Scanner Controls</SectionLabel>
          <NavDescription>Filtrele si simbolurile recente sunt tinute aproape de navigatie ca sa poti schimba contextul fara sa parasesti pagina curenta.</NavDescription>
          <ControlsSummaryRow>
            {filterSummary.map(item => <SummaryChip key={item}>{item}</SummaryChip>)}
          </ControlsSummaryRow>

          <IonAccordionGroup
            value={expandedScannerSection}
            onIonChange={e => handleAccordionGroupChange(e as CustomEvent<{ value: string | string[] | null | undefined }>, setExpandedScannerSection)}
          >
            <IonAccordion value="filters">
              <FiltersAccordionHeaderBox slot="header">
                <IonIcon slot="start" icon={filterOutline} />
                <IonLabel>Filters</IonLabel>
              </FiltersAccordionHeaderBox>
              <AccordionContentBox
                slot="content"
                onClickCapture={stopAccordionToggle}
                onMouseDownCapture={stopAccordionToggle}
                onPointerDownCapture={stopAccordionToggle}
                onTouchStartCapture={stopAccordionToggle}
              >
                <StrategyFiltersComponent />
              </AccordionContentBox>
            </IonAccordion>
          </IonAccordionGroup>

          <IonAccordionGroup
            value={expandedTickerSection}
            onIonChange={e => handleAccordionGroupChange(e as CustomEvent<{ value: string | string[] | null | undefined }>, setExpandedTickerSection)}
          >
            <IonAccordion value="recentTickers">
              <FiltersAccordionHeaderBox slot="header">
                <IonLabel>Recent symbols</IonLabel>
              </FiltersAccordionHeaderBox>
              <TickersBox slot="content">
                {tickers.map((ticker) => (
                  <TickerMenuItemComponent key={ticker.symbol} tickerSymbol={ticker.symbol} />
                ))}
              </TickersBox>
            </IonAccordion>
          </IonAccordionGroup>
        </IonListBox>

        <SectionLabel>Workspace</SectionLabel>
        {navItems.map(({ description, icon, label, path }) => (
          <IonItem
            key={path}
            button
            className={location.pathname === path ? 'selected' : undefined}
            routerLink={path}
            routerDirection="forward"
            detail={false}
            lines="none"
          >
            <IonIcon slot="start" icon={icon} />
            <IonLabel>
              <h3>{label}</h3>
              <p>{description}</p>
            </IonLabel>
          </IonItem>
        ))}

        {auth.currentUser?.uid === '7OcSxAkz8eahmOJD2ddu4ElBPsf2' && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <IonItem
              button
              className={location.pathname === '/superadmin' ? 'selected' : undefined}
              routerLink="/superadmin"
              routerDirection="forward"
              detail={false}
              lines="none"
            >
              <IonIcon slot="start" icon={keyOutline} />
              <IonLabel>
                <h3>SuperAdmin</h3>
                <p>Instrumente interne si configurari de nivel inalt</p>
              </IonLabel>
            </IonItem>
          </>
        )}

        <WatchListsLabelBox>Watch Lists</WatchListsLabelBox>
        <WatchListsComponent />
      </IonContent>
    </IonMenu>
  );
});

export default Menu;

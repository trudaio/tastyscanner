import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { IonSpinner } from '@ionic/react';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';

const C = {
    bgCard: '#12121a',
    bgCardElevated: '#1a1a24',
    border: '#2a2a3a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    accent1: '#3b82f6',
    accent2: '#8b5cf6',
} as const;

const TOP_ETFS: readonly string[] = ['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'DIA', 'VTI', 'VOO', 'EEM', 'XLF'];

const Sidebar = styled.aside`
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${C.bgCard};
  border: 1px solid ${C.border};
  border-radius: 12px;
  padding: 14px;
  max-height: calc(100vh - 100px);
  @media (max-width: 980px) {
    position: static;
    max-height: none;
  }
`;

const SidebarTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${C.textDim};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const SidebarSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FilterInput = styled.input`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 0.02em;
  &:focus { outline: 2px solid ${C.accent1}; outline-offset: -2px; }
  &::placeholder { color: ${C.textMuted}; }
`;

const TickerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: calc(100vh - 320px);
  padding-right: 4px;
  @media (max-width: 980px) { max-height: 320px; }
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: ${C.textMuted}; }
`;

const TickerItem = styled.button<{ $active: boolean }>`
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${(p) => (p.$active ? `linear-gradient(90deg, ${C.accent1}, ${C.accent2})` : 'transparent')};
  color: ${(p) => (p.$active ? 'white' : C.text)};
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  &:hover {
    background: ${(p) => (p.$active ? `linear-gradient(90deg, ${C.accent1}, ${C.accent2})` : C.bgCardElevated)};
  }
  &:disabled { cursor: progress; opacity: 0.85; }
`;

const TickerCount = styled.span<{ $active: boolean }>`
  font-size: 10px;
  color: ${(p) => (p.$active ? 'rgba(255,255,255,0.85)' : C.textMuted)};
  font-weight: 600;
`;

const SidebarMiniRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const MiniEtfButton = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? C.accent1 : C.bgCardElevated)};
  color: ${(p) => (p.$active ? 'white' : C.textDim)};
  border: 1px solid ${(p) => (p.$active ? C.accent1 : C.border)};
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.04em;
  &:hover { background: ${(p) => (p.$active ? C.accent1 : '#22222e')}; border-color: ${C.accent1}; }
`;

const SidebarAddRow = styled.div`
  display: flex;
  gap: 6px;
`;

const SmallButton = styled.button`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: ${C.accent1}; color: white; background: ${C.accent1}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

interface IProps {
    /** currently selected ticker (uppercase) */
    activeTicker: string;
    /** called when the user picks any ticker (from list, ETF, or "+ Add") */
    onPick: (ticker: string) => void;
    /** when true, indicates the parent is currently loading the active ticker */
    isLoading: boolean;
    /** optional per-ticker loading state — used to show a spinner on the row */
    isTickerLoading?: (ticker: string) => boolean;
}

export const SkewWatchlistSidebar: React.FC<IProps> = observer(({
    activeTicker,
    onPick,
    isLoading,
    isTickerLoading,
}) => {
    const services = useServices();
    const watchlist = services.skewWatchlist;

    const [filter, setFilter] = useState('');

    const filteredTickers = useMemo(() => {
        const f = filter.trim().toUpperCase();
        const list = watchlist.tickers ?? [];
        if (!f) return list;
        return list.filter((t) => t.toUpperCase().includes(f));
    }, [filter, watchlist.tickers]);

    const inWatchlist = useMemo(
        () => (watchlist.tickers ?? []).includes(activeTicker),
        [watchlist.tickers, activeTicker],
    );

    const handleAdd = (): void => {
        const t = activeTicker.trim().toUpperCase();
        if (!t) return;
        void watchlist.add(t);
    };

    return (
        <Sidebar>
            <SidebarSection>
                <SidebarTitle>Watchlist</SidebarTitle>
                <FilterInput
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter…"
                />
                <SidebarAddRow>
                    <SmallButton
                        onClick={handleAdd}
                        disabled={!activeTicker.trim() || inWatchlist}
                        title={inWatchlist ? 'Already in watchlist' : `Add ${activeTicker} to watchlist`}
                    >
                        {inWatchlist ? '✓ in list' : `+ Add ${activeTicker}`}
                    </SmallButton>
                </SidebarAddRow>
            </SidebarSection>

            <TickerList>
                {watchlist.isLoading && (watchlist.tickers ?? []).length === 0 && (
                    <div style={{ color: C.textMuted, fontSize: 12, padding: '8px 4px' }}>Loading…</div>
                )}
                {!watchlist.isLoading && filteredTickers.length === 0 && (
                    <div style={{ color: C.textMuted, fontSize: 12, padding: '8px 4px' }}>
                        {filter ? 'No matches' : 'Watchlist is empty'}
                    </div>
                )}
                {filteredTickers.map((t) => {
                    const upper = t.toUpperCase();
                    const active = upper === activeTicker;
                    const loadingThis = isTickerLoading?.(upper) ?? false;
                    return (
                        <TickerItem
                            key={upper}
                            $active={active}
                            onClick={() => onPick(upper)}
                            disabled={loadingThis}
                            title={`Load ${upper}`}
                        >
                            <span>{upper}</span>
                            {loadingThis ? (
                                <IonSpinner name="dots" style={{ height: 12, width: 18 }} />
                            ) : (
                                <TickerCount $active={active}>›</TickerCount>
                            )}
                        </TickerItem>
                    );
                })}
            </TickerList>

            <SidebarSection>
                <SidebarTitle>Quick ETFs</SidebarTitle>
                <SidebarMiniRow>
                    {TOP_ETFS.map((etf) => (
                        <MiniEtfButton
                            key={etf}
                            $active={activeTicker === etf}
                            onClick={() => onPick(etf)}
                            disabled={isLoading}
                        >
                            {etf}
                        </MiniEtfButton>
                    ))}
                </SidebarMiniRow>
            </SidebarSection>
        </Sidebar>
    );
});

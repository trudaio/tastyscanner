import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorTrade } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';
import { useHistory } from 'react-router-dom';

type SortKey = 'dte' | 'profit' | 'credit';
type SortDir = 'asc' | 'desc';

const Container = styled.div`
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: clamp(18px, 3vw, 28px);
    background: transparent;
    min-height: 100%;

    @media (max-width: 480px) {
        padding: 16px;
    }
`;

const Hero = styled.div`
    display: grid;
    gap: 18px;
    padding: clamp(20px, 3vw, 28px);
    border-radius: var(--app-radius-lg);
    background: var(--app-hero-surface);
    border: 1px solid var(--app-hero-border);
    box-shadow: var(--app-shadow);
    margin-bottom: 20px;
`;

const TopBar = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 16px;
    justify-content: space-between;
    flex-wrap: wrap;
`;

const HeroText = styled.div`
    display: grid;
    gap: 10px;
    max-width: 72ch;
`;

const Eyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
`;

const Title = styled.h1`
    color: var(--app-text);
    font-size: clamp(1.7rem, 3.4vw, 2.35rem);
    margin: 0;
    line-height: 1.05;
    letter-spacing: -0.03em;
`;

const Summary = styled.p`
    color: var(--app-text-soft);
    line-height: 1.6;
    margin: 0;
`;

const RefreshBtn = styled.button`
    min-height: 46px;
    padding: 10px 18px;
    background: linear-gradient(135deg, #67a8ff, #7de2d1);
    border: 1px solid rgba(103, 168, 255, 0.2);
    border-radius: 14px;
    color: #08111f;
    font-size: 0.92rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 16px 28px rgba(103, 168, 255, 0.18);
    transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;

    &:hover {
        transform: translateY(-1px);
        filter: brightness(0.99);
    }

    &:disabled {
        background: var(--app-subtle-surface-2);
        border-color: var(--app-border);
        color: var(--app-text-muted);
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
    }
`;

const MetricsRow = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;

    @media (max-width: 720px) {
        grid-template-columns: 1fr;
    }
`;

const MetricCard = styled.div`
    position: relative;
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--app-panel-surface);
    border: 1px solid var(--app-border);
    box-shadow: 0 18px 32px rgba(0, 0, 0, 0.12);
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: linear-gradient(180deg, var(--ion-color-primary), var(--ion-color-secondary));
        opacity: 0.9;
    }
`;

const MetricLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
    margin-bottom: 6px;
`;

const MetricValue = styled.div`
    color: var(--app-text);
    font-size: 1.25rem;
    font-weight: 800;
`;

const SectionCount = styled.span`
    background: var(--app-subtle-surface-3);
    color: var(--app-text-soft);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
`;

const TickerFilterRow = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 18px;
    align-items: center;
    padding: 10px;
    border-radius: 18px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
`;

const TickerFilterBtn = styled.button<{ $active?: boolean }>`
    padding: 8px 14px;
    background: ${p => p.$active ? 'rgba(103, 168, 255, 0.18)' : 'var(--app-subtle-surface)'};
    border: 1px solid ${p => p.$active ? 'rgba(103, 168, 255, 0.28)' : 'rgba(162, 184, 219, 0.12)'};
    border-radius: 999px;
    color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-soft)'};
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;

    &:hover {
        border-color: rgba(103, 168, 255, 0.28);
        background: ${p => p.$active ? 'rgba(103, 168, 255, 0.2)' : 'var(--app-hover-surface)'};
    }
`;

const DesktopTableWrap = styled.div`
    display: block;
    background: var(--app-panel-solid);
    border-radius: 18px;
    overflow-x: auto;
    border: 1px solid var(--app-border);
    box-shadow: 0 22px 42px rgba(0, 0, 0, 0.2);

    tbody tr:hover {
        background: var(--app-hover-surface);
    }

    @media (max-width: 860px) {
        display: none;
    }
`;

const Table = styled.table`
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
`;

const Th = styled.th<{ $align?: string }>`
    padding: 14px 16px;
    background: var(--app-table-head-surface);
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-align: ${p => p.$align ?? 'left'};
`;

const SortableTh = styled(Th)<{ $active?: boolean }>`
    cursor: pointer;
    color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-muted)'};

    &:hover {
        color: var(--app-text);
    }
`;

const SortArrow = styled.span`
    margin-left: 4px;
    font-size: 10px;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 14px 16px;
    border-bottom: 1px solid rgba(162, 184, 219, 0.1);
    color: var(--app-text);
    font-size: 13px;
    text-align: ${p => p.$align ?? 'left'};
`;

const DteCell = styled(Td)<{ $dte: number }>`
    color: ${p => p.$dte > 30 ? '#4dff91' : p.$dte >= 14 ? '#ffaa00' : '#ff4d6d'};
    font-weight: 700;
    white-space: nowrap;
`;

const ProfitCell = styled(Td)<{ $pct: number }>`
    font-weight: 800;
    color: ${p => p.$pct >= 75 ? '#4dff91' : p.$pct >= 50 ? '#ffaa00' : p.$pct >= 0 ? 'var(--app-text)' : '#ff4d6d'};
`;

const CloseBadge = styled.span`
    display: inline-block;
    background: rgba(77, 255, 145, 0.15);
    border: 1px solid #4dff91;
    color: #4dff91;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 999px;
`;

const HoldBadge = styled.span`
    display: inline-block;
    background: rgba(255, 170, 0, 0.12);
    border: 1px solid #ffaa00;
    color: #ffaa00;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 999px;
`;

const WaitBadge = styled.span`
    display: inline-block;
    background: var(--app-subtle-surface-3);
    color: var(--app-text-soft);
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 999px;
`;

const MobileCardList = styled.div`
    display: none;

    @media (max-width: 860px) {
        display: grid;
        gap: 12px;
    }
`;

const MobileCard = styled.div`
    padding: 16px;
    border-radius: 18px;
    background: var(--app-panel-solid);
    border: 1px solid var(--app-border);
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
`;

const MobileCardTop = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
`;

const MobileTicker = styled.div`
    color: var(--app-text);
    font-size: 1rem;
    font-weight: 800;
`;

const MobileExpiry = styled.div`
    color: var(--app-text-muted);
    font-size: 0.82rem;
    margin-top: 4px;
`;

const MobileGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
`;

const MobileMetric = styled.div`
    padding: 12px;
    border-radius: 14px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
`;

const MobileMetricLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
`;

const MobileMetricValue = styled.div`
    color: var(--app-text);
    font-weight: 700;
    line-height: 1.35;
`;

const EmptyState = styled.div`
    display: grid;
    gap: 16px;
    padding: 28px 20px;
    border-radius: 22px;
    border: 1px dashed rgba(162, 184, 219, 0.24);
    background: var(--app-surface-1);
    color: var(--app-text-soft);
    text-align: center;
    line-height: 1.6;
    justify-items: center;
`;

const EmptyStateEyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
`;

const EmptyStateTitle = styled.h2`
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.35rem, 2.3vw, 1.8rem);
    line-height: 1.08;
    letter-spacing: -0.03em;
`;

const EmptyStateDescription = styled.p`
    margin: 0;
    max-width: 60ch;
    color: var(--app-text-soft);
`;

const EmptyStateHints = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
`;

const EmptyStateHint = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 0.8rem;
    font-weight: 700;
`;

const EmptyStateActions = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
`;

const EmptyStateAction = styled.button<{ $primary?: boolean }>`
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 14px;
    border: 1px solid ${p => p.$primary ? 'rgba(103, 168, 255, 0.26)' : 'var(--app-border)'};
    background: ${p => p.$primary ? 'linear-gradient(135deg, rgba(103, 168, 255, 0.18), rgba(125, 226, 209, 0.1))' : 'var(--app-surface-1)'};
    color: var(--app-text);
    font-size: 0.88rem;
    font-weight: 800;
    cursor: pointer;
`;

const LoadingRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 4px 0;
    color: var(--app-text-muted);
`;

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const getSuggestion = (profitPct: number, credit: number) => {
    if (credit <= 0) return <WaitBadge>N/A</WaitBadge>;
    if (profitPct >= 75) return <CloseBadge>CLOSE</CloseBadge>;
    if (profitPct >= 50) return <HoldBadge>HOLD</HoldBadge>;
    return <WaitBadge>WAIT</WaitBadge>;
};

const getDte = (trade: IIronCondorTrade): number =>
    Math.ceil((new Date(trade.expirationDate).getTime() - Date.now()) / 86_400_000);

const getProfitPct = (trade: IIronCondorTrade): number =>
    trade.openCredit > 0
        ? ((trade.openCredit - trade.currentPrice) / trade.openCredit) * 100
        : 0;

export const DashboardComponent: React.FC = observer(() => {
    const services = useServices();
    const history = useHistory();
    const account = services.brokerAccount.currentAccount;

    const [openTrades, setOpenTrades] = useState<IIronCondorTrade[]>([]);
    const [loading, setLoading] = useState(false);
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const fetchPositions = async () => {
        if (!services.brokerAccount.currentAccount) return;
        setLoading(true);
        try {
            const trades = await services.ironCondorAnalytics.fetchOpenICsFromPositions();
            setOpenTrades(trades);
        } catch (e) {
            console.error('[Dashboard] Error fetching positions:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchPositions();
    }, [account]);

    const toggleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return key;
            }
            setSortDir('asc');
            return key;
        });
    }, []);

    const tickerList = useMemo(() => [...new Set(openTrades.map(t => t.ticker))].sort(), [openTrades]);

    const sortedTrades = useMemo(() => {
        const trades = tickerFilter
            ? openTrades.filter(t => t.ticker === tickerFilter)
            : [...openTrades];

        if (sortKey) {
            const mul = sortDir === 'asc' ? 1 : -1;
            trades.sort((a, b) => {
                let va = 0;
                let vb = 0;

                switch (sortKey) {
                    case 'dte':
                        va = getDte(a);
                        vb = getDte(b);
                        break;
                    case 'profit':
                        va = getProfitPct(a);
                        vb = getProfitPct(b);
                        break;
                    case 'credit':
                        va = a.openCredit;
                        vb = b.openCredit;
                        break;
                }

                return (va - vb) * mul;
            });
        }

        return trades;
    }, [openTrades, sortKey, sortDir, tickerFilter]);

    const sortArrow = (key: SortKey) => {
        if (sortKey !== key) return <SortArrow>⇅</SortArrow>;
        return <SortArrow>{sortDir === 'asc' ? '▲' : '▼'}</SortArrow>;
    };

    const totalCredit = sortedTrades.reduce((sum, trade) => sum + trade.openCredit, 0);
    const avgProfit = sortedTrades.length > 0
        ? sortedTrades.reduce((sum, trade) => sum + getProfitPct(trade), 0) / sortedTrades.length
        : 0;
    const nextExpiringTrade = sortedTrades.length > 0
        ? [...sortedTrades].sort((a, b) => getDte(a) - getDte(b))[0]
        : null;

    const hasAccount = Boolean(account);
    const isFilteredEmpty = Boolean(tickerFilter) && sortedTrades.length === 0;

    return (
        <Container>
            <Hero>
                <TopBar>
                    <HeroText>
                        <Eyebrow>Position Management</Eyebrow>
                        <Title>Open Iron Condors <SectionCount>{sortedTrades.length}{tickerFilter ? ` / ${openTrades.length}` : ''}</SectionCount></Title>
                        <Summary>Vezi rapid unde esti aproape de profit target, care pozitii expira primele si ce simboluri cer atentie imediata.</Summary>
                    </HeroText>
                    <RefreshBtn onClick={() => void fetchPositions()} disabled={loading}>
                        {loading ? 'Se actualizeaza...' : 'Actualizeaza'}
                    </RefreshBtn>
                </TopBar>

                <MetricsRow>
                    <MetricCard>
                        <MetricLabel>Total credit deschis</MetricLabel>
                        <MetricValue>{sortedTrades.length > 0 ? fmtCur(totalCredit) : '—'}</MetricValue>
                    </MetricCard>
                    <MetricCard>
                        <MetricLabel>Profit mediu curent</MetricLabel>
                        <MetricValue>{sortedTrades.length > 0 ? `${avgProfit.toFixed(1)}%` : '—'}</MetricValue>
                    </MetricCard>
                    <MetricCard>
                        <MetricLabel>Expira cel mai repede</MetricLabel>
                        <MetricValue>{nextExpiringTrade ? `${nextExpiringTrade.ticker} · ${getDte(nextExpiringTrade)}d` : '—'}</MetricValue>
                    </MetricCard>
                </MetricsRow>
            </Hero>

            {tickerList.length > 1 && (
                <TickerFilterRow>
                    <TickerFilterBtn $active={tickerFilter === null} onClick={() => setTickerFilter(null)}>
                        Toate
                    </TickerFilterBtn>
                    {tickerList.map(ticker => (
                        <TickerFilterBtn
                            key={ticker}
                            $active={tickerFilter === ticker}
                            onClick={() => setTickerFilter(ticker)}
                        >
                            {ticker}
                        </TickerFilterBtn>
                    ))}
                </TickerFilterRow>
            )}

            {sortedTrades.length === 0 && !loading ? (
                <EmptyState>
                    <EmptyStateEyebrow>
                        {!hasAccount ? 'Broker setup required' : isFilteredEmpty ? 'Filter active' : 'Portfolio clear'}
                    </EmptyStateEyebrow>
                    <EmptyStateTitle>
                        {!hasAccount
                            ? 'Conecteaza un cont broker ca sa vezi pozitiile active.'
                            : isFilteredEmpty
                                ? `Nu exista pozitii deschise pentru ${tickerFilter}.`
                                : 'Nu exista Iron Condors deschise in acest moment.'}
                    </EmptyStateTitle>
                    <EmptyStateDescription>
                        {!hasAccount
                            ? 'Dashboard-ul citeste pozitiile din contul broker curent. Dupa conectare, aici apar instant DTE, creditul ramas si sugestiile de management.'
                            : isFilteredEmpty
                                ? 'Ticker-ul selectat nu are expunere activa acum. Revino la toate simbolurile sau schimba rapid contextul din scanner.'
                                : 'Portofoliul e curat. Poti folosi scannerul pentru oportunitati noi sau backtest-ul pentru a rafina regulile inainte de urmatoarea intrare.'}
                    </EmptyStateDescription>
                    <EmptyStateHints>
                        {!hasAccount ? <EmptyStateHint>Cont broker lipsa</EmptyStateHint> : null}
                        {tickerFilter ? <EmptyStateHint>Filtru: {tickerFilter}</EmptyStateHint> : null}
                        <EmptyStateHint>Refresh manual disponibil</EmptyStateHint>
                    </EmptyStateHints>
                    <EmptyStateActions>
                        {!hasAccount ? (
                            <>
                                <EmptyStateAction $primary onClick={() => history.push('/account')}>Mergi la cont</EmptyStateAction>
                                <EmptyStateAction onClick={() => history.push('/app')}>Deschide scannerul</EmptyStateAction>
                            </>
                        ) : isFilteredEmpty ? (
                            <>
                                <EmptyStateAction $primary onClick={() => setTickerFilter(null)}>Vezi toate simbolurile</EmptyStateAction>
                                <EmptyStateAction onClick={() => history.push('/app')}>Schimba contextul</EmptyStateAction>
                            </>
                        ) : (
                            <>
                                <EmptyStateAction $primary onClick={() => history.push('/app')}>Cauta setup-uri</EmptyStateAction>
                                <EmptyStateAction onClick={() => history.push('/backtest')}>Ruleaza un backtest</EmptyStateAction>
                            </>
                        )}
                    </EmptyStateActions>
                </EmptyState>
            ) : (
                <>
                    <DesktopTableWrap>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Ticker</Th>
                                    <Th>Expiration</Th>
                                    <Th>Put Spread</Th>
                                    <Th>Call Spread</Th>
                                    <Th $align="center">Qty</Th>
                                    <SortableTh $align="center" $active={sortKey === 'dte'} onClick={() => toggleSort('dte')}>
                                        DTE{sortArrow('dte')}
                                    </SortableTh>
                                    <SortableTh $align="right" $active={sortKey === 'credit'} onClick={() => toggleSort('credit')}>
                                        Credit{sortArrow('credit')}
                                    </SortableTh>
                                    <Th $align="right">Current Price</Th>
                                    <SortableTh $align="right" $active={sortKey === 'profit'} onClick={() => toggleSort('profit')}>
                                        Profit %{sortArrow('profit')}
                                    </SortableTh>
                                    <Th $align="center">Suggestion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTrades.map(trade => {
                                    const dte = getDte(trade);
                                    const profitPct = getProfitPct(trade);

                                    return (
                                        <tr key={trade.id}>
                                            <Td><strong>{trade.ticker}</strong></Td>
                                            <Td>{trade.expirationDate}</Td>
                                            <Td>{trade.putBuyStrike}/{trade.putSellStrike}</Td>
                                            <Td>{trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                            <Td $align="center">{trade.quantity}</Td>
                                            <DteCell $dte={dte} $align="center">{dte}d</DteCell>
                                            <Td $align="right">{fmtCur(trade.openCredit)}</Td>
                                            <Td $align="right">{fmtCur(trade.currentPrice)}</Td>
                                            <ProfitCell $pct={profitPct} $align="right">
                                                {trade.openCredit > 0 ? `${profitPct.toFixed(1)}%` : 'N/A'}
                                            </ProfitCell>
                                            <Td $align="center">{getSuggestion(profitPct, trade.openCredit)}</Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </DesktopTableWrap>

                    <MobileCardList>
                        {sortedTrades.map(trade => {
                            const dte = getDte(trade);
                            const profitPct = getProfitPct(trade);

                            return (
                                <MobileCard key={trade.id}>
                                    <MobileCardTop>
                                        <div>
                                            <MobileTicker>{trade.ticker}</MobileTicker>
                                            <MobileExpiry>{trade.expirationDate}</MobileExpiry>
                                        </div>
                                        {getSuggestion(profitPct, trade.openCredit)}
                                    </MobileCardTop>

                                    <MobileGrid>
                                        <MobileMetric>
                                            <MobileMetricLabel>Put spread</MobileMetricLabel>
                                            <MobileMetricValue>{trade.putBuyStrike}/{trade.putSellStrike}</MobileMetricValue>
                                        </MobileMetric>
                                        <MobileMetric>
                                            <MobileMetricLabel>Call spread</MobileMetricLabel>
                                            <MobileMetricValue>{trade.callSellStrike}/{trade.callBuyStrike}</MobileMetricValue>
                                        </MobileMetric>
                                        <MobileMetric>
                                            <MobileMetricLabel>DTE</MobileMetricLabel>
                                            <MobileMetricValue style={{ color: dte > 30 ? '#4dff91' : dte >= 14 ? '#ffaa00' : '#ff4d6d' }}>{dte}d</MobileMetricValue>
                                        </MobileMetric>
                                        <MobileMetric>
                                            <MobileMetricLabel>Profit curent</MobileMetricLabel>
                                            <MobileMetricValue style={{ color: profitPct >= 75 ? '#4dff91' : profitPct >= 50 ? '#ffaa00' : profitPct >= 0 ? 'var(--app-text)' : '#ff4d6d' }}>
                                                {trade.openCredit > 0 ? `${profitPct.toFixed(1)}%` : 'N/A'}
                                            </MobileMetricValue>
                                        </MobileMetric>
                                        <MobileMetric>
                                            <MobileMetricLabel>Credit</MobileMetricLabel>
                                            <MobileMetricValue>{fmtCur(trade.openCredit)}</MobileMetricValue>
                                        </MobileMetric>
                                        <MobileMetric>
                                            <MobileMetricLabel>Current price</MobileMetricLabel>
                                            <MobileMetricValue>{fmtCur(trade.currentPrice)}</MobileMetricValue>
                                        </MobileMetric>
                                    </MobileGrid>
                                </MobileCard>
                            );
                        })}
                    </MobileCardList>
                </>
            )}

            {loading && (
                <LoadingRow>
                    <IonSpinner name="crescent" />
                    <span>Se incarca pozitiile din TastyTrade...</span>
                </LoadingRow>
            )}
        </Container>
    );
});

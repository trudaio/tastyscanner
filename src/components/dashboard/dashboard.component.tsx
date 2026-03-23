import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorTrade } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';
import { PORTFOLIO_DELTA_ALERT_THRESHOLD } from '../../services/broker-account/broker-account.service.interface';
import { BrokerBadgeInline } from '../broker-manager/broker-badge-inline.component';
import { BrokerType } from '../../services/broker-provider/broker-provider.interface';
import type { IBrokerAccount } from '../../services/credentials/broker-credentials.service.interface';

/* ─── Types ──────────────────────────────────────────────── */

type SortKey = 'dte' | 'profit' | 'credit';
type SortDir = 'asc' | 'desc';

/* ─── Layout ──────────────────────────────────────────────── */

const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    min-height: 100%;
    @media (max-width: 480px) { padding: 12px; }
`;

const TopBar = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 20px;
`;

const Title = styled.h1`
    color: #fff;
    font-size: 22px;
    margin: 0;
    flex: 1;
    white-space: nowrap;
`;

const RefreshBtn = styled.button`
    padding: 7px 20px;
    background: #4a9eff;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    &:hover { background: #3a8eef; }
    &:disabled { background: #333; cursor: not-allowed; }
`;

/* ─── Section ─────────────────────────────────────────────── */

/* ─── Delta Alert Banner ──────────────────────────────────── */

const DeltaAlertBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(220, 53, 69, 0.12);
    border: 1px solid rgba(220, 53, 69, 0.6);
    border-radius: 8px;
    padding: 10px 16px;
    margin-bottom: 16px;
    color: #ff6b7a;
    font-size: 13px;
    font-weight: 600;
`;

const AlertIcon = styled.span`
    font-size: 18px;
    flex-shrink: 0;
`;

/* ─── Section ─────────────────────────────────────────────── */

const SectionCount = styled.span`
    background: #2a2a3e;
    color: #888;
    font-size: 12px;
    font-weight: 400;
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: 10px;
`;

/* ─── Ticker filter ──────────────────────────────────────── */

const TickerFilterRow = styled.div`
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    align-items: center;
`;

const TickerFilterBtn = styled.button<{ $active?: boolean }>`
    padding: 5px 12px;
    background: ${p => p.$active ? '#4a9eff' : '#1a1a2e'};
    border: 1px solid ${p => p.$active ? '#4a9eff' : '#333'};
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    font-weight: ${p => p.$active ? 600 : 400};
    cursor: pointer;
    &:hover { background: ${p => p.$active ? '#4a9eff' : '#2a2a3e'}; }
`;

/* ─── Table ───────────────────────────────────────────────── */

const TableWrap = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
`;

const Table = styled.table`
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
`;

const Th = styled.th<{ $align?: string }>`
    padding: 10px 14px;
    background: #2a2a3e;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 500;
    text-align: ${p => p.$align ?? 'left'};
`;

const SortableTh = styled(Th)<{ $active?: boolean }>`
    cursor: pointer;
    user-select: none;
    transition: color 0.15s;
    color: ${p => p.$active ? '#4a9eff' : '#888'};
    &:hover { color: #fff; }
`;

const SortArrow = styled.span`
    margin-left: 4px;
    font-size: 10px;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 10px 14px;
    border-bottom: 1px solid #1e1e32;
    color: #fff;
    font-size: 13px;
    text-align: ${p => p.$align ?? 'left'};
`;

const DteCell = styled(Td)<{ $dte: number }>`
    color: ${p => p.$dte > 30 ? '#4dff91' : p.$dte >= 14 ? '#ffaa00' : '#ff4d6d'};
    font-weight: 600;
    white-space: nowrap;
`;

const ProfitCell = styled(Td)<{ $pct: number }>`
    font-weight: 700;
    color: ${p => p.$pct >= 75 ? '#4dff91' : p.$pct >= 50 ? '#ffaa00' : p.$pct >= 0 ? '#fff' : '#ff4d6d'};
`;

/* ─── Suggestion badges ──────────────────────────────────── */

const CloseBadge = styled.span`
    display: inline-block;
    background: rgba(77,255,145,0.15);
    border: 1px solid #4dff91;
    color: #4dff91;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
`;

const HoldBadge = styled.span`
    display: inline-block;
    background: rgba(255,170,0,0.12);
    border: 1px solid #ffaa00;
    color: #ffaa00;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
`;

const WaitBadge = styled.span`
    display: inline-block;
    background: #2a2a3e;
    color: #888;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
`;

/* ─── Helpers ─────────────────────────────────────────────── */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const getSuggestion = (profitPct: number, credit: number) => {
    if (credit <= 0) return <WaitBadge>N/A</WaitBadge>;
    if (profitPct >= 75) return <CloseBadge>CLOSE ✓</CloseBadge>;
    if (profitPct >= 50) return <HoldBadge>HOLD</HoldBadge>;
    return <WaitBadge>WAIT</WaitBadge>;
};

const getDte = (trade: IIronCondorTrade): number =>
    Math.ceil((new Date(trade.expirationDate).getTime() - Date.now()) / 86_400_000);

const getProfitPct = (trade: IIronCondorTrade): number =>
    trade.openCredit > 0
        ? ((trade.openCredit - trade.currentPrice) / trade.openCredit) * 100
        : 0;

/* ─── Component ───────────────────────────────────────────── */

export const DashboardComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;

    const [openTrades, setOpenTrades] = useState<IIronCondorTrade[]>([]);
    const [loading, setLoading] = useState(false);
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [activeBroker, setActiveBroker] = useState<IBrokerAccount | null>(null);

    useEffect(() => {
        services.brokerCredentials.getActiveBrokerAccount()
            .then(a => setActiveBroker(a))
            .catch(() => { /* ignore */ });
    }, [services.brokerCredentials]);

    /* fetch open ICs from positions API */
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

    useEffect(() => { fetchPositions(); }, [account]);

    /* toggle sort — click same column flips direction, click new column sorts asc */
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

    /* ticker filter */
    const tickerList = useMemo(() => {
        return [...new Set(openTrades.map(t => t.ticker))].sort();
    }, [openTrades]);

    /* filter + sort */
    const sortedTrades = useMemo(() => {
        let trades = tickerFilter
            ? openTrades.filter(t => t.ticker === tickerFilter)
            : [...openTrades];

        if (sortKey) {
            const mul = sortDir === 'asc' ? 1 : -1;
            trades.sort((a, b) => {
                let va: number, vb: number;
                switch (sortKey) {
                    case 'dte':    va = getDte(a); vb = getDte(b); break;
                    case 'profit': va = getProfitPct(a); vb = getProfitPct(b); break;
                    case 'credit': va = a.openCredit; vb = b.openCredit; break;
                }
                return (va - vb) * mul;
            });
        }

        return trades;
    }, [openTrades, tickerFilter, sortKey, sortDir]);

    const sortArrow = (key: SortKey) => {
        if (sortKey !== key) return <SortArrow>⇅</SortArrow>;
        return <SortArrow>{sortDir === 'asc' ? '▲' : '▼'}</SortArrow>;
    };

    return (
        <Container>
            <TopBar>
                <Title>
                    Open Iron Condors
                    <SectionCount>{sortedTrades.length}{tickerFilter ? ` / ${openTrades.length}` : ''}</SectionCount>
                    {activeBroker && (
                        <span style={{ marginLeft: 8 }}>
                            <BrokerBadgeInline brokerType={activeBroker.brokerType} />
                        </span>
                    )}
                </Title>
                <RefreshBtn onClick={fetchPositions} disabled={loading}>
                    {loading ? 'Loading…' : '↻ Refresh'}
                </RefreshBtn>
            </TopBar>

            {account?.isDeltaAlertActive && (
                <DeltaAlertBanner>
                    <AlertIcon>⚠️</AlertIcon>
                    <span>
                        Portfolio delta imbalance: <strong>Δ {account.portfolioGreeks?.delta.toFixed(2)}</strong> exceeds ±{PORTFOLIO_DELTA_ALERT_THRESHOLD} — consider hedging or adjusting positions.
                    </span>
                </DeltaAlertBanner>
            )}

            {tickerList.length > 1 && (
                <TickerFilterRow>
                    <TickerFilterBtn
                        $active={tickerFilter === null}
                        onClick={() => setTickerFilter(null)}
                    >
                        ALL
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

            <TableWrap>
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
                        {sortedTrades.length === 0 ? (
                            <tr>
                                <Td colSpan={10} $align="center" style={{ color: '#444', padding: '24px' }}>
                                    {loading ? 'Loading positions…' : (tickerFilter ? `No open ICs for ${tickerFilter}` : 'No open Iron Condors')}
                                </Td>
                            </tr>
                        ) : sortedTrades.map(trade => {
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
                                    <Td $align="center">
                                        {getSuggestion(profitPct, trade.openCredit)}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrap>

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0', color: '#666' }}>
                    <IonSpinner name="crescent" />
                    <span>Fetching positions from TastyTrade…</span>
                </div>
            )}
        </Container>
    );
});

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { ITransactionRawData } from '../../services/market-data-provider/market-data-provider.service.interface';

/* ─── Types ──────────────────────────────────────────────── */

type SortKey = 'date' | 'action' | 'symbol' | 'quantity' | 'price' | 'value' | 'fees';
type SortDir = 'asc' | 'desc';

interface IRoundTrip {
    symbol: string;
    underlyingSymbol: string;
    openDate: string;
    closeDate: string | null;
    openCredit: number;
    closeDebit: number | null;
    netPnl: number | null;
    holdDays: number | null;
    orderId: number | undefined;
    status: 'closed' | 'open';
}

/* ─── Styled Components ──────────────────────────────────── */

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

const MetricsRow = styled.div`
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const MetricCard = styled.div<{ $color?: string }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 14px 18px;
    min-width: 120px;
    flex: 1;
    border-left: 4px solid ${p => p.$color || '#4a9eff'};
    @media (max-width: 480px) {
        padding: 10px 14px;
        min-width: 100px;
    }
`;

const MetricLabel = styled.div`
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
`;

const MetricValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || '#fff'};
    font-size: 18px;
    font-weight: 700;
`;

const FiltersRow = styled.div`
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
    align-items: flex-end;
`;

const FilterGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const FilterLabel = styled.label`
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const FilterInput = styled.input`
    background: #1a1a2e;
    border: 1px solid #2a2a4e;
    border-radius: 6px;
    color: #fff;
    padding: 7px 12px;
    font-size: 13px;
    outline: none;
    &:focus { border-color: #4a9eff; }
`;

const FilterSelect = styled.select`
    background: #1a1a2e;
    border: 1px solid #2a2a4e;
    border-radius: 6px;
    color: #fff;
    padding: 7px 12px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    &:focus { border-color: #4a9eff; }
    option { background: #1a1a2e; }
`;

const TableWrapper = styled.div`
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid #1a1a2e;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
`;

const Th = styled.th<{ $sortable?: boolean; $active?: boolean }>`
    background: #13132a;
    color: ${p => p.$active ? '#4a9eff' : '#aaa'};
    padding: 10px 14px;
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    cursor: ${p => p.$sortable ? 'pointer' : 'default'};
    user-select: none;
    border-bottom: 1px solid #1a1a2e;
    &:hover { color: ${p => p.$sortable ? '#4a9eff' : 'inherit'}; }
`;

const Td = styled.td`
    padding: 9px 14px;
    border-bottom: 1px solid #131326;
    color: #ccc;
    white-space: nowrap;
`;

const Tr = styled.tr`
    &:hover td { background: #111128; }
`;

const PnlText = styled.span<{ $value: number }>`
    color: ${p => p.$value > 0 ? '#4caf50' : p.$value < 0 ? '#f44336' : '#888'};
    font-weight: 600;
`;

const Badge = styled.span<{ $status: string }>`
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: ${p => p.$status === 'closed' ? '#1a3a1a' : '#1a2a3a'};
    color: ${p => p.$status === 'closed' ? '#4caf50' : '#4a9eff'};
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 60px 20px;
    color: #555;
    font-size: 15px;
`;

const TabsRow = styled.div`
    display: flex;
    gap: 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #1a1a2e;
`;

const Tab = styled.button<{ $active: boolean }>`
    padding: 10px 20px;
    background: transparent;
    border: none;
    border-bottom: 2px solid ${p => p.$active ? '#4a9eff' : 'transparent'};
    color: ${p => p.$active ? '#4a9eff' : '#888'};
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s;
    &:hover { color: #4a9eff; }
`;

const SpinnerBox = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 60px;
`;

const SortIcon = styled.span`
    margin-left: 4px;
    opacity: 0.7;
`;

/* ─── Helpers ────────────────────────────────────────────── */

function fmtDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCurrency(val: number): string {
    return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function parseMoney(s: string | undefined): number {
    if (!s) return 0;
    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
}

function totalFees(tx: ITransactionRawData): number {
    return parseMoney(tx['clearing-fees'])
        + parseMoney(tx['regulatory-fees'])
        + parseMoney(tx['proprietary-index-option-fees'])
        + parseMoney(tx.commission);
}

function diffDays(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/* ─── Component ──────────────────────────────────────────── */

export const TransactionHistoryComponent: React.FC = observer(() => {
    const services = useServices();

    // Date range — default YTD
    const now = new Date();
    const ytdStart = `${now.getFullYear()}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);

    const [startDate, setStartDate] = useState(ytdStart);
    const [endDate, setEndDate] = useState(todayStr);
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState<ITransactionRawData[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [tab, setTab] = useState<'all' | 'roundtrips'>('all');
    const [filterTicker, setFilterTicker] = useState('');
    const [filterType, setFilterType] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const accountNumber = services.brokerAccount.accounts[0]?.accountNumber ?? '';

    const fetchTransactions = useCallback(async () => {
        if (!accountNumber) return;
        setLoading(true);
        setError(null);
        try {
            const all: ITransactionRawData[] = [];
            let hasMore = true;
            let pageOffset = 0;
            const pageSize = 250;

            while (hasMore) {
                const page = await services.marketDataProvider.getTransactions(accountNumber, {
                    'start-date': startDate,
                    'end-date': endDate,
                    'per-page': pageSize,
                    'page-offset': pageOffset,
                });
                if (Array.isArray(page) && page.length > 0) {
                    all.push(...page);
                    pageOffset++;
                    hasMore = page.length === pageSize;
                } else {
                    hasMore = false;
                }
            }
            setTransactions(all);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load transactions');
        } finally {
            setLoading(false);
        }
    }, [accountNumber, startDate, endDate, services.marketDataProvider]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    /* ─── Filter + Sort ────────────────────────────────────── */

    const filtered = useMemo(() => {
        let list = transactions;
        if (filterTicker) {
            const t = filterTicker.toUpperCase();
            list = list.filter(tx => tx['underlying-symbol']?.toUpperCase().includes(t));
        }
        if (filterType) {
            list = list.filter(tx => tx['transaction-type'] === filterType);
        }
        return list;
    }, [transactions, filterTicker, filterType]);

    const sorted = useMemo(() => {
        const list = [...filtered];
        list.sort((a, b) => {
            let va: string | number = 0;
            let vb: string | number = 0;
            switch (sortKey) {
                case 'date':   va = a['executed-at']; vb = b['executed-at']; break;
                case 'action': va = a.action ?? ''; vb = b.action ?? ''; break;
                case 'symbol': va = a['underlying-symbol'] ?? ''; vb = b['underlying-symbol'] ?? ''; break;
                case 'quantity': va = parseFloat(a.quantity) || 0; vb = parseFloat(b.quantity) || 0; break;
                case 'price':  va = parseMoney(a.price); vb = parseMoney(b.price); break;
                case 'value':  va = parseMoney(a['net-value']); vb = parseMoney(b['net-value']); break;
                case 'fees':   va = totalFees(a); vb = totalFees(b); break;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [filtered, sortKey, sortDir]);

    /* ─── Round-trip matching ──────────────────────────────── */

    const roundTrips = useMemo((): IRoundTrip[] => {
        // Only option trades (have underlying-symbol different from symbol)
        const optionTrades = transactions.filter(tx =>
            tx.symbol && tx['underlying-symbol'] && tx.symbol !== tx['underlying-symbol']
        );

        // Group by underlying + instrument symbol
        const byKey: Record<string, ITransactionRawData[]> = {};
        for (const tx of optionTrades) {
            const key = `${tx['underlying-symbol']}::${tx.symbol}`;
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(tx);
        }

        const trips: IRoundTrip[] = [];
        for (const [key, txs] of Object.entries(byKey)) {
            const [underlyingSymbol, symbol] = key.split('::');
            txs.sort((a, b) => new Date(a['executed-at']).getTime() - new Date(b['executed-at']).getTime());

            const opens = txs.filter(tx => tx.action?.includes('Open') || tx.action?.includes('Buy'));
            const closes = txs.filter(tx => tx.action?.includes('Close') || (tx.action?.includes('Sell') && !tx.action?.includes('Sell to Open')));

            if (opens.length === 0) continue;

            const openTx = opens[0];
            const closeTx = closes[0] ?? null;

            const effectMultiplier = (tx: ITransactionRawData) =>
                tx['value-effect'] === 'Credit' ? 1 : -1;

            const openVal = parseMoney(openTx['net-value']) * effectMultiplier(openTx);
            const closeVal = closeTx ? parseMoney(closeTx['net-value']) * effectMultiplier(closeTx) : null;
            const netPnl = closeVal !== null ? openVal + closeVal : null;

            trips.push({
                symbol,
                underlyingSymbol,
                openDate: openTx['executed-at'],
                closeDate: closeTx?.['executed-at'] ?? null,
                openCredit: openVal,
                closeDebit: closeVal,
                netPnl,
                holdDays: closeTx ? diffDays(openTx['executed-at'], closeTx['executed-at']) : null,
                orderId: openTx['order-id'],
                status: closeTx ? 'closed' : 'open',
            });
        }

        trips.sort((a, b) => new Date(b.openDate).getTime() - new Date(a.openDate).getTime());
        return trips;
    }, [transactions]);

    /* ─── Summary stats ────────────────────────────────────── */

    const summary = useMemo(() => {
        const totalPnl = roundTrips
            .filter(r => r.netPnl !== null)
            .reduce((acc, r) => acc + (r.netPnl ?? 0), 0);
        const totalFeesPaid = filtered.reduce((acc, tx) => acc + totalFees(tx), 0);
        const tradeCount = filtered.length;
        const winners = roundTrips.filter(r => (r.netPnl ?? 0) > 0).length;
        const winRate = roundTrips.filter(r => r.netPnl !== null).length > 0
            ? (winners / roundTrips.filter(r => r.netPnl !== null).length) * 100
            : 0;
        return { totalPnl, totalFeesPaid, tradeCount, winRate };
    }, [filtered, roundTrips]);

    /* ─── Sort handler ─────────────────────────────────────── */

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortIcon = (key: SortKey) => {
        if (sortKey !== key) return <SortIcon>↕</SortIcon>;
        return <SortIcon>{sortDir === 'asc' ? '↑' : '↓'}</SortIcon>;
    };

    const txTypes = useMemo(() => {
        const types = new Set(transactions.map(t => t['transaction-type']).filter(Boolean));
        return Array.from(types).sort();
    }, [transactions]);

    /* ─── Render ─────────────────────────────────────────────── */

    return (
        <Container>
            <TopBar>
                <Title>Istoric Tranzactii</Title>
                <RefreshBtn onClick={fetchTransactions} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh'}
                </RefreshBtn>
            </TopBar>

            {/* Summary metrics */}
            <MetricsRow>
                <MetricCard $color={summary.totalPnl >= 0 ? '#4caf50' : '#f44336'}>
                    <MetricLabel>Total P&L</MetricLabel>
                    <MetricValue $color={summary.totalPnl >= 0 ? '#4caf50' : '#f44336'}>
                        {fmtCurrency(summary.totalPnl)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color="#ff9800">
                    <MetricLabel>Total Fees</MetricLabel>
                    <MetricValue $color="#ff9800">{fmtCurrency(summary.totalFeesPaid)}</MetricValue>
                </MetricCard>
                <MetricCard $color="#4a9eff">
                    <MetricLabel>Transactions</MetricLabel>
                    <MetricValue>{summary.tradeCount}</MetricValue>
                </MetricCard>
                <MetricCard $color="#9c27b0">
                    <MetricLabel>Win Rate</MetricLabel>
                    <MetricValue>{summary.winRate.toFixed(1)}%</MetricValue>
                </MetricCard>
            </MetricsRow>

            {/* Filters */}
            <FiltersRow>
                <FilterGroup>
                    <FilterLabel>Start Date</FilterLabel>
                    <FilterInput
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                    />
                </FilterGroup>
                <FilterGroup>
                    <FilterLabel>End Date</FilterLabel>
                    <FilterInput
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                    />
                </FilterGroup>
                <FilterGroup>
                    <FilterLabel>Ticker</FilterLabel>
                    <FilterInput
                        type="text"
                        placeholder="e.g. SPY"
                        value={filterTicker}
                        onChange={e => setFilterTicker(e.target.value)}
                        style={{ width: '100px' }}
                    />
                </FilterGroup>
                <FilterGroup>
                    <FilterLabel>Type</FilterLabel>
                    <FilterSelect value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">All Types</option>
                        {txTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </FilterSelect>
                </FilterGroup>
            </FiltersRow>

            {/* Tabs */}
            <TabsRow>
                <Tab $active={tab === 'all'} onClick={() => setTab('all')}>All Transactions</Tab>
                <Tab $active={tab === 'roundtrips'} onClick={() => setTab('roundtrips')}>Round Trips</Tab>
            </TabsRow>

            {/* Error */}
            {error && (
                <div style={{ color: '#f44336', marginBottom: 16, padding: '12px', background: '#1a1010', borderRadius: 8 }}>
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <SpinnerBox>
                    <IonSpinner name="crescent" style={{ color: '#4a9eff' }} />
                </SpinnerBox>
            )}

            {/* All Transactions Table */}
            {!loading && tab === 'all' && (
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th $sortable $active={sortKey === 'date'} onClick={() => handleSort('date')}>
                                    Date {sortIcon('date')}
                                </Th>
                                <Th $sortable $active={sortKey === 'action'} onClick={() => handleSort('action')}>
                                    Action {sortIcon('action')}
                                </Th>
                                <Th $sortable $active={sortKey === 'symbol'} onClick={() => handleSort('symbol')}>
                                    Ticker {sortIcon('symbol')}
                                </Th>
                                <Th>Instrument</Th>
                                <Th $sortable $active={sortKey === 'quantity'} onClick={() => handleSort('quantity')}>
                                    Qty {sortIcon('quantity')}
                                </Th>
                                <Th $sortable $active={sortKey === 'price'} onClick={() => handleSort('price')}>
                                    Price {sortIcon('price')}
                                </Th>
                                <Th $sortable $active={sortKey === 'value'} onClick={() => handleSort('value')}>
                                    Net Value {sortIcon('value')}
                                </Th>
                                <Th $sortable $active={sortKey === 'fees'} onClick={() => handleSort('fees')}>
                                    Fees {sortIcon('fees')}
                                </Th>
                                <Th>Order ID</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 ? (
                                <tr>
                                    <td colSpan={9}>
                                        <EmptyState>No transactions found</EmptyState>
                                    </td>
                                </tr>
                            ) : sorted.map((tx, i) => {
                                const netVal = parseMoney(tx['net-value']);
                                const effect = tx['value-effect'];
                                const signedVal = effect === 'Credit' ? netVal : -netVal;
                                const fees = totalFees(tx);
                                return (
                                    <Tr key={`${tx.id}-${i}`}>
                                        <Td>{fmtDate(tx['executed-at'])}</Td>
                                        <Td>{tx.action || tx['transaction-sub-type'] || '—'}</Td>
                                        <Td style={{ color: '#fff', fontWeight: 600 }}>{tx['underlying-symbol'] || '—'}</Td>
                                        <Td style={{ fontSize: 11, color: '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {tx.symbol !== tx['underlying-symbol'] ? tx.symbol : '—'}
                                        </Td>
                                        <Td>{tx.quantity || '—'}</Td>
                                        <Td>{tx.price ? fmtCurrency(parseMoney(tx.price)) : '—'}</Td>
                                        <Td>
                                            <PnlText $value={signedVal}>
                                                {fmtCurrency(Math.abs(netVal))}
                                                {' '}
                                                <span style={{ fontSize: 10, opacity: 0.7 }}>{effect}</span>
                                            </PnlText>
                                        </Td>
                                        <Td style={{ color: fees > 0 ? '#ff9800' : '#555' }}>
                                            {fees > 0 ? fmtCurrency(fees) : '—'}
                                        </Td>
                                        <Td style={{ color: '#555', fontSize: 11 }}>{tx['order-id'] ?? '—'}</Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </TableWrapper>
            )}

            {/* Round Trips Table */}
            {!loading && tab === 'roundtrips' && (
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Ticker</Th>
                                <Th>Instrument</Th>
                                <Th>Open Date</Th>
                                <Th>Close Date</Th>
                                <Th>Open Credit</Th>
                                <Th>Close Debit</Th>
                                <Th>Net P&L</Th>
                                <Th>Hold Days</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {roundTrips.length === 0 ? (
                                <tr>
                                    <td colSpan={9}>
                                        <EmptyState>No round trips found</EmptyState>
                                    </td>
                                </tr>
                            ) : roundTrips.map((rt, i) => (
                                <Tr key={`${rt.symbol}-${i}`}>
                                    <Td style={{ color: '#fff', fontWeight: 600 }}>{rt.underlyingSymbol}</Td>
                                    <Td style={{ fontSize: 11, color: '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {rt.symbol}
                                    </Td>
                                    <Td>{fmtDate(rt.openDate)}</Td>
                                    <Td>{rt.closeDate ? fmtDate(rt.closeDate) : '—'}</Td>
                                    <Td>
                                        <PnlText $value={rt.openCredit}>
                                            {fmtCurrency(Math.abs(rt.openCredit))}
                                        </PnlText>
                                    </Td>
                                    <Td>
                                        {rt.closeDebit !== null
                                            ? <PnlText $value={rt.closeDebit}>{fmtCurrency(Math.abs(rt.closeDebit))}</PnlText>
                                            : '—'
                                        }
                                    </Td>
                                    <Td>
                                        {rt.netPnl !== null
                                            ? <PnlText $value={rt.netPnl}>{fmtCurrency(rt.netPnl)}</PnlText>
                                            : '—'
                                        }
                                    </Td>
                                    <Td>{rt.holdDays !== null ? `${rt.holdDays}d` : '—'}</Td>
                                    <Td><Badge $status={rt.status}>{rt.status}</Badge></Td>
                                </Tr>
                            ))}
                        </tbody>
                    </Table>
                </TableWrapper>
            )}
        </Container>
    );
});

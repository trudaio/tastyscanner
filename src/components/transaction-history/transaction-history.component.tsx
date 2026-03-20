import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { ITransactionRawData } from '../../services/market-data-provider/market-data-provider.service.interface';

/* ─── Types ──────────────────────────────────────────────── */

type SortKey = 'openDate' | 'ticker' | 'netPnl' | 'status';
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

/* ─── Date filter ─────────────────────────────────────────── */

const DateFilterRow = styled.div`
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

/* ─── Stat Cards ─────────────────────────────────────────── */

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
    font-size: 10px;
    text-transform: uppercase;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
`;

const MetricValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || '#fff'};
    font-size: 18px;
    font-weight: 700;
`;

/* ─── Section titles ─────────────────────────────────────── */

const SectionTitle = styled.h2`
    color: #fff;
    font-size: 16px;
    margin: 28px 0 12px 0;
    font-weight: 600;
`;

/* ─── Ticker filter buttons ──────────────────────────────── */

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
    margin-bottom: 24px;
`;

const Table = styled.table`
    width: 100%;
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
    white-space: nowrap;
`;

const SortableTh = styled(Th)<{ $active?: boolean }>`
    cursor: pointer;
    user-select: none;
    color: ${p => p.$active ? '#4a9eff' : '#888'};
    &:hover { color: #fff; }
`;

const Td = styled.td<{ $align?: string }>`
    padding: 10px 14px;
    border-bottom: 1px solid #1e1e32;
    color: #fff;
    font-size: 13px;
    text-align: ${p => p.$align ?? 'left'};
`;

const PLValue = styled.span<{ $value: number }>`
    color: ${p => p.$value > 0 ? '#4dff91' : p.$value < 0 ? '#ff4d6d' : '#888'};
    font-weight: 600;
`;

const WinRateValue = styled.span<{ $pct: number }>`
    color: ${p => p.$pct >= 60 ? '#4dff91' : p.$pct >= 40 ? '#ffaa00' : '#ff4d6d'};
    font-weight: 600;
`;

/* ─── Status badge ───────────────────────────────────────── */

const StatusBadge = styled.span<{ $status: string }>`
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    ${p => {
        switch (p.$status) {
            case 'open': return 'background: rgba(74,158,255,0.15); border: 1px solid #4a9eff; color: #4a9eff;';
            case 'closed': return 'background: rgba(77,255,145,0.15); border: 1px solid #4dff91; color: #4dff91;';
            default: return 'background: #2a2a3e; color: #888;';
        }
    }}
`;

/* ─── Calendar ───────────────────────────────────────────── */

const CalendarContainer = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
    overflow-x: auto;
`;

const CalendarMonthRow = styled.div`
    margin-bottom: 20px;
`;

const CalendarMonthLabel = styled.div`
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
`;

const CalendarDaysGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
`;

const CalendarDayHeader = styled.div`
    text-align: center;
    color: #666;
    font-size: 10px;
    font-weight: 600;
    padding: 4px;
    text-transform: uppercase;
`;

const CalendarDay = styled.div<{ $hasData: boolean; $isProfit: boolean; $isEmpty?: boolean }>`
    min-height: 48px;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    background: ${p => {
        if (p.$isEmpty) return 'transparent';
        if (!p.$hasData) return '#1f1f35';
        return p.$isProfit ? 'rgba(77, 255, 145, 0.18)' : 'rgba(255, 77, 109, 0.18)';
    }};
    border: 1px solid ${p => {
        if (p.$isEmpty) return 'transparent';
        if (!p.$hasData) return '#2a2a3e';
        return p.$isProfit ? 'rgba(77, 255, 145, 0.3)' : 'rgba(255, 77, 109, 0.3)';
    }};
    @media (max-width: 480px) { min-height: 36px; }
`;

const CalendarDayNum = styled.div<{ $isToday?: boolean }>`
    font-size: 11px;
    color: ${p => p.$isToday ? '#4a9eff' : '#666'};
    font-weight: ${p => p.$isToday ? 700 : 400};
`;

const CalendarDayPL = styled.div<{ $value: number }>`
    font-size: 10px;
    font-weight: 600;
    color: ${p => p.$value > 0 ? '#4dff91' : '#ff4d6d'};
    margin-top: auto;
`;

const CalendarDayTrades = styled.div`
    font-size: 9px;
    color: #666;
`;

const DaySummaryRow = styled.div`
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    font-size: 13px;
`;

/* ─── Helpers ─────────────────────────────────────────────── */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseMoney(s: string | undefined): number {
    if (!s) return 0;
    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
}

function diffDays(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/* ─── Component ──────────────────────────────────────────── */

export const TransactionHistoryComponent: React.FC = observer(() => {
    const services = useServices();

    const now = new Date();
    const ytdStart = `${now.getFullYear()}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);

    const [startDate, setStartDate] = useState(ytdStart);
    const [endDate, setEndDate] = useState(todayStr);
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState<ITransactionRawData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('openDate');
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

    /* ─── Round-trip matching ──────────────────────────────── */

    const roundTrips = useMemo((): IRoundTrip[] => {
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

    /* ─── 6 Summary Stats ──────────────────────────────────── */

    const closedTrips = useMemo(() => roundTrips.filter(r => r.status === 'closed' && r.netPnl !== null), [roundTrips]);

    const stats = useMemo(() => {
        const closedCount = closedTrips.length;
        const winners = closedTrips.filter(r => (r.netPnl ?? 0) > 0).length;
        const winRate = closedCount > 0 ? (winners / closedCount) * 100 : 0;
        const totalPnl = closedTrips.reduce((acc, r) => acc + (r.netPnl ?? 0), 0);
        const avgProfitPerTrade = closedCount > 0 ? totalPnl / closedCount : 0;

        // P&L per unique close day
        const uniqueCloseDays = new Set(closedTrips.map(r => r.closeDate?.slice(0, 10)).filter(Boolean));
        const plPerDay = uniqueCloseDays.size > 0 ? totalPnl / uniqueCloseDays.size : 0;

        // Avg hold duration
        const tripsWithDays = closedTrips.filter(r => r.holdDays !== null);
        const avgDuration = tripsWithDays.length > 0
            ? tripsWithDays.reduce((acc, r) => acc + (r.holdDays ?? 0), 0) / tripsWithDays.length
            : 0;

        return { closedCount, winRate, totalPnl, avgProfitPerTrade, plPerDay, avgDuration };
    }, [closedTrips]);

    /* ─── Trades by Ticker ─────────────────────────────────── */

    const byTicker = useMemo(() => {
        const map = new Map<string, { trades: number; profitable: number; unprofitable: number; winRate: number; totalPnl: number }>();
        for (const r of closedTrips) {
            const ticker = r.underlyingSymbol;
            const existing = map.get(ticker) ?? { trades: 0, profitable: 0, unprofitable: 0, winRate: 0, totalPnl: 0 };
            existing.trades++;
            existing.totalPnl += r.netPnl ?? 0;
            if ((r.netPnl ?? 0) > 0) existing.profitable++;
            else existing.unprofitable++;
            existing.winRate = existing.trades > 0 ? (existing.profitable / existing.trades) * 100 : 0;
            map.set(ticker, existing);
        }
        return Array.from(map.entries())
            .map(([ticker, data]) => ({ ticker, ...data }))
            .sort((a, b) => b.totalPnl - a.totalPnl);
    }, [closedTrips]);

    /* ─── Monthly P&L ──────────────────────────────────────── */

    const byMonth = useMemo(() => {
        const map = new Map<string, { trades: number; profitable: number; winRate: number; totalPnl: number }>();
        for (const r of closedTrips) {
            const month = r.closeDate?.slice(0, 7) ?? '';
            if (!month) continue;
            const existing = map.get(month) ?? { trades: 0, profitable: 0, winRate: 0, totalPnl: 0 };
            existing.trades++;
            existing.totalPnl += r.netPnl ?? 0;
            if ((r.netPnl ?? 0) > 0) existing.profitable++;
            existing.winRate = existing.trades > 0 ? (existing.profitable / existing.trades) * 100 : 0;
            map.set(month, existing);
        }
        return Array.from(map.entries())
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [closedTrips]);

    /* ─── Daily P&L for calendar ───────────────────────────── */

    const dailyPLMap = useMemo(() => {
        const map = new Map<string, { pl: number; trades: number }>();
        for (const r of closedTrips) {
            const date = r.closeDate?.slice(0, 10);
            if (!date) continue;
            const existing = map.get(date) ?? { pl: 0, trades: 0 };
            existing.pl += r.netPnl ?? 0;
            existing.trades++;
            map.set(date, existing);
        }
        return map;
    }, [closedTrips]);

    const profitableDays = useMemo(() => Array.from(dailyPLMap.values()).filter(d => d.pl > 0).length, [dailyPLMap]);
    const unprofitableDays = useMemo(() => Array.from(dailyPLMap.values()).filter(d => d.pl <= 0).length, [dailyPLMap]);

    /* ─── Calendar months ──────────────────────────────────── */

    const calendarMonths = useMemo(() => {
        const year = now.getFullYear();
        const currentMonth = now.getMonth();
        const todayDateStr = now.toISOString().split('T')[0];

        const months: Array<{
            label: string;
            days: Array<{ date: string; dayNum: number; pl: number; trades: number; hasData: boolean; isEmpty: boolean; isToday: boolean }>;
        }> = [];

        for (let m = 0; m <= currentMonth; m++) {
            const firstDay = new Date(year, m, 1);
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            const startDow = firstDay.getDay();

            const days: typeof months[0]['days'] = [];

            for (let i = 0; i < startDow; i++) {
                days.push({ date: '', dayNum: 0, pl: 0, trades: 0, hasData: false, isEmpty: true, isToday: false });
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const data = dailyPLMap.get(dateStr);
                days.push({
                    date: dateStr,
                    dayNum: d,
                    pl: data?.pl ?? 0,
                    trades: data?.trades ?? 0,
                    hasData: !!data,
                    isEmpty: false,
                    isToday: dateStr === todayDateStr,
                });
            }

            while (days.length % 7 !== 0) {
                days.push({ date: '', dayNum: 0, pl: 0, trades: 0, hasData: false, isEmpty: true, isToday: false });
            }

            months.push({ label: `${MONTH_NAMES[m]} ${year}`, days });
        }

        return months;
    }, [dailyPLMap]);

    /* ─── Ticker list for filter ───────────────────────────── */

    const tickerList = useMemo(() => {
        return [...new Set(roundTrips.map(r => r.underlyingSymbol))].sort();
    }, [roundTrips]);

    /* ─── Filtered + sorted detailed trades ────────────────── */

    const sortedTrades = useMemo(() => {
        let list = tickerFilter
            ? roundTrips.filter(r => r.underlyingSymbol === tickerFilter)
            : [...roundTrips];

        const mul = sortDir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            switch (sortKey) {
                case 'openDate': return a.openDate.localeCompare(b.openDate) * mul;
                case 'ticker': return a.underlyingSymbol.localeCompare(b.underlyingSymbol) * mul;
                case 'netPnl': return ((a.netPnl ?? 0) - (b.netPnl ?? 0)) * mul;
                case 'status': return a.status.localeCompare(b.status) * mul;
                default: return 0;
            }
        });
        return list;
    }, [roundTrips, tickerFilter, sortKey, sortDir]);

    const toggleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return key;
            }
            setSortDir(key === 'openDate' ? 'desc' : 'asc');
            return key;
        });
    }, []);

    const sortArrow = (key: SortKey) => {
        if (sortKey !== key) return ' \u21C5';
        return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
    };

    /* ─── Render ─────────────────────────────────────────────── */

    return (
        <Container>
            {/* ─── Header ───────────────────────────────────────── */}
            <TopBar>
                <Title>Istoric Tranzactii</Title>
                <RefreshBtn onClick={fetchTransactions} disabled={loading}>
                    {loading ? 'Loading...' : '\u21BB Refresh'}
                </RefreshBtn>
            </TopBar>

            {/* ─── Date Range Filter ────────────────────────────── */}
            <DateFilterRow>
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
            </DateFilterRow>

            {/* ─── Error ────────────────────────────────────────── */}
            {error && (
                <div style={{ color: '#ff4d6d', marginBottom: 16, padding: '12px', background: '#1a1010', borderRadius: 8 }}>
                    {error}
                </div>
            )}

            {/* ─── Loading ──────────────────────────────────────── */}
            {loading && !roundTrips.length && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: '#666' }}>
                    <IonSpinner name="crescent" />
                    <span>Loading transaction history...</span>
                </div>
            )}

            {/* ─── Section 1: Stat Cards ────────────────────────── */}
            <MetricsRow>
                <MetricCard $color="#4a9eff">
                    <MetricLabel>Closed Round Trips</MetricLabel>
                    <MetricValue>{stats.closedCount}</MetricValue>
                </MetricCard>
                <MetricCard $color={stats.winRate >= 60 ? '#4dff91' : stats.winRate >= 40 ? '#ffaa00' : '#ff4d6d'}>
                    <MetricLabel>Win Rate</MetricLabel>
                    <MetricValue $color={stats.winRate >= 60 ? '#4dff91' : stats.winRate >= 40 ? '#ffaa00' : '#ff4d6d'}>
                        {stats.winRate.toFixed(1)}%
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={stats.totalPnl >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>Total P&L</MetricLabel>
                    <MetricValue $color={stats.totalPnl >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(stats.totalPnl)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={stats.avgProfitPerTrade >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>Avg Profit / Trade</MetricLabel>
                    <MetricValue $color={stats.avgProfitPerTrade >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(stats.avgProfitPerTrade)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={stats.plPerDay >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>P&L / Day</MetricLabel>
                    <MetricValue $color={stats.plPerDay >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(stats.plPerDay)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color="#4a9eff">
                    <MetricLabel>Avg Duration</MetricLabel>
                    <MetricValue>{stats.avgDuration.toFixed(1)}d</MetricValue>
                </MetricCard>
            </MetricsRow>

            {/* ─── Section 2: Trades by Ticker ──────────────────── */}
            <SectionTitle>Trades by Ticker</SectionTitle>
            <TableWrap>
                <Table style={{ minWidth: 500 }}>
                    <thead>
                        <tr>
                            <Th>Ticker</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="center">Unprofitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&L</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {byTicker.length === 0 ? (
                            <tr>
                                <Td colSpan={6} $align="center" style={{ color: '#444', padding: '24px' }}>
                                    No closed round trips found
                                </Td>
                            </tr>
                        ) : byTicker.map(row => (
                            <tr key={row.ticker}>
                                <Td><strong>{row.ticker}</strong></Td>
                                <Td $align="center">{row.trades}</Td>
                                <Td $align="center" style={{ color: '#4dff91' }}>{row.profitable}</Td>
                                <Td $align="center" style={{ color: '#ff4d6d' }}>{row.unprofitable}</Td>
                                <Td $align="right"><WinRateValue $pct={row.winRate}>{row.winRate.toFixed(1)}%</WinRateValue></Td>
                                <Td $align="right"><PLValue $value={row.totalPnl}>{fmtCur(row.totalPnl)}</PLValue></Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </TableWrap>

            {/* ─── Section 3: Monthly P&L ───────────────────────── */}
            <SectionTitle>Monthly P&L</SectionTitle>
            <TableWrap>
                <Table style={{ minWidth: 400 }}>
                    <thead>
                        <tr>
                            <Th>Month</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&L</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {byMonth.length === 0 ? (
                            <tr>
                                <Td colSpan={5} $align="center" style={{ color: '#444', padding: '24px' }}>
                                    No monthly data available
                                </Td>
                            </tr>
                        ) : byMonth.map(row => (
                            <tr key={row.month}>
                                <Td><strong>{row.month}</strong></Td>
                                <Td $align="center">{row.trades}</Td>
                                <Td $align="center" style={{ color: '#4dff91' }}>{row.profitable}</Td>
                                <Td $align="right"><WinRateValue $pct={row.winRate}>{row.winRate.toFixed(1)}%</WinRateValue></Td>
                                <Td $align="right"><PLValue $value={row.totalPnl}>{fmtCur(row.totalPnl)}</PLValue></Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </TableWrap>

            {/* ─── Section 4: Daily P&L Calendar ────────────────── */}
            <SectionTitle>Daily P&L Calendar</SectionTitle>
            <DaySummaryRow>
                <span style={{ color: '#4dff91' }}>{profitableDays} profitable days</span>
                <span style={{ color: '#888' }}>|</span>
                <span style={{ color: '#ff4d6d' }}>{unprofitableDays} unprofitable days</span>
            </DaySummaryRow>
            <CalendarContainer>
                {calendarMonths.map(month => (
                    <CalendarMonthRow key={month.label}>
                        <CalendarMonthLabel>{month.label}</CalendarMonthLabel>
                        <CalendarDaysGrid>
                            {DAY_NAMES.map(d => <CalendarDayHeader key={d}>{d}</CalendarDayHeader>)}
                            {month.days.map((day, idx) => (
                                <CalendarDay
                                    key={`${month.label}-${idx}`}
                                    $hasData={day.hasData}
                                    $isProfit={day.pl > 0}
                                    $isEmpty={day.isEmpty}
                                >
                                    {!day.isEmpty && (
                                        <>
                                            <CalendarDayNum $isToday={day.isToday}>{day.dayNum}</CalendarDayNum>
                                            {day.hasData && (
                                                <>
                                                    <CalendarDayPL $value={day.pl}>{fmtCur(day.pl)}</CalendarDayPL>
                                                    <CalendarDayTrades>{day.trades} trade{day.trades !== 1 ? 's' : ''}</CalendarDayTrades>
                                                </>
                                            )}
                                        </>
                                    )}
                                </CalendarDay>
                            ))}
                        </CalendarDaysGrid>
                    </CalendarMonthRow>
                ))}
            </CalendarContainer>

            {/* ─── Section 5: Detailed Trade History ────────────── */}
            <SectionTitle>Trade History</SectionTitle>

            {tickerList.length > 1 && (
                <TickerFilterRow>
                    <TickerFilterBtn $active={tickerFilter === null} onClick={() => setTickerFilter(null)}>
                        ALL ({roundTrips.length})
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
                <Table style={{ minWidth: 800 }}>
                    <thead>
                        <tr>
                            <Th>Order ID</Th>
                            <SortableTh $active={sortKey === 'ticker'} onClick={() => toggleSort('ticker')}>
                                Ticker{sortArrow('ticker')}
                            </SortableTh>
                            <SortableTh $active={sortKey === 'openDate'} onClick={() => toggleSort('openDate')}>
                                Open Date{sortArrow('openDate')}
                            </SortableTh>
                            <Th>Close Date</Th>
                            <Th $align="right">Open Credit</Th>
                            <Th $align="right">Close Debit</Th>
                            <SortableTh $align="right" $active={sortKey === 'netPnl'} onClick={() => toggleSort('netPnl')}>
                                P&L{sortArrow('netPnl')}
                            </SortableTh>
                            <Th $align="center">Hold Days</Th>
                            <SortableTh $align="center" $active={sortKey === 'status'} onClick={() => toggleSort('status')}>
                                Status{sortArrow('status')}
                            </SortableTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTrades.length === 0 ? (
                            <tr>
                                <Td colSpan={9} $align="center" style={{ color: '#444', padding: '24px' }}>
                                    {tickerFilter ? `No trades for ${tickerFilter}` : 'No round trips found'}
                                </Td>
                            </tr>
                        ) : sortedTrades.map((rt, i) => (
                            <tr key={`${rt.symbol}-${i}`}>
                                <Td style={{ fontSize: 11, color: '#666' }}>{rt.orderId ?? '—'}</Td>
                                <Td><strong>{rt.underlyingSymbol}</strong></Td>
                                <Td>{rt.openDate.slice(0, 10)}</Td>
                                <Td>
                                    {rt.closeDate
                                        ? rt.closeDate.slice(0, 10)
                                        : <StatusBadge $status="open">OPEN</StatusBadge>
                                    }
                                </Td>
                                <Td $align="right"><PLValue $value={rt.openCredit}>{fmtCur(rt.openCredit)}</PLValue></Td>
                                <Td $align="right">
                                    {rt.closeDebit !== null
                                        ? <PLValue $value={rt.closeDebit}>{fmtCur(rt.closeDebit)}</PLValue>
                                        : '—'
                                    }
                                </Td>
                                <Td $align="right">
                                    {rt.netPnl !== null
                                        ? <PLValue $value={rt.netPnl}>{fmtCur(rt.netPnl)}</PLValue>
                                        : '—'
                                    }
                                </Td>
                                <Td $align="center">{rt.holdDays !== null ? `${rt.holdDays}d` : '—'}</Td>
                                <Td $align="center">
                                    <StatusBadge $status={rt.status}>{rt.status.toUpperCase()}</StatusBadge>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </TableWrap>

            {loading && roundTrips.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0', color: '#666' }}>
                    <IonSpinner name="crescent" />
                    <span>Refreshing data...</span>
                </div>
            )}
        </Container>
    );
});

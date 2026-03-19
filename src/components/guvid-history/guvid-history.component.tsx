import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import {
    IGuvidHistorySummary,
    IDailyICPL,
    IIronCondorTrade,
    ITickerSummary,
    IMonthSummary,
} from '../../services/iron-condor-analytics/iron-condor-analytics.interface';

/* ─── Types ──────────────────────────────────────────────── */

type SortKey = 'openDate' | 'ticker' | 'profit' | 'status';
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

/* ─── Status badges ──────────────────────────────────────── */

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
            case 'expired': return 'background: rgba(255,170,0,0.12); border: 1px solid #ffaa00; color: #ffaa00;';
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

/* ─── Component ───────────────────────────────────────────── */

export const GuvidHistoryComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;

    const [summary, setSummary] = useState<IGuvidHistorySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('openDate');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const fetchHistory = async () => {
        if (!services.brokerAccount.currentAccount) return;
        setLoading(true);
        try {
            const data = await services.ironCondorAnalytics.getHistorySummary();
            setSummary(data);
        } catch (e) {
            console.error('[Guvid History] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchHistory(); }, [account]);

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

    /* Ticker list for filter */
    const tickerList = useMemo(() => {
        if (!summary) return [];
        return [...new Set(summary.trades.map(t => t.ticker))].sort();
    }, [summary]);

    /* Ticker breakdown from summary */
    const tickerBreakdown = useMemo(() => {
        if (!summary) return [];
        return Array.from(summary.byTicker.values())
            .sort((a, b) => b.totalProfit - a.totalProfit);
    }, [summary]);

    /* Monthly breakdown from summary */
    const monthlyBreakdown = useMemo(() => {
        if (!summary) return [];
        return Array.from(summary.byMonth.values())
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [summary]);

    /* Per-ticker P&L/day + avg duration */
    const tickerExtraStats = useMemo(() => {
        const map = new Map<string, { plPerDay: number; avgDuration: number }>();
        if (!summary) return map;
        for (const [ticker, ts] of summary.byTicker.entries()) {
            const closed = summary.trades.filter(
                t => t.ticker === ticker && t.status !== 'open' && t.openDate && (t.closeDate || t.expirationDate),
            );
            const closeDates = new Set<string>();
            for (const t of closed) closeDates.add((t.closeDate || t.expirationDate)!.substring(0, 10));
            const days = closeDates.size;
            const plPerDay = days > 0 ? ts.totalProfit / days : 0;
            let avgDuration = 0;
            if (closed.length > 0) {
                let tot = 0;
                for (const t of closed) {
                    tot += Math.max(0, Math.round((new Date(t.closeDate || t.expirationDate).getTime() - new Date(t.openDate).getTime()) / 86400000));
                }
                avgDuration = tot / closed.length;
            }
            map.set(ticker, { plPerDay, avgDuration });
        }
        return map;
    }, [summary]);

    /* Per-month P&L/day + avg duration */
    const monthExtraStats = useMemo(() => {
        const map = new Map<string, { plPerDay: number; avgDuration: number }>();
        if (!summary) return map;
        for (const [month, ms] of summary.byMonth.entries()) {
            const daysInMonth = summary.dailyPL.filter(d => d.date.substring(0, 7) === month).length;
            const plPerDay = daysInMonth > 0 ? ms.totalProfit / daysInMonth : 0;
            const closed = summary.trades.filter(t => {
                if (t.status === 'open') return false;
                const cd = t.closeDate || t.expirationDate;
                return cd && cd.substring(0, 7) === month;
            });
            let avgDuration = 0;
            if (closed.length > 0) {
                let tot = 0;
                for (const t of closed) {
                    tot += Math.max(0, Math.round((new Date(t.closeDate || t.expirationDate).getTime() - new Date(t.openDate).getTime()) / 86400000));
                }
                avgDuration = tot / closed.length;
            }
            map.set(month, { plPerDay, avgDuration });
        }
        return map;
    }, [summary]);

    /* Filtered + sorted trades */
    const sortedTrades = useMemo(() => {
        if (!summary) return [];
        let trades = tickerFilter
            ? summary.trades.filter(t => t.ticker === tickerFilter)
            : [...summary.trades];

        const mul = sortDir === 'asc' ? 1 : -1;
        trades.sort((a, b) => {
            switch (sortKey) {
                case 'openDate': return a.openDate.localeCompare(b.openDate) * mul;
                case 'ticker': return a.ticker.localeCompare(b.ticker) * mul;
                case 'profit': {
                    const pa = a.status === 'open' ? a.openCredit : a.profit;
                    const pb = b.status === 'open' ? b.openCredit : b.profit;
                    return (pa - pb) * mul;
                }
                case 'status': return a.status.localeCompare(b.status) * mul;
                default: return 0;
            }
        });
        return trades;
    }, [summary, tickerFilter, sortKey, sortDir]);

    /* Calendar data: build month grids from dailyPL */
    const calendarMonths = useMemo(() => {
        if (!summary) return [];

        const now = new Date();
        const year = now.getFullYear();
        const currentMonth = now.getMonth();
        const todayStr = now.toISOString().split('T')[0];

        // Build a lookup from dailyPL
        const plMap = new Map<string, IDailyICPL>();
        for (const d of summary.dailyPL) {
            plMap.set(d.date, d);
        }

        const months: Array<{
            label: string;
            days: Array<{ date: string; dayNum: number; pl: number; trades: number; hasData: boolean; isEmpty: boolean; isToday: boolean }>;
        }> = [];

        // Show Jan through current month
        for (let m = 0; m <= currentMonth; m++) {
            const firstDay = new Date(year, m, 1);
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            const startDow = firstDay.getDay(); // 0=Sun

            const days: typeof months[0]['days'] = [];

            // Empty cells before the 1st
            for (let i = 0; i < startDow; i++) {
                days.push({ date: '', dayNum: 0, pl: 0, trades: 0, hasData: false, isEmpty: true, isToday: false });
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const data = plMap.get(dateStr);
                days.push({
                    date: dateStr,
                    dayNum: d,
                    pl: data?.totalPL ?? 0,
                    trades: data?.tradesClosedCount ?? 0,
                    hasData: !!data,
                    isEmpty: false,
                    isToday: dateStr === todayStr,
                });
            }

            // Pad end to complete last week
            while (days.length % 7 !== 0) {
                days.push({ date: '', dayNum: 0, pl: 0, trades: 0, hasData: false, isEmpty: true, isToday: false });
            }

            months.push({ label: `${MONTH_NAMES[m]} ${year}`, days });
        }

        return months;
    }, [summary]);

    const sortArrow = (key: SortKey) => {
        if (sortKey !== key) return ' \u21C5';
        return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
    };

    if (loading && !summary) {
        return (
            <Container>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: '#666' }}>
                    <IonSpinner name="crescent" />
                    <span>Loading YTD Iron Condor history...</span>
                </div>
            </Container>
        );
    }

    if (!summary) {
        return (
            <Container>
                <TopBar>
                    <Title>Guvid History</Title>
                    <RefreshBtn onClick={fetchHistory} disabled={loading}>
                        {loading ? 'Loading...' : '\u21BB Refresh'}
                    </RefreshBtn>
                </TopBar>
                <div style={{ color: '#444', textAlign: 'center', padding: '40px' }}>
                    No data available. Connect your TastyTrade account to see IC performance.
                </div>
            </Container>
        );
    }

    const ytd = summary.yearToDate;

    // Realized P&L = only from closed/expired trades (NOT open positions)
    const realizedPL = ytd.totalWins + ytd.totalLosses;
    const avgProfitPerClosed = ytd.closedTrades > 0 ? realizedPL / ytd.closedTrades : 0;

    // P&L per day — realized P&L / number of unique trading days that had closings
    const tradingDays = summary.dailyPL.length;
    const plPerDay = tradingDays > 0 ? realizedPL / tradingDays : 0;

    // Average day duration — mean calendar days from openDate to closeDate for closed trades
    const closedForDuration = summary.trades.filter(
        t => t.status !== 'open' && t.openDate && (t.closeDate || t.expirationDate),
    );
    let avgDaysHeld = 0;
    if (closedForDuration.length > 0) {
        let totalDays = 0;
        for (const t of closedForDuration) {
            const open = new Date(t.openDate);
            const close = new Date(t.closeDate || t.expirationDate);
            const diffMs = close.getTime() - open.getTime();
            totalDays += Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        }
        avgDaysHeld = totalDays / closedForDuration.length;
    }

    return (
        <Container>
            {/* ─── Header ───────────────────────────────────────── */}
            <TopBar>
                <Title>Guvid History</Title>
                <RefreshBtn onClick={fetchHistory} disabled={loading}>
                    {loading ? 'Loading...' : '\u21BB Refresh'}
                </RefreshBtn>
            </TopBar>

            {/* ─── Section 1: Stat Cards (closed trades only) ──── */}
            <MetricsRow>
                <MetricCard $color="#4a9eff">
                    <MetricLabel>Closed IC Trades</MetricLabel>
                    <MetricValue>{ytd.closedTrades}</MetricValue>
                </MetricCard>
                <MetricCard $color={ytd.winRate >= 60 ? '#4dff91' : ytd.winRate >= 40 ? '#ffaa00' : '#ff4d6d'}>
                    <MetricLabel>Win Rate</MetricLabel>
                    <MetricValue $color={ytd.winRate >= 60 ? '#4dff91' : ytd.winRate >= 40 ? '#ffaa00' : '#ff4d6d'}>
                        {ytd.winRate.toFixed(1)}%
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={realizedPL >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>Total P&L</MetricLabel>
                    <MetricValue $color={realizedPL >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(realizedPL)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={avgProfitPerClosed >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>Avg Profit / Trade</MetricLabel>
                    <MetricValue $color={avgProfitPerClosed >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(avgProfitPerClosed)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color={plPerDay >= 0 ? '#4dff91' : '#ff4d6d'}>
                    <MetricLabel>P&L / Day</MetricLabel>
                    <MetricValue $color={plPerDay >= 0 ? '#4dff91' : '#ff4d6d'}>
                        {fmtCur(plPerDay)}
                    </MetricValue>
                </MetricCard>
                <MetricCard $color="#4a9eff">
                    <MetricLabel>Avg Duration</MetricLabel>
                    <MetricValue>
                        {avgDaysHeld.toFixed(1)}d
                    </MetricValue>
                </MetricCard>
            </MetricsRow>

            {/* ─── Section 2: Trades by Ticker ──────────────────── */}
            <SectionTitle>Trades by Ticker</SectionTitle>
            <TableWrap>
                <Table style={{ minWidth: 650 }}>
                    <thead>
                        <tr>
                            <Th>Ticker</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="center">Unprofitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&L</Th>
                            <Th $align="right">P&L / Day</Th>
                            <Th $align="right">Avg Duration</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickerBreakdown.map(ts => {
                            const extra = tickerExtraStats.get(ts.ticker);
                            return (
                                <tr key={ts.ticker}>
                                    <Td><strong>{ts.ticker}</strong></Td>
                                    <Td $align="center">{ts.totalTrades}</Td>
                                    <Td $align="center" style={{ color: '#4dff91' }}>{ts.profitableTrades}</Td>
                                    <Td $align="center" style={{ color: '#ff4d6d' }}>{ts.totalTrades - ts.profitableTrades}</Td>
                                    <Td $align="right"><WinRateValue $pct={ts.winRate}>{ts.winRate.toFixed(1)}%</WinRateValue></Td>
                                    <Td $align="right"><PLValue $value={ts.totalProfit}>{fmtCur(ts.totalProfit)}</PLValue></Td>
                                    <Td $align="right"><PLValue $value={extra?.plPerDay ?? 0}>{fmtCur(extra?.plPerDay ?? 0)}</PLValue></Td>
                                    <Td $align="right">{(extra?.avgDuration ?? 0).toFixed(1)}d</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrap>

            {/* ─── Section 3: Monthly P&L ───────────────────────── */}
            <SectionTitle>Monthly P&L</SectionTitle>
            <TableWrap>
                <Table style={{ minWidth: 600 }}>
                    <thead>
                        <tr>
                            <Th>Month</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&L</Th>
                            <Th $align="right">P&L / Day</Th>
                            <Th $align="right">Avg Duration</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyBreakdown.map(ms => {
                            const extra = monthExtraStats.get(ms.month);
                            return (
                                <tr key={ms.month}>
                                    <Td><strong>{ms.month}</strong></Td>
                                    <Td $align="center">{ms.totalTrades}</Td>
                                    <Td $align="center" style={{ color: '#4dff91' }}>{ms.profitableTrades}</Td>
                                    <Td $align="right"><WinRateValue $pct={ms.winRate}>{ms.winRate.toFixed(1)}%</WinRateValue></Td>
                                    <Td $align="right"><PLValue $value={ms.totalProfit}>{fmtCur(ms.totalProfit)}</PLValue></Td>
                                    <Td $align="right"><PLValue $value={extra?.plPerDay ?? 0}>{fmtCur(extra?.plPerDay ?? 0)}</PLValue></Td>
                                    <Td $align="right">{(extra?.avgDuration ?? 0).toFixed(1)}d</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrap>

            {/* ─── Section 4: Calendar Heatmap ──────────────────── */}
            <SectionTitle>Daily P&L Calendar</SectionTitle>
            <DaySummaryRow>
                <span style={{ color: '#4dff91' }}>{summary.profitableDaysCount} profitable days</span>
                <span style={{ color: '#888' }}>|</span>
                <span style={{ color: '#ff4d6d' }}>{summary.unprofitableDaysCount} unprofitable days</span>
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
                                                    <CalendarDayTrades>{day.trades} IC{day.trades !== 1 ? 's' : ''}</CalendarDayTrades>
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

            {/* ─── Section 5: Trade History ──────────────────────── */}
            <SectionTitle>Trade History</SectionTitle>

            {tickerList.length > 1 && (
                <TickerFilterRow>
                    <TickerFilterBtn $active={tickerFilter === null} onClick={() => setTickerFilter(null)}>
                        ALL ({summary.trades.length})
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
                <Table style={{ minWidth: 1000 }}>
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
                            <Th>Expiration</Th>
                            <Th>Put Spread</Th>
                            <Th>Call Spread</Th>
                            <Th $align="right">Credit</Th>
                            <Th $align="right">Debit / Current</Th>
                            <SortableTh $align="right" $active={sortKey === 'profit'} onClick={() => toggleSort('profit')}>
                                P&L{sortArrow('profit')}
                            </SortableTh>
                            <SortableTh $align="center" $active={sortKey === 'status'} onClick={() => toggleSort('status')}>
                                Status{sortArrow('status')}
                            </SortableTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTrades.length === 0 ? (
                            <tr>
                                <Td colSpan={11} $align="center" style={{ color: '#444', padding: '24px' }}>
                                    {tickerFilter ? `No IC trades for ${tickerFilter}` : 'No IC trades found'}
                                </Td>
                            </tr>
                        ) : sortedTrades.map(trade => {
                            const pl = trade.status === 'open' ? trade.openCredit : trade.profit;
                            const debitOrCurrent = trade.status === 'open'
                                ? (trade.currentPrice > 0 ? fmtCur(trade.currentPrice) : '\u2014')
                                : fmtCur(trade.closeDebit);

                            return (
                                <tr key={trade.id}>
                                    <Td style={{ fontSize: 11, color: '#666' }}>
                                        {trade.openOrderIds.slice(0, 2).join(', ')}
                                        {trade.openOrderIds.length > 2 ? '...' : ''}
                                    </Td>
                                    <Td><strong>{trade.ticker}</strong></Td>
                                    <Td>{trade.openDate}</Td>
                                    <Td>
                                        {trade.status === 'open'
                                            ? <StatusBadge $status="open">OPEN</StatusBadge>
                                            : (trade.closeDate || trade.expirationDate)
                                        }
                                    </Td>
                                    <Td>{trade.expirationDate}</Td>
                                    <Td>{trade.putBuyStrike}/{trade.putSellStrike}</Td>
                                    <Td>{trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                    <Td $align="right">{fmtCur(trade.openCredit)}</Td>
                                    <Td $align="right">{debitOrCurrent}</Td>
                                    <Td $align="right"><PLValue $value={pl}>{fmtCur(pl)}</PLValue></Td>
                                    <Td $align="center">
                                        <StatusBadge $status={trade.status}>
                                            {trade.status.toUpperCase()}
                                        </StatusBadge>
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
                    <span>Refreshing data...</span>
                </div>
            )}
        </Container>
    );
});

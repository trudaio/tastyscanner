import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useServices } from '../../hooks/use-services.hook';
import { IDailyICPL, IGuvidHistorySummary } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';

type SortKey = 'openDate' | 'ticker' | 'profit' | 'status';
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
    justify-content: space-between;
    gap: 16px;
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
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.7rem, 3.4vw, 2.35rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
`;

const Summary = styled.p`
    margin: 0;
    color: var(--app-text-soft);
    line-height: 1.6;
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

    @media (max-width: 980px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 620px) {
        grid-template-columns: 1fr;
    }
`;

const MetricCard = styled.div<{ $color?: string }>`
    position: relative;
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--app-panel-surface);
    border: 1px solid var(--app-border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: ${p => p.$color || '#67a8ff'};
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

const MetricValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || 'var(--app-text)'};
    font-size: 1.2rem;
    font-weight: 800;
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
    border: 1px solid ${p => p.$active ? 'rgba(103, 168, 255, 0.28)' : 'var(--app-border)'};
    border-radius: 999px;
    color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-soft)'};
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
`;

const SectionTitle = styled.h2`
    color: var(--app-text);
    font-size: 1rem;
    margin: 28px 0 12px;
    font-weight: 700;
    letter-spacing: -0.01em;
`;

const Panel = styled.div`
    background: var(--app-panel-surface);
    border-radius: 18px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
    overflow: hidden;
`;

const TableWrap = styled(Panel)`
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;

    tbody tr:hover {
        background: var(--app-hover-surface);
    }

    @media (max-width: 860px) {
        display: none;
    }
`;

const Table = styled.table`
    width: 100%;
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
    white-space: nowrap;
`;

const SortableTh = styled(Th)<{ $active?: boolean }>`
    cursor: pointer;
    color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-muted)'};
`;

const Td = styled.td<{ $align?: string }>`
    padding: 14px 16px;
    color: var(--app-text);
    font-size: 13px;
    border-bottom: 1px solid var(--app-border);
    text-align: ${p => p.$align ?? 'left'};
    white-space: nowrap;
`;

const PLValue = styled.span<{ $value: number }>`
    color: ${p => p.$value > 0 ? '#4dff91' : p.$value < 0 ? '#ff6b7e' : 'var(--app-text-muted)'};
    font-weight: 700;
`;

const WinRateValue = styled.span<{ $pct: number }>`
    color: ${p => p.$pct >= 60 ? '#4dff91' : p.$pct >= 40 ? '#ffaa00' : '#ff6b7e'};
    font-weight: 700;
`;

const StatusBadge = styled.span<{ $status: string }>`
    display: inline-block;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 999px;
    ${p => {
        switch (p.$status) {
            case 'open':
                return 'background: rgba(103, 168, 255, 0.15); border: 1px solid rgba(103, 168, 255, 0.3); color: #67a8ff;';
            case 'closed':
                return 'background: rgba(77, 255, 145, 0.15); border: 1px solid rgba(77, 255, 145, 0.3); color: #4dff91;';
            case 'expired':
                return 'background: rgba(255, 170, 0, 0.15); border: 1px solid rgba(255, 170, 0, 0.3); color: #ffaa00;';
            default:
                return 'background: rgba(255,255,255,0.08); color: #cbd6ea;';
        }
    }}
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
    box-shadow: var(--app-shadow);
`;

const MobileCardTop = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
`;

const MobileTitle = styled.div`
    color: var(--app-text);
    font-weight: 800;
    font-size: 1rem;
`;

const MobileSub = styled.div`
    margin-top: 4px;
    color: var(--app-text-muted);
    font-size: 0.82rem;
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
    gap: 14px;
    justify-items: center;
    padding: 30px 22px;
    border-radius: 22px;
    border: 1px dashed rgba(162, 184, 219, 0.24);
    background: var(--app-subtle-surface);
    color: var(--app-text-soft);
    text-align: center;
    line-height: 1.6;
`;

const EmptyStateTitle = styled.div`
    color: var(--app-text);
    font-size: 1.12rem;
    font-weight: 800;
    margin-bottom: 8px;
`;

const EmptyStateText = styled.div`
    color: var(--app-text-soft);
    max-width: 58ch;
    margin: 0 auto;
`;

const EmptyStateActions = styled.div`
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 16px;
`;

const EmptyStateAction = styled.button<{ $primary?: boolean }>`
    min-height: 46px;
    padding: 0 16px;
    border-radius: 14px;
    border: 1px solid ${p => p.$primary ? 'transparent' : 'var(--app-border)'};
    background: ${p => p.$primary ? 'linear-gradient(135deg, #67a8ff, #7de2d1)' : 'var(--app-subtle-surface)'};
    color: ${p => p.$primary ? '#08111f' : 'var(--app-text)'};
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
`;

const DaySummaryRow = styled.div`
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    font-size: 0.9rem;
    flex-wrap: wrap;
`;

const CalendarContainer = styled(Panel)`
    padding: 18px;
    overflow-x: auto;
`;

const CalendarScroller = styled.div`
    min-width: 640px;
`;

const CalendarMonthRow = styled.div`
    margin-bottom: 20px;
`;

const CalendarMonthLabel = styled.div`
    color: var(--app-text);
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 8px;
`;

const CalendarDaysGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
`;

const CalendarDayHeader = styled.div`
    text-align: center;
    color: var(--app-text-muted);
    font-size: 10px;
    font-weight: 700;
    padding: 4px;
    text-transform: uppercase;
`;

const CalendarDay = styled.div<{ $hasData: boolean; $isProfit: boolean; $isEmpty?: boolean }>`
    min-height: 52px;
    padding: 6px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    background: ${p => {
        if (p.$isEmpty) return 'transparent';
        if (!p.$hasData) return 'rgba(255,255,255,0.03)';
        return p.$isProfit ? 'rgba(77, 255, 145, 0.18)' : 'rgba(255, 107, 126, 0.18)';
    }};
    border: 1px solid ${p => {
        if (p.$isEmpty) return 'transparent';
        if (!p.$hasData) return 'rgba(162, 184, 219, 0.1)';
        return p.$isProfit ? 'rgba(77, 255, 145, 0.26)' : 'rgba(255, 107, 126, 0.26)';
    }};
`;

const CalendarDayNum = styled.div<{ $isToday?: boolean }>`
    font-size: 11px;
    color: ${p => p.$isToday ? '#67a8ff' : 'var(--app-text-muted)'};
    font-weight: ${p => p.$isToday ? 800 : 600};
`;

const CalendarDayPL = styled.div<{ $value: number }>`
    font-size: 10px;
    font-weight: 700;
    color: ${p => p.$value > 0 ? '#4dff91' : '#ff6b7e'};
    margin-top: auto;
`;

const CalendarDayTrades = styled.div`
    font-size: 9px;
    color: var(--app-text-muted);
`;

const LoadingRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 28px 4px;
    color: var(--app-text-muted);
`;

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const GuvidHistoryComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;
    const history = useHistory();

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

    useEffect(() => {
        void fetchHistory();
    }, [account]);

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

    const tickerList = useMemo(() => {
        if (!summary) return [];
        return [...new Set(summary.trades.map(t => t.ticker))].sort();
    }, [summary]);

    const tickerBreakdown = useMemo(() => {
        if (!summary) return [];
        return Array.from(summary.byTicker.values()).sort((a, b) => b.totalProfit - a.totalProfit);
    }, [summary]);

    const monthlyBreakdown = useMemo(() => {
        if (!summary) return [];
        return Array.from(summary.byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
    }, [summary]);

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

    const sortedTrades = useMemo(() => {
        if (!summary) return [];
        const trades = tickerFilter ? summary.trades.filter(t => t.ticker === tickerFilter) : [...summary.trades];
        const mul = sortDir === 'asc' ? 1 : -1;

        trades.sort((a, b) => {
            switch (sortKey) {
                case 'openDate':
                    return a.openDate.localeCompare(b.openDate) * mul;
                case 'ticker':
                    return a.ticker.localeCompare(b.ticker) * mul;
                case 'profit': {
                    const pa = a.status === 'open' ? a.openCredit : a.profit;
                    const pb = b.status === 'open' ? b.openCredit : b.profit;
                    return (pa - pb) * mul;
                }
                case 'status':
                    return a.status.localeCompare(b.status) * mul;
                default:
                    return 0;
            }
        });

        return trades;
    }, [summary, sortDir, sortKey, tickerFilter]);

    const calendarMonths = useMemo(() => {
        if (!summary) return [];

        const now = new Date();
        const year = now.getFullYear();
        const currentMonth = now.getMonth();
        const todayStr = now.toISOString().split('T')[0];
        const plMap = new Map<string, IDailyICPL>();

        for (const d of summary.dailyPL) plMap.set(d.date, d);

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

            while (days.length % 7 !== 0) {
                days.push({ date: '', dayNum: 0, pl: 0, trades: 0, hasData: false, isEmpty: true, isToday: false });
            }

            months.push({ label: `${MONTH_NAMES[m]} ${year}`, days });
        }

        return months;
    }, [summary]);

    const sortArrow = (key: SortKey) => {
        if (sortKey !== key) return ' ⇅';
        return sortDir === 'asc' ? ' ▲' : ' ▼';
    };

    if (loading && !summary) {
        return (
            <Container>
                <LoadingRow>
                    <IonSpinner name="crescent" />
                    <span>Se incarca istoricul YTD pentru Iron Condors...</span>
                </LoadingRow>
            </Container>
        );
    }

    if (!summary) {
        return (
            <Container>
                <Hero>
                    <TopBar>
                        <HeroText>
                            <Eyebrow>History</Eyebrow>
                            <Title>Istoric Guvid</Title>
                            <Summary>Ai nevoie de contul TastyTrade conectat ca sa vezi performanta istorica, distribuția pe ticker si calendarul de P&L.</Summary>
                        </HeroText>
                        <RefreshBtn onClick={() => void fetchHistory()} disabled={loading}>
                            {loading ? 'Se incarca...' : 'Reincearca'}
                        </RefreshBtn>
                    </TopBar>
                </Hero>
                <EmptyState>
                    <EmptyStateTitle>{account ? 'Istoricul nu este gata inca' : 'Conecteaza brokerul pentru istoric'}</EmptyStateTitle>
                    <EmptyStateText>
                        {account
                            ? 'Aplicatia nu are inca trades inchise sau sincronizarea istorica nu a livrat rezultate. Poti relansa incarcarea sau continua analiza in scanner.'
                            : 'Istoricul devine util dupa ce configurezi credentialele TastyTrade si lasi sincronizarea sa incarce trades inchise, distributii pe ticker si calendarul zilnic de P&L.'}
                    </EmptyStateText>
                    <EmptyStateActions>
                        {!account && (
                            <EmptyStateAction $primary type="button" onClick={() => history.push('/account')}>
                                Mergi la cont
                            </EmptyStateAction>
                        )}
                        <EmptyStateAction type="button" onClick={() => history.push('/app')}>
                            Deschide scannerul
                        </EmptyStateAction>
                    </EmptyStateActions>
                </EmptyState>
            </Container>
        );
    }

    const ytd = summary.yearToDate;
    const realizedPL = ytd.totalWins + ytd.totalLosses;
    const avgProfitPerClosed = ytd.closedTrades > 0 ? realizedPL / ytd.closedTrades : 0;
    const tradingDays = summary.dailyPL.length;
    const plPerDay = tradingDays > 0 ? realizedPL / tradingDays : 0;

    const closedForDuration = summary.trades.filter(
        t => t.status !== 'open' && t.openDate && (t.closeDate || t.expirationDate),
    );

    let avgDaysHeld = 0;
    if (closedForDuration.length > 0) {
        let totalDays = 0;
        for (const t of closedForDuration) {
            const open = new Date(t.openDate);
            const close = new Date(t.closeDate || t.expirationDate);
            totalDays += Math.max(0, Math.round((close.getTime() - open.getTime()) / 86400000));
        }
        avgDaysHeld = totalDays / closedForDuration.length;
    }

    return (
        <Container>
            <Hero>
                <TopBar>
                    <HeroText>
                        <Eyebrow>History</Eyebrow>
                        <Title>Istoric Guvid</Title>
                        <Summary>Vezi cum performeaza sistemul in timp: win rate, P&L realizat, distributie pe ticker si zilele care muta cel mai mult rezultatul anual.</Summary>
                    </HeroText>
                    <RefreshBtn onClick={() => void fetchHistory()} disabled={loading}>
                        {loading ? 'Se actualizeaza...' : 'Actualizeaza'}
                    </RefreshBtn>
                </TopBar>

                <MetricsRow>
                    <MetricCard $color="#67a8ff">
                        <MetricLabel>Trades inchise</MetricLabel>
                        <MetricValue>{ytd.closedTrades}</MetricValue>
                    </MetricCard>
                    <MetricCard $color={ytd.winRate >= 60 ? '#4dff91' : ytd.winRate >= 40 ? '#ffaa00' : '#ff6b7e'}>
                        <MetricLabel>Win rate</MetricLabel>
                        <MetricValue $color={ytd.winRate >= 60 ? '#4dff91' : ytd.winRate >= 40 ? '#ffaa00' : '#ff6b7e'}>
                            {ytd.winRate.toFixed(1)}%
                        </MetricValue>
                    </MetricCard>
                    <MetricCard $color={realizedPL >= 0 ? '#4dff91' : '#ff6b7e'}>
                        <MetricLabel>P&amp;L total</MetricLabel>
                        <MetricValue $color={realizedPL >= 0 ? '#4dff91' : '#ff6b7e'}>{fmtCur(realizedPL)}</MetricValue>
                    </MetricCard>
                    <MetricCard $color={avgProfitPerClosed >= 0 ? '#4dff91' : '#ff6b7e'}>
                        <MetricLabel>Profit mediu / trade</MetricLabel>
                        <MetricValue $color={avgProfitPerClosed >= 0 ? '#4dff91' : '#ff6b7e'}>{fmtCur(avgProfitPerClosed)}</MetricValue>
                    </MetricCard>
                    <MetricCard $color={plPerDay >= 0 ? '#4dff91' : '#ff6b7e'}>
                        <MetricLabel>P&amp;L / zi</MetricLabel>
                        <MetricValue $color={plPerDay >= 0 ? '#4dff91' : '#ff6b7e'}>{fmtCur(plPerDay)}</MetricValue>
                    </MetricCard>
                    <MetricCard $color="#f4a261">
                        <MetricLabel>Durata medie</MetricLabel>
                        <MetricValue>{avgDaysHeld.toFixed(1)}d</MetricValue>
                    </MetricCard>
                </MetricsRow>
            </Hero>

            {tickerList.length > 1 && (
                <TickerFilterRow>
                    <TickerFilterBtn $active={tickerFilter === null} onClick={() => setTickerFilter(null)}>
                        Toate simbolurile
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

            <SectionTitle>Trades by Ticker</SectionTitle>
            <TableWrap>
                <Table>
                    <thead>
                        <tr>
                            <Th>Ticker</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="center">Unprofitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&amp;L</Th>
                            <Th $align="right">P&amp;L / Day</Th>
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
                                    <Td $align="center"><PLValue $value={1}>{ts.profitableTrades}</PLValue></Td>
                                    <Td $align="center"><PLValue $value={-1}>{ts.totalTrades - ts.profitableTrades}</PLValue></Td>
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

            <MobileCardList>
                {tickerBreakdown.map(ts => {
                    const extra = tickerExtraStats.get(ts.ticker);
                    return (
                        <MobileCard key={ts.ticker}>
                            <MobileCardTop>
                                <div>
                                    <MobileTitle>{ts.ticker}</MobileTitle>
                                    <MobileSub>{ts.totalTrades} trades inchise</MobileSub>
                                </div>
                                <WinRateValue $pct={ts.winRate}>{ts.winRate.toFixed(1)}%</WinRateValue>
                            </MobileCardTop>
                            <MobileGrid>
                                <MobileMetric>
                                    <MobileMetricLabel>Total P&amp;L</MobileMetricLabel>
                                    <MobileMetricValue><PLValue $value={ts.totalProfit}>{fmtCur(ts.totalProfit)}</PLValue></MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>P&amp;L / zi</MobileMetricLabel>
                                    <MobileMetricValue><PLValue $value={extra?.plPerDay ?? 0}>{fmtCur(extra?.plPerDay ?? 0)}</PLValue></MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>Profitable</MobileMetricLabel>
                                    <MobileMetricValue>{ts.profitableTrades}</MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>Durata medie</MobileMetricLabel>
                                    <MobileMetricValue>{(extra?.avgDuration ?? 0).toFixed(1)}d</MobileMetricValue>
                                </MobileMetric>
                            </MobileGrid>
                        </MobileCard>
                    );
                })}
            </MobileCardList>

            <SectionTitle>Monthly P&amp;L</SectionTitle>
            <TableWrap>
                <Table>
                    <thead>
                        <tr>
                            <Th>Month</Th>
                            <Th $align="center">Trades</Th>
                            <Th $align="center">Profitable</Th>
                            <Th $align="right">Win Rate</Th>
                            <Th $align="right">Total P&amp;L</Th>
                            <Th $align="right">P&amp;L / Day</Th>
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
                                    <Td $align="center"><PLValue $value={1}>{ms.profitableTrades}</PLValue></Td>
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

            <MobileCardList>
                {monthlyBreakdown.map(ms => {
                    const extra = monthExtraStats.get(ms.month);
                    return (
                        <MobileCard key={ms.month}>
                            <MobileCardTop>
                                <div>
                                    <MobileTitle>{ms.month}</MobileTitle>
                                    <MobileSub>{ms.totalTrades} trades</MobileSub>
                                </div>
                                <WinRateValue $pct={ms.winRate}>{ms.winRate.toFixed(1)}%</WinRateValue>
                            </MobileCardTop>
                            <MobileGrid>
                                <MobileMetric>
                                    <MobileMetricLabel>Total P&amp;L</MobileMetricLabel>
                                    <MobileMetricValue><PLValue $value={ms.totalProfit}>{fmtCur(ms.totalProfit)}</PLValue></MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>P&amp;L / zi</MobileMetricLabel>
                                    <MobileMetricValue><PLValue $value={extra?.plPerDay ?? 0}>{fmtCur(extra?.plPerDay ?? 0)}</PLValue></MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>Profitable</MobileMetricLabel>
                                    <MobileMetricValue>{ms.profitableTrades}</MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>Durata medie</MobileMetricLabel>
                                    <MobileMetricValue>{(extra?.avgDuration ?? 0).toFixed(1)}d</MobileMetricValue>
                                </MobileMetric>
                            </MobileGrid>
                        </MobileCard>
                    );
                })}
            </MobileCardList>

            <SectionTitle>Daily P&amp;L Calendar</SectionTitle>
            <DaySummaryRow>
                <span style={{ color: '#4dff91' }}>{summary.profitableDaysCount} zile profitabile</span>
                <span style={{ color: 'var(--app-text-muted)' }}>|</span>
                <span style={{ color: '#ff6b7e' }}>{summary.unprofitableDaysCount} zile negative</span>
            </DaySummaryRow>
            <CalendarContainer>
                <CalendarScroller>
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
                </CalendarScroller>
            </CalendarContainer>

            <SectionTitle>Trade History ({sortedTrades.length})</SectionTitle>
            <TableWrap>
                <Table>
                    <thead>
                        <tr>
                            <SortableTh $active={sortKey === 'openDate'} onClick={() => toggleSort('openDate')}>Open Date{sortArrow('openDate')}</SortableTh>
                            <SortableTh $active={sortKey === 'ticker'} onClick={() => toggleSort('ticker')}>Ticker{sortArrow('ticker')}</SortableTh>
                            <Th>Expiration</Th>
                            <Th>Strikes</Th>
                            <SortableTh $align="center" $active={sortKey === 'status'} onClick={() => toggleSort('status')}>Status{sortArrow('status')}</SortableTh>
                            <SortableTh $align="right" $active={sortKey === 'profit'} onClick={() => toggleSort('profit')}>P&amp;L{sortArrow('profit')}</SortableTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTrades.map(trade => {
                            const realized = trade.status === 'open' ? trade.openCredit : trade.profit;
                            return (
                                <tr key={trade.id}>
                                    <Td>{trade.openDate}</Td>
                                    <Td><strong>{trade.ticker}</strong></Td>
                                    <Td>{trade.expirationDate}</Td>
                                    <Td>{trade.putBuyStrike}/{trade.putSellStrike} · {trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                    <Td $align="center"><StatusBadge $status={trade.status}>{trade.status}</StatusBadge></Td>
                                    <Td $align="right"><PLValue $value={realized}>{fmtCur(realized)}</PLValue></Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrap>

            <MobileCardList>
                {sortedTrades.map(trade => {
                    const realized = trade.status === 'open' ? trade.openCredit : trade.profit;
                    return (
                        <MobileCard key={trade.id}>
                            <MobileCardTop>
                                <div>
                                    <MobileTitle>{trade.ticker}</MobileTitle>
                                    <MobileSub>{trade.openDate} → {trade.expirationDate}</MobileSub>
                                </div>
                                <StatusBadge $status={trade.status}>{trade.status}</StatusBadge>
                            </MobileCardTop>
                            <MobileGrid>
                                <MobileMetric>
                                    <MobileMetricLabel>Strikes</MobileMetricLabel>
                                    <MobileMetricValue>{trade.putBuyStrike}/{trade.putSellStrike}</MobileMetricValue>
                                    <MobileMetricValue>{trade.callSellStrike}/{trade.callBuyStrike}</MobileMetricValue>
                                </MobileMetric>
                                <MobileMetric>
                                    <MobileMetricLabel>P&amp;L</MobileMetricLabel>
                                    <MobileMetricValue><PLValue $value={realized}>{fmtCur(realized)}</PLValue></MobileMetricValue>
                                </MobileMetric>
                            </MobileGrid>
                        </MobileCard>
                    );
                })}
            </MobileCardList>

            {loading && (
                <LoadingRow>
                    <IonSpinner name="crescent" />
                    <span>Se actualizeaza istoricul...</span>
                </LoadingRow>
            )}
        </Container>
    );
});

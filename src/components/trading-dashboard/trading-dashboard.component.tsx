import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { useServices } from '../../hooks/use-services.hook';
import { ITickerPL, INetLiquidityPoint } from '../../services/trading-dashboard/trading-dashboard.interface';

const DashboardContainer = styled.div`
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
    margin-bottom: 20px;
    border-radius: 24px;
    background: var(--app-hero-surface);
    border: 1px solid var(--app-hero-border);
    box-shadow: var(--app-shadow);
`;

const Eyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
`;

const HeroTitle = styled.h2`
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.45rem, 2.8vw, 2rem);
    line-height: 1.06;
    letter-spacing: -0.03em;
`;

const HeroText = styled.p`
    margin: 0;
    max-width: 72ch;
    color: var(--app-text-soft);
    line-height: 1.65;
`;

const DateRangeContainer = styled.div`
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    padding: 12px;
    border-radius: 18px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
`;

const DateInput = styled.input`
    min-height: 40px;
    padding: 8px 12px;
    background: var(--app-panel-solid);
    border: 1px solid var(--app-border);
    border-radius: 12px;
    color: var(--app-text);
    font-size: 14px;

    &:focus {
        outline: none;
        border-color: var(--app-border-strong);
    }
`;

const DateLabel = styled.label`
    color: var(--app-text-muted);
    font-size: 14px;
`;

const QuickSelectButton = styled.button<{ $active?: boolean }>`
    min-height: 38px;
    padding: 8px 16px;
    background: ${props => props.$active ? 'rgba(103, 168, 255, 0.18)' : 'var(--app-subtle-surface)'};
    border: 1px solid ${props => props.$active ? 'rgba(103, 168, 255, 0.28)' : 'var(--app-border)'};
    border-radius: 999px;
    color: ${props => props.$active ? 'var(--app-text)' : 'var(--app-text-soft)'};
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.$active ? 'rgba(103, 168, 255, 0.22)' : 'var(--app-hover-surface)'};
    }
`;

const RefreshButton = styled.button`
    min-height: 40px;
    padding: 8px 20px;
    background: linear-gradient(135deg, #67a8ff, #7de2d1);
    border: 1px solid rgba(103, 168, 255, 0.2);
    border-radius: 14px;
    color: #08111f;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        filter: brightness(0.98);
        transform: translateY(-1px);
    }

    &:disabled {
        background: var(--app-subtle-surface-2);
        border-color: var(--app-border);
        color: var(--app-text-muted);
        cursor: not-allowed;
        transform: none;
    }
`;

const TotalsScrollWrapper = styled.div`
    overflow-x: auto;
    margin-bottom: 16px;
    -webkit-overflow-scrolling: touch;

    @media (min-width: 769px) {
        overflow-x: visible;
    }
`;

const TotalsRow = styled.div`
    display: grid;
    grid-template-columns: 120px repeat(6, 1fr);
    gap: 8px;
    padding: 16px;
    background: var(--app-panel-surface);
    border-radius: 18px;
    font-weight: 600;
    min-width: 680px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

const TotalsHeaderRow = styled.div`
    display: grid;
    grid-template-columns: 120px repeat(6, 1fr);
    gap: 8px;
    padding: 4px 16px;
    min-width: 680px;
`;

const TotalsHeaderLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    text-align: right;
    &:first-child { text-align: left; }
`;

const TotalLabel = styled.div`
    color: var(--app-text);
    font-size: 16px;
`;

const TotalValue = styled.div<{ $value: number }>`
    color: ${props => props.$value >= 0 ? '#4dff91' : '#ff4d6d'};
    font-size: 16px;
    text-align: right;
`;

const SectionTitle = styled.h2`
    color: var(--app-text);
    font-size: 1.08rem;
    margin: 28px 0 14px 0;
    letter-spacing: -0.02em;
`;

const TableContainer = styled.div`
    background: var(--app-panel-surface);
    border-radius: 18px;
    overflow-x: auto;
    margin-bottom: 24px;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);

    tbody tr:hover {
        background: var(--app-hover-surface);
    }
`;

const Table = styled.table`
    width: 100%;
    min-width: 550px;
    border-collapse: collapse;
`;

const Th = styled.th<{ $align?: string }>`
    text-align: ${props => props.$align || 'left'};
    padding: 12px 16px;
    background: var(--app-table-head-surface);
    color: var(--app-text-muted);
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 500;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 14px;
    text-align: ${props => props.$align || 'left'};
`;

const PLValue = styled.span<{ $value: number }>`
    color: ${props => props.$value >= 0 ? '#4dff91' : '#ff4d6d'};
    font-weight: 500;
`;

const ChartContainer = styled.div`
    background: var(--app-panel-surface);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

const ChartSVG = styled.svg`
    width: 100%;
    height: 300px;
`;

const LoadingOverlay = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px;
    color: var(--app-text-muted);
    font-size: 16px;
`;

const EmptyState = styled.div`
    display: grid;
    gap: 14px;
    justify-items: flex-start;
    padding: 28px 24px;
    color: var(--app-text-muted);
    border: 1px dashed var(--app-border);
    border-radius: 24px;
    background: var(--app-subtle-surface);
`;

const EmptyTitle = styled.div`
    color: var(--app-text);
    font-size: 1.08rem;
    font-weight: 800;
`;

const EmptyText = styled.div`
    color: var(--app-text-soft);
    line-height: 1.6;
    max-width: 64ch;
`;

const EmptyHints = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const EmptyHint = styled.span`
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

const EmptyActions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
`;

const EmptyAction = styled.button<{ $primary?: boolean }>`
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

const MetricsRow = styled.div`
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const MetricCard = styled.div<{ $color?: string }>`
    position: relative;
    background: var(--app-panel-surface);
    border-radius: 18px;
    padding: 16px 20px;
    min-width: 130px;
    flex: 1;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: ${props => props.$color || '#4a9eff'};
    }

    @media (max-width: 480px) {
        padding: 12px 16px;
        min-width: 100px;
    }
`;

const MetricLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 4px;
`;

const MetricValue = styled.div<{ $color?: string }>`
    color: ${props => props.$color || 'var(--app-text)'};
    font-size: 20px;
    font-weight: 600;
`;

// Calendar Styles
const CalendarContainer = styled.div`
    background: var(--app-panel-surface);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

const CalendarHeader = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 8px;
`;

const CalendarDayHeader = styled.div`
    text-align: center;
    color: var(--app-text-muted);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 4px;
    text-transform: uppercase;
`;

const CalendarGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
`;

const CalendarDay = styled.div<{ $hasData: boolean; $isProfit: boolean; $isEmpty?: boolean }>`
    min-height: 80px;
    padding: 8px;
    border-radius: 6px;

    @media (max-width: 480px) {
        min-height: 56px;
        padding: 4px;
    }
    background: ${props => {
        if (props.$isEmpty) return 'transparent';
        if (!props.$hasData) return 'var(--app-subtle-surface)';
        return props.$isProfit ? 'rgba(77, 255, 145, 0.2)' : 'rgba(255, 77, 109, 0.2)';
    }};
    border: 1px solid ${props => {
        if (props.$isEmpty) return 'transparent';
        if (!props.$hasData) return 'var(--app-border)';
        return props.$isProfit ? 'rgba(77, 255, 145, 0.3)' : 'rgba(255, 77, 109, 0.3)';
    }};
    display: flex;
    flex-direction: column;
    transition: all 0.2s;

    &:hover {
        ${props => !props.$isEmpty && `
            transform: scale(1.02);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `}
    }
`;

const CalendarDayNumber = styled.div<{ $isToday?: boolean }>`
    font-size: 12px;
    color: ${props => props.$isToday ? '#4a9eff' : 'var(--app-text-muted)'};
    font-weight: ${props => props.$isToday ? '700' : '400'};
    margin-bottom: 4px;
`;

const CalendarDayPL = styled.div<{ $value: number }>`
    font-size: 13px;
    font-weight: 600;
    color: ${props => props.$value >= 0 ? '#4dff91' : '#ff4d6d'};
    margin-top: auto;

    @media (max-width: 480px) {
        font-size: 10px;
    }
`;

const CalendarDayTrades = styled.div`
    font-size: 10px;
    color: var(--app-text-muted);
    margin-top: 2px;
`;

const CalendarMonthTitle = styled.div`
    text-align: center;
    color: var(--app-text);
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
`;

const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value >= 0 ? absValue : `-${absValue}`;
};

const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`;
};

type DateRangePreset = 'ytd' | 'mtd' | '3m' | '6m' | '1y' | 'custom';

export const TradingDashboardComponent: React.FC = observer(() => {
    const services = useServices();
    const { tradingDashboard } = services;
    const history = useHistory();
    const account = services.brokerAccount.currentAccount;

    const [dateRange, setDateRange] = useState<DateRangePreset>('ytd');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let start: Date;
        switch (dateRange) {
            case 'mtd':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case '3m':
                start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                break;
            case '6m':
                start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
                break;
            case '1y':
                start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                break;
            case 'custom':
                start = customStartDate ? new Date(customStartDate) : new Date(now.getFullYear(), 0, 1);
                return {
                    startDate: start,
                    endDate: customEndDate ? new Date(customEndDate) : end
                };
            case 'ytd':
            default:
                start = new Date(now.getFullYear(), 0, 1);
                break;
        }
        return { startDate: start, endDate: end };
    }, [dateRange, customStartDate, customEndDate]);

    useEffect(() => {
        if (!account) return;
        tradingDashboard.fetchTrades(startDate, endDate).catch(err => {
            console.error('Failed to fetch trades:', err);
        });
    }, [account, tradingDashboard, startDate, endDate]);

    const summary = tradingDashboard.summary;
    const isLoading = tradingDashboard.isLoading;

    // Chart dimensions
    const chartWidth = 800;
    const chartHeight = 250;
    const chartPadding = { top: 20, right: 60, bottom: 40, left: 70 };

    const chartData = useMemo(() => {
        if (!summary || summary.netLiquidityHistory.length <= 1) {
            return { path: '', area: '', points: [], yMin: 0, yMax: 0, xLabels: [] };
        }

        const data = summary.netLiquidityHistory;
        const values = data.map(d => d.cumulativePL);
        const yMin = Math.min(0, ...values);
        const yMax = Math.max(0, ...values);
        const yRange = Math.max(yMax - yMin, 1);

        const xScale = (i: number) =>
            chartPadding.left + (i / (data.length - 1 || 1)) * (chartWidth - chartPadding.left - chartPadding.right);
        const yScale = (v: number) =>
            chartPadding.top + (1 - (v - yMin) / yRange) * (chartHeight - chartPadding.top - chartPadding.bottom);

        const pathPoints = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.cumulativePL)}`).join(' ');
        const areaPath = `${pathPoints} L ${xScale(data.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`;

        const points = data.map((d, i) => ({
            x: xScale(i),
            y: yScale(d.cumulativePL),
            date: d.date,
            value: d.cumulativePL
        }));

        const labelInterval = Math.ceil(data.length / 6);
        const xLabels = data
            .filter((_, i) => i % labelInterval === 0 || i === data.length - 1)
            .map((d) => ({
                x: xScale(data.indexOf(d)),
                label: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));

        return { path: pathPoints, area: areaPath, points, yMin, yMax, xLabels };
    }, [summary]);

    const zeroLineY = useMemo(() => {
        if (!chartData || chartData.yMax === chartData.yMin) return chartHeight / 2;
        const yRange = chartData.yMax - chartData.yMin;
        return chartPadding.top + (1 - (0 - chartData.yMin) / yRange) * (chartHeight - chartPadding.top - chartPadding.bottom);
    }, [chartData]);

    // Calendar data for last 30 days
    const calendarData = useMemo(() => {
        if (!summary) return { weeks: [], monthLabel: '' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Create a map of daily P/L from net liquidity history
        const dailyPLMap = new Map<string, { pl: number; trades: number }>();

        // Count trades per day
        const tradesPerDay = new Map<string, number>();
        for (const trade of summary.trades) {
            const dateKey = trade.executedAt.toISOString().split('T')[0];
            tradesPerDay.set(dateKey, (tradesPerDay.get(dateKey) || 0) + 1);
        }

        // Get daily P/L from history
        for (const point of summary.netLiquidityHistory) {
            if (point.dayPL !== 0) {
                const dateKey = point.date.toISOString().split('T')[0];
                dailyPLMap.set(dateKey, {
                    pl: point.dayPL,
                    trades: tradesPerDay.get(dateKey) || 0
                });
            }
        }

        // Generate last 35 days to ensure we have complete weeks
        const startDay = new Date(today);
        startDay.setDate(startDay.getDate() - 34);

        // Find the Sunday before or on startDay
        const dayOfWeek = startDay.getDay();
        startDay.setDate(startDay.getDate() - dayOfWeek);

        const weeks: Array<Array<{
            date: Date;
            dayNum: number;
            pl: number;
            trades: number;
            hasData: boolean;
            isEmpty: boolean;
            isToday: boolean;
        }>> = [];

        let currentWeek: typeof weeks[0] = [];
        const current = new Date(startDay);

        // Generate 5 weeks of data
        for (let i = 0; i < 42; i++) {
            const dateKey = current.toISOString().split('T')[0];
            const data = dailyPLMap.get(dateKey);
            const isInRange = current >= new Date(today.getTime() - 34 * 24 * 60 * 60 * 1000) && current <= today;

            currentWeek.push({
                date: new Date(current),
                dayNum: current.getDate(),
                pl: data?.pl || 0,
                trades: data?.trades || 0,
                hasData: !!data && data.pl !== 0,
                isEmpty: !isInRange,
                isToday: current.toDateString() === today.toDateString()
            });

            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }

            current.setDate(current.getDate() + 1);
        }

        // Get month label
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const monthLabel = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;

        return { weeks, monthLabel };
    }, [summary]);

    const handleRefresh = () => {
        if (!account) return;
        tradingDashboard.fetchTrades(startDate, endDate);
    };

    return (
        <DashboardContainer>
            <Hero>
                <Eyebrow>Trading Overview</Eyebrow>
                <HeroTitle>Trading Dashboard</HeroTitle>
                <HeroText>
                    Aici se aduna rezultatele agregate ale executiilor: P&amp;L, distributie pe simbol, calendar zilnic si curba de evolutie a contului.
                </HeroText>

                <DateRangeContainer>
                    <QuickSelectButton $active={dateRange === 'ytd'} onClick={() => setDateRange('ytd')}>
                        YTD
                    </QuickSelectButton>
                    <QuickSelectButton $active={dateRange === 'mtd'} onClick={() => setDateRange('mtd')}>
                        MTD
                    </QuickSelectButton>
                    <QuickSelectButton $active={dateRange === '3m'} onClick={() => setDateRange('3m')}>
                        3M
                    </QuickSelectButton>
                    <QuickSelectButton $active={dateRange === '6m'} onClick={() => setDateRange('6m')}>
                        6M
                    </QuickSelectButton>
                    <QuickSelectButton $active={dateRange === '1y'} onClick={() => setDateRange('1y')}>
                        1Y
                    </QuickSelectButton>
                    <QuickSelectButton $active={dateRange === 'custom'} onClick={() => setDateRange('custom')}>
                        Custom
                    </QuickSelectButton>

                    {dateRange === 'custom' && (
                        <>
                            <DateLabel>From:</DateLabel>
                            <DateInput
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                            />
                            <DateLabel>To:</DateLabel>
                            <DateInput
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                            />
                        </>
                    )}

                    <RefreshButton onClick={handleRefresh} disabled={isLoading || !account}>
                        {isLoading ? 'Loading...' : 'Refresh'}
                    </RefreshButton>
                </DateRangeContainer>
            </Hero>

            {isLoading && !summary && (
                <LoadingOverlay>Se incarca datele de trading...</LoadingOverlay>
            )}

            {summary && (
                <>
                    {/* Totals Summary - TastyTrade Style */}
                    <TotalsScrollWrapper>
                        <TotalsHeaderRow>
                            <TotalsHeaderLabel></TotalsHeaderLabel>
                            <TotalsHeaderLabel>Realized</TotalsHeaderLabel>
                            <TotalsHeaderLabel>Unrealized</TotalsHeaderLabel>
                            <TotalsHeaderLabel>Year Gain</TotalsHeaderLabel>
                            <TotalsHeaderLabel>Commissions</TotalsHeaderLabel>
                            <TotalsHeaderLabel>Fees</TotalsHeaderLabel>
                            <TotalsHeaderLabel>P/L w/Fees</TotalsHeaderLabel>
                        </TotalsHeaderRow>
                        <TotalsRow>
                            <TotalLabel>TOTALS</TotalLabel>
                            <TotalValue $value={summary.realizedGain}>{formatCurrency(summary.realizedGain)}</TotalValue>
                            <TotalValue $value={summary.unrealizedGain}>{formatCurrency(summary.unrealizedGain)}</TotalValue>
                            <TotalValue $value={summary.yearGain}>{formatCurrency(summary.yearGain)}</TotalValue>
                            <TotalValue $value={summary.commissions}>{formatCurrency(summary.commissions)}</TotalValue>
                            <TotalValue $value={summary.fees}>{formatCurrency(summary.fees)}</TotalValue>
                            <TotalValue $value={summary.plYTDWithFees}>{formatCurrency(summary.plYTDWithFees)}</TotalValue>
                        </TotalsRow>
                    </TotalsScrollWrapper>

                    {/* Quick Stats */}
                    <MetricsRow>
                        <MetricCard $color="#4a9eff">
                            <MetricLabel>Total Trades</MetricLabel>
                            <MetricValue>{summary.totalTrades}</MetricValue>
                        </MetricCard>
                        <MetricCard $color="#4dff91">
                            <MetricLabel>Winners</MetricLabel>
                            <MetricValue $color="#4dff91">{summary.winnersCount}</MetricValue>
                        </MetricCard>
                        <MetricCard $color="#ff4d6d">
                            <MetricLabel>Losers</MetricLabel>
                            <MetricValue $color="#ff4d6d">{summary.losersCount}</MetricValue>
                        </MetricCard>
                        <MetricCard $color={summary.winRate >= 50 ? '#4dff91' : '#ff4d6d'}>
                            <MetricLabel>Win Rate</MetricLabel>
                            <MetricValue $color={summary.winRate >= 50 ? '#4dff91' : '#ff4d6d'}>
                                {formatPercent(summary.winRate)}
                            </MetricValue>
                        </MetricCard>
                    </MetricsRow>

                    {/* Net Liquidity Chart */}
                    <SectionTitle>Net Liquidity Evolution</SectionTitle>
                    <ChartContainer>
                        {summary.netLiquidityHistory.length > 1 ? (
                            <ChartSVG viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                                {/* Zero line */}
                                <line
                                    x1={chartPadding.left}
                                    y1={zeroLineY}
                                    x2={chartWidth - chartPadding.right}
                                    y2={zeroLineY}
                                    stroke="rgba(162, 184, 219, 0.4)"
                                    strokeDasharray="5,5"
                                />

                                {/* Area fill */}
                                <path
                                    d={chartData.area}
                                    fill={summary.plYTDWithFees >= 0 ? 'rgba(77, 255, 145, 0.15)' : 'rgba(255, 77, 109, 0.15)'}
                                />

                                {/* Line */}
                                <path
                                    d={chartData.path}
                                    fill="none"
                                    stroke={summary.plYTDWithFees >= 0 ? '#4dff91' : '#ff4d6d'}
                                    strokeWidth="2.5"
                                />

                                {/* Data points */}
                                {chartData.points.map((point, i) => (
                                    <circle
                                        key={i}
                                        cx={point.x}
                                        cy={point.y}
                                        r="4"
                                        fill={point.value >= 0 ? '#4dff91' : '#ff4d6d'}
                                    />
                                ))}

                                {/* X-axis labels */}
                                {chartData.xLabels.map((label, i) => (
                                    <text
                                        key={i}
                                        x={label.x}
                                        y={chartHeight - 10}
                                        fill="var(--app-text-muted)"
                                        fontSize="11"
                                        textAnchor="middle"
                                    >
                                        {label.label}
                                    </text>
                                ))}

                                {/* Y-axis labels */}
                                <text
                                    x={chartPadding.left - 10}
                                    y={chartPadding.top + 5}
                                    fill="var(--app-text-muted)"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    ${Math.abs(chartData.yMax).toLocaleString()}
                                </text>
                                <text
                                    x={chartPadding.left - 10}
                                    y={zeroLineY + 4}
                                    fill="var(--app-text-muted)"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    $0
                                </text>
                                <text
                                    x={chartPadding.left - 10}
                                    y={chartHeight - chartPadding.bottom}
                                    fill="var(--app-text-muted)"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    -${Math.abs(chartData.yMin).toLocaleString()}
                                </text>

                                {/* Final value label */}
                                {chartData.points.length > 0 && (
                                    <text
                                        x={chartData.points[chartData.points.length - 1].x + 10}
                                        y={chartData.points[chartData.points.length - 1].y + 4}
                                        fill={summary.plYTDWithFees >= 0 ? '#4dff91' : '#ff4d6d'}
                                        fontSize="13"
                                        fontWeight="bold"
                                    >
                                        ${formatCurrency(summary.plYTDWithFees)}
                                    </text>
                                )}
                            </ChartSVG>
                        ) : (
                            <EmptyState>Date insuficiente pentru a desena evolutia curbei.</EmptyState>
                        )}
                    </ChartContainer>

                    {/* Daily P/L Calendar */}
                    <SectionTitle>Daily P/L Calendar (Last 30 Days)</SectionTitle>
                    <CalendarContainer>
                        <CalendarMonthTitle>{calendarData.monthLabel}</CalendarMonthTitle>
                        <CalendarHeader>
                            <CalendarDayHeader>Sun</CalendarDayHeader>
                            <CalendarDayHeader>Mon</CalendarDayHeader>
                            <CalendarDayHeader>Tue</CalendarDayHeader>
                            <CalendarDayHeader>Wed</CalendarDayHeader>
                            <CalendarDayHeader>Thu</CalendarDayHeader>
                            <CalendarDayHeader>Fri</CalendarDayHeader>
                            <CalendarDayHeader>Sat</CalendarDayHeader>
                        </CalendarHeader>
                        <CalendarGrid>
                            {calendarData.weeks.flat().map((day, index) => (
                                <CalendarDay
                                    key={index}
                                    $hasData={day.hasData}
                                    $isProfit={day.pl >= 0}
                                    $isEmpty={day.isEmpty}
                                >
                                    {!day.isEmpty && (
                                        <>
                                            <CalendarDayNumber $isToday={day.isToday}>
                                                {day.dayNum}
                                            </CalendarDayNumber>
                                            {day.hasData && (
                                                <>
                                                    <CalendarDayPL $value={day.pl}>
                                                        ${day.pl >= 0 ? '' : '-'}{Math.abs(day.pl).toFixed(2)}
                                                    </CalendarDayPL>
                                                    <CalendarDayTrades>
                                                        {day.trades} trade{day.trades !== 1 ? 's' : ''}
                                                    </CalendarDayTrades>
                                                </>
                                            )}
                                        </>
                                    )}
                                </CalendarDay>
                            ))}
                        </CalendarGrid>
                    </CalendarContainer>

                    {/* P/L by Symbol Table - TastyTrade Style */}
                    <SectionTitle>P/L by Symbol</SectionTitle>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Symbol</Th>
                                    <Th $align="right">Realized Gain</Th>
                                    <Th $align="right">Unrealized Year Gain</Th>
                                    <Th $align="right">Year Gain</Th>
                                    <Th $align="right">Commissions</Th>
                                    <Th $align="right">Fees</Th>
                                    <Th $align="right">P/L YTD w/fees</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.plByTicker.map((ticker: ITickerPL) => (
                                    <tr key={ticker.ticker}>
                                        <Td><strong>{ticker.ticker}</strong></Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.realizedGain}>{formatCurrency(ticker.realizedGain)}</PLValue>
                                        </Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.unrealizedGain}>{formatCurrency(ticker.unrealizedGain)}</PLValue>
                                        </Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.yearGain}>{formatCurrency(ticker.yearGain)}</PLValue>
                                        </Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.commissions}>{formatCurrency(ticker.commissions)}</PLValue>
                                        </Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.fees}>{formatCurrency(ticker.fees)}</PLValue>
                                        </Td>
                                        <Td $align="right">
                                            <PLValue $value={ticker.plYTDWithFees}>{formatCurrency(ticker.plYTDWithFees)}</PLValue>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </TableContainer>
                </>
            )}

            {!isLoading && !summary && (
                <EmptyState>
                    <EmptyTitle>{account ? 'Nu exista date suficiente inca' : 'Conecteaza brokerul pentru date agregate'}</EmptyTitle>
                    <EmptyText>
                        {account
                            ? 'Intervalul selectat nu intoarce rezultate sau nu exista inca enough executions pentru agregare. Schimba perioada ori relanseaza incarcarea dupa ce apar trades noi.'
                            : 'Trading Dashboard are nevoie de un cont broker conectat ca sa poata calcula P&L agregat, evolutia capitalului si distributia pe simbol.'}
                    </EmptyText>
                    <EmptyHints>
                        <EmptyHint>Calendar zilnic</EmptyHint>
                        <EmptyHint>Curba equity</EmptyHint>
                        <EmptyHint>P&amp;L pe ticker</EmptyHint>
                    </EmptyHints>
                    <EmptyActions>
                        {!account && (
                            <EmptyAction $primary type="button" onClick={() => history.push('/account')}>
                                Mergi la cont
                            </EmptyAction>
                        )}
                        <EmptyAction type="button" onClick={() => history.push('/app')}>
                            Deschide scannerul
                        </EmptyAction>
                    </EmptyActions>
                </EmptyState>
            )}
        </DashboardContainer>
    );
});

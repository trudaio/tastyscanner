import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { ITickerPL, INetLiquidityPoint } from '../../services/trading-dashboard/trading-dashboard.interface';

const DashboardContainer = styled.div`
    padding: 20px;
    background-color: #0d0d1a;
    min-height: 100%;

    @media (max-width: 480px) {
        padding: 12px;
    }
`;

const Title = styled.h1`
    color: #fff;
    font-size: 24px;
    margin: 0 0 20px 0;
`;

const DateRangeContainer = styled.div`
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const DateInput = styled.input`
    padding: 8px 12px;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;

    &:focus {
        outline: none;
        border-color: #4a9eff;
    }
`;

const DateLabel = styled.label`
    color: #aaa;
    font-size: 14px;
`;

const QuickSelectButton = styled.button<{ $active?: boolean }>`
    padding: 8px 16px;
    background: ${props => props.$active ? '#4a9eff' : '#1a1a2e'};
    border: 1px solid ${props => props.$active ? '#4a9eff' : '#333'};
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.$active ? '#4a9eff' : '#2a2a3e'};
    }
`;

const RefreshButton = styled.button`
    padding: 8px 20px;
    background: #4a9eff;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: #3a8eef;
    }

    &:disabled {
        background: #333;
        cursor: not-allowed;
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
    background: #1a1a2e;
    border-radius: 8px;
    font-weight: 600;
    min-width: 680px;
`;

const TotalsHeaderRow = styled.div`
    display: grid;
    grid-template-columns: 120px repeat(6, 1fr);
    gap: 8px;
    padding: 4px 16px;
    min-width: 680px;
`;

const TotalsHeaderLabel = styled.div`
    color: #666;
    font-size: 11px;
    text-transform: uppercase;
    text-align: right;
    &:first-child { text-align: left; }
`;

const TotalLabel = styled.div`
    color: #fff;
    font-size: 16px;
`;

const TotalValue = styled.div<{ $value: number }>`
    color: ${props => props.$value >= 0 ? '#4dff91' : '#ff4d6d'};
    font-size: 16px;
    text-align: right;
`;

const SectionTitle = styled.h2`
    color: #fff;
    font-size: 18px;
    margin: 24px 0 16px 0;
`;

const TableContainer = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 24px;
    -webkit-overflow-scrolling: touch;
`;

const Table = styled.table`
    width: 100%;
    min-width: 550px;
    border-collapse: collapse;
`;

const Th = styled.th<{ $align?: string }>`
    text-align: ${props => props.$align || 'left'};
    padding: 12px 16px;
    background: #2a2a3e;
    color: #aaa;
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 500;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a3e;
    color: #fff;
    font-size: 14px;
    text-align: ${props => props.$align || 'left'};
`;

const PLValue = styled.span<{ $value: number }>`
    color: ${props => props.$value >= 0 ? '#4dff91' : '#ff4d6d'};
    font-weight: 500;
`;

const ChartContainer = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
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
    color: #888;
    font-size: 16px;
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 60px 20px;
    color: #666;
`;

const MetricsRow = styled.div`
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const MetricCard = styled.div<{ $color?: string }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 16px 20px;
    min-width: 130px;
    flex: 1;
    border-left: 4px solid ${props => props.$color || '#4a9eff'};

    @media (max-width: 480px) {
        padding: 12px 16px;
        min-width: 100px;
    }
`;

const MetricLabel = styled.div`
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 4px;
`;

const MetricValue = styled.div<{ $color?: string }>`
    color: ${props => props.$color || '#fff'};
    font-size: 20px;
    font-weight: 600;
`;

// Calendar Styles
const CalendarContainer = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
`;

const CalendarHeader = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 8px;
`;

const CalendarDayHeader = styled.div`
    text-align: center;
    color: #888;
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
        if (props.$isEmpty) return '#0d0d1a';
        if (!props.$hasData) return '#1f1f35';
        return props.$isProfit ? 'rgba(77, 255, 145, 0.2)' : 'rgba(255, 77, 109, 0.2)';
    }};
    border: 1px solid ${props => {
        if (props.$isEmpty) return 'transparent';
        if (!props.$hasData) return '#2a2a3e';
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
    color: ${props => props.$isToday ? '#4a9eff' : '#888'};
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
    color: #888;
    margin-top: 2px;
`;

const CalendarMonthTitle = styled.div`
    text-align: center;
    color: #fff;
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
        tradingDashboard.fetchTrades(startDate, endDate).catch(err => {
            console.error('Failed to fetch trades:', err);
        });
    }, [tradingDashboard, startDate, endDate]);

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
        tradingDashboard.fetchTrades(startDate, endDate);
    };

    return (
        <DashboardContainer>
            <Title>Trading Dashboard</Title>

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

                <RefreshButton onClick={handleRefresh} disabled={isLoading}>
                    {isLoading ? 'Loading...' : 'Refresh'}
                </RefreshButton>
            </DateRangeContainer>

            {isLoading && !summary && (
                <LoadingOverlay>Loading trading data...</LoadingOverlay>
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
                                    stroke="#444"
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
                                        fill="#888"
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
                                    fill="#888"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    ${Math.abs(chartData.yMax).toLocaleString()}
                                </text>
                                <text
                                    x={chartPadding.left - 10}
                                    y={zeroLineY + 4}
                                    fill="#888"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    $0
                                </text>
                                <text
                                    x={chartPadding.left - 10}
                                    y={chartHeight - chartPadding.bottom}
                                    fill="#888"
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
                            <EmptyState>Not enough data to display chart</EmptyState>
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
                    <p>No trading data available. Click Refresh to load.</p>
                </EmptyState>
            )}
        </DashboardContainer>
    );
});

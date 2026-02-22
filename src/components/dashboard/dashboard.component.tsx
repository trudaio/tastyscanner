import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorSummary } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';

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
    margin-right: 8px;
    white-space: nowrap;
`;

const DateRangeGroup = styled.div`
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    flex: 1;
`;

const DateBtn = styled.button<{ $active?: boolean }>`
    padding: 7px 14px;
    background: ${p => p.$active ? '#4a9eff' : '#1a1a2e'};
    border: 1px solid ${p => p.$active ? '#4a9eff' : '#333'};
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    &:hover { background: ${p => p.$active ? '#4a9eff' : '#2a2a3e'}; }
`;

const DateInput = styled.input`
    padding: 7px 10px;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    &:focus { outline: none; border-color: #4a9eff; }
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

/* ─── Top split row ───────────────────────────────────────── */

const TopSplit = styled.div`
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 16px;
    margin-bottom: 24px;
    @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const StatsCol = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

/* ─── Totals ──────────────────────────────────────────────── */

const TotalsWrap = styled.div`
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
`;

const TotalsHeaderRow = styled.div`
    display: grid;
    grid-template-columns: 80px repeat(6, 1fr);
    gap: 6px;
    padding: 0 14px;
    min-width: 580px;
`;

const TotalsHeaderLbl = styled.div`
    color: #555;
    font-size: 10px;
    text-transform: uppercase;
    text-align: right;
    &:first-child { text-align: left; }
`;

const TotalsRow = styled.div`
    display: grid;
    grid-template-columns: 80px repeat(6, 1fr);
    gap: 6px;
    padding: 14px;
    background: #1a1a2e;
    border-radius: 8px;
    font-weight: 600;
    min-width: 580px;
`;

const TotalsLbl = styled.div`
    color: #aaa;
    font-size: 13px;
`;

const TotalsVal = styled.div<{ $v: number }>`
    color: ${p => p.$v >= 0 ? '#4dff91' : '#ff4d6d'};
    font-size: 14px;
    text-align: right;
`;

/* ─── Quick stats ─────────────────────────────────────────── */

const StatsRow = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    @media (max-width: 480px) { grid-template-columns: repeat(2, 1fr); }
`;

const StatCard = styled.div<{ $accent: string }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 12px 14px;
    border-left: 3px solid ${p => p.$accent};
`;

const StatLbl = styled.div`
    color: #666;
    font-size: 10px;
    text-transform: uppercase;
    margin-bottom: 4px;
`;

const StatVal = styled.div<{ $color?: string }>`
    color: ${p => p.$color ?? '#fff'};
    font-size: 18px;
    font-weight: 700;
`;

/* ─── Net Liq chart ───────────────────────────────────────── */

const ChartBox = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
`;

const ChartHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
`;

const ChartTitle = styled.div`
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const ChartCurrentVal = styled.div<{ $up: boolean }>`
    color: ${p => p.$up ? '#4dff91' : '#ff4d6d'};
    font-size: 20px;
    font-weight: 700;
`;

const ChartSVG = styled.svg`
    width: 100%;
    flex: 1;
`;

const ChartEmpty = styled.div`
    color: #444;
    font-size: 13px;
    text-align: center;
    padding: 40px 0;
`;

/* ─── Section ──────────────────────────────────────────────── */

const SectionTitle = styled.h2`
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 10px;
`;

const SectionCount = styled.span`
    background: #2a2a3e;
    color: #888;
    font-size: 12px;
    font-weight: 400;
    padding: 2px 8px;
    border-radius: 10px;
`;

const SectionBlock = styled.div`
    margin-bottom: 28px;
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
    min-width: 680px;
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

const Td = styled.td<{ $align?: string }>`
    padding: 10px 14px;
    border-bottom: 1px solid #1e1e32;
    color: #fff;
    font-size: 13px;
    text-align: ${p => p.$align ?? 'left'};
    &:last-child { border-bottom-color: transparent; }
`;

const PLCell = styled(Td)<{ $v: number }>`
    color: ${p => p.$v >= 0 ? '#4dff91' : '#ff4d6d'};
    font-weight: 600;
`;

const getDteColor = (dte: number) => dte > 30 ? '#4dff91' : dte >= 21 ? '#ffaa00' : '#ff4d6d';

const DteCell = styled(Td)<{ $dte: number }>`
    color: ${p => getDteColor(p.$dte)};
    font-weight: 600;
    white-space: nowrap;
`;

const CloseBadge = styled.span`
    display: inline-block;
    background: #ff4d6d;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
`;

const TargetBadge = styled.span`
    display: inline-block;
    background: rgba(77,255,145,0.12);
    border: 1px solid #4dff91;
    color: #4dff91;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
`;

const TargetTd = styled(Td)`
    color: #aaa;
    font-size: 12px;
    white-space: nowrap;
`;

const WinBar = styled.div<{ $rate: number }>`
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    margin-top: 3px;
    &::after {
        content: '';
        display: block;
        width: ${p => p.$rate}%;
        height: 100%;
        background: ${p => p.$rate >= 50 ? '#4dff91' : '#ff4d6d'};
        border-radius: 3px;
    }
`;

/* ─── Misc ────────────────────────────────────────────────── */

const LoadRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 30px;
    color: #666;
    font-size: 14px;
`;

const EmptyRow = styled.div`
    padding: 30px;
    text-align: center;
    color: #444;
    font-size: 14px;
`;

const WinRateBar = styled.div<{ $rate: number }>`
    width: 60px;
    height: 5px;
    background: #2a2a3e;
    border-radius: 3px;
    margin-top: 3px;
    &::after {
        content: '';
        display: block;
        width: ${p => Math.min(p.$rate, 100)}%;
        height: 100%;
        background: ${p => p.$rate >= 50 ? '#4dff91' : '#ff4d6d'};
        border-radius: 3px;
    }
`;

/* ─── Helpers ─────────────────────────────────────────────── */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? abs : `-${abs}`;
};

const kFmt = (v: number): string => {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
};

type DatePreset = 'ytd' | 'mtd' | '3m' | '6m' | '1y' | 'custom';

/* ─── Component ───────────────────────────────────────────── */

export const DashboardComponent: React.FC = observer(() => {
    const services = useServices();
    const { tradingDashboard } = services;
    const account = services.brokerAccount.currentAccount;

    const [preset, setPreset] = useState<DatePreset>('ytd');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const [icSummary, setIcSummary] = useState<IIronCondorSummary | null>(null);
    const [icLoading, setIcLoading] = useState(false);

    /* date range */
    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let start: Date;
        switch (preset) {
            case 'mtd': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
            case '3m':  start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
            case '6m':  start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
            case '1y':  start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
            case 'custom':
                return {
                    startDate: customFrom ? new Date(customFrom) : new Date(now.getFullYear(), 0, 1),
                    endDate:   customTo   ? new Date(customTo)   : end
                };
            default: start = new Date(now.getFullYear(), 0, 1);
        }
        return { startDate: start, endDate: end };
    }, [preset, customFrom, customTo]);

    /* fetch trading data on date change */
    useEffect(() => {
        tradingDashboard.fetchTrades(startDate, endDate).catch(console.error);
    }, [tradingDashboard, startDate, endDate]);

    /* fetch IC data on account change */
    const fetchIc = async () => {
        if (!services.brokerAccount.currentAccount) return;
        setIcLoading(true);
        try {
            const data = await services.ironCondorAnalytics.getSummary();
            setIcSummary(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIcLoading(false);
        }
    };

    useEffect(() => { fetchIc(); }, [account]);

    const handleRefresh = () => {
        tradingDashboard.fetchTrades(startDate, endDate).catch(console.error);
        fetchIc();
    };

    const summary = tradingDashboard.summary;
    const isLoading = tradingDashboard.isLoading;

    /* ── Net liq chart data ─────────────────────────────────── */
    const W = 800, H = 220;
    const PAD = { top: 16, right: 70, bottom: 36, left: 70 };

    const chartData = useMemo(() => {
        if (!summary || summary.netLiquidityHistory.length <= 1) return null;
        const currentNetLiq = account?.balances?.netLiquidity ?? 0;
        const hist = summary.netLiquidityHistory;
        const lastPL = hist[hist.length - 1].cumulativePL;
        const startNL = currentNetLiq - lastPL;

        const pts = hist.map((d, i) => ({
            date: d.date,
            value: startNL + d.cumulativePL,
            i
        }));

        const values = pts.map(p => p.value);
        const yMin = Math.min(...values) * 0.998;
        const yMax = Math.max(...values) * 1.002;
        const yRange = Math.max(yMax - yMin, 1);

        const xS = (i: number) =>
            PAD.left + (i / (pts.length - 1 || 1)) * (W - PAD.left - PAD.right);
        const yS = (v: number) =>
            PAD.top + (1 - (v - yMin) / yRange) * (H - PAD.top - PAD.bottom);

        const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xS(i)} ${yS(p.value)}`).join(' ');
        const areaPath = `${linePath} L ${xS(pts.length - 1)} ${H - PAD.bottom} L ${xS(0)} ${H - PAD.bottom} Z`;

        const interval = Math.ceil(pts.length / 6);
        const xLabels = pts
            .filter((_, i) => i % interval === 0 || i === pts.length - 1)
            .map(p => ({
                x: xS(p.i),
                label: p.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));

        const yTicks = [yMin, (yMin + yMax) / 2, yMax].map(v => ({ y: yS(v), label: kFmt(v) }));

        const isUp = pts[pts.length - 1].value >= pts[0].value;
        const lineColor = isUp ? '#4dff91' : '#ff4d6d';
        const fillColor = isUp ? 'rgba(77,255,145,0.12)' : 'rgba(255,77,109,0.12)';

        const last = pts[pts.length - 1];

        return { linePath, areaPath, xLabels, yTicks, lineColor, fillColor, last: { x: xS(last.i), y: yS(last.value), value: last.value }, isUp };
    }, [summary, account?.balances?.netLiquidity]);

    /* ── Open IC trades ─────────────────────────────────────── */
    const openTrades = icSummary?.trades.filter(t => t.status === 'open')
        .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()) ?? [];

    /* ─────────────────────────────────────────────────────────── */
    return (
        <Container>

            {/* ── Top bar ──────────────────────────────── */}
            <TopBar>
                <Title>Dashboard</Title>
                <DateRangeGroup>
                    {(['ytd','mtd','3m','6m','1y','custom'] as DatePreset[]).map(p => (
                        <DateBtn key={p} $active={preset === p} onClick={() => setPreset(p)}>
                            {p.toUpperCase()}
                        </DateBtn>
                    ))}
                    {preset === 'custom' && (
                        <>
                            <DateInput type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                            <DateInput type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)} />
                        </>
                    )}
                </DateRangeGroup>
                <RefreshBtn onClick={handleRefresh} disabled={isLoading || icLoading}>
                    {(isLoading || icLoading) ? 'Loading…' : '↻ Refresh'}
                </RefreshBtn>
            </TopBar>

            {/* ── Top split: stats + chart ──────────────── */}
            <TopSplit>

                {/* LEFT — P&L stats */}
                <StatsCol>
                    {summary ? (
                        <>
                            <TotalsWrap>
                                <TotalsHeaderRow>
                                    <TotalsHeaderLbl />
                                    <TotalsHeaderLbl>Realized</TotalsHeaderLbl>
                                    <TotalsHeaderLbl>Unrealized</TotalsHeaderLbl>
                                    <TotalsHeaderLbl>Year Gain</TotalsHeaderLbl>
                                    <TotalsHeaderLbl>Comm.</TotalsHeaderLbl>
                                    <TotalsHeaderLbl>Fees</TotalsHeaderLbl>
                                    <TotalsHeaderLbl>P/L w/Fees</TotalsHeaderLbl>
                                </TotalsHeaderRow>
                                <TotalsRow>
                                    <TotalsLbl>TOTALS</TotalsLbl>
                                    <TotalsVal $v={summary.realizedGain}>{fmtCur(summary.realizedGain)}</TotalsVal>
                                    <TotalsVal $v={summary.unrealizedGain}>{fmtCur(summary.unrealizedGain)}</TotalsVal>
                                    <TotalsVal $v={summary.yearGain}>{fmtCur(summary.yearGain)}</TotalsVal>
                                    <TotalsVal $v={summary.commissions}>{fmtCur(summary.commissions)}</TotalsVal>
                                    <TotalsVal $v={summary.fees}>{fmtCur(summary.fees)}</TotalsVal>
                                    <TotalsVal $v={summary.plYTDWithFees}>{fmtCur(summary.plYTDWithFees)}</TotalsVal>
                                </TotalsRow>
                            </TotalsWrap>

                            <StatsRow>
                                <StatCard $accent="#4a9eff">
                                    <StatLbl>Total Trades</StatLbl>
                                    <StatVal>{summary.totalTrades}</StatVal>
                                </StatCard>
                                <StatCard $accent="#4dff91">
                                    <StatLbl>Winners</StatLbl>
                                    <StatVal $color="#4dff91">{summary.winnersCount}</StatVal>
                                </StatCard>
                                <StatCard $accent="#ff4d6d">
                                    <StatLbl>Losers</StatLbl>
                                    <StatVal $color="#ff4d6d">{summary.losersCount}</StatVal>
                                </StatCard>
                                <StatCard $accent={summary.winRate >= 50 ? '#4dff91' : '#ff4d6d'}>
                                    <StatLbl>Win Rate</StatLbl>
                                    <StatVal $color={summary.winRate >= 50 ? '#4dff91' : '#ff4d6d'}>
                                        {summary.winRate.toFixed(1)}%
                                    </StatVal>
                                </StatCard>
                            </StatsRow>
                        </>
                    ) : isLoading ? (
                        <LoadRow><IonSpinner name="crescent" /><span>Loading P&amp;L data…</span></LoadRow>
                    ) : (
                        <EmptyRow>No data — click Refresh</EmptyRow>
                    )}
                </StatsCol>

                {/* RIGHT — Net Liq chart */}
                <ChartBox>
                    <ChartHeader>
                        <ChartTitle>Net Liquidity Evolution</ChartTitle>
                        {chartData && (
                            <ChartCurrentVal $up={chartData.isUp}>
                                {kFmt(chartData.last.value)}
                            </ChartCurrentVal>
                        )}
                    </ChartHeader>

                    {chartData ? (
                        <ChartSVG viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ minHeight: 160 }}>
                            {/* Gradient definition */}
                            <defs>
                                <linearGradient id="nlGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={chartData.lineColor} stopOpacity="0.25" />
                                    <stop offset="100%" stopColor={chartData.lineColor} stopOpacity="0" />
                                </linearGradient>
                            </defs>

                            {/* Subtle horizontal grid lines */}
                            {chartData.yTicks.map((t, i) => (
                                <line key={i}
                                    x1={PAD.left} y1={t.y}
                                    x2={W - PAD.right} y2={t.y}
                                    stroke="#1e1e32" strokeWidth="1"
                                />
                            ))}

                            {/* Area fill */}
                            <path d={chartData.areaPath} fill="url(#nlGrad)" />

                            {/* Line */}
                            <path d={chartData.linePath} fill="none"
                                stroke={chartData.lineColor} strokeWidth="2.5" strokeLinejoin="round" />

                            {/* End dot */}
                            <circle cx={chartData.last.x} cy={chartData.last.y}
                                r="5" fill={chartData.lineColor} />

                            {/* Y-axis labels */}
                            {chartData.yTicks.map((t, i) => (
                                <text key={i}
                                    x={PAD.left - 8} y={t.y + 4}
                                    fill="#555" fontSize="11" textAnchor="end">
                                    {t.label}
                                </text>
                            ))}

                            {/* X-axis labels */}
                            {chartData.xLabels.map((l, i) => (
                                <text key={i}
                                    x={l.x} y={H - 6}
                                    fill="#555" fontSize="11" textAnchor="middle">
                                    {l.label}
                                </text>
                            ))}
                        </ChartSVG>
                    ) : (
                        <ChartEmpty>
                            {isLoading ? 'Loading chart…' : 'Not enough data for chart'}
                        </ChartEmpty>
                    )}
                </ChartBox>
            </TopSplit>

            {/* ── Open Iron Condors ─────────────────────── */}
            <SectionBlock>
                <SectionTitle>
                    Open Iron Condors
                    <SectionCount>{openTrades.length}</SectionCount>
                    {icLoading && <IonSpinner name="crescent" style={{ width: 16, height: 16, marginLeft: 8 }} />}
                </SectionTitle>
                <TableWrap>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Ticker</Th>
                                <Th>Expiration</Th>
                                <Th>Put Spread</Th>
                                <Th>Call Spread</Th>
                                <Th $align="center">Qty</Th>
                                <Th $align="center">DTE</Th>
                                <Th $align="right">Credit</Th>
                                <Th $align="right">Max Profit</Th>
                                <Th $align="right">75% Target</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {openTrades.length === 0 ? (
                                <tr>
                                    <Td colSpan={9} $align="center" style={{ color: '#444', padding: '24px' }}>
                                        {icLoading ? 'Loading…' : 'No open trades'}
                                    </Td>
                                </tr>
                            ) : openTrades.map(trade => {
                                const dte = Math.ceil(
                                    (new Date(trade.expirationDate).getTime() - Date.now()) / 86_400_000
                                );
                                return (
                                    <tr key={trade.id}>
                                        <Td><strong>{trade.ticker}</strong></Td>
                                        <Td>{trade.expirationDate}</Td>
                                        <Td>{trade.putBuyStrike}/{trade.putSellStrike}</Td>
                                        <Td>{trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                        <Td $align="center">{trade.quantity}</Td>
                                        <DteCell $dte={dte} $align="center">
                                            {dte}d{dte < 21 && <CloseBadge>Close Now</CloseBadge>}
                                        </DteCell>
                                        <Td $align="right">${trade.openCredit.toFixed(2)}</Td>
                                        <PLCell $v={trade.openCredit} $align="right">
                                            +${trade.openCredit.toFixed(2)}
                                        </PLCell>
                                        <TargetTd $align="right">
                                            ${(trade.openCredit * 0.25).toFixed(2)}
                                            <TargetBadge>75%</TargetBadge>
                                        </TargetTd>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </TableWrap>
            </SectionBlock>

            {/* ── Profit by Ticker ──────────────────────── */}
            {summary && summary.plByTicker.length > 0 && (
                <SectionBlock>
                    <SectionTitle>
                        Profit by Ticker
                        <SectionCount>{summary.plByTicker.length} symbols</SectionCount>
                    </SectionTitle>
                    <TableWrap>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Symbol</Th>
                                    <Th $align="center">Trades</Th>
                                    <Th $align="center">Win Rate</Th>
                                    <Th $align="right">Realized</Th>
                                    <Th $align="right">Unrealized</Th>
                                    <Th $align="right">Year Gain</Th>
                                    <Th $align="right">Commissions</Th>
                                    <Th $align="right">Fees</Th>
                                    <Th $align="right">P/L YTD w/Fees</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Totals row */}
                                <tr style={{ background: '#1e1e32' }}>
                                    <Td><strong style={{ color: '#aaa' }}>TOTALS</strong></Td>
                                    <Td $align="center" style={{ color: '#aaa' }}>{summary.totalTrades}</Td>
                                    <Td $align="center">
                                        <span style={{ color: summary.winRate >= 50 ? '#4dff91' : '#ff4d6d', fontWeight: 600 }}>
                                            {summary.winRate.toFixed(1)}%
                                        </span>
                                        <WinRateBar $rate={summary.winRate} />
                                    </Td>
                                    <PLCell $v={summary.realizedGain} $align="right">{fmtCur(summary.realizedGain)}</PLCell>
                                    <PLCell $v={summary.unrealizedGain} $align="right">{fmtCur(summary.unrealizedGain)}</PLCell>
                                    <PLCell $v={summary.yearGain} $align="right">{fmtCur(summary.yearGain)}</PLCell>
                                    <PLCell $v={summary.commissions} $align="right">{fmtCur(summary.commissions)}</PLCell>
                                    <PLCell $v={summary.fees} $align="right">{fmtCur(summary.fees)}</PLCell>
                                    <PLCell $v={summary.plYTDWithFees} $align="right"><strong>{fmtCur(summary.plYTDWithFees)}</strong></PLCell>
                                </tr>
                                {/* Per-ticker rows sorted by P/L descending */}
                                {[...summary.plByTicker]
                                    .sort((a, b) => b.plYTDWithFees - a.plYTDWithFees)
                                    .map(t => (
                                        <tr key={t.ticker}>
                                            <Td><strong>{t.ticker}</strong></Td>
                                            <Td $align="center" style={{ color: '#aaa' }}>
                                                {t.tradesCount}
                                                <div style={{ fontSize: 10, color: '#555' }}>
                                                    {t.winnersCount}W / {t.losersCount}L
                                                </div>
                                            </Td>
                                            <Td $align="center">
                                                <span style={{ color: t.winRate >= 50 ? '#4dff91' : '#ff4d6d', fontWeight: 600 }}>
                                                    {t.winRate.toFixed(1)}%
                                                </span>
                                                <WinRateBar $rate={t.winRate} />
                                            </Td>
                                            <PLCell $v={t.realizedGain} $align="right">{fmtCur(t.realizedGain)}</PLCell>
                                            <PLCell $v={t.unrealizedGain} $align="right">{fmtCur(t.unrealizedGain)}</PLCell>
                                            <PLCell $v={t.yearGain} $align="right">{fmtCur(t.yearGain)}</PLCell>
                                            <PLCell $v={t.commissions} $align="right">{fmtCur(t.commissions)}</PLCell>
                                            <PLCell $v={t.fees} $align="right">{fmtCur(t.fees)}</PLCell>
                                            <PLCell $v={t.plYTDWithFees} $align="right"><strong>{fmtCur(t.plYTDWithFees)}</strong></PLCell>
                                        </tr>
                                    ))}
                            </tbody>
                        </Table>
                    </TableWrap>
                </SectionBlock>
            )}

        </Container>
    );
});

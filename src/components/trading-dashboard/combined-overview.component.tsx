import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { INetLiquidityPoint } from '../../services/trading-dashboard/trading-dashboard.interface';

/* ─── Net Liq Header Card ─────────────────────────────────── */

const HeaderCard = styled.div`
    background: #1a1a2e;
    border-radius: 12px;
    padding: 20px 24px 16px;
    margin-bottom: 12px;
    border: 1px solid #2a2a3e;
`;

const HeaderLabel = styled.div`
    color: #8888aa;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
`;

const NetLiqValue = styled.div<{ $positive: boolean }>`
    color: ${p => p.$positive ? '#66bb6a' : '#ef5350'};
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1;
    margin-bottom: 16px;
`;

/* ─── Daily P&L Stats Row ─────────────────────────────────── */

const StatsRow = styled.div`
    display: flex;
    gap: 0;
    border-top: 1px solid #2a2a3e;
    padding-top: 14px;

    @media (max-width: 480px) {
        flex-wrap: wrap;
        gap: 8px;
    }
`;

const StatItem = styled.div`
    flex: 1;
    padding: 0 12px;
    border-right: 1px solid #2a2a3e;
    &:first-child { padding-left: 0; }
    &:last-child { border-right: none; }

    @media (max-width: 480px) {
        flex: 0 0 calc(50% - 4px);
        border-right: none;
        padding: 0;
    }
`;

const StatLabel = styled.div`
    color: #8888aa;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    white-space: nowrap;
`;

const StatValue = styled.div<{ $value: number }>`
    color: ${p => p.$value > 0 ? '#66bb6a' : p.$value < 0 ? '#ef5350' : '#e0e0e0'};
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
`;

const StatNeutral = styled.div`
    color: #8888aa;
    font-size: 16px;
    font-weight: 600;
`;

/* ─── Helpers ─────────────────────────────────────────────── */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `+$${abs}` : `-$${abs}`;
};

const fmtCurPlain = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

interface IDailyStats {
    todayPL: number | null;
    avg7dPL: number | null;
    bestDayThisMonth: number | null;
}

function computeDailyStats(history: INetLiquidityPoint[]): IDailyStats {
    if (!history.length) return { todayPL: null, avg7dPL: null, bestDayThisMonth: null };

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayPL: number | null = null;
    const last7: number[] = [];
    const thisMonthPLs: number[] = [];

    // Sort by date ascending
    const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const point of sorted) {
        const pointStr = point.date.toISOString().split('T')[0];

        // Today's P&L
        if (pointStr === todayStr) {
            todayPL = point.dayPL;
        }

        // 7-day average (last 7 calendar days with P&L != 0)
        if (point.date >= cutoff7d && point.dayPL !== 0) {
            last7.push(point.dayPL);
        }

        // Best day this month
        if (point.date >= monthStart && point.dayPL !== 0) {
            thisMonthPLs.push(point.dayPL);
        }
    }

    const avg7dPL = last7.length > 0 ? last7.reduce((s, v) => s + v, 0) / last7.length : null;
    const bestDayThisMonth = thisMonthPLs.length > 0 ? Math.max(...thisMonthPLs) : null;

    return { todayPL, avg7dPL, bestDayThisMonth };
}

/* ─── Component ───────────────────────────────────────────── */

export const CombinedOverview: React.FC = observer(() => {
    const { tradingDashboard, brokerAccount } = useServices();
    const summary = tradingDashboard.summary;
    const account = brokerAccount.currentAccount;

    const netLiq = account?.balances?.netLiquidity ?? 0;

    const stats = useMemo<IDailyStats>(() => {
        if (!summary) return { todayPL: null, avg7dPL: null, bestDayThisMonth: null };
        return computeDailyStats(summary.netLiquidityHistory);
    }, [summary]);

    return (
        <HeaderCard>
            <HeaderLabel>Net Liquidity</HeaderLabel>
            <NetLiqValue $positive={netLiq >= 0}>
                {fmtCurPlain(netLiq)}
            </NetLiqValue>

            <StatsRow>
                <StatItem>
                    <StatLabel>Today's P&amp;L</StatLabel>
                    {stats.todayPL !== null ? (
                        <StatValue $value={stats.todayPL}>{fmtCur(stats.todayPL)}</StatValue>
                    ) : (
                        <StatNeutral>—</StatNeutral>
                    )}
                </StatItem>

                <StatItem>
                    <StatLabel>7-Day Avg</StatLabel>
                    {stats.avg7dPL !== null ? (
                        <StatValue $value={stats.avg7dPL}>{fmtCur(stats.avg7dPL)}</StatValue>
                    ) : (
                        <StatNeutral>—</StatNeutral>
                    )}
                </StatItem>

                <StatItem>
                    <StatLabel>Best Day (MTD)</StatLabel>
                    {stats.bestDayThisMonth !== null ? (
                        <StatValue $value={stats.bestDayThisMonth}>{fmtCur(stats.bestDayThisMonth)}</StatValue>
                    ) : (
                        <StatNeutral>—</StatNeutral>
                    )}
                </StatItem>
            </StatsRow>
        </HeaderCard>
    );
});

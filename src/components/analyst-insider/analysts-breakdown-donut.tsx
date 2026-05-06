import React, { useMemo } from 'react';
import styled from 'styled-components';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { IGradeChange } from '../../services/api-clients/fmp.client';
import {
    C,
    Card,
    CardTitle,
    CardTitleRow,
    Empty,
    ratingPalette,
    type RatingBucket,
} from './analyst-insider-styled';

interface IProps {
    history: IGradeChange[];
    /** Look-back window in days; defaults to 90. */
    days?: number;
}

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  align-items: center;
  gap: 16px;
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;

const Legend = styled.div`
  display: grid;
  gap: 6px;
  font-size: 13px;
`;

const LegendRow = styled.div`
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
`;

const Dot = styled.div<{ $bg: string }>`
  width: 10px; height: 10px; border-radius: 50%;
  background: ${(p) => p.$bg};
`;

const ChartBox = styled.div`
  height: 160px;
`;

const BUCKETS: RatingBucket[] = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];

function bucketize(grade: string): RatingBucket {
    const g = grade.toLowerCase().trim();
    if (g === 'strong buy' || g === 'top pick') return 'Strong Buy';
    if (g === 'strong sell') return 'Strong Sell';
    if (
        g === 'buy' || g === 'outperform' || g === 'overweight' ||
        g === 'positive' || g === 'add' || g === 'accumulate' ||
        g === 'market outperform' || g === 'sector outperform'
    ) return 'Buy';
    if (
        g === 'sell' || g === 'underperform' || g === 'underweight' ||
        g === 'reduce' || g === 'negative' || g === 'sector underperform'
    ) return 'Sell';
    return 'Hold'; // hold / neutral / market perform / equal-weight / peer perform / mkt perform
}

export const AnalystsBreakdownDonut: React.FC<IProps> = ({ history, days = 90 }) => {
    const { counts, total } = useMemo(() => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const c: Record<RatingBucket, number> = {
            'Strong Buy': 0, 'Buy': 0, 'Hold': 0, 'Sell': 0, 'Strong Sell': 0,
        };
        for (const r of history) {
            if (!r.date) continue;
            const t = new Date(r.date + 'T00:00:00').getTime();
            if (!Number.isFinite(t) || t < cutoff) continue;
            c[bucketize(r.newGrade)] += 1;
        }
        const t = c['Strong Buy'] + c['Buy'] + c['Hold'] + c['Sell'] + c['Strong Sell'];
        return { counts: c, total: t };
    }, [history, days]);

    if (total === 0) {
        return (
            <Card>
                <CardTitleRow><CardTitle>Analysts Breakdown</CardTitle></CardTitleRow>
                <Empty>No analyst rating actions in the last {days} days.</Empty>
            </Card>
        );
    }

    const chartData = BUCKETS
        .map((b) => ({ name: b, value: counts[b], color: ratingPalette[b] }))
        .filter((d) => d.value > 0);

    return (
        <Card>
            <CardTitleRow><CardTitle>Analysts Breakdown</CardTitle></CardTitleRow>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, fontWeight: 700 }}>
                {total} Analysts in the Last {days} Days
            </div>
            <Body>
                <Legend>
                    {BUCKETS.map((b) => (
                        <LegendRow key={b}>
                            <Dot $bg={ratingPalette[b]} />
                            <span style={{ color: C.text }}>{b}:</span>
                            <span style={{ color: C.textDim, fontWeight: 700 }}>{counts[b]}</span>
                        </LegendRow>
                    ))}
                </Legend>
                <ChartBox>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                innerRadius={48}
                                outerRadius={70}
                                stroke={C.bgCard}
                                strokeWidth={2}
                                startAngle={90}
                                endAngle={-270}
                            >
                                {chartData.map((d) => (
                                    <Cell key={d.name} fill={d.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </ChartBox>
            </Body>
        </Card>
    );
};

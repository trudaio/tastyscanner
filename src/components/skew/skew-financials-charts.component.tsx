import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { IFinancialsPoint, IHistoricalFinancials } from '../../services/api-clients/fmp.client';

const C = {
    bgCard: '#12121a',
    bgChart: '#1a1a24',
    border: '#2a2a3a',
    borderStrong: '#3a3a4a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    grid: 'rgba(255,255,255,0.04)',
    bar1: '#3b82f6',  // GAAP EPS — blue
    bar2: '#8b5cf6',  // Sales — purple
    bar3: '#14b8a6',  // Shares — teal
    accent: '#3b82f6',
} as const;

const Wrap = styled.div`
  background: ${C.bgCard};
  border: 1px solid ${C.border};
  border-radius: 12px;
  padding: 14px 16px 18px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
`;

const Title = styled.div`
  font-size: 15px;
  font-weight: 800;
  color: ${C.text};
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const Sub = styled.div`
  font-size: 11px;
  color: ${C.textDim};
  margin-top: 2px;
`;

const ToggleWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${C.textDim};
`;

const ToggleLbl = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  font-weight: 700;
  color: ${C.textMuted};
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? 'rgba(59, 130, 246, 0.16)' : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? C.accent : C.borderStrong)};
  color: ${(p) => (p.$active ? '#cfe2ff' : C.textDim)};
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { color: ${C.text}; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 980px) { grid-template-columns: 1fr; }
`;

const ChartCard = styled.div`
  background: ${C.bgChart};
  border: 1px solid ${C.border};
  border-radius: 10px;
  padding: 12px 12px 6px;
  min-width: 0;
`;

const ChartTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${C.textDim};
  margin: 2px 4px 8px;
`;

const SvgEl = styled.svg`
  width: 100%;
  height: auto;
  display: block;
`;

const Empty = styled.div`
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: ${C.textDim};
  background: ${C.bgChart};
  border: 1px dashed ${C.border};
  border-radius: 10px;
`;

interface IProps {
    data: IHistoricalFinancials | null;
}

type Timeframe = 'annual' | 'quarterly';

export const SkewFinancialsCharts: React.FC<IProps> = ({ data }) => {
    const [timeframe, setTimeframe] = useState<Timeframe>('annual');

    const points = useMemo<IFinancialsPoint[]>(() => {
        if (!data) return [];
        return timeframe === 'annual' ? data.annual : data.quarterly;
    }, [data, timeframe]);

    if (!data || (data.annual.length === 0 && data.quarterly.length === 0)) {
        return (
            <Wrap>
                <HeaderRow>
                    <div>
                        <Title>Financials</Title>
                        <Sub>Annual / Quarterly history — GAAP EPS, Sales, Shares Outstanding</Sub>
                    </div>
                </HeaderRow>
                <Empty>Historical financials unavailable for this ticker (common for ETFs / indices).</Empty>
            </Wrap>
        );
    }

    return (
        <Wrap>
            <HeaderRow>
                <div>
                    <Title>Financials</Title>
                    <Sub>Source: Financial Modeling Prep — income statement</Sub>
                </div>
                <ToggleWrap>
                    <ToggleLbl>Timeframe</ToggleLbl>
                    <ToggleBtn $active={timeframe === 'annual'} onClick={() => setTimeframe('annual')}>Annual</ToggleBtn>
                    <ToggleBtn $active={timeframe === 'quarterly'} onClick={() => setTimeframe('quarterly')}>Quarterly</ToggleBtn>
                </ToggleWrap>
            </HeaderRow>

            <Grid>
                <ChartCard>
                    <ChartTitle>GAAP EPS</ChartTitle>
                    <BarChart
                        points={points}
                        valueFn={(p) => epsValue(p)}
                        formatFn={(v) => v.toFixed(2)}
                        color={C.bar1}
                    />
                </ChartCard>
                <ChartCard>
                    <ChartTitle>Sales ($bln)</ChartTitle>
                    <BarChart
                        points={points}
                        valueFn={(p) => (p.revenue != null ? p.revenue / 1e9 : null)}
                        formatFn={(v) => v.toFixed(2)}
                        color={C.bar2}
                    />
                </ChartCard>
                <ChartCard>
                    <ChartTitle>Shares Outstanding (bln)</ChartTitle>
                    <BarChart
                        points={points}
                        valueFn={(p) => (p.sharesOutstanding != null ? p.sharesOutstanding / 1e9 : null)}
                        formatFn={(v) => v.toFixed(2)}
                        color={C.bar3}
                    />
                </ChartCard>
            </Grid>
        </Wrap>
    );
};

/** Use diluted EPS when available (industry standard); fall back to basic. */
function epsValue(p: IFinancialsPoint): number | null {
    if (p.epsDiluted != null) return p.epsDiluted;
    if (p.eps != null) return p.eps;
    return null;
}

interface IBarChartProps {
    points: IFinancialsPoint[];
    valueFn: (p: IFinancialsPoint) => number | null;
    formatFn: (v: number) => string;
    color: string;
}

const BarChart: React.FC<IBarChartProps> = ({ points, valueFn, formatFn, color }) => {
    const VW = 460;
    const VH = 220;
    const PAD_L = 8;
    const PAD_R = 36;
    const PAD_T = 18;
    const PAD_B = 26;

    const values = points.map(valueFn);
    const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (finite.length === 0) {
        return <Empty>No data</Empty>;
    }

    const rawMin = Math.min(...finite, 0);
    const rawMax = Math.max(...finite, 0);
    // Add 18% headroom on top so value labels fit above bars
    const span = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.001, 0.001);
    const yMin = rawMin < 0 ? rawMin - span * 0.1 : 0;
    const yMax = rawMax + span * 0.18;

    const innerW = VW - PAD_L - PAD_R;
    const innerH = VH - PAD_T - PAD_B;
    const n = points.length;
    const slot = innerW / Math.max(n, 1);
    const barW = Math.max(slot * 0.7, 6);

    const yToPx = (v: number): number => PAD_T + ((yMax - v) / (yMax - yMin)) * innerH;
    const zeroY = yToPx(0);

    // Pretty y-axis ticks (5 steps)
    const ticks = niceTicks(yMin, yMax, 5);

    return (
        <SvgEl viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet">
            {/* horizontal gridlines */}
            {ticks.map((t, i) => {
                const y = yToPx(t);
                return (
                    <g key={`g${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={y} y2={y} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />
                        <text x={VW - PAD_R + 4} y={y + 3} fontSize={9} fill={C.textMuted} fontFamily="system-ui, sans-serif">
                            {formatFn(t)}
                        </text>
                    </g>
                );
            })}

            {/* bars + value labels + period labels */}
            {points.map((p, i) => {
                const v = values[i];
                const cx = PAD_L + slot * i + slot / 2;
                const x = cx - barW / 2;

                const periodLabel = shortLabel(p.fiscalPeriod, n);

                if (v == null || !Number.isFinite(v)) {
                    return (
                        <g key={i}>
                            <text x={cx} y={VH - 8} fontSize={9} fill={C.textMuted} textAnchor="middle">{periodLabel}</text>
                        </g>
                    );
                }

                const yVal = yToPx(v);
                const top = Math.min(yVal, zeroY);
                const h = Math.max(Math.abs(yVal - zeroY), 1);

                return (
                    <g key={i}>
                        <rect
                            x={x}
                            y={top}
                            width={barW}
                            height={h}
                            rx={2}
                            fill={color}
                            opacity={0.92}
                        />
                        <text
                            x={cx}
                            y={top - 4}
                            fontSize={9.5}
                            fill={C.text}
                            textAnchor="middle"
                            fontWeight={700}
                            fontFamily="system-ui, sans-serif"
                        >
                            {formatFn(v)}
                        </text>
                        <text x={cx} y={VH - 8} fontSize={9} fill={C.textMuted} textAnchor="middle" fontFamily="system-ui, sans-serif">
                            {periodLabel}
                        </text>
                    </g>
                );
            })}

            {/* zero baseline (only if range crosses zero or starts above) */}
            {yMin < 0 && (
                <line x1={PAD_L} x2={VW - PAD_R} y1={zeroY} y2={zeroY} stroke={C.borderStrong} strokeWidth={1} />
            )}
        </SvgEl>
    );
};

/** Make a tick array of approximately `count` "nice" values that span [min,max]. */
function niceTicks(min: number, max: number, count: number): number[] {
    if (max <= min) return [min];
    const range = max - min;
    const rough = range / Math.max(count - 1, 1);
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step: number;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;

    const start = Math.ceil(min / step) * step;
    const out: number[] = [];
    for (let v = start; v <= max + 1e-9; v += step) {
        out.push(+v.toFixed(10));
    }
    return out;
}

/** When many quarterly bars are crowded, show only year/quarter abbreviations. */
function shortLabel(label: string, total: number): string {
    if (total <= 10) return label;
    // "Q3 2024" → "Q3'24"
    const m = label.match(/^(Q[1-4])\s+(\d{4})$/i);
    if (m) return `${m[1].toUpperCase()}'${m[2].slice(2)}`;
    if (/^\d{4}$/.test(label)) return label.slice(2);
    return label;
}

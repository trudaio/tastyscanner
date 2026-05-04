import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { ISkewChartPoint } from '../../services/skew-analysis/skew-analysis.service.interface';

// Plain SVG implementation — no charting library. Mirrors the pattern used in
// `technicals-chart.component.tsx`. Fixed viewBox, lines built from data.

const VW = 1200;
const VH = 400;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 56;

const Wrapper = styled.div`
  width: 100%;
  position: relative;
  user-select: none;
`;

const Svg = styled.svg`
  width: 100%;
  height: auto;
  display: block;
  background: var(--ion-color-light);
  border-radius: 8px;
`;

const TooltipBox = styled.div`
  position: absolute;
  pointer-events: none;
  background: rgba(33, 33, 33, 0.95);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
  transform: translate(-50%, -100%);
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--ion-color-medium);
`;

const LegendDot = styled.span<{ $color: string; $dashed?: boolean }>`
  display: inline-block;
  width: 16px;
  height: 3px;
  background: ${(p) => p.$color};
  margin-right: 6px;
  vertical-align: middle;
  ${(p) => p.$dashed && `
    background-image: linear-gradient(to right, ${p.$color} 50%, transparent 50%);
    background-size: 6px 3px;
    background-color: transparent;
  `}
`;

const COLORS = {
    10: '#3b82f6',
    20: '#8b5cf6',
    30: '#06b6d4',
    40: '#f59e0b',
} as const;

type DeltaKey = 10 | 20 | 30 | 40;
type LineKey = `putIv${DeltaKey}` | `callIv${DeltaKey}`;

interface IProps {
    data: ISkewChartPoint[];
}

interface IPlotPoint {
    x: number;
    y: number;
    value: number;
    expirationLabel: string;
    dte: number;
    isMonthly: boolean;
}

export const SkewChartComponent: React.FC<IProps> = ({ data }) => {
    const [hover, setHover] = useState<{ x: number; y: number; idx: number } | null>(null);

    const yRange = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        for (const p of data) {
            for (const k of ['putIv10', 'callIv10', 'putIv20', 'callIv20', 'putIv30', 'callIv30', 'putIv40', 'callIv40'] as LineKey[]) {
                const v = p[k];
                if (typeof v === 'number' && Number.isFinite(v)) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
            return { min: 0, max: 100 };
        }
        const pad = (max - min) * 0.05;
        return { min: Math.max(0, min - pad), max: max + pad };
    }, [data]);

    const xFor = (i: number): number => {
        const n = data.length;
        if (n <= 1) return PAD_L;
        return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
    };

    const yFor = (v: number): number => {
        const ratio = (v - yRange.min) / (yRange.max - yRange.min);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };

    const buildLine = (key: LineKey): IPlotPoint[] => {
        const out: IPlotPoint[] = [];
        for (let i = 0; i < data.length; i += 1) {
            const p = data[i];
            const v = p[key];
            if (typeof v === 'number' && Number.isFinite(v)) {
                out.push({
                    x: xFor(i),
                    y: yFor(v),
                    value: v,
                    expirationLabel: p.expirationLabel,
                    dte: p.dte,
                    isMonthly: p.isMonthly,
                });
            }
        }
        return out;
    };

    const pathFor = (pts: IPlotPoint[]): string =>
        pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');

    // Y-axis ticks (5 evenly spaced)
    const yTicks = [0, 1, 2, 3, 4].map((i) => {
        const v = yRange.min + (i / 4) * (yRange.max - yRange.min);
        return { v, y: yFor(v) };
    });

    // X-axis ticks (max 8, evenly spaced)
    const xTicks = (() => {
        const n = data.length;
        if (n === 0) return [] as Array<{ idx: number; label: string; x: number }>;
        const desired = Math.min(8, n);
        const step = Math.max(1, Math.floor(n / desired));
        const out: Array<{ idx: number; label: string; x: number }> = [];
        for (let i = 0; i < n; i += step) {
            out.push({ idx: i, label: data[i].expirationLabel, x: xFor(i) });
        }
        if (out.length === 0 || out[out.length - 1].idx !== n - 1) {
            out.push({ idx: n - 1, label: data[n - 1].expirationLabel, x: xFor(n - 1) });
        }
        return out;
    })();

    const lines: Array<{ key: LineKey; color: string; dashed: boolean; pts: IPlotPoint[] }> = [
        { key: 'putIv10', color: COLORS[10], dashed: false, pts: buildLine('putIv10') },
        { key: 'callIv10', color: COLORS[10], dashed: true, pts: buildLine('callIv10') },
        { key: 'putIv20', color: COLORS[20], dashed: false, pts: buildLine('putIv20') },
        { key: 'callIv20', color: COLORS[20], dashed: true, pts: buildLine('callIv20') },
        { key: 'putIv30', color: COLORS[30], dashed: false, pts: buildLine('putIv30') },
        { key: 'callIv30', color: COLORS[30], dashed: true, pts: buildLine('callIv30') },
        { key: 'putIv40', color: COLORS[40], dashed: false, pts: buildLine('putIv40') },
        { key: 'callIv40', color: COLORS[40], dashed: true, pts: buildLine('callIv40') },
    ];

    const handleMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const ratio = cx / rect.width;
        const x = ratio * VW;
        const n = data.length;
        if (n === 0) return;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x - PAD_L) / (VW - PAD_L - PAD_R) * (n - 1))));
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx });
    };

    const handleLeave = (): void => setHover(null);

    if (data.length === 0) {
        return <div style={{ padding: 24, textAlign: 'center', color: 'var(--ion-color-medium)' }}>No expirations to plot.</div>;
    }

    return (
        <Wrapper>
            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {/* Y-grid */}
                {yTicks.map((t, i) => (
                    <g key={`yt-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#cfd5e0" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 8} y={t.y + 4} fontSize={11} fill="#6b7280" textAnchor="end">
                            {t.v.toFixed(0)}%
                        </text>
                    </g>
                ))}

                {/* X-axis labels */}
                {xTicks.map((t, i) => (
                    <g key={`xt-${i}`}>
                        <line x1={t.x} x2={t.x} y1={VH - PAD_B} y2={VH - PAD_B + 4} stroke="#9ca3af" strokeWidth={1} />
                        <text x={t.x} y={VH - PAD_B + 18} fontSize={11} fill="#6b7280" textAnchor="middle">
                            {t.label}
                        </text>
                        {data[t.idx].isMonthly && (
                            <text x={t.x} y={VH - PAD_B + 32} fontSize={9} fill="#3b82f6" textAnchor="middle">
                                ◆
                            </text>
                        )}
                    </g>
                ))}

                {/* Lines */}
                {lines.map((ln) => (
                    <path
                        key={ln.key}
                        d={pathFor(ln.pts)}
                        stroke={ln.color}
                        strokeWidth={ln.dashed ? 1.5 : 2}
                        strokeDasharray={ln.dashed ? '5 4' : undefined}
                        fill="none"
                    />
                ))}

                {/* Hover vertical line */}
                {hover && (
                    <line
                        x1={xFor(hover.idx)}
                        x2={xFor(hover.idx)}
                        y1={PAD_T}
                        y2={VH - PAD_B}
                        stroke="#9ca3af"
                        strokeWidth={1}
                        strokeDasharray="2 3"
                    />
                )}

                {/* Hover dots */}
                {hover && lines.flatMap((ln) => {
                    const pt = ln.pts.find((p) => Math.abs(p.x - xFor(hover.idx)) < 0.5);
                    if (!pt) return [];
                    return [(
                        <circle
                            key={`dot-${ln.key}`}
                            cx={pt.x}
                            cy={pt.y}
                            r={3}
                            fill={ln.color}
                            stroke="#fff"
                            strokeWidth={1}
                        />
                    )];
                })}

                {/* Mouse-tracking overlay */}
                <rect
                    x={PAD_L}
                    y={PAD_T}
                    width={VW - PAD_L - PAD_R}
                    height={VH - PAD_T - PAD_B}
                    fill="transparent"
                    onMouseMove={handleMove}
                    onMouseLeave={handleLeave}
                />
            </Svg>

            {hover && data[hover.idx] && (
                <TooltipBox style={{ left: hover.x, top: hover.y - 12 }}>
                    <strong>{data[hover.idx].expirationLabel}</strong> • {data[hover.idx].dte} DTE
                    {data[hover.idx].isMonthly && ' • monthly'}
                    <br />
                    {lines.map((ln) => {
                        const v = data[hover.idx][ln.key];
                        if (typeof v !== 'number') return null;
                        const label = ln.key.replace('putIv', 'Put ').replace('callIv', 'Call ') + 'Δ';
                        return (
                            <span key={ln.key} style={{ display: 'block', color: ln.color }}>
                                {label}: {v.toFixed(2)}%
                            </span>
                        );
                    })}
                </TooltipBox>
            )}

            <Legend>
                {([10, 20, 30, 40] as DeltaKey[]).map((d) => (
                    <span key={`leg-${d}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <LegendDot $color={COLORS[d]} />
                        Put {d}Δ
                        <LegendDot $color={COLORS[d]} $dashed />
                        Call {d}Δ
                    </span>
                ))}
            </Legend>
        </Wrapper>
    );
};

export default SkewChartComponent;

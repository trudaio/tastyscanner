import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type {
    ISkewChartPoint,
    IExpirationDetail,
} from '../../services/skew-analysis/skew-analysis.service.interface';

// Combined SVG: 4 colored lines (premium skew % at 10/20/30/40Δ) +
// optional put/call volume bars per expiration. Filters: Monthly only,
// Weekly only, show put vol bars, show call vol bars.
//
// Inputs come from snapshot.expirationDetails (perDelta.skewPct + volumes)
// joined with snapshot.chartData (for the IsMonthly + DTE flag, although
// expirationDetails has these too).

const VW = 1300;
const VH = 460;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 80;

const Wrapper = styled.div`
  width: 100%;
`;

const Svg = styled.svg`
  width: 100%;
  height: auto;
  display: block;
  background: #1a1a24;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  align-items: center;
`;

const Toggle = styled.button<{ $active: boolean; $color: string }>`
  border: 1px solid ${(p) => (p.$active ? p.$color : '#2a2a3a')};
  background: ${(p) => (p.$active ? p.$color : 'transparent')};
  color: ${(p) => (p.$active ? '#0a0a0f' : '#a0a0b0')};
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
`;

const HowToRead = styled.div`
  margin-top: 10px;
  padding: 10px 14px;
  background: #12121a;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
  font-size: 12px;
  color: #a0a0b0;

  strong { color: #f0f0f5; font-weight: 700; }
  .neutral { color: #f59e0b; }
  .bearish { color: #ef4444; }
  .bullish { color: #22c55e; }
`;

const COLORS = {
    10: '#3b82f6',
    20: '#8b5cf6',
    30: '#06b6d4',
    40: '#f59e0b',
} as const;
type DeltaKey = 10 | 20 | 30 | 40;

interface IProps {
    chartData: ISkewChartPoint[];
    expirationDetails: IExpirationDetail[];
}

export const SkewPremiumSkewChart: React.FC<IProps> = ({ chartData, expirationDetails }) => {
    void chartData;
    const [showMonthly, setShowMonthly] = useState(true);
    const [showWeekly, setShowWeekly] = useState(true);
    const [showPutVol, setShowPutVol] = useState(true);
    const [showCallVol, setShowCallVol] = useState(true);

    const filtered = useMemo(() => {
        return expirationDetails.filter((d) => (d.isMonthly ? showMonthly : showWeekly));
    }, [expirationDetails, showMonthly, showWeekly]);

    // Y-range: skew % min/max plus a touch of padding
    const skewRange = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        for (const d of filtered) {
            for (const lvl of d.perDelta) {
                if (lvl.skewPct != null && Number.isFinite(lvl.skewPct)) {
                    if (lvl.skewPct < min) min = lvl.skewPct;
                    if (lvl.skewPct > max) max = lvl.skewPct;
                }
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return { min: -10, max: 100 };
        const pad = (max - min) * 0.1;
        return { min: Math.min(0, min - pad), max: max + pad };
    }, [filtered]);

    const maxVol = useMemo(() => {
        let m = 0;
        for (const d of filtered) {
            if (showPutVol) m = Math.max(m, d.putVolumeTotal);
            if (showCallVol) m = Math.max(m, d.callVolumeTotal);
        }
        return m || 1;
    }, [filtered, showPutVol, showCallVol]);

    const xFor = (i: number): number => {
        const n = filtered.length;
        if (n <= 1) return PAD_L;
        return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
    };
    const ySkewFor = (v: number): number => {
        const ratio = (v - skewRange.min) / (skewRange.max - skewRange.min);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };
    // Volume bars share the lower half of the chart, scaled to maxVol
    const yVolBaseline = VH - PAD_B;
    const volBarHeight = (vol: number): number => {
        const usable = (VH - PAD_T - PAD_B) * 0.4; // bars take up to 40% of plot height
        return (vol / maxVol) * usable;
    };

    const skewLines: Array<{ key: string; color: string; pts: Array<{ x: number; y: number; v: number; label: string }> }> = (
        ([10, 20, 30, 40] as DeltaKey[]).map((d) => {
            const pts: Array<{ x: number; y: number; v: number; label: string }> = [];
            filtered.forEach((det, i) => {
                const lvl = det.perDelta.find((p) => p.delta === d);
                if (lvl?.skewPct != null && Number.isFinite(lvl.skewPct)) {
                    pts.push({ x: xFor(i), y: ySkewFor(lvl.skewPct), v: lvl.skewPct, label: det.expirationLabel });
                }
            });
            return { key: `d${d}`, color: COLORS[d], pts };
        })
    );

    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((r) => {
        const v = skewRange.min + r * (skewRange.max - skewRange.min);
        return { v, y: ySkewFor(v) };
    });

    const xTicks = (() => {
        const n = filtered.length;
        if (n === 0) return [] as Array<{ idx: number; label: string; x: number }>;
        const desired = Math.min(10, n);
        const step = Math.max(1, Math.floor(n / desired));
        const out: Array<{ idx: number; label: string; x: number }> = [];
        for (let i = 0; i < n; i += step) {
            out.push({ idx: i, label: filtered[i].expirationLabel, x: xFor(i) });
        }
        if (out.length === 0 || out[out.length - 1].idx !== n - 1) {
            out.push({ idx: n - 1, label: filtered[n - 1].expirationLabel, x: xFor(n - 1) });
        }
        return out;
    })();

    const barWidth = filtered.length > 1
        ? Math.max(4, Math.min(24, ((VW - PAD_L - PAD_R) / filtered.length) * 0.35))
        : 12;

    return (
        <Wrapper>
            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                <text x={PAD_L} y={20} fontSize={13} fontWeight={700} fill="#f0f0f5">— Premium Skew (%)</text>

                {yTicks.map((t, i) => (
                    <g key={`yt-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 8} y={t.y + 4} fontSize={11} fill="#a0a0b0" textAnchor="end">{t.v.toFixed(0)}</text>
                    </g>
                ))}

                {/* Y-axis label */}
                <text x={14} y={VH / 2} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(-90 14 ${VH / 2})`}>Skew (%)</text>

                {/* Volume bars */}
                {showPutVol && filtered.map((d, i) => (
                    <rect
                        key={`pv-${d.expiration}`}
                        x={xFor(i) - barWidth - 1}
                        y={yVolBaseline - volBarHeight(d.putVolumeTotal)}
                        width={barWidth}
                        height={volBarHeight(d.putVolumeTotal)}
                        fill="#ef4444"
                        opacity={0.55}
                    />
                ))}
                {showCallVol && filtered.map((d, i) => (
                    <rect
                        key={`cv-${d.expiration}`}
                        x={xFor(i) + 1}
                        y={yVolBaseline - volBarHeight(d.callVolumeTotal)}
                        width={barWidth}
                        height={volBarHeight(d.callVolumeTotal)}
                        fill="#22c55e"
                        opacity={0.55}
                    />
                ))}

                {/* Zero line */}
                <line x1={PAD_L} x2={VW - PAD_R} y1={ySkewFor(0)} y2={ySkewFor(0)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4" />

                {/* Skew lines */}
                {skewLines.map((ln) => (
                    <g key={ln.key}>
                        <path
                            d={ln.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
                            stroke={ln.color}
                            strokeWidth={2.5}
                            fill="none"
                        />
                        {ln.pts.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r={3} fill={ln.color} stroke="#1a1a24" strokeWidth={1} />
                        ))}
                    </g>
                ))}

                {/* X-axis labels */}
                {xTicks.map((t, i) => (
                    <g key={`xt-${i}`}>
                        <text x={t.x} y={VH - PAD_B + 18} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                              transform={`rotate(-30 ${t.x} ${VH - PAD_B + 18})`}>
                            {t.label}
                        </text>
                    </g>
                ))}
            </Svg>

            <Toolbar>
                <Toggle $active={showMonthly} $color="#f59e0b" onClick={() => setShowMonthly((v) => !v)}>Monthly</Toggle>
                <Toggle $active={showWeekly} $color="#a0a0b0" onClick={() => setShowWeekly((v) => !v)}>Weekly</Toggle>
                <span style={{ width: 12 }} />
                <Toggle $active={showPutVol} $color="#ef4444" onClick={() => setShowPutVol((v) => !v)}>Put Vol</Toggle>
                <Toggle $active={showCallVol} $color="#22c55e" onClick={() => setShowCallVol((v) => !v)}>Call Vol</Toggle>
                <span style={{ flex: 1 }} />
                {[10, 20, 30, 40].map((d) => (
                    <span key={`legend-${d}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#a0a0b0' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 3, background: COLORS[d as DeltaKey] }} />
                        {d}Δ
                    </span>
                ))}
            </Toolbar>

            <HowToRead>
                <strong>How to read:</strong> The <span className="neutral">orange line at 0</span> is neutral.
                <strong> Above 0</strong> = <span className="bearish">Puts more expensive</span> → Bearish/hedging.
                <strong> Below 0</strong> = <span className="bullish">Calls more expensive</span> → Bullish.
            </HowToRead>
        </Wrapper>
    );
};

export default SkewPremiumSkewChart;

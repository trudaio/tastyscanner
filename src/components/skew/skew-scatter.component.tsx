import React, { useMemo, useState, useEffect } from 'react';
import styled from 'styled-components';
import type { IStrikeRow } from '../../services/skew-analysis/skew-analysis.service.interface';

// Generic scatter used for both:
//   - Skew Bell Curve (X = delta, Y = premium)
//   - Volatility Smile (X = strike, Y = IV %)

const VW = 1300;
const VH = 380;
const PAD_L = 56;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 56;

const Wrapper = styled.div`
  width: 100%;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
  flex-wrap: wrap;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #f0f0f5;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const Sub = styled.div`
  font-size: 11px;
  color: #a0a0b0;
`;

const Select = styled.select`
  background: #1a1a24;
  color: #f0f0f5;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  &:focus { outline: 2px solid #3b82f6; outline-offset: -2px; }
`;

const Svg = styled.svg`
  width: 100%;
  height: auto;
  display: block;
  background: #1a1a24;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
`;

const LegendRow = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: #a0a0b0;
`;

const Dot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  margin-right: 6px;
  vertical-align: middle;
`;

const PUT_COLOR = '#ef4444';
const CALL_COLOR = '#22c55e';

interface IExpirationOption {
    expiration: string;
    label: string;
    isMonthly: boolean;
}

type Mode = 'bell' | 'smile';

interface IProps {
    mode: Mode;
    strikesByExpiration: Record<string, IStrikeRow[]>;
    expirations: IExpirationOption[];
    /** Defaults to first monthly. */
    defaultExpiration?: string;
    /** Stock price for ATM marker on smile mode. */
    stockPrice: number | null;
}

export const SkewScatterChart: React.FC<IProps> = ({ mode, strikesByExpiration, expirations, defaultExpiration, stockPrice }) => {
    const fallback = expirations.find((e) => e.isMonthly)?.expiration ?? expirations[0]?.expiration ?? '';
    const [selected, setSelected] = useState<string>(defaultExpiration ?? fallback);

    useEffect(() => {
        if (selected && expirations.find((e) => e.expiration === selected)) return;
        setSelected(fallback);
    }, [selected, fallback, expirations]);

    const rows = strikesByExpiration[selected] ?? [];

    const points = useMemo(() => {
        const out: Array<{ x: number; y: number; type: 'put' | 'call' }> = [];
        for (const r of rows) {
            const xRaw = mode === 'bell' ? r.delta : r.strike;
            const yRaw = mode === 'bell' ? r.premium : r.iv != null ? r.iv * 100 : null;
            if (xRaw == null || yRaw == null || !Number.isFinite(xRaw) || !Number.isFinite(yRaw)) continue;
            out.push({ x: xRaw, y: yRaw, type: r.type });
        }
        return out;
    }, [rows, mode]);

    const xRange = useMemo(() => {
        if (points.length === 0) return mode === 'bell' ? { min: -0.5, max: 0.5 } : { min: 0, max: 1 };
        if (mode === 'bell') return { min: -0.5, max: 0.5 };
        let min = Infinity;
        let max = -Infinity;
        for (const p of points) {
            if (p.x < min) min = p.x;
            if (p.x > max) max = p.x;
        }
        const pad = (max - min) * 0.05;
        return { min: min - pad, max: max + pad };
    }, [points, mode]);

    const yRange = useMemo(() => {
        if (points.length === 0) return { min: 0, max: 1 };
        let min = Infinity;
        let max = -Infinity;
        for (const p of points) {
            if (p.y < min) min = p.y;
            if (p.y > max) max = p.y;
        }
        if (mode === 'bell') {
            min = 0;
        }
        const pad = (max - min) * 0.05 || 1;
        return { min: Math.max(0, min - pad), max: max + pad };
    }, [points, mode]);

    const xFor = (v: number): number => {
        const ratio = (v - xRange.min) / (xRange.max - xRange.min);
        return PAD_L + ratio * (VW - PAD_L - PAD_R);
    };
    const yFor = (v: number): number => {
        const ratio = (v - yRange.min) / (yRange.max - yRange.min);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
        const v = yRange.min + r * (yRange.max - yRange.min);
        return { v, y: yFor(v) };
    });

    const xTicks = (() => {
        if (mode === 'bell') {
            return [-0.5, -0.25, 0, 0.25, 0.5].map((v) => ({ v, x: xFor(v), label: v.toFixed(2) }));
        }
        // smile: 5 ticks across strikes
        const out: Array<{ v: number; x: number; label: string }> = [];
        for (let i = 0; i < 5; i += 1) {
            const v = xRange.min + (i / 4) * (xRange.max - xRange.min);
            out.push({ v, x: xFor(v), label: `$${Math.round(v)}` });
        }
        return out;
    })();

    const atmX = mode === 'bell' ? xFor(0) : (stockPrice != null ? xFor(stockPrice) : null);

    const expSelected = expirations.find((e) => e.expiration === selected);
    const titleLabel = `${selected}${expSelected?.isMonthly ? ' (Monthly)' : expSelected?.expiration ? ' (Weekly)' : ''}`;

    const yLabel = mode === 'bell' ? 'Premium ($)' : 'Implied Volatility (%)';
    const xLabel = mode === 'bell' ? 'Delta' : 'Strike Price';
    const titleText = mode === 'bell' ? `Skew Bell Curve — ${titleLabel}` : `Volatility Smile — ${titleLabel}`;
    const subText = mode === 'bell'
        ? 'Delta on X-axis • Premium on Y-axis • Shows put/call skew distribution'
        : 'Strike Price on X-axis • Implied Volatility on Y-axis • Classic "smile" shape shows higher IV for OTM options';

    return (
        <Wrapper>
            <TitleRow>
                <div>
                    <Title>
                        <span style={{ color: mode === 'bell' ? '#8b5cf6' : '#06b6d4' }}>{mode === 'bell' ? '⌇' : '↗'}</span>
                        {titleText}
                    </Title>
                    <Sub>{subText}</Sub>
                </div>
                <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                    {expirations.map((opt) => (
                        <option key={opt.expiration} value={opt.expiration}>
                            {opt.label} {opt.isMonthly ? '(Monthly)' : '(Weekly)'}
                        </option>
                    ))}
                </Select>
            </TitleRow>

            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {yTicks.map((t, i) => (
                    <g key={`yt-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 8} y={t.y + 4} fontSize={11} fill="#a0a0b0" textAnchor="end">
                            {mode === 'bell' ? t.v.toFixed(0) : `${t.v.toFixed(0)}%`}
                        </text>
                    </g>
                ))}

                {xTicks.map((t, i) => (
                    <g key={`xt-${i}`}>
                        <line x1={t.x} x2={t.x} y1={VH - PAD_B} y2={VH - PAD_B + 4} stroke="#606070" strokeWidth={1} />
                        <text x={t.x} y={VH - PAD_B + 18} fontSize={11} fill="#a0a0b0" textAnchor="middle">{t.label}</text>
                    </g>
                ))}

                {/* ATM line */}
                {atmX != null && (
                    <g>
                        <line x1={atmX} x2={atmX} y1={PAD_T} y2={VH - PAD_B} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" />
                        <text x={atmX} y={PAD_T - 6} fontSize={10} fill="#f59e0b" textAnchor="middle">ATM</text>
                    </g>
                )}

                {/* Y-axis label */}
                <text x={14} y={VH / 2} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(-90 14 ${VH / 2})`}>{yLabel}</text>
                {/* X-axis label */}
                <text x={(VW - PAD_L - PAD_R) / 2 + PAD_L} y={VH - 8} fontSize={11} fill="#a0a0b0" textAnchor="middle">{xLabel}</text>

                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={xFor(p.x)}
                        cy={yFor(p.y)}
                        r={3}
                        fill={p.type === 'put' ? PUT_COLOR : CALL_COLOR}
                        opacity={0.85}
                    />
                ))}
            </Svg>

            <LegendRow>
                <span><Dot $color={PUT_COLOR} />Puts</span>
                <span><Dot $color={CALL_COLOR} />Calls</span>
            </LegendRow>
        </Wrapper>
    );
};

export default SkewScatterChart;

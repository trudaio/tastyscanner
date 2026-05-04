import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { IStrikeRow } from '../../services/skew-analysis/skew-analysis.service.interface';

const VW = 1300;
const PAD_L = 70;
const PAD_R = 90;
const PAD_T = 24;
const PAD_B = 80;
const ROW_H = 18;

const Wrapper = styled.div`
  width: 100%;
  position: relative;
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
  font-size: 16px;
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

const Controls = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const Btn = styled.button<{ $active?: boolean }>`
  background: ${(p) => (p.$active ? '#3b82f6' : '#1a1a24')};
  color: ${(p) => (p.$active ? 'white' : '#f0f0f5')};
  border: 1px solid ${(p) => (p.$active ? '#3b82f6' : '#2a2a3a')};
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
  &:hover { border-color: #3b82f6; }
`;

const Interp = styled.div`
  margin-bottom: 10px;
  padding: 10px 14px;
  background: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #cfd5e0;

  strong { color: #38bdf8; }
`;

const Svg = styled.svg`
  width: 100%;
  height: auto;
  display: block;
  background: #1a1a24;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
`;

const TooltipBox = styled.div`
  position: absolute;
  pointer-events: none;
  background: rgba(15, 15, 24, 0.97);
  color: #f0f0f5;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid #2a2a3a;
  z-index: 10;
  transform: translate(-50%, -100%);
`;

type Side = 'call' | 'put' | 'avg';

interface IExpirationOption {
    expiration: string;
    label: string;
    isMonthly: boolean;
}

interface IProps {
    ticker: string;
    stockPrice: number | null;
    strikesByExpiration: Record<string, IStrikeRow[]>;
    expirations: IExpirationOption[];
}

interface ICell {
    iv: number | null;
    strike: number;
    expiration: string;
}

// Strike range in % from spot to display.
const STRIKE_RANGE_PCT = 25;

function colorForIv(iv: number | null, min: number, max: number): string {
    if (iv == null || min === max) return '#0f0f17';
    const t = (iv - min) / (max - min);
    // blue → cyan → green → yellow → orange → red gradient (viridis-ish)
    const stops: Array<[number, [number, number, number]]> = [
        [0.00, [40, 30, 90]],     // dark indigo
        [0.20, [59, 130, 246]],   // blue
        [0.40, [6, 182, 212]],    // cyan
        [0.60, [250, 204, 21]],   // yellow
        [0.80, [245, 158, 11]],   // orange
        [1.00, [239, 68, 68]],    // red
    ];
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i += 1) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
            lo = stops[i];
            hi = stops[i + 1];
            break;
        }
    }
    const span = hi[0] - lo[0];
    const local = span === 0 ? 0 : (t - lo[0]) / span;
    const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * local);
    const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * local);
    const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * local);
    return `rgb(${r}, ${g}, ${b})`;
}

function shortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function buildInterpretation(stockPrice: number | null, ticker: string, ivMin: number, ivMax: number, side: Side, hotspot: { strike: number; expiration: string; iv: number } | null): string {
    const parts: string[] = [];
    parts.push(
        `${ticker}'s implied volatility surface across strikes (Y) and expirations (X). ` +
        `Cells are colored on a viridis-style scale — dark indigo for the lowest IV in view, red for the highest. ` +
        `The dashed orange line is the spot ATM strike. `,
    );
    parts.push(`Side: <strong>${side === 'call' ? 'Calls' : side === 'put' ? 'Puts' : 'Avg(put,call)'}</strong>. IV range: <strong>${(ivMin * 100).toFixed(1)}% → ${(ivMax * 100).toFixed(1)}%</strong>. `);
    if (hotspot) {
        parts.push(`Hottest cell: <strong>${hotspot.strike}</strong> at <strong>${shortDate(hotspot.expiration)}</strong> (${(hotspot.iv * 100).toFixed(1)}% IV). `);
    }
    parts.push(
        `Read it like a topographic map — bright bands further from spot indicate skew (puts or calls "smiling"); ` +
        `vertical color shifts as you move right show term structure (steepening = expanding event premium, flattening = waning). `,
    );
    if (stockPrice) {
        parts.push(`Spot ${stockPrice.toFixed(2)}, strikes shown ±${STRIKE_RANGE_PCT}% from spot. `);
    }
    return parts.join('');
}

export const SkewVolSurface: React.FC<IProps> = ({ ticker, stockPrice, strikesByExpiration, expirations }) => {
    const [side, setSide] = useState<Side>('avg');
    const [hover, setHover] = useState<{ x: number; y: number; strike: number; expiration: string; iv: number | null } | null>(null);

    const sortedExpirations = useMemo(() =>
        [...expirations].sort((a, b) => a.expiration.localeCompare(b.expiration))
    , [expirations]);

    const strikes = useMemo(() => {
        const all = new Set<number>();
        for (const e of sortedExpirations) {
            const rows = strikesByExpiration[e.expiration];
            if (!rows) continue;
            for (const r of rows) all.add(r.strike);
        }
        const arr = Array.from(all).sort((a, b) => a - b);
        if (stockPrice == null || stockPrice <= 0) return arr;
        const lo = stockPrice * (1 - STRIKE_RANGE_PCT / 100);
        const hi = stockPrice * (1 + STRIKE_RANGE_PCT / 100);
        return arr.filter((s) => s >= lo && s <= hi);
    }, [sortedExpirations, strikesByExpiration, stockPrice]);

    const matrix = useMemo(() => {
        const m = new Map<string, Map<number, ICell>>();
        for (const e of sortedExpirations) {
            const rows = strikesByExpiration[e.expiration];
            if (!rows) continue;
            const strikeMap = new Map<number, ICell>();
            for (const s of strikes) {
                const calls = rows.filter((r) => r.strike === s && r.type === 'call');
                const puts = rows.filter((r) => r.strike === s && r.type === 'put');
                const callIv = calls.length && calls[0].iv != null && Number.isFinite(calls[0].iv) ? calls[0].iv : null;
                const putIv = puts.length && puts[0].iv != null && Number.isFinite(puts[0].iv) ? puts[0].iv : null;
                let iv: number | null;
                if (side === 'call') iv = callIv;
                else if (side === 'put') iv = putIv;
                else if (callIv != null && putIv != null) iv = (callIv + putIv) / 2;
                else iv = callIv ?? putIv;
                strikeMap.set(s, { iv, strike: s, expiration: e.expiration });
            }
            m.set(e.expiration, strikeMap);
        }
        return m;
    }, [sortedExpirations, strikesByExpiration, strikes, side]);

    const ivStats = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        let hot: { strike: number; expiration: string; iv: number } | null = null;
        for (const [, smap] of matrix.entries()) {
            for (const cell of smap.values()) {
                if (cell.iv == null) continue;
                if (cell.iv < min) min = cell.iv;
                if (cell.iv > max) { max = cell.iv; hot = { strike: cell.strike, expiration: cell.expiration, iv: cell.iv }; }
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, hot: null };
        return { min, max, hot };
    }, [matrix]);

    const VH = PAD_T + PAD_B + Math.max(140, strikes.length * ROW_H);
    const cellW = sortedExpirations.length > 0 ? (VW - PAD_L - PAD_R) / sortedExpirations.length : 24;
    const cellH = ROW_H;

    const xFor = (i: number): number => PAD_L + i * cellW;
    const yFor = (strikeIdx: number): number => PAD_T + strikeIdx * cellH;

    // Strike Y labels — show every Nth depending on count
    const strikeLabelStep = Math.max(1, Math.floor(strikes.length / 14));

    // Spot line position — interpolated between nearest strikes
    const spotY = (() => {
        if (stockPrice == null || strikes.length === 0) return null;
        // Strikes are ascending; we render strike[0] at top, strike[N-1] at bottom (since strikes.length sorted asc, we want low strikes at bottom of chart visually). But in our buildup we draw strikeIdx from top. Let's keep low strikes at TOP for now (consistent with reading the SVG top to bottom).
        for (let i = 0; i < strikes.length - 1; i += 1) {
            if (stockPrice >= strikes[i] && stockPrice <= strikes[i + 1]) {
                const frac = (stockPrice - strikes[i]) / (strikes[i + 1] - strikes[i]);
                return yFor(i) + cellH / 2 + frac * cellH;
            }
        }
        if (stockPrice < strikes[0]) return yFor(0);
        return yFor(strikes.length - 1) + cellH;
    })();

    const handleMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const xRatio = cx / rect.width;
        const yRatio = cy / rect.height;
        const xRel = xRatio * VW - PAD_L;
        const yRel = yRatio * VH - PAD_T;
        if (xRel < 0 || yRel < 0) return;
        const i = Math.min(sortedExpirations.length - 1, Math.max(0, Math.floor(xRel / cellW)));
        const j = Math.min(strikes.length - 1, Math.max(0, Math.floor(yRel / cellH)));
        const exp = sortedExpirations[i]?.expiration;
        const strike = strikes[j];
        const cell = exp ? matrix.get(exp)?.get(strike) : null;
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, strike, expiration: exp, iv: cell?.iv ?? null });
    };
    const handleLeave = (): void => setHover(null);

    const interp = buildInterpretation(stockPrice, ticker, ivStats.min, ivStats.max, side, ivStats.hot);

    if (strikes.length === 0 || sortedExpirations.length === 0) {
        return (
            <Wrapper>
                <TitleRow><Title>📊 {ticker} — Volatility Surface</Title></TitleRow>
                <div style={{ padding: 20, color: '#a0a0b0', fontSize: 13, textAlign: 'center' }}>
                    No data — load a ticker first.
                </div>
            </Wrapper>
        );
    }

    return (
        <Wrapper>
            <TitleRow>
                <div>
                    <Title>📊 {ticker} — Volatility Surface</Title>
                    <Sub>Strike × Expiration × IV — colored heatmap, viridis scale, ATM line marked</Sub>
                </div>
                <Controls>
                    <Btn $active={side === 'avg'} onClick={() => setSide('avg')}>Avg</Btn>
                    <Btn $active={side === 'call'} onClick={() => setSide('call')}>Calls</Btn>
                    <Btn $active={side === 'put'} onClick={() => setSide('put')}>Puts</Btn>
                </Controls>
            </TitleRow>

            <Interp dangerouslySetInnerHTML={{ __html: interp }} />

            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {/* Cells */}
                {sortedExpirations.map((exp, i) =>
                    strikes.map((s, j) => {
                        const cell = matrix.get(exp.expiration)?.get(s);
                        const fill = colorForIv(cell?.iv ?? null, ivStats.min, ivStats.max);
                        return (
                            <rect
                                key={`c-${exp.expiration}-${s}`}
                                x={xFor(i)}
                                y={yFor(j)}
                                width={cellW}
                                height={cellH}
                                fill={fill}
                                stroke="#0f0f17"
                                strokeWidth={0.5}
                            />
                        );
                    })
                )}

                {/* Y-axis strike labels */}
                {strikes.map((s, j) => (
                    j % strikeLabelStep === 0 ? (
                        <text key={`y-${s}`} x={PAD_L - 8} y={yFor(j) + cellH / 2 + 4} fontSize={10} fill="#a0a0b0" textAnchor="end">
                            {s.toFixed(0)}
                        </text>
                    ) : null
                ))}

                {/* X-axis expiration labels */}
                {sortedExpirations.map((exp, i) => {
                    const labelEvery = Math.max(1, Math.floor(sortedExpirations.length / 12));
                    if (i % labelEvery !== 0 && i !== sortedExpirations.length - 1) return null;
                    const x = xFor(i) + cellW / 2;
                    return (
                        <text
                            key={`x-${exp.expiration}`}
                            x={x}
                            y={VH - PAD_B + 18}
                            fontSize={10}
                            fill="#a0a0b0"
                            textAnchor="end"
                            transform={`rotate(-45 ${x} ${VH - PAD_B + 18})`}
                        >
                            {shortDate(exp.expiration)}{exp.isMonthly ? ' ◆' : ''}
                        </text>
                    );
                })}

                {/* ATM line */}
                {spotY != null && (
                    <g>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={spotY} y2={spotY} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" />
                        <text x={PAD_L - 8} y={spotY - 4} fontSize={10} fill="#f59e0b" textAnchor="end">SPOT</text>
                    </g>
                )}

                {/* Color legend on right */}
                <g>
                    <defs>
                        <linearGradient id="iv-grad" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0" stopColor="rgb(40, 30, 90)" />
                            <stop offset="0.2" stopColor="rgb(59, 130, 246)" />
                            <stop offset="0.4" stopColor="rgb(6, 182, 212)" />
                            <stop offset="0.6" stopColor="rgb(250, 204, 21)" />
                            <stop offset="0.8" stopColor="rgb(245, 158, 11)" />
                            <stop offset="1.0" stopColor="rgb(239, 68, 68)" />
                        </linearGradient>
                    </defs>
                    <rect x={VW - PAD_R + 24} y={PAD_T} width={16} height={VH - PAD_T - PAD_B} fill="url(#iv-grad)" stroke="#2a2a3a" />
                    <text x={VW - PAD_R + 44} y={PAD_T + 8} fontSize={10} fill="#a0a0b0">{(ivStats.max * 100).toFixed(0)}%</text>
                    <text x={VW - PAD_R + 44} y={(PAD_T + (VH - PAD_B)) / 2} fontSize={10} fill="#a0a0b0">{(((ivStats.min + ivStats.max) / 2) * 100).toFixed(0)}%</text>
                    <text x={VW - PAD_R + 44} y={VH - PAD_B - 4} fontSize={10} fill="#a0a0b0">{(ivStats.min * 100).toFixed(0)}%</text>
                    <text x={VW - PAD_R + 24} y={PAD_T - 6} fontSize={9} fill="#a0a0b0">IV</text>
                </g>

                {/* X label */}
                <text x={(VW - PAD_L - PAD_R) / 2 + PAD_L} y={VH - 8} fontSize={11} fill="#a0a0b0" textAnchor="middle">Expiration</text>
                <text x={20} y={(VH - PAD_T - PAD_B) / 2 + PAD_T} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(-90 20 ${(VH - PAD_T - PAD_B) / 2 + PAD_T})`}>Strike</text>

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

            {hover && hover.expiration && (
                <TooltipBox style={{ left: hover.x, top: hover.y - 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        Strike ${hover.strike} • {shortDate(hover.expiration)}
                    </div>
                    <div>IV: {hover.iv != null ? `${(hover.iv * 100).toFixed(2)}%` : '–'}</div>
                    <div style={{ color: '#a0a0b0', fontSize: 11 }}>{side === 'call' ? 'Call IV' : side === 'put' ? 'Put IV' : 'Avg(put, call)'}</div>
                </TooltipBox>
            )}
        </Wrapper>
    );
};

export default SkewVolSurface;

import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { ITechnicals, IOHLCBar } from '../../services/technicals/technicals.service.interface';

// SVG-raw chart: 90-day close line with Bollinger Bands overlay + RSI strip beneath.
// viewBox is fixed; stretches to 100% container width.

const Wrapper = styled.div`
    width: 100%;
    position: relative;
    user-select: none;
`;

const Svg = styled.svg`
    width: 100%;
    height: auto;
    display: block;
`;

const Footer = styled.div<{ $stale?: boolean }>`
    margin-top: 6px;
    font-size: 0.78rem;
    color: ${(p) => p.$stale ? 'var(--ion-color-warning-shade)' : 'var(--ion-color-medium)'};
    text-align: right;
`;

const Tooltip = styled.div`
    position: absolute;
    pointer-events: none;
    background: rgba(33, 33, 33, 0.95);
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    line-height: 1.35;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10;
`;

// ── Layout constants ──────────────────────────────────────────────────────
const VW = 1200;
const CHART_H = 280;
const RSI_H = 60;
const GAP = 10;
const H = CHART_H + GAP + RSI_H;
const PAD_L = 48;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 22;

function xForIndex(i: number, n: number): number {
    if (n <= 1) return PAD_L;
    return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
}

function rsiForBar(closes: number[], idx: number, period = 14): number | null {
    if (idx < period) return null;
    let gainSum = 0, lossSum = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
        if (i <= 0) return null;
        const delta = closes[i] - closes[i - 1];
        if (delta >= 0) gainSum += delta; else lossSum -= delta;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function bbForBar(closes: number[], idx: number, period = 20, sigma = 2): { upper: number; mid: number; lower: number } | null {
    if (idx < period - 1) return null;
    const slice = closes.slice(idx - period + 1, idx + 1);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, x) => sum + (x - mid) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    return { upper: mid + sigma * stdDev, mid, lower: mid - sigma * stdDev };
}

function formatDateShort(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${m}/${d}`;
}

interface Props {
    technicals: ITechnicals;
}

export const TechnicalsChartComponent: React.FC<Props> = ({ technicals }) => {
    const bars = technicals.bars;
    const closes = useMemo(() => bars.map((b: IOHLCBar) => b.close), [bars]);
    const n = bars.length;

    // Pre-compute BB per bar
    const bbs = useMemo(() => bars.map((_, i) => bbForBar(closes, i, 20, 2)), [closes, bars]);
    const rsis = useMemo(() => bars.map((_, i) => rsiForBar(closes, i, 14)), [closes, bars]);

    // Y-axis range: min lower band, max upper band, ±0.5%
    const yRange = useMemo(() => {
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < n; i++) {
            const bb = bbs[i];
            if (bb) { min = Math.min(min, bb.lower); max = Math.max(max, bb.upper); }
            min = Math.min(min, closes[i]);
            max = Math.max(max, closes[i]);
        }
        if (!isFinite(min) || !isFinite(max) || min >= max) {
            min = Math.min(...closes) || 0;
            max = Math.max(...closes) || 1;
        }
        const pad = (max - min) * 0.02;
        return { min: min - pad, max: max + pad };
    }, [bbs, closes, n]);

    const yForPrice = (price: number): number => {
        const ratio = (price - yRange.min) / (yRange.max - yRange.min);
        return PAD_T + (1 - ratio) * (CHART_H - PAD_T - PAD_B);
    };

    // Build path strings
    const closePath = closes.map((c, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i, n).toFixed(2)} ${yForPrice(c).toFixed(2)}`).join(' ');
    const bbUpperPath: string[] = [];
    const bbLowerPath: string[] = [];
    const bbMidPath: string[] = [];
    let started = false;
    for (let i = 0; i < n; i++) {
        const bb = bbs[i];
        if (!bb) continue;
        const cmd = started ? 'L' : 'M';
        bbUpperPath.push(`${cmd} ${xForIndex(i, n).toFixed(2)} ${yForPrice(bb.upper).toFixed(2)}`);
        bbLowerPath.push(`${cmd} ${xForIndex(i, n).toFixed(2)} ${yForPrice(bb.lower).toFixed(2)}`);
        bbMidPath.push(`${cmd} ${xForIndex(i, n).toFixed(2)} ${yForPrice(bb.mid).toFixed(2)}`);
        started = true;
    }

    // Shaded fill between BB upper and BB lower (polygon: upper forward, lower backward)
    const bbFillPoints: string[] = [];
    const firstBbIdx = bbs.findIndex((b) => b !== null);
    if (firstBbIdx >= 0) {
        for (let i = firstBbIdx; i < n; i++) {
            const bb = bbs[i]; if (!bb) continue;
            bbFillPoints.push(`${xForIndex(i, n).toFixed(2)},${yForPrice(bb.upper).toFixed(2)}`);
        }
        for (let i = n - 1; i >= firstBbIdx; i--) {
            const bb = bbs[i]; if (!bb) continue;
            bbFillPoints.push(`${xForIndex(i, n).toFixed(2)},${yForPrice(bb.lower).toFixed(2)}`);
        }
    }

    // RSI strip: colored bars per bar
    const rsiStripY0 = CHART_H + GAP;
    const barWidth = Math.max(1, (VW - PAD_L - PAD_R) / Math.max(1, n - 1));

    // Axis labels (X)
    const xTicks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];

    // Axis labels (Y) — 3 reference lines
    const yTicks = [yRange.min, (yRange.min + yRange.max) / 2, yRange.max].map((v) => ({
        value: v,
        y: yForPrice(v),
    }));

    // ── Hover state ────────────────────────────────────────────────────────
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const loc = pt.matrixTransform(ctm.inverse());
        const rel = (loc.x - PAD_L) / (VW - PAD_L - PAD_R);
        const idx = Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))));
        setHoverIdx(idx);
    };

    const hover = hoverIdx !== null ? {
        idx: hoverIdx,
        bar: bars[hoverIdx],
        bb: bbs[hoverIdx],
        rsi: rsis[hoverIdx],
        x: xForIndex(hoverIdx, n),
        y: yForPrice(closes[hoverIdx]),
    } : null;

    const formattedComputed = new Date(technicals.computedAt).toLocaleString('en-US', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/New_York',
    });

    return (
        <Wrapper>
            <Svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none">
                {/* Chart background */}
                <rect x={0} y={0} width={VW} height={CHART_H} fill="transparent" />

                {/* BB band fill */}
                {bbFillPoints.length > 0 && (
                    <polygon points={bbFillPoints.join(' ')} fill="rgba(120,144,156,0.10)" stroke="none" />
                )}

                {/* Y reference grid + labels */}
                {yTicks.map((t, i) => (
                    <g key={`yt-${i}`}>
                        <line x1={PAD_L} y1={t.y} x2={VW - PAD_R} y2={t.y}
                              stroke="rgba(120,120,120,0.18)" strokeWidth={1} strokeDasharray="3,4" />
                        <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" fontSize={10} fill="var(--ion-color-medium)">
                            {t.value.toFixed(2)}
                        </text>
                    </g>
                ))}

                {/* BB lines */}
                <path d={bbUpperPath.join(' ')} fill="none" stroke="rgba(244,67,54,0.55)" strokeWidth={1.2} />
                <path d={bbLowerPath.join(' ')} fill="none" stroke="rgba(76,175,80,0.55)" strokeWidth={1.2} />
                <path d={bbMidPath.join(' ')} fill="none" stroke="rgba(120,120,120,0.7)" strokeWidth={1} strokeDasharray="4,4" />

                {/* Close price line */}
                <path d={closePath} fill="none" stroke="var(--ion-color-primary)" strokeWidth={2} />

                {/* X-axis ticks */}
                {xTicks.map((idx, i) => (
                    <text key={`xt-${i}`}
                          x={xForIndex(idx, n)} y={CHART_H - 4}
                          textAnchor={i === 0 ? 'start' : (i === xTicks.length - 1 ? 'end' : 'middle')}
                          fontSize={10} fill="var(--ion-color-medium)">
                        {formatDateShort(bars[idx].date)}
                    </text>
                ))}

                {/* RSI strip */}
                <rect x={PAD_L} y={rsiStripY0} width={VW - PAD_L - PAD_R} height={RSI_H}
                      fill="rgba(120,120,120,0.06)" stroke="rgba(120,120,120,0.25)" strokeWidth={0.5} />
                {rsis.map((r, i) => {
                    if (r === null) return null;
                    let color = 'rgba(120,120,120,0.30)';
                    if (r > 75) color = 'rgba(244,67,54,0.80)';
                    else if (r > 70) color = 'rgba(255,152,0,0.70)';
                    else if (r < 25) color = 'rgba(244,67,54,0.80)';
                    else if (r < 30) color = 'rgba(255,152,0,0.70)';
                    else color = 'rgba(120,120,120,0.30)';
                    const x = xForIndex(i, n) - barWidth / 2;
                    return <rect key={i} x={x} y={rsiStripY0 + 2} width={barWidth} height={RSI_H - 4} fill={color} />;
                })}
                {/* RSI 30 and 70 reference lines */}
                <line x1={PAD_L} y1={rsiStripY0 + (RSI_H * (100 - 70)) / 100}
                      x2={VW - PAD_R} y2={rsiStripY0 + (RSI_H * (100 - 70)) / 100}
                      stroke="rgba(0,0,0,0.25)" strokeWidth={0.75} strokeDasharray="3,3" />
                <line x1={PAD_L} y1={rsiStripY0 + (RSI_H * (100 - 30)) / 100}
                      x2={VW - PAD_R} y2={rsiStripY0 + (RSI_H * (100 - 30)) / 100}
                      stroke="rgba(0,0,0,0.25)" strokeWidth={0.75} strokeDasharray="3,3" />
                <text x={PAD_L - 6} y={rsiStripY0 + 10} textAnchor="end" fontSize={9} fill="var(--ion-color-medium)">RSI</text>
                <text x={PAD_L - 6} y={rsiStripY0 + (RSI_H * (100 - 70)) / 100 + 3} textAnchor="end" fontSize={9} fill="var(--ion-color-medium)">70</text>
                <text x={PAD_L - 6} y={rsiStripY0 + (RSI_H * (100 - 30)) / 100 + 3} textAnchor="end" fontSize={9} fill="var(--ion-color-medium)">30</text>

                {/* Hover vertical line + dot */}
                {hover && (
                    <>
                        <line x1={hover.x} y1={0} x2={hover.x} y2={H}
                              stroke="rgba(120,120,120,0.45)" strokeWidth={0.75} strokeDasharray="2,3" />
                        <circle cx={hover.x} cy={hover.y} r={3.5}
                                fill="var(--ion-color-primary)" stroke="white" strokeWidth={1.5} />
                    </>
                )}

                {/* Invisible capture rect */}
                <rect x={PAD_L} y={0} width={VW - PAD_L - PAD_R} height={H}
                      fill="transparent"
                      onMouseMove={handleMouseMove}
                      onMouseLeave={() => setHoverIdx(null)} />
            </Svg>

            {hover && (
                <Tooltip style={{
                    left: `${(hover.x / VW) * 100}%`,
                    top: 0,
                    transform: `translateX(${hover.x > VW / 2 ? 'calc(-100% - 8px)' : '8px'})`,
                }}>
                    <div><strong>{hover.bar.date}</strong></div>
                    <div>Close: {hover.bar.close.toFixed(2)}</div>
                    {hover.bb && <div>BB mid: {hover.bb.mid.toFixed(2)} · σ {(hover.bb.upper - hover.bb.mid) > 0 ? ((closes[hover.idx] - hover.bb.mid) / (hover.bb.upper - hover.bb.mid) * 2).toFixed(2) : '0'}</div>}
                    {hover.rsi !== null && <div>RSI: {hover.rsi!.toFixed(1)}</div>}
                </Tooltip>
            )}

            <Footer $stale={technicals.stale}>
                {technicals.stale ? '⚠ Stale data — last fresh computation: ' : 'Computed: '}
                {formattedComputed} ET
            </Footer>
        </Wrapper>
    );
};

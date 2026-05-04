import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { IFundamentalsPoint } from '../../services/skew-analysis/skew-analysis.service.interface';

const VW = 1300;
const VH = 380;
const PAD_L = 70;
const PAD_R = 70;
const PAD_T = 28;
const PAD_B = 60;

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
  min-width: 180px;
`;

const TooltipLine = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
`;

const Legend = styled.div`
  display: flex;
  gap: 18px;
  margin-top: 10px;
  font-size: 12px;
  color: #a0a0b0;
  align-items: center;
  justify-content: center;
`;

const SwatchLine = styled.span<{ $color: string }>`
  display: inline-block;
  width: 18px;
  height: 2px;
  background: ${(p) => p.$color};
  margin-right: 6px;
  vertical-align: middle;
`;

const PRICE_COLOR = '#3b82f6';
const EPS_COLOR = '#22c55e';

interface IProps {
    ticker: string;
    points: IFundamentalsPoint[];
}

function fmtBig(n: number): string {
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return n.toFixed(2);
}

function buildInterp(ticker: string, points: IFundamentalsPoint[]): string {
    if (points.length === 0) {
        return `<strong>No fundamentals data.</strong> Polygon's quarterly financials feed didn't return rows for ${ticker} — common for ETFs (SPY/QQQ/etc.) and certain sectors. Try a single-name stock like AAPL, MSFT, NVDA, TSLA to see this populated.`;
    }
    const withEps = points.filter((p) => p.eps != null);
    if (withEps.length < 2) {
        return `<strong>${ticker} fundamentals:</strong> ${points.length} quarters returned but limited EPS history — chart will fill in as more reports become available.`;
    }
    const latest = withEps[withEps.length - 1];
    const earliest = withEps[0];
    const epsLatest = latest.eps ?? 0;
    const epsEarliest = earliest.eps ?? 0;
    const epsChange = epsLatest - epsEarliest;
    const epsChangePct = epsEarliest !== 0 ? ((epsLatest - epsEarliest) / Math.abs(epsEarliest)) * 100 : null;

    const priceLatest = latest.price ?? null;
    const priceEarliest = earliest.price ?? null;
    const priceChangePct = priceLatest != null && priceEarliest != null && priceEarliest !== 0
        ? ((priceLatest - priceEarliest) / priceEarliest) * 100 : null;

    const parts: string[] = [];
    parts.push(
        `<strong>${ticker}:</strong> ${points.length} quarter${points.length > 1 ? 's' : ''} of fundamentals from Polygon. ` +
        `Blue line is the closing stock price at each quarter end (left axis). Green line is basic EPS (right axis). ` +
        `When the lines diverge it's a signal — e.g., price climbing while EPS stalls = multiple expansion (overvaluation risk); ` +
        `EPS climbing while price flat = compression (potential setup). `,
    );
    parts.push(
        `Latest reported quarter (${latest.fiscalPeriod}): EPS <strong>${(latest.eps ?? 0).toFixed(2)}</strong>` +
        (priceLatest != null ? `, price <strong>$${priceLatest.toFixed(2)}</strong>. ` : `. `),
    );
    if (epsChangePct != null) {
        const sign = epsChangePct >= 0 ? '+' : '';
        parts.push(`EPS Δ over period: ${sign}${epsChangePct.toFixed(1)}% (${epsChange >= 0 ? '+' : ''}${epsChange.toFixed(2)}). `);
    }
    if (priceChangePct != null) {
        const sign = priceChangePct >= 0 ? '+' : '';
        parts.push(`Price Δ over same window: ${sign}${priceChangePct.toFixed(1)}%. `);
    }
    return parts.join('');
}

export const SkewFundamentalsChart: React.FC<IProps> = ({ ticker, points }) => {
    const [hover, setHover] = useState<{ x: number; y: number; idx: number } | null>(null);

    const interp = useMemo(() => buildInterp(ticker, points), [ticker, points]);

    const xFor = (i: number): number => {
        const n = points.length;
        if (n <= 1) return PAD_L;
        return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
    };

    const priceRange = useMemo(() => {
        const xs = points.map((p) => p.price).filter((v): v is number => v != null && Number.isFinite(v));
        if (xs.length === 0) return { min: 0, max: 1 };
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        if (min === max) return { min: min * 0.95, max: max * 1.05 };
        const pad = (max - min) * 0.1;
        return { min: min - pad, max: max + pad };
    }, [points]);

    const epsRange = useMemo(() => {
        const xs = points.map((p) => p.eps).filter((v): v is number => v != null && Number.isFinite(v));
        if (xs.length === 0) return { min: 0, max: 1 };
        const min = Math.min(0, ...xs);
        const max = Math.max(0, ...xs);
        if (min === max) return { min: min - 1, max: max + 1 };
        const pad = (max - min) * 0.1;
        return { min: min - pad, max: max + pad };
    }, [points]);

    const yPriceFor = (v: number): number => {
        const ratio = (v - priceRange.min) / (priceRange.max - priceRange.min);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };
    const yEpsFor = (v: number): number => {
        const ratio = (v - epsRange.min) / (epsRange.max - epsRange.min);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };

    const pricePath = useMemo(() => {
        const segs: string[] = [];
        let started = false;
        points.forEach((p, i) => {
            if (p.price == null || !Number.isFinite(p.price)) { started = false; return; }
            const cmd = started ? 'L' : 'M';
            segs.push(`${cmd} ${xFor(i).toFixed(2)} ${yPriceFor(p.price).toFixed(2)}`);
            started = true;
        });
        return segs.join(' ');
    }, [points, priceRange]);

    const epsPath = useMemo(() => {
        const segs: string[] = [];
        let started = false;
        points.forEach((p, i) => {
            if (p.eps == null || !Number.isFinite(p.eps)) { started = false; return; }
            const cmd = started ? 'L' : 'M';
            segs.push(`${cmd} ${xFor(i).toFixed(2)} ${yEpsFor(p.eps).toFixed(2)}`);
            started = true;
        });
        return segs.join(' ');
    }, [points, epsRange]);

    const yLeftTicks = (() => {
        const out: Array<{ v: number; y: number }> = [];
        const steps = 5;
        for (let i = 0; i <= steps; i += 1) {
            const v = priceRange.min + (i / steps) * (priceRange.max - priceRange.min);
            out.push({ v, y: yPriceFor(v) });
        }
        return out;
    })();

    const yRightTicks = (() => {
        const out: Array<{ v: number; y: number }> = [];
        const steps = 5;
        for (let i = 0; i <= steps; i += 1) {
            const v = epsRange.min + (i / steps) * (epsRange.max - epsRange.min);
            out.push({ v, y: yEpsFor(v) });
        }
        return out;
    })();

    // Zero baseline for EPS
    const yEpsZero = epsRange.min < 0 && epsRange.max > 0 ? yEpsFor(0) : null;

    const handleMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const ratio = cx / rect.width;
        const x = ratio * VW;
        const n = points.length;
        if (n === 0) return;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x - PAD_L) / (VW - PAD_L - PAD_R) * (n - 1))));
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx });
    };
    const handleLeave = (): void => setHover(null);

    if (points.length === 0) {
        return (
            <Wrapper>
                <TitleRow>
                    <div>
                        <Title>📊 {ticker} — Stock Price vs EPS</Title>
                    </div>
                </TitleRow>
                <Interp dangerouslySetInnerHTML={{ __html: interp }} />
            </Wrapper>
        );
    }

    const hovered = hover ? points[hover.idx] : null;

    return (
        <Wrapper>
            <TitleRow>
                <div>
                    <Title>📊 {ticker} — Stock Price vs EPS</Title>
                    <Sub>Quarterly price (left axis) + basic EPS (right axis), most recent {points.length} quarters from Polygon</Sub>
                </div>
            </TitleRow>

            <Interp dangerouslySetInnerHTML={{ __html: interp }} />

            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {/* Left Y-axis ticks (price) */}
                {yLeftTicks.map((t, i) => (
                    <g key={`yl-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 6} y={t.y + 4} fontSize={11} fill={PRICE_COLOR} textAnchor="end">${t.v.toFixed(0)}</text>
                    </g>
                ))}

                {/* Right Y-axis ticks (EPS) */}
                {yRightTicks.map((t, i) => (
                    <text key={`yr-${i}`} x={VW - PAD_R + 6} y={t.y + 4} fontSize={11} fill={EPS_COLOR} textAnchor="start">{t.v.toFixed(2)}</text>
                ))}

                {/* EPS zero baseline if range crosses zero */}
                {yEpsZero != null && (
                    <line x1={PAD_L} x2={VW - PAD_R} y1={yEpsZero} y2={yEpsZero} stroke="#3a3a4a" strokeWidth={1} strokeDasharray="6 4" />
                )}

                {/* X-axis labels */}
                {points.map((p, i) => {
                    const labelEvery = Math.max(1, Math.floor(points.length / 8));
                    if (i % labelEvery !== 0 && i !== points.length - 1) return null;
                    return (
                        <text
                            key={`xt-${i}`}
                            x={xFor(i)}
                            y={VH - PAD_B + 18}
                            fontSize={11}
                            fill="#a0a0b0"
                            textAnchor="end"
                            transform={`rotate(-30 ${xFor(i)} ${VH - PAD_B + 18})`}
                        >
                            {p.fiscalPeriod}
                        </text>
                    );
                })}

                {/* Price line */}
                {pricePath && (
                    <path d={pricePath} stroke={PRICE_COLOR} strokeWidth={2} fill="none" />
                )}

                {/* EPS line */}
                {epsPath && (
                    <path d={epsPath} stroke={EPS_COLOR} strokeWidth={2} fill="none" strokeDasharray="0" />
                )}

                {/* Price dots */}
                {points.map((p, i) => p.price != null && Number.isFinite(p.price) ? (
                    <circle key={`pd-${i}`} cx={xFor(i)} cy={yPriceFor(p.price)} r={3.5} fill={PRICE_COLOR} stroke="#0f0f17" strokeWidth={1} />
                ) : null)}

                {/* EPS dots */}
                {points.map((p, i) => p.eps != null && Number.isFinite(p.eps) ? (
                    <circle key={`ed-${i}`} cx={xFor(i)} cy={yEpsFor(p.eps)} r={3.5} fill={EPS_COLOR} stroke="#0f0f17" strokeWidth={1} />
                ) : null)}

                {/* Hover vertical line */}
                {hover && (
                    <line
                        x1={xFor(hover.idx)}
                        x2={xFor(hover.idx)}
                        y1={PAD_T}
                        y2={VH - PAD_B}
                        stroke="#f0f0f5"
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.4}
                    />
                )}

                {/* Axis labels */}
                <text x={20} y={(VH - PAD_T - PAD_B) / 2 + PAD_T} fontSize={11} fill={PRICE_COLOR} textAnchor="middle"
                      transform={`rotate(-90 20 ${(VH - PAD_T - PAD_B) / 2 + PAD_T})`}>Price ($)</text>
                <text x={VW - 14} y={(VH - PAD_T - PAD_B) / 2 + PAD_T} fontSize={11} fill={EPS_COLOR} textAnchor="middle"
                      transform={`rotate(90 ${VW - 14} ${(VH - PAD_T - PAD_B) / 2 + PAD_T})`}>EPS ($)</text>

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

            {hovered && (
                <TooltipBox style={{ left: hover!.x, top: hover!.y - 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {hovered.fiscalPeriod} <span style={{ color: '#a0a0b0', fontWeight: 400 }}>• {hovered.periodEndDate}</span>
                    </div>
                    <TooltipLine><span style={{ color: PRICE_COLOR }}>Price</span><span>{hovered.price != null ? `$${hovered.price.toFixed(2)}` : '–'}</span></TooltipLine>
                    <TooltipLine><span style={{ color: EPS_COLOR }}>EPS (basic)</span><span>{hovered.eps != null ? `$${hovered.eps.toFixed(2)}` : '–'}</span></TooltipLine>
                    <TooltipLine><span style={{ color: '#a0a0b0' }}>EPS (diluted)</span><span>{hovered.epsDiluted != null ? `$${hovered.epsDiluted.toFixed(2)}` : '–'}</span></TooltipLine>
                    {hovered.revenue != null && (
                        <TooltipLine><span style={{ color: '#a0a0b0' }}>Revenue</span><span>${fmtBig(hovered.revenue)}</span></TooltipLine>
                    )}
                    {hovered.netIncome != null && (
                        <TooltipLine><span style={{ color: '#a0a0b0' }}>Net Income</span><span>${fmtBig(hovered.netIncome)}</span></TooltipLine>
                    )}
                    {hovered.price != null && hovered.eps != null && hovered.eps !== 0 && (
                        <TooltipLine><span style={{ color: '#facc15' }}>P/E (TTM est.)</span><span>{(hovered.price / hovered.eps).toFixed(1)}</span></TooltipLine>
                    )}
                </TooltipBox>
            )}

            <Legend>
                <span><SwatchLine $color={PRICE_COLOR} />Stock Price</span>
                <span><SwatchLine $color={EPS_COLOR} />EPS (basic)</span>
            </Legend>
        </Wrapper>
    );
};

export default SkewFundamentalsChart;

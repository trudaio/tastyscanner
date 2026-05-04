import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { IStrikeRow } from '../../services/skew-analysis/skew-analysis.service.interface';

// QQQ Gamma Exposure (GEX) chart — paired call/put bars per strike on the
// left Y axis, cumulative exposure white line on the right Y axis, spot
// reference line, and toggles for view mode + DTE filter.
//
// Formula:
//   GEX_call = gamma * OI * 100 * spot^2 * 0.01
//   GEX_put  = -gamma * OI * 100 * spot^2 * 0.01      (dealers short puts)
//   Net      = GEX_call + GEX_put per strike

const VW = 1300;
const VH = 460;
const PAD_L = 70;
const PAD_R = 70;
const PAD_T = 40;
const PAD_B = 80;

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
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const Btn = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  background: ${(p) => (p.$disabled ? '#0f0f17' : p.$active ? '#3b82f6' : '#1a1a24')};
  color: ${(p) => (p.$disabled ? '#404050' : p.$active ? 'white' : '#f0f0f5')};
  border: 1px solid ${(p) => (p.$disabled ? '#1f1f2a' : p.$active ? '#3b82f6' : '#2a2a3a')};
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  text-transform: uppercase;
  &:hover { border-color: ${(p) => (p.$disabled ? '#1f1f2a' : '#3b82f6')}; }
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
  min-width: 160px;
`;

const Legend = styled.div`
  display: flex;
  gap: 20px;
  margin-top: 8px;
  font-size: 12px;
  color: #a0a0b0;
  align-items: center;
  justify-content: center;
`;

const SwatchRect = styled.span<{ $color: string }>`
  display: inline-block;
  width: 14px;
  height: 10px;
  background: ${(p) => p.$color};
  margin-right: 6px;
  vertical-align: middle;
`;

const SwatchLine = styled.span`
  display: inline-block;
  width: 18px;
  height: 2px;
  background: white;
  margin-right: 6px;
  vertical-align: middle;
`;

const CALL_COLOR = '#22c55e';
const PUT_COLOR = '#ef4444';

type DteFilter = 'all' | 'lt30' | '30to60' | '60to90' | 'gt90';
type Mode = 'gex' | 'spotGex' | 'vanna' | 'vannaGex';
type RangeFilter = 'pm10' | 'pm20' | 'pm50' | 'all';

const RANGE_PCT: Record<RangeFilter, number | null> = {
    pm10: 10,
    pm20: 20,
    pm50: 50,
    all: null,
};
const RANGE_LABEL: Record<RangeFilter, string> = {
    pm10: '±10%',
    pm20: '±20%',
    pm50: '±50%',
    all: 'All',
};

interface IExpirationOption {
    expiration: string;
    isMonthly: boolean;
}

interface IProps {
    ticker: string;
    stockPrice: number | null;
    strikesByExpiration: Record<string, IStrikeRow[]>;
    expirations: IExpirationOption[];
}

interface IGexBucket {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
}

function buildBuckets(rows: IStrikeRow[], spot: number): IGexBucket[] {
    const m = new Map<number, IGexBucket>();
    for (const r of rows) {
        if (r.gamma == null || !Number.isFinite(r.gamma)) continue;
        if (r.openInterest <= 0) continue;
        // GEX in millions of $-gamma per 1% move:
        //   gamma * OI * 100 * spot^2 * 0.01 / 1_000_000
        const raw = (r.gamma * r.openInterest * 100 * spot * spot * 0.01) / 1_000_000;
        let b = m.get(r.strike);
        if (!b) {
            b = { strike: r.strike, callGex: 0, putGex: 0, netGex: 0 };
            m.set(r.strike, b);
        }
        if (r.type === 'call') {
            b.callGex += raw;
        } else {
            // dealers short puts → flip sign so net GEX adds correctly
            b.putGex += -raw;
        }
        b.netGex = b.callGex + b.putGex;
    }
    return Array.from(m.values()).sort((a, b) => a.strike - b.strike);
}

function dteFilterFn(filter: DteFilter): (dte: number) => boolean {
    switch (filter) {
        case 'lt30': return (d) => d < 30;
        case '30to60': return (d) => d >= 30 && d < 60;
        case '60to90': return (d) => d >= 60 && d < 90;
        case 'gt90': return (d) => d >= 90;
        case 'all':
        default: return () => true;
    }
}

function fmtBig(n: number, digits = 2): string {
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}M`;
}

function fmtBigUnsigned(n: number, digits = 2): string {
    return `${n.toFixed(digits)}M`;
}

function buildInterpretation(buckets: IGexBucket[], stockPrice: number | null, ticker: string, mode: Mode): string {
    if (buckets.length === 0) return 'No gamma exposure data — Polygon may not be reporting greeks.gamma for the chosen filter.';
    const totalNet = buckets.reduce((a, b) => a + b.netGex, 0);
    const totalCall = buckets.reduce((a, b) => a + b.callGex, 0);
    const totalPut = buckets.reduce((a, b) => a + b.putGex, 0);

    // walk cumulative to find zero-gamma flip
    let cumulative = 0;
    let flipStrike: number | null = null;
    for (const b of buckets) {
        const prev = cumulative;
        cumulative += b.netGex;
        if (flipStrike == null && Math.sign(prev) !== Math.sign(cumulative) && prev !== 0) {
            flipStrike = b.strike;
        }
    }

    const tone = totalNet > 0 ? 'positive' : 'negative';
    const parts: string[] = [];
    parts.push(
        `${ticker} ${mode === 'spotGex' ? 'Spot ' : ''}GEX measures how much dealers must hedge per 1% move. ` +
        `Green bars = call GEX (dealers long), red bars = put GEX (dealers short, sign-flipped). ` +
        `The white line is the running cumulative exposure. `,
    );
    parts.push(
        `Net dealer gamma is ${fmtBig(totalNet, 2)} (calls ${fmtBigUnsigned(totalCall, 2)}, puts ${fmtBigUnsigned(Math.abs(totalPut), 2)}). `,
    );
    if (tone === 'positive') {
        parts.push(`Positive net GEX → dealers buy on dips, sell on rallies (vol-suppressing, range-bound). `);
    } else {
        parts.push(`Negative net GEX → dealers sell on dips, buy on rallies (vol-amplifying, trending). `);
    }
    if (flipStrike != null) {
        parts.push(`The cumulative line crosses zero near $${flipStrike.toFixed(0)} — that's the "zero-gamma" level. Above it dealers add positive gamma; below, negative. `);
    }
    if (stockPrice != null) {
        parts.push(`Spot is at $${stockPrice.toFixed(2)}. `);
    }
    return parts.join('');
}

export const SkewGexChart: React.FC<IProps> = ({ ticker, stockPrice, strikesByExpiration, expirations }) => {
    const [aggregate, setAggregate] = useState<boolean>(true);
    const fallbackExp = expirations.find((e) => e.isMonthly)?.expiration ?? expirations[0]?.expiration ?? '';
    const [selectedExp, setSelectedExp] = useState<string>(fallbackExp);
    const [dteFilter, setDteFilter] = useState<DteFilter>('all');
    const [rangeFilter, setRangeFilter] = useState<RangeFilter>('pm20');
    const [mode, setMode] = useState<Mode>('gex');
    const [hover, setHover] = useState<{ x: number; y: number; b: IGexBucket; cumulative: number } | null>(null);

    const spot = stockPrice && Number.isFinite(stockPrice) && stockPrice > 0 ? stockPrice : 1;

    const buckets = useMemo(() => {
        const dteOk = dteFilterFn(dteFilter);
        const rangePct = RANGE_PCT[rangeFilter];
        const lo = rangePct != null && stockPrice != null ? stockPrice * (1 - rangePct / 100) : -Infinity;
        const hi = rangePct != null && stockPrice != null ? stockPrice * (1 + rangePct / 100) : Infinity;
        const all: IStrikeRow[] = [];
        if (aggregate) {
            for (const e of expirations) {
                const rows = strikesByExpiration[e.expiration];
                if (!rows) continue;
                for (const r of rows) {
                    if (!dteOk(r.dte)) continue;
                    if (r.strike < lo || r.strike > hi) continue;
                    all.push(r);
                }
            }
        } else {
            const rows = strikesByExpiration[selectedExp] ?? [];
            for (const r of rows) {
                if (!dteOk(r.dte)) continue;
                if (r.strike < lo || r.strike > hi) continue;
                all.push(r);
            }
        }
        return buildBuckets(all, spot);
    }, [aggregate, expirations, strikesByExpiration, selectedExp, dteFilter, rangeFilter, stockPrice, spot]);

    const interp = useMemo(() => buildInterpretation(buckets, stockPrice, ticker, mode), [buckets, stockPrice, ticker, mode]);

    // Y range for bars (left axis): symmetric around zero
    const yBarMax = useMemo(() => {
        let m = 0;
        for (const b of buckets) {
            const am = Math.max(Math.abs(b.callGex), Math.abs(b.putGex));
            if (am > m) m = am;
        }
        return m || 1;
    }, [buckets]);

    // Cumulative line (right axis)
    const cumulative = useMemo(() => {
        let acc = 0;
        return buckets.map((b) => {
            acc += b.netGex;
            return acc;
        });
    }, [buckets]);

    const cumMin = useMemo(() => Math.min(0, ...cumulative), [cumulative]);
    const cumMax = useMemo(() => Math.max(0, ...cumulative), [cumulative]);

    const xFor = (i: number): number => {
        const n = buckets.length;
        if (n <= 1) return PAD_L;
        return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
    };
    const yBarFor = (v: number): number => {
        // bars symmetric around zero baseline at chart middle
        const half = (VH - PAD_T - PAD_B) / 2;
        const yZero = PAD_T + half;
        const ratio = v / yBarMax;
        return yZero - ratio * half;
    };
    const yCumFor = (v: number): number => {
        if (cumMin === cumMax) return PAD_T + (VH - PAD_T - PAD_B) / 2;
        const ratio = (v - cumMin) / (cumMax - cumMin);
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };
    const yZeroBar = yBarFor(0);

    const slot = buckets.length > 1 ? (VW - PAD_L - PAD_R) / buckets.length : 24;
    const barWidth = Math.max(2, Math.min(8, slot * 0.4));

    // Y ticks - bars (left)
    const yBarTicks = (() => {
        const out: Array<{ v: number; y: number }> = [];
        const steps = 6;
        const range = yBarMax * 2;
        for (let i = 0; i <= steps; i += 1) {
            const v = yBarMax - (i / steps) * range;
            out.push({ v, y: yBarFor(v) });
        }
        return out;
    })();

    // Y ticks - cumulative (right)
    const yCumTicks = (() => {
        const out: Array<{ v: number; y: number }> = [];
        const steps = 6;
        const range = cumMax - cumMin;
        if (range === 0) return out;
        for (let i = 0; i <= steps; i += 1) {
            const v = cumMax - (i / steps) * range;
            out.push({ v, y: yCumFor(v) });
        }
        return out;
    })();

    const xTicks = (() => {
        if (buckets.length === 0) return [] as Array<{ idx: number; label: string; x: number }>;
        const desired = Math.min(15, buckets.length);
        const step = Math.max(1, Math.floor(buckets.length / desired));
        const out: Array<{ idx: number; label: string; x: number }> = [];
        for (let i = 0; i < buckets.length; i += step) {
            out.push({ idx: i, label: buckets[i].strike.toFixed(0), x: xFor(i) });
        }
        return out;
    })();

    // Spot bar index
    const spotIdx = useMemo(() => {
        if (stockPrice == null || buckets.length === 0) return null;
        let idx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < buckets.length; i += 1) {
            const d = Math.abs(buckets[i].strike - stockPrice);
            if (d < bestDiff) {
                bestDiff = d;
                idx = i;
            }
        }
        return idx;
    }, [stockPrice, buckets]);

    const cumulativePath = cumulative.length > 1
        ? cumulative.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yCumFor(v).toFixed(2)}`).join(' ')
        : '';

    const handleMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const ratio = cx / rect.width;
        const x = ratio * VW;
        const n = buckets.length;
        if (n === 0) return;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x - PAD_L) / (VW - PAD_L - PAD_R) * (n - 1))));
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, b: buckets[idx], cumulative: cumulative[idx] ?? 0 });
    };
    const handleLeave = (): void => setHover(null);

    return (
        <Wrapper>
            <TitleRow>
                <div>
                    <Title>📐 {ticker} Gamma Exposure (GEX) <span style={{ color: '#a0a0b0', fontWeight: 400, fontSize: 12 }}>per strike</span></Title>
                    <Sub>
                        Strike on X • Greek exposure (M) on left Y • Cumulative exposure on right Y • formula: γ × OI × 100 × spot² × 1%
                    </Sub>
                </div>
                <Controls>
                    {!aggregate && (
                        <Select value={selectedExp} onChange={(e) => setSelectedExp(e.target.value)}>
                            {expirations.map((opt) => (
                                <option key={opt.expiration} value={opt.expiration}>
                                    {opt.expiration} {opt.isMonthly ? '(Monthly)' : '(Weekly)'}
                                </option>
                            ))}
                        </Select>
                    )}
                    <Btn $active={aggregate} onClick={() => setAggregate(true)}>Aggregate</Btn>
                    <Btn $active={!aggregate} onClick={() => setAggregate(false)}>Exp Filter</Btn>
                    <Select value={dteFilter} onChange={(e) => setDteFilter(e.target.value as DteFilter)}>
                        <option value="all">DTE: All</option>
                        <option value="lt30">DTE: &lt; 30</option>
                        <option value="30to60">DTE: 30–60</option>
                        <option value="60to90">DTE: 60–90</option>
                        <option value="gt90">DTE: &gt; 90</option>
                    </Select>
                    <Select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}>
                        {(['pm10', 'pm20', 'pm50', 'all'] as RangeFilter[]).map((r) => (
                            <option key={r} value={r}>Range: {RANGE_LABEL[r]}</option>
                        ))}
                    </Select>
                    <span style={{ width: 8 }} />
                    <Btn $active={mode === 'gex'} onClick={() => setMode('gex')}>GEX</Btn>
                    <Btn $active={mode === 'spotGex'} onClick={() => setMode('spotGex')}>Spot GEX</Btn>
                    <Btn $disabled title="Vanna requires BSM math — coming soon">Vanna</Btn>
                    <Btn $disabled title="VannaGEX — coming soon">VannaGEX</Btn>
                </Controls>
            </TitleRow>

            <Interp>{interp}</Interp>

            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {/* Y bar ticks (left) */}
                {yBarTicks.map((t, i) => (
                    <g key={`yb-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 6} y={t.y + 4} fontSize={11} fill="#a0a0b0" textAnchor="end">{t.v.toFixed(2)}</text>
                    </g>
                ))}

                {/* Zero baseline */}
                <line x1={PAD_L} x2={VW - PAD_R} y1={yZeroBar} y2={yZeroBar} stroke="#3a3a4a" strokeWidth={1.5} />

                {/* Y cum ticks (right) */}
                {yCumTicks.map((t, i) => (
                    <text key={`yc-${i}`} x={VW - PAD_R + 6} y={t.y + 4} fontSize={11} fill="#a0a0b0" textAnchor="start">{t.v.toFixed(1)}</text>
                ))}

                {/* Spot reference bar (white vertical) */}
                {spotIdx != null && (
                    <g>
                        <line x1={xFor(spotIdx)} x2={xFor(spotIdx)} y1={PAD_T} y2={VH - PAD_B} stroke="#f0f0f5" strokeWidth={2} opacity={0.4} />
                        <text x={xFor(spotIdx)} y={PAD_T - 6} fontSize={10} fill="#f0f0f5" textAnchor="middle" fontWeight={700}>SPOT</text>
                    </g>
                )}

                {/* Bars */}
                {buckets.map((b, i) => (
                    <g key={`bar-${b.strike}`}>
                        {b.callGex !== 0 && (
                            <rect
                                x={xFor(i) - barWidth - 0.5}
                                y={Math.min(yBarFor(b.callGex), yZeroBar)}
                                width={barWidth}
                                height={Math.abs(yBarFor(b.callGex) - yZeroBar)}
                                fill={CALL_COLOR}
                                opacity={0.85}
                            />
                        )}
                        {b.putGex !== 0 && (
                            <rect
                                x={xFor(i) + 0.5}
                                y={Math.min(yBarFor(b.putGex), yZeroBar)}
                                width={barWidth}
                                height={Math.abs(yBarFor(b.putGex) - yZeroBar)}
                                fill={PUT_COLOR}
                                opacity={0.85}
                            />
                        )}
                    </g>
                ))}

                {/* Cumulative line */}
                {cumulativePath && (
                    <path d={cumulativePath} stroke="#f0f0f5" strokeWidth={2} fill="none" />
                )}

                {/* X tick labels */}
                {xTicks.map((t, i) => (
                    <text key={`xt-${i}`} x={t.x} y={VH - PAD_B + 18} fontSize={10} fill="#a0a0b0" textAnchor="end"
                          transform={`rotate(-45 ${t.x} ${VH - PAD_B + 18})`}>{t.label}</text>
                ))}

                {/* Axis labels */}
                <text x={14} y={VH / 2} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(-90 14 ${VH / 2})`}>Greek Exposure (M)</text>
                <text x={VW - 14} y={VH / 2} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(90 ${VW - 14} ${VH / 2})`}>Cumulative</text>
                <text x={(VW - PAD_L - PAD_R) / 2 + PAD_L} y={VH - 8} fontSize={11} fill="#a0a0b0" textAnchor="middle">Strike Price</text>

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

            {hover && (
                <TooltipBox style={{ left: hover.x, top: hover.y - 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Strike ${hover.b.strike}</div>
                    <div style={{ color: CALL_COLOR }}>Call GEX: {fmtBig(hover.b.callGex)}</div>
                    <div style={{ color: PUT_COLOR }}>Put GEX: {fmtBig(hover.b.putGex)}</div>
                    <div style={{ color: '#a0a0b0' }}>Net: {fmtBig(hover.b.netGex)}</div>
                    <div style={{ borderTop: '1px solid #2a2a3a', marginTop: 4, paddingTop: 4, color: '#f0f0f5' }}>
                        Cumulative: {fmtBig(hover.cumulative)}
                    </div>
                </TooltipBox>
            )}

            <Legend>
                <span><SwatchRect $color={CALL_COLOR} />Call GEX</span>
                <span><SwatchRect $color={PUT_COLOR} />Put GEX</span>
                <span><SwatchLine />Cumulative Exposure</span>
                {stockPrice != null && (
                    <span><SwatchLine />Spot ${stockPrice.toFixed(2)}</span>
                )}
            </Legend>
        </Wrapper>
    );
};

export default SkewGexChart;

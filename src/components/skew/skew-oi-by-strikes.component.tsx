import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { IStrikeRow } from '../../services/skew-analysis/skew-analysis.service.interface';

const VW = 1300;
const VH = 380;
const PAD_L = 64;
const PAD_R = 16;
const PAD_T = 16;
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
  gap: 8px;
  align-items: center;
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

const ToggleButton = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? '#3b82f6' : '#1a1a24')};
  color: ${(p) => (p.$active ? 'white' : '#f0f0f5')};
  border: 1px solid ${(p) => (p.$active ? '#3b82f6' : '#2a2a3a')};
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

const Legend = styled.div`
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
  background: ${(p) => p.$color};
  margin-right: 6px;
  vertical-align: middle;
`;

const PUT_COLOR = '#ef4444';
const CALL_COLOR = '#22c55e';

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

interface IBucket {
    strike: number;
    putOI: number;
    callOI: number;
}

interface IProps {
    ticker: string;
    stockPrice: number | null;
    strikesByExpiration: Record<string, IStrikeRow[]>;
    expirations: IExpirationOption[];
}

function buildBuckets(rows: IStrikeRow[]): IBucket[] {
    const m = new Map<number, IBucket>();
    for (const r of rows) {
        const oi = r.openInterest > 0 ? r.openInterest : 0;
        if (oi === 0) continue;
        let b = m.get(r.strike);
        if (!b) {
            b = { strike: r.strike, putOI: 0, callOI: 0 };
            m.set(r.strike, b);
        }
        if (r.type === 'put') b.putOI += oi;
        else b.callOI += oi;
    }
    return Array.from(m.values()).sort((a, b) => a.strike - b.strike);
}

function buildInterpretation(buckets: IBucket[], stockPrice: number | null, ticker: string): string {
    if (buckets.length === 0) return 'No open interest data to summarize.';
    const totalPut = buckets.reduce((a, b) => a + b.putOI, 0);
    const totalCall = buckets.reduce((a, b) => a + b.callOI, 0);
    const ratio = totalCall > 0 ? totalPut / totalCall : null;
    const topPut = [...buckets].sort((a, b) => b.putOI - a.putOI)[0];
    const topCall = [...buckets].sort((a, b) => b.callOI - a.callOI)[0];

    const parts: string[] = [];
    parts.push(
        `Each bar shows total open interest at a strike — red is put OI, green is call OI. ` +
        `Bars cluster around levels traders care about: large put OI below spot signals support / put walls; large call OI above spot signals resistance / call walls. `,
    );
    if (topPut && topPut.putOI > 0) {
        parts.push(`Largest put cluster sits at $${topPut.strike} (${topPut.putOI.toLocaleString()} contracts). `);
    }
    if (topCall && topCall.callOI > 0) {
        parts.push(`Largest call cluster sits at $${topCall.strike} (${topCall.callOI.toLocaleString()} contracts). `);
    }
    if (ratio != null) {
        const tone = ratio > 1.2 ? 'put-skewed' : ratio < 0.8 ? 'call-skewed' : 'balanced';
        parts.push(`Aggregate P/C OI ratio is ${ratio.toFixed(2)} — ${tone} positioning. `);
    }
    if (stockPrice) {
        parts.push(`Spot is at $${stockPrice.toFixed(2)} — bars above are call-side resistance, bars below are put-side support. `);
    }
    parts.push(
        `Use the dropdown to scope to a single expiration, or hit Aggregate to combine all of ${ticker}'s expirations into one view.`,
    );
    return parts.join('');
}

export const SkewOiByStrikes: React.FC<IProps> = ({ ticker, stockPrice, strikesByExpiration, expirations }) => {
    const [aggregate, setAggregate] = useState<boolean>(true);
    const fallbackExp = expirations.find((e) => e.isMonthly)?.expiration ?? expirations[0]?.expiration ?? '';
    const [selectedExp, setSelectedExp] = useState<string>(fallbackExp);
    const [rangeFilter, setRangeFilter] = useState<RangeFilter>('pm20');
    const [hover, setHover] = useState<{ x: number; y: number; b: IBucket } | null>(null);

    const buckets = useMemo(() => {
        const rangePct = RANGE_PCT[rangeFilter];
        const lo = rangePct != null && stockPrice != null ? stockPrice * (1 - rangePct / 100) : -Infinity;
        const hi = rangePct != null && stockPrice != null ? stockPrice * (1 + rangePct / 100) : Infinity;
        const inRange = (r: IStrikeRow): boolean => r.strike >= lo && r.strike <= hi;
        if (aggregate) {
            const all: IStrikeRow[] = [];
            for (const e of expirations) {
                const rows = strikesByExpiration[e.expiration];
                if (!rows) continue;
                for (const r of rows) if (inRange(r)) all.push(r);
            }
            return buildBuckets(all);
        }
        const rows = strikesByExpiration[selectedExp] ?? [];
        return buildBuckets(rows.filter(inRange));
    }, [aggregate, expirations, strikesByExpiration, selectedExp, rangeFilter, stockPrice]);

    const interp = useMemo(() => buildInterpretation(buckets, stockPrice, ticker), [buckets, stockPrice, ticker]);

    const yMax = useMemo(() => {
        let m = 0;
        for (const b of buckets) {
            if (b.putOI > m) m = b.putOI;
            if (b.callOI > m) m = b.callOI;
        }
        return m || 1;
    }, [buckets]);

    const xFor = (i: number): number => {
        const n = buckets.length;
        if (n <= 1) return PAD_L;
        return PAD_L + (i / (n - 1)) * (VW - PAD_L - PAD_R);
    };
    const yFor = (v: number): number => {
        const ratio = v / yMax;
        return PAD_T + (1 - ratio) * (VH - PAD_T - PAD_B);
    };
    const yBaseline = VH - PAD_B;

    // Bar width based on number of buckets
    const slotWidth = buckets.length > 1
        ? (VW - PAD_L - PAD_R) / buckets.length
        : 24;
    const barWidth = Math.max(2, Math.min(10, slotWidth * 0.4));

    const yTicks = (() => {
        const out: Array<{ v: number; y: number }> = [];
        const steps = 6;
        for (let i = 0; i <= steps; i += 1) {
            const v = (i / steps) * yMax;
            out.push({ v, y: yFor(v) });
        }
        return out;
    })();

    const xTicks = (() => {
        if (buckets.length === 0) return [] as Array<{ idx: number; label: string; x: number }>;
        const desired = Math.min(20, buckets.length);
        const step = Math.max(1, Math.floor(buckets.length / desired));
        const out: Array<{ idx: number; label: string; x: number }> = [];
        for (let i = 0; i < buckets.length; i += step) {
            out.push({ idx: i, label: buckets[i].strike.toFixed(0), x: xFor(i) });
        }
        return out;
    })();

    const handleMove: React.MouseEventHandler<SVGRectElement> = (e) => {
        const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const ratio = cx / rect.width;
        const x = ratio * VW;
        const n = buckets.length;
        if (n === 0) return;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x - PAD_L) / (VW - PAD_L - PAD_R) * (n - 1))));
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, b: buckets[idx] });
    };
    const handleLeave = (): void => setHover(null);

    const fmtBig = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
    };

    return (
        <Wrapper>
            <TitleRow>
                <div>
                    <Title>📊 Open Interest By Strikes — {ticker}</Title>
                    <Sub>
                        Strike Price on X-axis • Total Open Interest on Y-axis • Red = Puts, Green = Calls
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
                    <ToggleButton $active={!aggregate} onClick={() => setAggregate(false)}>
                        OI by Expiration
                    </ToggleButton>
                    <ToggleButton $active={aggregate} onClick={() => setAggregate(true)}>
                        Aggregate
                    </ToggleButton>
                    <Select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}>
                        {(['pm10', 'pm20', 'pm50', 'all'] as RangeFilter[]).map((r) => (
                            <option key={r} value={r}>Range: {RANGE_LABEL[r]}</option>
                        ))}
                    </Select>
                </Controls>
            </TitleRow>

            <Interp>{interp}</Interp>

            <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                {yTicks.map((t, i) => (
                    <g key={`yt-${i}`}>
                        <line x1={PAD_L} x2={VW - PAD_R} y1={t.y} y2={t.y} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={PAD_L - 8} y={t.y + 4} fontSize={11} fill="#a0a0b0" textAnchor="end">
                            {fmtBig(t.v)}
                        </text>
                    </g>
                ))}

                {/* Y axis label */}
                <text x={14} y={VH / 2} fontSize={11} fill="#a0a0b0" textAnchor="middle"
                      transform={`rotate(-90 14 ${VH / 2})`}>Total Open Interest</text>

                {/* Spot price reference */}
                {stockPrice != null && buckets.length > 1 && (() => {
                    // find nearest strike to spot
                    let bestIdx = 0;
                    let bestDiff = Infinity;
                    for (let i = 0; i < buckets.length; i += 1) {
                        const diff = Math.abs(buckets[i].strike - stockPrice);
                        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
                    }
                    const sx = xFor(bestIdx);
                    return (
                        <g>
                            <line x1={sx} x2={sx} y1={PAD_T} y2={yBaseline} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
                            <text x={sx} y={PAD_T - 4} fontSize={10} fill="#f59e0b" textAnchor="middle">SPOT</text>
                        </g>
                    );
                })()}

                {/* Bars: put left, call right */}
                {buckets.map((b, i) => (
                    <g key={`bar-${b.strike}`}>
                        {b.putOI > 0 && (
                            <rect
                                x={xFor(i) - barWidth - 0.5}
                                y={yFor(b.putOI)}
                                width={barWidth}
                                height={yBaseline - yFor(b.putOI)}
                                fill={PUT_COLOR}
                                opacity={0.85}
                            />
                        )}
                        {b.callOI > 0 && (
                            <rect
                                x={xFor(i) + 0.5}
                                y={yFor(b.callOI)}
                                width={barWidth}
                                height={yBaseline - yFor(b.callOI)}
                                fill={CALL_COLOR}
                                opacity={0.85}
                            />
                        )}
                    </g>
                ))}

                {/* X-axis labels */}
                {xTicks.map((t, i) => (
                    <g key={`xt-${i}`}>
                        <text
                            x={t.x}
                            y={VH - PAD_B + 18}
                            fontSize={10}
                            fill="#a0a0b0"
                            textAnchor="end"
                            transform={`rotate(-45 ${t.x} ${VH - PAD_B + 18})`}
                        >
                            {t.label}
                        </text>
                    </g>
                ))}

                {/* X-axis label */}
                <text x={(VW - PAD_L - PAD_R) / 2 + PAD_L} y={VH - 6} fontSize={11} fill="#a0a0b0" textAnchor="middle">
                    Strike Price
                </text>

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
                    <div style={{ color: PUT_COLOR }}>Put OI: {hover.b.putOI.toLocaleString()}</div>
                    <div style={{ color: CALL_COLOR }}>Call OI: {hover.b.callOI.toLocaleString()}</div>
                </TooltipBox>
            )}

            <Legend>
                <span><Dot $color={PUT_COLOR} />Puts</span>
                <span><Dot $color={CALL_COLOR} />Calls</span>
                {stockPrice != null && (
                    <span><Dot $color="#f59e0b" />Spot ${stockPrice.toFixed(2)}</span>
                )}
            </Legend>
        </Wrapper>
    );
};

export default SkewOiByStrikes;

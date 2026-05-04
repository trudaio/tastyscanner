import React from 'react';
import styled from 'styled-components';
import type { ISkewSummary } from '../../services/skew-analysis/skew-analysis.service.interface';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
`;

const Stat = styled.div<{ $accent?: string }>`
  background: #12121a;
  border: 1px solid #2a2a3a;
  border-left: 3px solid ${(p) => p.$accent ?? '#2a2a3a'};
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatValue = styled.div<{ $color?: string }>`
  font-size: 22px;
  font-weight: 800;
  color: ${(p) => p.$color ?? '#f0f0f5'};
  line-height: 1.1;
`;

const StatLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #606070;
`;

const StatNote = styled.div`
  font-size: 11px;
  color: #a0a0b0;
`;

const Gauge = styled.svg`
  width: 100%;
  max-width: 140px;
  height: 64px;
`;

const TermStructPill = styled.span<{ $tone: 'good' | 'warn' | 'bad' | 'neutral' }>`
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: white;
  background: ${(p) => {
    if (p.$tone === 'good') return '#22c55e';
    if (p.$tone === 'warn') return '#facc15';
    if (p.$tone === 'bad') return '#ef4444';
    return '#606070';
}};
`;

function fmtCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
}

interface IProps {
    ticker: string;
    summary: ISkewSummary;
}

export const SkewStatsRow: React.FC<IProps> = ({ ticker, summary }) => {
    const { stockPrice, avgSkewPct10, termStructure, maxPain, expectedMove, putCallRatio, totalPuts60d, totalCalls60d } = summary;

    // P/C gauge angle: 0.5 → 0deg, 1.0 → 90deg, 2.0 → 180deg.
    const pcRatio = putCallRatio?.ratio ?? null;
    const gaugeRatio = pcRatio == null ? null : Math.min(Math.max(pcRatio, 0.5), 2.0);
    const gaugeAngle = gaugeRatio == null ? 90 : ((gaugeRatio - 0.5) / 1.5) * 180;
    const gaugeColor = pcRatio == null ? '#a0a0b0'
        : pcRatio > 1.2 ? '#ef4444'
        : pcRatio < 0.8 ? '#22c55e'
        : '#a0a0b0';

    const skewColor = avgSkewPct10 == null ? '#a0a0b0'
        : avgSkewPct10 > 20 ? '#ef4444'
        : avgSkewPct10 > 5 ? '#facc15'
        : avgSkewPct10 < -5 ? '#22c55e'
        : '#a0a0b0';

    const termStructTone: 'good' | 'warn' | 'bad' | 'neutral' =
        termStructure === 'backwardation' ? 'bad'
        : termStructure === 'contango' ? 'good'
        : termStructure === 'flat' ? 'neutral'
        : 'neutral';

    const termStructArrow =
        termStructure === 'backwardation' ? '↓'
        : termStructure === 'contango' ? '↑'
        : termStructure === 'flat' ? '→'
        : '?';

    const termStructDesc =
        termStructure === 'backwardation'
            ? 'Near-term puts more expensive than far-term — immediate hedging demand.'
            : termStructure === 'contango'
                ? 'Far-term puts more expensive than near-term — gradual hedging, no panic.'
                : termStructure === 'flat'
                    ? 'Skew consistent across expirations — neutral sentiment.'
                    : 'Insufficient data.';

    return (
        <Grid>
            <Stat $accent="#3b82f6">
                <StatValue $color="#22c55e">${stockPrice == null ? '–' : stockPrice.toFixed(2)}</StatValue>
                <StatLabel>Stock Price</StatLabel>
            </Stat>

            <Stat $accent={skewColor}>
                <StatValue $color={skewColor}>
                    {avgSkewPct10 == null ? '–' : `${avgSkewPct10 >= 0 ? '+' : ''}${avgSkewPct10.toFixed(1)}%`}
                </StatValue>
                <StatLabel>Avg Skew</StatLabel>
            </Stat>

            <Stat $accent={termStructTone === 'bad' ? '#ef4444' : termStructTone === 'good' ? '#22c55e' : '#a0a0b0'}>
                <StatValue style={{ fontSize: 18 }}>{termStructArrow}</StatValue>
                <StatLabel>Term Struct</StatLabel>
                <TermStructPill $tone={termStructTone}>{termStructure}</TermStructPill>
                <StatNote style={{ marginTop: 6 }}>{termStructDesc}</StatNote>
            </Stat>

            <Stat $accent="#facc15">
                <StatValue $color="#facc15">{maxPain == null ? '–' : `$${maxPain}`}</StatValue>
                <StatLabel>Max Pain</StatLabel>
                <StatNote>Strike where most options expire worthless on the front-monthly chain.</StatNote>
            </Stat>

            <Stat $accent="#8b5cf6">
                <StatValue $color="#8b5cf6">
                    {expectedMove == null ? '–' : `±$${expectedMove.dollars.toFixed(2)}`}
                </StatValue>
                <StatLabel>Exp Move</StatLabel>
                <StatNote>{expectedMove == null ? '–' : `±${expectedMove.percent.toFixed(1)}%`}</StatNote>
            </Stat>

            <Stat $accent={gaugeColor}>
                <Gauge viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#2a2a3a" strokeWidth={8} strokeLinecap="round" />
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={gaugeColor}
                        strokeWidth={8}
                        strokeLinecap="round"
                        strokeDasharray={`${(gaugeAngle / 180) * 126} 126`}
                    />
                    <line
                        x1={50}
                        y1={50}
                        x2={50 + 28 * Math.cos((180 - gaugeAngle) * Math.PI / 180)}
                        y2={50 - 28 * Math.sin((180 - gaugeAngle) * Math.PI / 180)}
                        stroke="#f0f0f5"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                    <circle cx={50} cy={50} r={3} fill="#f0f0f5" />
                    <text x={5} y={58} fontSize={6} fill="#22c55e">0.5</text>
                    <text x={47} y={12} fontSize={6} fill="#a0a0b0">1.0</text>
                    <text x={87} y={58} fontSize={6} fill="#ef4444">2.0</text>
                </Gauge>
                <StatValue $color={gaugeColor} style={{ fontSize: 22, textAlign: 'center' }}>
                    {pcRatio == null ? '–' : pcRatio.toFixed(2)}
                </StatValue>
                <StatLabel style={{ textAlign: 'center' }}>P/C Ratio</StatLabel>
            </Stat>

            <Stat $accent="#06b6d4">
                <StatNote>Total Contracts (60 days)</StatNote>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 18 }}>{fmtCount(totalPuts60d)}</span>
                    <span style={{ color: '#606070' }}>/</span>
                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 18 }}>{fmtCount(totalCalls60d)}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#606070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <span style={{ color: '#ef4444' }}>Puts</span>
                    <span style={{ color: '#22c55e' }}>Calls</span>
                </div>
                <StatNote style={{ marginTop: 4 }}>Ticker: {ticker}</StatNote>
            </Stat>
        </Grid>
    );
};

export default SkewStatsRow;

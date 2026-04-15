import React from 'react';
import styled from 'styled-components';
import type { IScenarioStudySummary, IStrategySummary, ScenarioLabel } from '../../services/scenario-study/scenario-study.interface';

const SummaryWrap = styled.div`
    margin-bottom: 24px;
`;

const CardsRow = styled.div`
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 4px 0 12px;
`;

const MetricCard = styled.div<{ $color: string; $best?: boolean }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 14px 18px;
    border-left: 4px solid ${(p) => p.$color};
    min-width: 180px;
    flex-shrink: 0;
    ${(p) => p.$best ? `box-shadow: 0 0 0 2px ${p.$color}40; background: #1f1f36;` : ''}
`;

const CardLabel = styled.div`
    font-size: 0.78rem;
    color: #aaa;
    text-transform: uppercase;
    margin-bottom: 4px;
`;

const CardValue = styled.div<{ $color?: string }>`
    font-size: 1.3rem;
    font-weight: 700;
    color: ${(p) => p.$color ?? '#fff'};
`;

const CardSub = styled.div`
    font-size: 0.78rem;
    color: #888;
    margin-top: 4px;
`;

// ── Comparison table ─────────────────────────────────────────────────────

const TableWrap = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
    margin-top: 16px;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
`;

const Th = styled.th`
    padding: 10px 14px;
    background: #2a2a3e;
    color: #888;
    font-size: 0.73rem;
    text-transform: uppercase;
    text-align: right;
    &:first-child { text-align: left; }
`;

const Td = styled.td<{ $best?: boolean; $positive?: boolean }>`
    padding: 10px 14px;
    border-bottom: 1px solid #1e1e32;
    text-align: right;
    color: ${(p) => p.$best ? '#4dff91' : p.$positive ? '#ccc' : '#ff6b6b'};
    font-weight: ${(p) => p.$best ? 700 : 400};
    &:first-child { text-align: left; color: #fff; font-weight: 600; }
`;

const RowLabel = styled.span<{ $color: string }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    &::before {
        content: '';
        width: 10px;
        height: 10px;
        border-radius: 2px;
        background: ${(p) => p.$color};
    }
`;

const STRATEGY_COLORS: Record<ScenarioLabel, string> = {
    actual: '#4a9eff',
    target75: '#4dff91',
    target50: '#ffaa00',
    target25: '#ff8a4c',
    expire: '#888',
};

const STRATEGY_ORDER: ScenarioLabel[] = ['actual', 'target75', 'target50', 'target25', 'expire'];

function fmt$(v: number): string { return v >= 0 ? `$${v.toFixed(0)}` : `-$${Math.abs(v).toFixed(0)}`; }
function fmtPct(v: number): string { return `${v.toFixed(1)}%`; }

function findBestInColumn(summary: IScenarioStudySummary, getter: (s: IStrategySummary) => number): ScenarioLabel {
    let best: ScenarioLabel = 'actual';
    let bestVal = -Infinity;
    for (const key of STRATEGY_ORDER) {
        const val = getter(summary.strategies[key]);
        if (val > bestVal) { bestVal = val; best = key; }
    }
    return best;
}

interface Props {
    summary: IScenarioStudySummary;
}

export const ScenarioStudySummaryComponent: React.FC<Props> = ({ summary }) => {
    return (
        <SummaryWrap>
            <CardsRow>
                {STRATEGY_ORDER.map((key) => {
                    const s = summary.strategies[key];
                    const isBest = key === summary.bestOverall;
                    const color = STRATEGY_COLORS[key];
                    return (
                        <MetricCard key={key} $color={color} $best={isBest}>
                            <CardLabel>{s.label}{isBest ? ' ★' : ''}</CardLabel>
                            <CardValue $color={s.totalPL >= 0 ? '#4dff91' : '#ff6b6b'}>
                                {fmt$(s.totalPL)}
                            </CardValue>
                            <CardSub>
                                Win {fmtPct(s.winRate)} · Avg {fmt$(s.avgPL)} · {s.avgDaysHeld}d held
                            </CardSub>
                        </MetricCard>
                    );
                })}
            </CardsRow>

            <TableWrap>
                <Table>
                    <thead>
                        <tr>
                            <Th>Strategy</Th>
                            <Th>Total P&L</Th>
                            <Th>Avg P&L</Th>
                            <Th>Win Rate</Th>
                            <Th>Avg Days</Th>
                            <Th>Profit Factor</Th>
                            <Th>Target Hit %</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {STRATEGY_ORDER.map((key) => {
                            const s = summary.strategies[key];
                            const bestPL = findBestInColumn(summary, (x) => x.totalPL);
                            const bestAvg = findBestInColumn(summary, (x) => x.avgPL);
                            const bestWR = findBestInColumn(summary, (x) => x.winRate);
                            const bestDays = findBestInColumn(summary, (x) => -x.avgDaysHeld); // lower is better
                            const bestPF = findBestInColumn(summary, (x) => x.profitFactor);
                            return (
                                <tr key={key}>
                                    <Td>
                                        <RowLabel $color={STRATEGY_COLORS[key]}>{s.label}</RowLabel>
                                    </Td>
                                    <Td $best={key === bestPL} $positive={s.totalPL >= 0}>{fmt$(s.totalPL)}</Td>
                                    <Td $best={key === bestAvg} $positive={s.avgPL >= 0}>{fmt$(s.avgPL)}</Td>
                                    <Td $best={key === bestWR} $positive={s.winRate >= 50}>{fmtPct(s.winRate)}</Td>
                                    <Td $best={key === bestDays} $positive>{s.avgDaysHeld}d</Td>
                                    <Td $best={key === bestPF} $positive={s.profitFactor >= 1}>{s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)}</Td>
                                    <Td $positive={s.targetHitRate > 50}>{fmtPct(s.targetHitRate)}</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrap>
        </SummaryWrap>
    );
};

/**
 * BatchComparisonComponent — Side-by-side comparison of multiple backtest scenarios
 *
 * Shows a table with key metrics per scenario, highlighting best/worst values.
 */

import React from 'react';
import styled from 'styled-components';
import type { IBacktestBatchResults } from '../../../services/backtest/backtest-engine.interface';
import { formatDollar, formatPct, plColor, SectionTitle } from '../backtest-styled';

// ─── Styled ─────────────────────────────────────────────────────────────────

const ComparisonContainer = styled.div`
    margin: 24px 0;
`;

const ComparisonTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #1a1a2e;
    border-radius: 10px;
    overflow: hidden;
    font-size: 13px;
`;

const HeaderRow = styled.tr`
    background: #0d0d1a;
`;

const HeaderCell = styled.th`
    padding: 12px 14px;
    color: #888;
    font-weight: 500;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-align: center;
    border-bottom: 1px solid #2a2a3e;

    &:first-child {
        text-align: left;
        color: #ccc;
    }
`;

const MetricRow = styled.tr`
    border-bottom: 1px solid #1a1a2e;
    &:hover { background: rgba(74, 158, 255, 0.03); }
`;

const MetricLabel = styled.td`
    padding: 10px 14px;
    color: #aaa;
    font-weight: 500;
    font-size: 12px;
    white-space: nowrap;
`;

const MetricCell = styled.td<{ $isBest?: boolean; $isWorst?: boolean }>`
    padding: 10px 14px;
    text-align: center;
    font-weight: 600;
    font-size: 14px;
    color: ${p => p.$isBest ? '#4dff91' : p.$isWorst ? '#ff4d6d' : '#ccc'};
    background: ${p => p.$isBest ? 'rgba(77, 255, 145, 0.06)' : p.$isWorst ? 'rgba(255, 77, 109, 0.04)' : 'transparent'};
`;

const ScenarioLabel = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: #4a9eff;
`;

const ExecutionTime = styled.div`
    color: #555;
    font-size: 11px;
    margin-top: 8px;
    text-align: right;
`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricDef {
    label: string;
    getValue: (idx: number) => number;
    format: (v: number) => string;
    higherIsBetter: boolean; // true = green for max, false = green for min
}

// ─── Component ──────────────────────────────────────────────────────────────

interface BatchComparisonProps {
    batchResults: IBacktestBatchResults;
}

export const BatchComparisonComponent: React.FC<BatchComparisonProps> = ({ batchResults }) => {
    const { scenarios } = batchResults;
    if (scenarios.length === 0) return null;

    const metrics: MetricDef[] = [
        {
            label: 'Total P&L',
            getValue: i => scenarios[i].results.totalPL,
            format: v => formatDollar(v),
            higherIsBetter: true,
        },
        {
            label: 'Win Rate',
            getValue: i => scenarios[i].results.winRate,
            format: v => formatPct(v),
            higherIsBetter: true,
        },
        {
            label: 'Avg P&L / Trade',
            getValue: i => scenarios[i].results.averagePL,
            format: v => formatDollar(v),
            higherIsBetter: true,
        },
        {
            label: '# Trades',
            getValue: i => scenarios[i].results.totalTrades,
            format: v => v.toString(),
            higherIsBetter: false, // neutral — but fewer trades with same P&L is better
        },
        {
            label: 'Profit Factor',
            getValue: i => scenarios[i].results.profitFactor,
            format: v => v === Infinity ? '∞' : v.toFixed(2),
            higherIsBetter: true,
        },
        {
            label: 'Max Drawdown',
            getValue: i => scenarios[i].results.maxDrawdown,
            format: v => formatDollar(v),
            higherIsBetter: false, // lower drawdown = better
        },
        {
            label: 'Max DD %',
            getValue: i => scenarios[i].results.maxDrawdownPct,
            format: v => formatPct(v),
            higherIsBetter: false,
        },
        {
            label: 'Sharpe',
            getValue: i => scenarios[i].results.sharpeRatio,
            format: v => v.toFixed(2),
            higherIsBetter: true,
        },
        {
            label: 'Sortino',
            getValue: i => scenarios[i].results.sortinoRatio,
            format: v => v === Infinity ? '∞' : v.toFixed(2),
            higherIsBetter: true,
        },
        {
            label: 'Calmar',
            getValue: i => scenarios[i].results.calmarRatio,
            format: v => v.toFixed(2),
            higherIsBetter: true,
        },
        {
            label: 'Kelly %',
            getValue: i => scenarios[i].results.kellyFraction,
            format: v => formatPct(v),
            higherIsBetter: true,
        },
        {
            label: 'Largest Win',
            getValue: i => scenarios[i].results.largestWin,
            format: v => formatDollar(v),
            higherIsBetter: true,
        },
        {
            label: 'Largest Loss',
            getValue: i => scenarios[i].results.largestLoss,
            format: v => formatDollar(v),
            higherIsBetter: false, // less negative = better
        },
    ];

    const findBestWorst = (metric: MetricDef): { bestIdx: number; worstIdx: number } => {
        const values = scenarios.map((_, i) => metric.getValue(i));
        let bestIdx = 0;
        let worstIdx = 0;
        for (let i = 1; i < values.length; i++) {
            if (metric.higherIsBetter) {
                if (values[i] > values[bestIdx]) bestIdx = i;
                if (values[i] < values[worstIdx]) worstIdx = i;
            } else {
                if (values[i] < values[bestIdx]) bestIdx = i;
                if (values[i] > values[worstIdx]) worstIdx = i;
            }
        }
        // Don't highlight if all values are the same
        if (values[bestIdx] === values[worstIdx]) return { bestIdx: -1, worstIdx: -1 };
        return { bestIdx, worstIdx };
    };

    return (
        <ComparisonContainer>
            <SectionTitle>Batch Comparison</SectionTitle>
            <ComparisonTable>
                <thead>
                    <HeaderRow>
                        <HeaderCell>Metric</HeaderCell>
                        {scenarios.map(s => (
                            <HeaderCell key={s.label}>
                                <ScenarioLabel>{s.label}</ScenarioLabel>
                            </HeaderCell>
                        ))}
                    </HeaderRow>
                </thead>
                <tbody>
                    {metrics.map(metric => {
                        const { bestIdx, worstIdx } = findBestWorst(metric);
                        return (
                            <MetricRow key={metric.label}>
                                <MetricLabel>{metric.label}</MetricLabel>
                                {scenarios.map((_, i) => (
                                    <MetricCell
                                        key={i}
                                        $isBest={i === bestIdx}
                                        $isWorst={i === worstIdx}
                                    >
                                        {metric.format(metric.getValue(i))}
                                    </MetricCell>
                                ))}
                            </MetricRow>
                        );
                    })}
                </tbody>
            </ComparisonTable>
            <ExecutionTime>
                {scenarios.length} scenarios completed in {(batchResults.executionTimeMs / 1000).toFixed(1)}s
            </ExecutionTime>
        </ComparisonContainer>
    );
};

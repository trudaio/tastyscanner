/**
 * Monthly P&L Table — Backtest Results
 *
 * Renders a table of monthly performance breakdown.
 */

import React from 'react';
import {
    TableContainer, Table, Th, Td, formatPct, formatDollar, winRateColor, plColor,
} from '../backtest-styled';
import type { IMonthlyPL } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    monthlyBreakdown: IMonthlyPL[];
}

export const MonthlyTableComponent: React.FC<Props> = ({ monthlyBreakdown }) => (
    <TableContainer>
        <Table>
            <thead>
                <tr>
                    <Th>Month</Th>
                    <Th>Trades</Th>
                    <Th>Wins</Th>
                    <Th>Win Rate</Th>
                    <Th>P&L</Th>
                </tr>
            </thead>
            <tbody>
                {monthlyBreakdown.map(m => (
                    <tr key={m.month}>
                        <Td>{m.month}</Td>
                        <Td>{m.trades}</Td>
                        <Td>{m.wins}</Td>
                        <Td $color={winRateColor(m.winRate)}>{formatPct(m.winRate)}</Td>
                        <Td $color={plColor(m.totalPL)}>{formatDollar(m.totalPL)}</Td>
                    </tr>
                ))}
            </tbody>
        </Table>
    </TableContainer>
);

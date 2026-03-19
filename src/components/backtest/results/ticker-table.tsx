/**
 * Ticker P&L Table — Backtest Results
 *
 * Renders a table of per-ticker performance breakdown.
 */

import React from 'react';
import {
    TableContainer, Table, Th, Td, formatPct, formatDollar, winRateColor, plColor,
} from '../backtest-styled';
import type { ITickerPL } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    tickerBreakdown: ITickerPL[];
}

export const TickerTableComponent: React.FC<Props> = ({ tickerBreakdown }) => (
    <TableContainer>
        <Table>
            <thead>
                <tr>
                    <Th>Ticker</Th>
                    <Th>Trades</Th>
                    <Th>Wins</Th>
                    <Th>Win Rate</Th>
                    <Th>Total P&L</Th>
                    <Th>Avg P&L</Th>
                </tr>
            </thead>
            <tbody>
                {tickerBreakdown.map(t => (
                    <tr key={t.ticker}>
                        <Td><strong>{t.ticker}</strong></Td>
                        <Td>{t.trades}</Td>
                        <Td>{t.wins}</Td>
                        <Td $color={winRateColor(t.winRate)}>{formatPct(t.winRate)}</Td>
                        <Td $color={plColor(t.totalPL)}>{formatDollar(t.totalPL)}</Td>
                        <Td $color={plColor(t.averagePL)}>{formatDollar(t.averagePL)}</Td>
                    </tr>
                ))}
            </tbody>
        </Table>
    </TableContainer>
);

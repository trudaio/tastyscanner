/**
 * Trade History Table — Backtest Results
 *
 * Renders the full trade log with ticker filter chips.
 */

import React, { useState, useMemo } from 'react';
import {
    TableContainer, Table, Th, Td, Badge, ChipsRow, Chip,
    PanelHeader, PanelHeaderText, PanelHeaderTitle,
    formatDollar, plColor, EXIT_REASON_LABELS,
} from '../backtest-styled';
import type { IBacktestTrade } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    trades: IBacktestTrade[];
}

export const TradeHistoryTableComponent: React.FC<Props> = ({ trades }) => {
    const [tradeFilter, setTradeFilter] = useState<string>('ALL');

    const uniqueTickers = useMemo(
        () => Array.from(new Set(trades.map(t => t.ticker))).sort(),
        [trades],
    );

    const filteredTrades = useMemo(
        () => tradeFilter === 'ALL' ? trades : trades.filter(t => t.ticker === tradeFilter),
        [trades, tradeFilter],
    );

    return (
        <>
            <PanelHeader>
                <PanelHeaderTitle>Jurnal executii</PanelHeaderTitle>
                <PanelHeaderText>
                    Filtreaza rapid pe ticker si vezi unde iesirea vine din profit target, stop loss sau expirare.
                </PanelHeaderText>
            </PanelHeader>
            <ChipsRow>
                <Chip $active={tradeFilter === 'ALL'} onClick={() => setTradeFilter('ALL')}>ALL</Chip>
                {uniqueTickers.map(t => (
                    <Chip key={t} $active={tradeFilter === t} onClick={() => setTradeFilter(t)}>{t}</Chip>
                ))}
            </ChipsRow>
            <TableContainer>
                <Table>
                    <thead>
                        <tr>
                            <Th>#</Th>
                            <Th>Ticker</Th>
                            <Th>Entry</Th>
                            <Th>Exit</Th>
                            <Th>Reason</Th>
                            <Th>Put Spread</Th>
                            <Th>Call Spread</Th>
                            <Th>Credit</Th>
                            <Th>P&L</Th>
                            <Th>Days</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTrades.map((t: IBacktestTrade) => {
                            const reason = EXIT_REASON_LABELS[t.exitReason] || { label: t.exitReason, color: '#8a96ad' };
                            return (
                                <tr key={t.id}>
                                    <Td>{t.id}</Td>
                                    <Td><strong>{t.ticker}</strong></Td>
                                    <Td>{t.entryDate}</Td>
                                    <Td>{t.exitDate}</Td>
                                    <Td><Badge $color={reason.color}>{reason.label}</Badge></Td>
                                    <Td>{t.putBuyStrike}/{t.putSellStrike}</Td>
                                    <Td>{t.callSellStrike}/{t.callBuyStrike}</Td>
                                    <Td>{formatDollar(t.entryCredit)}</Td>
                                    <Td $color={plColor(t.pnl)}>{formatDollar(t.pnl)}</Td>
                                    <Td>{t.daysHeld}d</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableContainer>
        </>
    );
};

/**
 * Backtest Results — Wrapper Component
 *
 * Displays the full results panel: summary stat cards, equity curve,
 * monthly/ticker breakdowns, trade history, and execution time.
 */

import React, { useState } from 'react';
import {
    SectionTitle, CardsGrid, StatCard, StatLabel, StatValue,
    SaveRow, SaveInput, SaveButton, ProgressText,
    ResultsHeader, ResultsTitle, ResultsCaption, ResultsMetaRow, ResultsMetaChip,
    formatDollar, formatPct, plColor, winRateColor,
} from '../backtest-styled';
import type { IBacktestResults } from '../../../services/backtest/backtest-engine.interface';
import { EquityCurveChartComponent } from './equity-curve-chart';
import { MonthlyTableComponent } from './monthly-table';
import { TickerTableComponent } from './ticker-table';
import { TradeHistoryTableComponent } from './trade-history-table';

interface Props {
    results: IBacktestResults;
    onSave: (name: string) => void;
    isSaving: boolean;
}

export const BacktestResultsComponent: React.FC<Props> = ({ results: r, onSave, isSaving }) => {
    const [saveName, setSaveName] = useState('');

    const handleSave = () => {
        if (saveName.trim()) {
            onSave(saveName.trim());
            setSaveName('');
        }
    };

    return (
        <>
            <ResultsHeader>
                <ResultsTitle>Rezumat backtest</ResultsTitle>
                <ResultsCaption>
                    Rezultatele de mai jos iti arata repede daca setup-ul merita rafinat sau daca trebuie schimbata structura,
                    sizing-ul ori regulile de iesire.
                </ResultsCaption>
                <ResultsMetaRow>
                    <ResultsMetaChip>{r.totalTrades} trades</ResultsMetaChip>
                    <ResultsMetaChip>{r.params.startDate} → {r.params.endDate}</ResultsMetaChip>
                    <ResultsMetaChip>{r.params.tickers.join(', ')}</ResultsMetaChip>
                    <ResultsMetaChip>{r.params.batchProfitTargets?.length ? 'Batch mode' : 'Single run'}</ResultsMetaChip>
                </ResultsMetaRow>
            </ResultsHeader>

            <SaveRow>
                <SaveInput
                    placeholder="Salveaza acest run cu un nume clar..."
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                />
                <SaveButton
                    onClick={handleSave}
                    disabled={isSaving || !saveName.trim()}
                >
                    {isSaving ? 'Se salveaza...' : 'Salveaza'}
                </SaveButton>
            </SaveRow>

            <CardsGrid>
                <StatCard $color="#4a9eff">
                    <StatLabel>Total Trades</StatLabel>
                    <StatValue>{r.totalTrades}</StatValue>
                </StatCard>
                <StatCard $color={winRateColor(r.winRate)}>
                    <StatLabel>Win Rate</StatLabel>
                    <StatValue $color={winRateColor(r.winRate)}>{formatPct(r.winRate)}</StatValue>
                </StatCard>
                <StatCard $color={plColor(r.totalPL)}>
                    <StatLabel>Total P&L</StatLabel>
                    <StatValue $color={plColor(r.totalPL)}>{formatDollar(r.totalPL)}</StatValue>
                </StatCard>
                <StatCard $color={r.profitFactor > 1 ? '#4dff91' : '#ff4d6d'}>
                    <StatLabel>Profit Factor</StatLabel>
                    <StatValue $color={r.profitFactor > 1 ? '#4dff91' : '#ff4d6d'}>
                        {r.profitFactor === Infinity ? '\u221E' : r.profitFactor.toFixed(2)}
                    </StatValue>
                </StatCard>
                <StatCard $color="#ff4d6d">
                    <StatLabel>Max Drawdown</StatLabel>
                    <StatValue $color="#ff4d6d">
                        {formatDollar(r.maxDrawdown)} ({formatPct(r.maxDrawdownPct)})
                    </StatValue>
                </StatCard>
                <StatCard $color={r.sharpeRatio > 1 ? '#4dff91' : r.sharpeRatio > 0 ? '#ffd93d' : '#ff4d6d'}>
                    <StatLabel>Sharpe Ratio</StatLabel>
                    <StatValue $color={r.sharpeRatio > 1 ? '#4dff91' : r.sharpeRatio > 0 ? '#ffd93d' : '#ff4d6d'}>
                        {r.sharpeRatio.toFixed(2)}
                    </StatValue>
                </StatCard>
                <StatCard $color="#4a9eff">
                    <StatLabel>Kelly Fraction</StatLabel>
                    <StatValue>{formatPct(r.kellyFraction)}</StatValue>
                </StatCard>
                <StatCard $color={plColor(r.averagePL)}>
                    <StatLabel>Avg P&L / Trade</StatLabel>
                    <StatValue $color={plColor(r.averagePL)}>{formatDollar(r.averagePL)}</StatValue>
                </StatCard>
            </CardsGrid>

            <SectionTitle>Equity Curve</SectionTitle>
            <EquityCurveChartComponent equityCurve={r.equityCurve} />

            {r.monthlyBreakdown.length > 0 && (
                <>
                    <SectionTitle>Monthly P&L</SectionTitle>
                    <MonthlyTableComponent monthlyBreakdown={r.monthlyBreakdown} />
                </>
            )}

            {r.tickerBreakdown.length > 0 && (
                <>
                    <SectionTitle>Ticker P&L</SectionTitle>
                    <TickerTableComponent tickerBreakdown={r.tickerBreakdown} />
                </>
            )}

            <SectionTitle>Trade History ({r.trades.length} trades)</SectionTitle>
            <TradeHistoryTableComponent trades={r.trades} />

            <ProgressText>
                Backtest finalizat in {(r.executionTimeMs / 1000).toFixed(1)}s. Foloseste salvarea doar pentru variantele care chiar merita comparate sau reluate.
            </ProgressText>
        </>
    );
};

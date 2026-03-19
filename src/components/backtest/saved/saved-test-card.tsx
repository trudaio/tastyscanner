/**
 * Saved Test Card — Individual saved backtest summary card
 *
 * Displays name, meta info, key stats, and load/delete actions.
 */

import React from 'react';
import {
    SavedTestCard, SavedTestName, SavedTestMeta,
    SavedTestStats, SavedTestStatItem, SavedTestActions,
    LoadButton, DeleteButton,
    formatDollar, formatPct, winRateColor, plColor,
} from '../backtest-styled';
import type { ISavedBacktestSummary } from '../../../services/backtest/backtest-saved.interface';

interface Props {
    test: ISavedBacktestSummary;
    onLoad: (id: string) => void;
    onDelete: (id: string) => void;
}

export const SavedTestCardComponent: React.FC<Props> = ({ test, onLoad, onDelete }) => (
    <SavedTestCard>
        <SavedTestName>{test.name}</SavedTestName>
        <SavedTestMeta>
            {new Date(test.createdAt).toLocaleDateString()} — {test.tickers.join(', ')}
        </SavedTestMeta>
        <SavedTestStats>
            <SavedTestStatItem $color={winRateColor(test.winRate)}>
                <span>Win Rate</span>
                {formatPct(test.winRate)}
            </SavedTestStatItem>
            <SavedTestStatItem $color={plColor(test.totalPL)}>
                <span>Total P&L</span>
                {formatDollar(test.totalPL)}
            </SavedTestStatItem>
            <SavedTestStatItem $color={test.sharpeRatio > 1 ? '#4dff91' : test.sharpeRatio > 0 ? '#ffd93d' : '#ff4d6d'}>
                <span>Sharpe</span>
                {test.sharpeRatio.toFixed(2)}
            </SavedTestStatItem>
        </SavedTestStats>
        <SavedTestActions>
            <LoadButton onClick={() => onLoad(test.id)}>Load</LoadButton>
            <DeleteButton onClick={() => onDelete(test.id)}>Delete</DeleteButton>
        </SavedTestActions>
    </SavedTestCard>
);

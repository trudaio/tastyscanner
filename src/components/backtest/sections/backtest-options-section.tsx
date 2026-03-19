/**
 * BacktestOptionsSection — Test period, date range, description, excluded dates
 *
 * Test period chips auto-compute start/end dates for 1Y/2Y/3Y.
 * Custom mode shows manual date inputs.
 */

import React from 'react';
import {
    ParamsGrid,
    ParamGroup,
    ParamLabel,
    ParamInputOnCard,
    ParamTextarea,
    ChipsRow,
    Chip,
} from '../backtest-styled';

const PERIOD_OPTIONS: Array<{ value: '1Y' | '2Y' | '3Y' | 'custom'; label: string }> = [
    { value: '1Y', label: '1Y' },
    { value: '2Y', label: '2Y' },
    { value: '3Y', label: '3Y' },
    { value: 'custom', label: 'Custom' },
];

interface BacktestOptionsSectionProps {
    startDate: string;
    endDate: string;
    testPeriod: '1Y' | '2Y' | '3Y' | 'custom';
    description: string;
    excludedDates: string;
    onStartDateChange: (v: string) => void;
    onEndDateChange: (v: string) => void;
    onTestPeriodChange: (v: '1Y' | '2Y' | '3Y' | 'custom') => void;
    onDescriptionChange: (v: string) => void;
    onExcludedDatesChange: (v: string) => void;
}

export const BacktestOptionsSection: React.FC<BacktestOptionsSectionProps> = ({
    startDate,
    endDate,
    testPeriod,
    description,
    excludedDates,
    onStartDateChange,
    onEndDateChange,
    onTestPeriodChange,
    onDescriptionChange,
    onExcludedDatesChange,
}) => {
    const handlePeriodChange = (period: '1Y' | '2Y' | '3Y' | 'custom') => {
        onTestPeriodChange(period);

        if (period !== 'custom') {
            const now = new Date();
            const end = now.toISOString().split('T')[0];
            const start = new Date(now);

            if (period === '1Y') start.setFullYear(start.getFullYear() - 1);
            else if (period === '2Y') start.setFullYear(start.getFullYear() - 2);
            else if (period === '3Y') start.setFullYear(start.getFullYear() - 3);

            onStartDateChange(start.toISOString().split('T')[0]);
            onEndDateChange(end);
        }
    };

    return (
        <div>
            <ParamLabel>Test Period</ParamLabel>
            <ChipsRow style={{ marginTop: 6 }}>
                {PERIOD_OPTIONS.map(({ value, label }) => (
                    <Chip
                        key={value}
                        $active={testPeriod === value}
                        onClick={() => handlePeriodChange(value)}
                    >
                        {label}
                    </Chip>
                ))}
            </ChipsRow>

            {testPeriod === 'custom' && (
                <ParamsGrid>
                    <ParamGroup>
                        <ParamLabel>Start Date</ParamLabel>
                        <ParamInputOnCard
                            type="date"
                            value={startDate}
                            onChange={e => onStartDateChange(e.target.value)}
                        />
                    </ParamGroup>
                    <ParamGroup>
                        <ParamLabel>End Date</ParamLabel>
                        <ParamInputOnCard
                            type="date"
                            value={endDate}
                            onChange={e => onEndDateChange(e.target.value)}
                        />
                    </ParamGroup>
                </ParamsGrid>
            )}

            <ParamsGrid>
                <ParamGroup>
                    <ParamLabel>Description</ParamLabel>
                    <ParamTextarea
                        value={description}
                        onChange={e => onDescriptionChange(e.target.value)}
                        placeholder="Optional test name"
                        rows={2}
                    />
                </ParamGroup>

                <ParamGroup>
                    <ParamLabel>Excluded Dates</ParamLabel>
                    <ParamTextarea
                        value={excludedDates}
                        onChange={e => onExcludedDatesChange(e.target.value)}
                        placeholder="YYYY-MM-DD separated by space"
                        rows={2}
                    />
                </ParamGroup>
            </ParamsGrid>
        </div>
    );
};

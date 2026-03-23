/**
 * StrategySetupSection — Strategy type, ticker selection, IC type
 *
 * Always visible (no collapsible card wrapper).
 */

import React from 'react';
import {
    ParamsGrid,
    ParamGroup,
    ParamLabel,
    ParamInput,
    ChipsRow,
    Chip,
} from '../backtest-styled';

const AVAILABLE_TICKERS = ['SPX', 'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOG', 'TSLA'];

const LADDERING_MODES: Array<{ value: 'single' | 'fill-all'; label: string; desc: string }> = [
    { value: 'single', label: 'Single', desc: '1 IC per ticker per day' },
    { value: 'fill-all', label: 'Fill-All', desc: 'IC at every expiration in DTE range' },
];

const IC_TYPES: Array<{ value: 'symmetric' | 'bullish' | 'bearish'; label: string }> = [
    { value: 'symmetric', label: 'Symmetric' },
    { value: 'bullish', label: 'Bullish' },
    { value: 'bearish', label: 'Bearish' },
];

interface StrategySetupSectionProps {
    tickers: string[];
    icType: 'symmetric' | 'bullish' | 'bearish';
    minDTE: number;
    maxDTE: number;
    ladderingMode: 'single' | 'fill-all';
    minIVRank: number;
    onTickerToggle: (t: string) => void;
    onIcTypeChange: (v: 'symmetric' | 'bullish' | 'bearish') => void;
    onMinDTEChange: (v: number) => void;
    onMaxDTEChange: (v: number) => void;
    onLadderingModeChange: (v: 'single' | 'fill-all') => void;
    onMinIVRankChange: (v: number) => void;
}

export const StrategySetupSection: React.FC<StrategySetupSectionProps> = ({
    tickers,
    icType,
    minDTE,
    maxDTE,
    ladderingMode,
    minIVRank,
    onTickerToggle,
    onIcTypeChange,
    onMinDTEChange,
    onMaxDTEChange,
    onLadderingModeChange,
    onMinIVRankChange,
}) => {
    return (
        <div>
            <ParamLabel>Tickers</ParamLabel>
            <ChipsRow style={{ marginTop: 6 }}>
                {AVAILABLE_TICKERS.map(t => (
                    <Chip
                        key={t}
                        $active={tickers.includes(t)}
                        onClick={() => onTickerToggle(t)}
                    >
                        {t}
                    </Chip>
                ))}
            </ChipsRow>

            <ParamsGrid>
                <ParamGroup>
                    <ParamLabel>Expiration — Min DTE</ParamLabel>
                    <ParamInput
                        type="number"
                        value={minDTE}
                        min={0}
                        onChange={e => onMinDTEChange(Number(e.target.value))}
                    />
                </ParamGroup>
                <ParamGroup>
                    <ParamLabel>Max DTE</ParamLabel>
                    <ParamInput
                        type="number"
                        value={maxDTE}
                        min={0}
                        onChange={e => onMaxDTEChange(Number(e.target.value))}
                    />
                </ParamGroup>
                <ParamGroup>
                    <ParamLabel>Min IV Rank</ParamLabel>
                    <ParamInput
                        type="number"
                        value={minIVRank}
                        min={0}
                        max={100}
                        onChange={e => onMinIVRankChange(Number(e.target.value))}
                        placeholder="0 = off"
                    />
                </ParamGroup>
            </ParamsGrid>

            <ParamLabel>IC Type</ParamLabel>
            <ChipsRow style={{ marginTop: 6 }}>
                {IC_TYPES.map(({ value, label }) => (
                    <Chip
                        key={value}
                        $active={icType === value}
                        onClick={() => onIcTypeChange(value)}
                    >
                        {label}
                    </Chip>
                ))}
            </ChipsRow>

            <ParamLabel>Laddering Mode</ParamLabel>
            <ChipsRow style={{ marginTop: 6 }}>
                {LADDERING_MODES.map(({ value, label }) => (
                    <Chip
                        key={value}
                        $active={ladderingMode === value}
                        onClick={() => onLadderingModeChange(value)}
                    >
                        {label}
                    </Chip>
                ))}
            </ChipsRow>
            {ladderingMode === 'fill-all' && (
                <div style={{ color: '#888', fontSize: 11, marginTop: -6, marginBottom: 12 }}>
                    Opens IC at every available expiration in DTE range. Day 1 fills all expirations; replaces at furthest DTE when one closes.
                </div>
            )}
        </div>
    );
};

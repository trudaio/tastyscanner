/**
 * CapitalSection — Starting capital, max position size, max open positions
 *
 * No card wrapper — parent handles CollapsibleCard.
 */

import React from 'react';
import {
    ParamsGrid,
    ParamGroup,
    ParamLabel,
    ParamInputOnCard,
} from '../backtest-styled';

interface CapitalSectionProps {
    capital: number;
    maxPositionPct: number;
    maxOpenPositions: number;
    contractsPerPosition: number;
    onCapitalChange: (v: number) => void;
    onMaxPositionPctChange: (v: number) => void;
    onMaxOpenPositionsChange: (v: number) => void;
    onContractsPerPositionChange: (v: number) => void;
}

export const CapitalSection: React.FC<CapitalSectionProps> = ({
    capital,
    maxPositionPct,
    maxOpenPositions,
    contractsPerPosition,
    onCapitalChange,
    onMaxPositionPctChange,
    onMaxOpenPositionsChange,
    onContractsPerPositionChange,
}) => {
    const handleNumber = (cb: (v: number) => void) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) cb(val);
        };

    return (
        <ParamsGrid>
            <ParamGroup>
                <ParamLabel>Capital ($)</ParamLabel>
                <ParamInputOnCard
                    type="number"
                    value={capital}
                    onChange={handleNumber(onCapitalChange)}
                />
            </ParamGroup>

            <ParamGroup>
                <ParamLabel>Max Position Size (%)</ParamLabel>
                <ParamInputOnCard
                    type="number"
                    value={maxPositionPct}
                    onChange={handleNumber(onMaxPositionPctChange)}
                />
            </ParamGroup>

            <ParamGroup>
                <ParamLabel>Max Open Positions</ParamLabel>
                <ParamInputOnCard
                    type="number"
                    value={maxOpenPositions}
                    onChange={handleNumber(onMaxOpenPositionsChange)}
                />
            </ParamGroup>

            <ParamGroup>
                <ParamLabel>Contracts per Position</ParamLabel>
                <ParamInputOnCard
                    type="number"
                    value={contractsPerPosition}
                    min={1}
                    onChange={handleNumber(onContractsPerPositionChange)}
                />
            </ParamGroup>
        </ParamsGrid>
    );
};

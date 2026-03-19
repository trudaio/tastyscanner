/**
 * PositionEntrySection — Slippage, commission, risk-free rate
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

interface PositionEntrySectionProps {
    slippage: number;
    commissionPerContract: number;
    riskFreeRate: number;
    onSlippageChange: (v: number) => void;
    onCommissionPerContractChange: (v: number) => void;
    onRiskFreeRateChange: (v: number) => void;
}

export const PositionEntrySection: React.FC<PositionEntrySectionProps> = ({
    slippage,
    commissionPerContract,
    riskFreeRate,
    onSlippageChange,
    onCommissionPerContractChange,
    onRiskFreeRateChange,
}) => {
    const handleNumber = (cb: (v: number) => void) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) cb(val);
        };

    return (
        <div>
            <ParamsGrid>
                <ParamGroup>
                    <ParamLabel>Slippage ($/share)</ParamLabel>
                    <ParamInputOnCard
                        type="number"
                        step={0.01}
                        value={slippage}
                        onChange={handleNumber(onSlippageChange)}
                    />
                </ParamGroup>

                <ParamGroup>
                    <ParamLabel>Commission ($/contract)</ParamLabel>
                    <ParamInputOnCard
                        type="number"
                        step={0.50}
                        value={commissionPerContract}
                        onChange={handleNumber(onCommissionPerContractChange)}
                    />
                </ParamGroup>

                <ParamGroup>
                    <ParamLabel>Risk-Free Rate (%)</ParamLabel>
                    <ParamInputOnCard
                        type="number"
                        step={0.01}
                        value={riskFreeRate}
                        onChange={handleNumber(onRiskFreeRateChange)}
                    />
                </ParamGroup>
            </ParamsGrid>

            <div style={{ color: 'var(--app-text-muted)', fontSize: 12, marginTop: 4 }}>
                Entry: 1 hour after market open (daily data)
            </div>
        </div>
    );
};

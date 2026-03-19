/**
 * ExitOptionsSection — Profit target, stop loss, close-at-DTE toggles + batch mode
 *
 * Each exit rule has an on/off toggle chip and a number input (visible when on).
 * Batch mode allows testing multiple profit target scenarios simultaneously.
 */

import React from 'react';
import styled from 'styled-components';
import {
    ParamLabel,
    ParamInputOnCard,
    Chip,
    ChipsRow,
} from '../backtest-styled';

// ─── Local styled components for exit rule rows ─────────────────────────────

const ExitRuleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--app-border);
    &:last-child { border-bottom: none; }
`;

const ExitRuleLabel = styled.div`
    color: var(--app-text-soft);
    font-size: 13px;
    font-weight: 500;
    min-width: 120px;
`;

const ExitRuleValue = styled.div`
    color: var(--app-text-muted);
    font-size: 13px;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const DisabledText = styled.span`
    color: var(--app-text-muted);
    font-size: 13px;
    font-style: italic;
`;

const BatchBox = styled.div`
    background: rgba(103, 168, 255, 0.08);
    border: 1px solid rgba(103, 168, 255, 0.2);
    border-radius: 14px;
    padding: 12px;
    margin-top: 12px;
`;

const BatchLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    margin-bottom: 8px;
`;

// ─── Constants ──────────────────────────────────────────────────────────────

const BATCH_OPTIONS = [
    { value: 9999, label: 'Expire' },
    { value: 70, label: '70%' },
    { value: 85, label: '85%' },
    { value: 90, label: '90%' },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface ExitOptionsSectionProps {
    profitTarget: number;
    stopLoss: number;
    closeDTE: number;
    profitTargetEnabled: boolean;
    stopLossEnabled: boolean;
    closeDTEEnabled: boolean;
    batchMode: boolean;
    batchTargets: number[];
    onProfitTargetChange: (v: number) => void;
    onStopLossChange: (v: number) => void;
    onCloseDTEChange: (v: number) => void;
    onProfitTargetEnabledChange: (v: boolean) => void;
    onStopLossEnabledChange: (v: boolean) => void;
    onCloseDTEEnabledChange: (v: boolean) => void;
    onBatchModeChange: (v: boolean) => void;
    onBatchTargetsChange: (v: number[]) => void;
}

export const ExitOptionsSection: React.FC<ExitOptionsSectionProps> = ({
    profitTarget,
    stopLoss,
    closeDTE,
    profitTargetEnabled,
    stopLossEnabled,
    closeDTEEnabled,
    batchMode,
    batchTargets,
    onProfitTargetChange,
    onStopLossChange,
    onCloseDTEChange,
    onProfitTargetEnabledChange,
    onStopLossEnabledChange,
    onCloseDTEEnabledChange,
    onBatchModeChange,
    onBatchTargetsChange,
}) => {
    const handleNumber = (cb: (v: number) => void) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) cb(val);
        };

    const toggleBatchTarget = (val: number) => {
        if (batchTargets.includes(val)) {
            // Don't allow removing last target
            if (batchTargets.length <= 1) return;
            onBatchTargetsChange(batchTargets.filter(t => t !== val));
        } else {
            onBatchTargetsChange([...batchTargets, val]);
        }
    };

    return (
        <div>
            {/* Profit Target */}
            <ExitRuleRow>
                <ExitRuleLabel>Profit Target (%)</ExitRuleLabel>
                <Chip
                    $active={profitTargetEnabled && !batchMode}
                    onClick={() => !batchMode && onProfitTargetEnabledChange(!profitTargetEnabled)}
                    style={{ fontSize: 11, padding: '3px 10px', opacity: batchMode ? 0.5 : 1 }}
                >
                    {profitTargetEnabled && !batchMode ? 'On' : 'Off'}
                </Chip>
                <ExitRuleValue>
                    {profitTargetEnabled && !batchMode ? (
                        <ParamInputOnCard
                            type="number"
                            value={profitTarget}
                            onChange={handleNumber(onProfitTargetChange)}
                            style={{ width: 100 }}
                        />
                    ) : batchMode ? (
                        <DisabledText>Controlled by batch mode</DisabledText>
                    ) : (
                        <DisabledText>None</DisabledText>
                    )}
                </ExitRuleValue>
            </ExitRuleRow>

            {/* Stop Loss */}
            <ExitRuleRow>
                <ExitRuleLabel>Stop Loss (%)</ExitRuleLabel>
                <Chip
                    $active={stopLossEnabled}
                    onClick={() => onStopLossEnabledChange(!stopLossEnabled)}
                    style={{ fontSize: 11, padding: '3px 10px' }}
                >
                    {stopLossEnabled ? 'On' : 'Off'}
                </Chip>
                <ExitRuleValue>
                    {stopLossEnabled ? (
                        <ParamInputOnCard
                            type="number"
                            value={stopLoss}
                            onChange={handleNumber(onStopLossChange)}
                            style={{ width: 100 }}
                        />
                    ) : (
                        <DisabledText>None</DisabledText>
                    )}
                </ExitRuleValue>
            </ExitRuleRow>

            {/* Close at DTE */}
            <ExitRuleRow>
                <ExitRuleLabel>Close at DTE</ExitRuleLabel>
                <Chip
                    $active={closeDTEEnabled}
                    onClick={() => onCloseDTEEnabledChange(!closeDTEEnabled)}
                    style={{ fontSize: 11, padding: '3px 10px' }}
                >
                    {closeDTEEnabled ? 'On' : 'Off'}
                </Chip>
                <ExitRuleValue>
                    {closeDTEEnabled ? (
                        <ParamInputOnCard
                            type="number"
                            value={closeDTE}
                            onChange={handleNumber(onCloseDTEChange)}
                            style={{ width: 100 }}
                        />
                    ) : (
                        <DisabledText>None</DisabledText>
                    )}
                </ExitRuleValue>
            </ExitRuleRow>

            {/* Batch Mode */}
            <ExitRuleRow style={{ borderBottom: 'none' }}>
                <ExitRuleLabel>Batch Compare</ExitRuleLabel>
                <Chip
                    $active={batchMode}
                    onClick={() => onBatchModeChange(!batchMode)}
                    style={{ fontSize: 11, padding: '3px 10px' }}
                >
                    {batchMode ? 'On' : 'Off'}
                </Chip>
                <ExitRuleValue>
                    {batchMode ? (
                        <span style={{ color: '#4a9eff', fontSize: 12 }}>
                            Run {batchTargets.length} scenarios and compare
                        </span>
                    ) : (
                        <DisabledText>Test multiple profit targets at once</DisabledText>
                    )}
                </ExitRuleValue>
            </ExitRuleRow>

            {batchMode && (
                <BatchBox>
                    <BatchLabel>Select profit target scenarios to compare:</BatchLabel>
                    <ChipsRow>
                        {BATCH_OPTIONS.map(opt => (
                            <Chip
                                key={opt.value}
                                $active={batchTargets.includes(opt.value)}
                                onClick={() => toggleBatchTarget(opt.value)}
                            >
                                {opt.label}
                            </Chip>
                        ))}
                    </ChipsRow>
                </BatchBox>
            )}
        </div>
    );
};

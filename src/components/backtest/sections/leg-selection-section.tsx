/**
 * LegSelectionSection — 4-leg IC visualization with delta/wing inputs
 *
 * Shows short put, short call (sell rows) and long put, long call (buy rows)
 * with selection criteria and descriptions.
 */

import React from 'react';
import {
    LegTable,
    LegRow,
    LegLabel,
    LegCriteria,
    LegValue,
    ParamInputOnCard,
    ParamLabel,
    Chip,
    ChipsRow,
} from '../backtest-styled';

interface LegSelectionSectionProps {
    targetDelta: number;
    wingWidth: number;
    icType: 'symmetric' | 'bullish' | 'bearish';
    asymmetricDelta: boolean;
    putTargetDelta: number;
    callTargetDelta: number;
    onTargetDeltaChange: (v: number) => void;
    onWingWidthChange: (v: number) => void;
    onAsymmetricDeltaChange: (v: boolean) => void;
    onPutTargetDeltaChange: (v: number) => void;
    onCallTargetDeltaChange: (v: number) => void;
}

export const LegSelectionSection: React.FC<LegSelectionSectionProps> = ({
    targetDelta,
    wingWidth,
    icType,
    asymmetricDelta,
    putTargetDelta,
    callTargetDelta,
    onTargetDeltaChange,
    onWingWidthChange,
    onAsymmetricDeltaChange,
    onPutTargetDeltaChange,
    onCallTargetDeltaChange,
}) => {
    const handleDeltaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onTargetDeltaChange(val);
    };

    const handleWingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onWingWidthChange(val);
    };

    const handlePutDeltaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onPutTargetDeltaChange(val);
    };

    const handleCallDeltaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onCallTargetDeltaChange(val);
    };

    const putDelta = asymmetricDelta ? putTargetDelta : targetDelta;
    const callDelta = asymmetricDelta ? callTargetDelta : targetDelta;
    const callDeltaDisplay = !asymmetricDelta && icType !== 'symmetric'
        ? 'Auto (IC type)'
        : null;

    return (
        <>
            <div style={{ marginBottom: 12 }}>
                <ParamLabel>Delta Mode</ParamLabel>
                <ChipsRow style={{ marginTop: 6 }}>
                    <Chip $active={!asymmetricDelta} onClick={() => onAsymmetricDeltaChange(false)}>
                        Symmetric
                    </Chip>
                    <Chip $active={asymmetricDelta} onClick={() => onAsymmetricDeltaChange(true)}>
                        Asymmetric
                    </Chip>
                </ChipsRow>
                {asymmetricDelta && (
                    <div style={{ color: '#888', fontSize: 11, marginTop: -6, marginBottom: 8 }}>
                        Different delta targets for put and call sides (e.g., 20 put / 15 call)
                    </div>
                )}
            </div>

            <LegTable>
                {/* Short Put — Sell */}
                <LegRow $type="sell">
                    <LegLabel $type="sell">Short Put</LegLabel>
                    <LegCriteria>
                        <span>By Delta</span>
                        {asymmetricDelta ? (
                            <ParamInputOnCard
                                type="number"
                                value={putTargetDelta}
                                onChange={handlePutDeltaChange}
                                style={{ width: 80 }}
                            />
                        ) : (
                            <ParamInputOnCard
                                type="number"
                                value={targetDelta}
                                onChange={handleDeltaChange}
                                style={{ width: 80 }}
                            />
                        )}
                    </LegCriteria>
                    <LegValue>Sell OTM Put (~{putDelta}Δ)</LegValue>
                </LegRow>

                {/* Short Call — Sell */}
                <LegRow $type="sell">
                    <LegLabel $type="sell">Short Call</LegLabel>
                    <LegCriteria>
                        <span>By Delta</span>
                        {asymmetricDelta ? (
                            <ParamInputOnCard
                                type="number"
                                value={callTargetDelta}
                                onChange={handleCallDeltaChange}
                                style={{ width: 80 }}
                            />
                        ) : callDeltaDisplay ? (
                            <span style={{ color: '#888', fontSize: 13 }}>{callDeltaDisplay}</span>
                        ) : (
                            <span style={{ color: '#fff', fontSize: 13 }}>{targetDelta}</span>
                        )}
                    </LegCriteria>
                    <LegValue>Sell OTM Call (~{callDelta}Δ)</LegValue>
                </LegRow>

                {/* Long Put — Buy */}
                <LegRow $type="buy">
                    <LegLabel $type="buy">Long Put</LegLabel>
                    <LegCriteria>
                        <span>Wing Width</span>
                        <ParamInputOnCard
                            type="number"
                            value={wingWidth}
                            onChange={handleWingChange}
                            style={{ width: 80 }}
                        />
                    </LegCriteria>
                    <LegValue>${wingWidth} below short put</LegValue>
                </LegRow>

                {/* Long Call — Buy */}
                <LegRow $type="buy">
                    <LegLabel $type="buy">Long Call</LegLabel>
                    <LegCriteria>
                        <span>Wing Width</span>
                        <span style={{ color: '#fff', fontSize: 13 }}>${wingWidth}</span>
                    </LegCriteria>
                    <LegValue>${wingWidth} above short call</LegValue>
                </LegRow>
            </LegTable>
        </>
    );
};

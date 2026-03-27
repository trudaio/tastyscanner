import React, {useEffect, useMemo, useState} from "react";
import {observer} from "mobx-react-lite";
import {useServices} from "../../hooks/use-services.hook";
import {IonChip, IonInput, IonSegment, IonSegmentButton, IonLabel, IonSpinner} from "@ionic/react";
import styled from "styled-components";
import {TickerModel} from "../../models/ticker.model";
import {OptionModel} from "../../models/option.model";
import {
    IStrategyDefinition,
    IStrategyResult,
    DEFAULT_STRATEGIES,
} from "./dte-strategy-simulator.interface";
import {DteStrategySimulatorChartComponent} from "./dte-strategy-simulator-chart.component";

const TICKERS = ['SPX', 'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOG', 'TSLA'];

// ─── Styled Components ──────────────────────────────────────────────────────

const ContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 16px;
    max-width: 1100px;
    margin: 0 auto;
`

const ControlsBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
`

const ChipsBox = styled.div`
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
`

const StrategiesRowBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: stretch;
`

const StrategyCardBox = styled.div<{$color: string; $editing: boolean}>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid ${p => p.$editing ? p.$color : '#e8ecf1'};
    background: ${p => p.$editing ? `${p.$color}0d` : '#ffffff'};
    cursor: pointer;
    transition: all 0.15s;
    min-width: 160px;
    position: relative;

    &:hover {
        border-color: ${p => p.$color};
    }
`

const StrategyHeaderRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`

const StrategyColorDot = styled.span<{$color: string}>`
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${p => p.$color};
    flex-shrink: 0;
`

const StrategyLabel = styled.span`
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ion-text-color);
`

const StrategyDteLabel = styled.span`
    font-size: 0.75rem;
    color: var(--ion-color-medium);
`

const RemoveButton = styled.button`
    background: none;
    border: none;
    font-size: 0.85rem;
    color: var(--ion-color-medium);
    cursor: pointer;
    padding: 0;
    line-height: 1;
    &:hover { color: #e53935; }
`

const AddButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    min-height: 80px;
    border-radius: 10px;
    border: 1px dashed #e8ecf1;
    background: #ffffff;
    font-size: 1.4rem;
    color: var(--ion-color-medium);
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
        border-color: #1a73e8;
        color: #1a73e8;
    }
`

const EditRowBox = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--ion-color-medium);
`

const EditDteInput = styled(IonInput)`
    width: 48px;
    --padding-start: 4px;
    --padding-end: 4px;
    border: 1px solid var(--ion-color-light-shade);
    border-radius: 4px;
    font-size: 0.8rem;
    text-align: center;
`

const EditLabelBox = styled.span`
    font-size: 0.65rem;
    color: var(--ion-color-medium);
    text-transform: uppercase;
    font-weight: 600;
`

const TableContainerBox = styled.div`
    overflow-x: auto;
`

const ComparisonTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;

    th, td {
        padding: 8px 12px;
        text-align: right;
        border-bottom: 1px solid rgba(var(--ion-color-medium-rgb), 0.15);
        white-space: nowrap;
    }

    th {
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--ion-color-medium);
        font-weight: 600;
    }

    th:first-child, td:first-child {
        text-align: left;
        font-weight: 600;
        color: var(--ion-color-medium);
        font-size: 0.75rem;
    }
`

const BestCell = styled.td`
    color: #16a34a;
    font-weight: 700;
`

const WinnerBox = styled.div`
    padding: 12px 16px;
    background: rgba(var(--ion-color-success-rgb), 0.08);
    border: 1px solid rgba(var(--ion-color-success-rgb), 0.2);
    border-radius: 10px;
    font-size: 0.85rem;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 4px;
`

const WinnerLabel = styled.span`
    font-size: 0.75rem;
    color: var(--ion-color-medium);
    text-transform: uppercase;
    font-weight: 600;
`

const NoDataBox = styled.div`
    display: flex;
    justify-content: center;
    padding: 48px;
    color: var(--ion-color-medium);
    font-size: 0.9rem;
`

const InfoBox = styled.div`
    padding: 12px 16px;
    background: rgba(var(--ion-color-primary-rgb), 0.08);
    border-radius: 8px;
    font-size: 0.85rem;
    color: var(--ion-color-medium);
    line-height: 1.5;
`

// ─── Custom Colors for new strategies ───────────────────────────────────────

const CUSTOM_COLORS = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ─── Build Strategy Results ─────────────────────────────────────────────────

function buildStrategyResults(
    ticker: TickerModel,
    strategies: IStrategyDefinition[],
    side: 'PUT' | 'CALL',
): IStrategyResult[] {
    const expirations = ticker.expirations;
    if (expirations.length === 0) return [];

    return strategies.map((strategy): IStrategyResult => {
        const empty: IStrategyResult = {
            strategy,
            entryDte: strategy.entryDte,
            entryStrike: 0, entryPremium: 0, entryDelta: 0, entryTheta: 0, entryGamma: 0,
            exitDte: strategy.exitDte,
            exitPremium: 0, exitDelta: 0, exitTheta: 0, exitGamma: 0,
            capturedPremium: 0, capturePercent: 0, daysInTrade: 0, capturedPerDay: 0,
            thetaEfficiency: 0, gammaRisk: 0, riskAdjustedScore: 0, found: false,
        };

        // Find expiration closest to entryDte
        const entryExp = expirations.reduce((best, exp) =>
            Math.abs(exp.daysToExpiration - strategy.entryDte) < Math.abs(best.daysToExpiration - strategy.entryDte) ? exp : best
        );

        // Get OTM options — use strategy's own delta (±3 range)
        const targetDelta = strategy.delta;
        const deltaMin = Math.max(targetDelta - 3, 1);
        const deltaMax = targetDelta + 3;

        const options: OptionModel[] = side === 'PUT' ? entryExp.getOTMPuts() : entryExp.getOTMCalls();
        const inRange = options.filter(opt => {
            const absDelta = opt.absoluteDeltaPercent;
            return absDelta >= deltaMin && absDelta <= deltaMax && opt.midPrice > 0;
        });

        const bestOption = inRange.reduce<OptionModel | null>((closest, opt) => {
            if (!closest) return opt;
            return Math.abs(opt.absoluteDeltaPercent - targetDelta) < Math.abs(closest.absoluteDeltaPercent - targetDelta) ? opt : closest;
        }, null);

        if (!bestOption) return empty;
        const entryGreeks = bestOption.greeksData;
        if (!entryGreeks) return empty;

        const strikePrice = bestOption.strikePrice;
        const entryPremium = bestOption.midPrice;
        const entryDelta = bestOption.absoluteDeltaPercent;
        const entryTheta = Math.abs(entryGreeks.theta);
        const entryGamma = Math.abs(entryGreeks.gamma);

        // Find expiration closest to exitDte
        const exitExp = expirations.reduce((best, exp) =>
            Math.abs(exp.daysToExpiration - strategy.exitDte) < Math.abs(best.daysToExpiration - strategy.exitDte) ? exp : best
        );

        // Look up the same strike in exit expiration
        let exitStrike = exitExp.getStrikeByPrice(strikePrice) ?? null;
        if (!exitStrike) {
            exitStrike = exitExp.getStrikeBelow(strikePrice) ?? exitExp.getStrikeAbove(strikePrice);
        }
        if (!exitStrike) return empty;

        const exitOption = side === 'PUT' ? exitStrike.put : exitStrike.call;
        if (!exitOption || exitOption.midPrice <= 0) return empty;
        const exitGreeks = exitOption.greeksData;
        if (!exitGreeks) return empty;

        const exitPremium = exitOption.midPrice;
        const exitDelta = exitOption.absoluteDeltaPercent;
        const exitTheta = Math.abs(exitGreeks.theta);
        const exitGamma = Math.abs(exitGreeks.gamma);

        const capturedPremium = Math.round((entryPremium - exitPremium) * 100) / 100;
        const capturePercent = entryPremium > 0 ? Math.round((capturedPremium / entryPremium) * 10000) / 100 : 0;
        const daysInTrade = Math.max(entryExp.daysToExpiration - exitExp.daysToExpiration, 1);
        const capturedPerDay = Math.round((capturedPremium / daysInTrade) * 100) / 100;
        const thetaEfficiency = entryGamma > 0 ? Math.round((entryTheta / entryGamma) * 100) / 100 : 0;
        const gammaRisk = Math.round(entryGamma * 10000) / 10000;
        const riskAdjustedScore = gammaRisk > 0 ? Math.round((capturedPerDay / gammaRisk) * 100) / 100 : 0;

        return {
            strategy,
            entryDte: entryExp.daysToExpiration, entryStrike: strikePrice,
            entryPremium, entryDelta,
            entryTheta: Math.round(entryTheta * 100) / 100,
            entryGamma: Math.round(entryGamma * 10000) / 10000,
            exitDte: exitExp.daysToExpiration, exitPremium, exitDelta,
            exitTheta: Math.round(exitTheta * 100) / 100,
            exitGamma: Math.round(exitGamma * 10000) / 10000,
            capturedPremium, capturePercent, daysInTrade, capturedPerDay,
            thetaEfficiency, gammaRisk, riskAdjustedScore,
            found: true,
        };
    });
}

// ─── Metric rows definition ────────────────────────────────────────────────

interface MetricRow {
    label: string;
    getValue: (r: IStrategyResult) => string;
    getNumeric: (r: IStrategyResult) => number;
    higherIsBetter: boolean;
}

const METRIC_ROWS: MetricRow[] = [
    {label: 'Entry DTE', getValue: r => `${r.entryDte}d`, getNumeric: () => 0, higherIsBetter: false},
    {label: 'Exit DTE', getValue: r => `${r.exitDte}d`, getNumeric: () => 0, higherIsBetter: false},
    {label: 'Days in Trade', getValue: r => `${r.daysInTrade}d`, getNumeric: r => r.daysInTrade, higherIsBetter: false},
    {label: 'Delta', getValue: r => `${r.entryDelta}`, getNumeric: () => 0, higherIsBetter: false},
    {label: 'Strike', getValue: r => `${r.entryStrike}`, getNumeric: () => 0, higherIsBetter: false},
    {label: 'Entry Premium', getValue: r => `$${r.entryPremium.toFixed(2)}`, getNumeric: r => r.entryPremium, higherIsBetter: true},
    {label: 'Exit Premium', getValue: r => `$${r.exitPremium.toFixed(2)}`, getNumeric: r => r.exitPremium, higherIsBetter: false},
    {label: 'Captured', getValue: r => `$${r.capturedPremium.toFixed(2)}`, getNumeric: r => r.capturedPremium, higherIsBetter: true},
    {label: 'Capture %', getValue: r => `${r.capturePercent.toFixed(1)}%`, getNumeric: r => r.capturePercent, higherIsBetter: true},
    {label: '$/Day', getValue: r => `$${r.capturedPerDay.toFixed(2)}`, getNumeric: r => r.capturedPerDay, higherIsBetter: true},
    {label: 'Theta@Entry', getValue: r => `${r.entryTheta.toFixed(2)}`, getNumeric: r => r.entryTheta, higherIsBetter: true},
    {label: 'Gamma@Entry', getValue: r => `${r.entryGamma.toFixed(4)}`, getNumeric: r => r.entryGamma, higherIsBetter: false},
    {label: 'θ/γ Ratio', getValue: r => `${r.thetaEfficiency.toFixed(1)}`, getNumeric: r => r.thetaEfficiency, higherIsBetter: true},
    {label: 'Risk-Adj Score', getValue: r => `${r.riskAdjustedScore.toFixed(1)}`, getNumeric: r => r.riskAdjustedScore, higherIsBetter: true},
];

const HIGHLIGHT_LABELS = new Set([
    'Days in Trade', 'Entry Premium', 'Exit Premium', 'Captured', 'Capture %',
    '$/Day', 'Theta@Entry', 'Gamma@Entry', 'θ/γ Ratio', 'Risk-Adj Score',
]);

// ─── Component (standalone page) ────────────────────────────────────────────

export const DteStrategySimulatorComponent: React.FC = observer(() => {
    const services = useServices();
    const [selectedTicker, setSelectedTicker] = useState<string>('SPX');
    const [side, setSide] = useState<'PUT' | 'CALL'>('PUT');
    const [ticker, setTicker] = useState<TickerModel | null>(null);
    const [loading, setLoading] = useState(false);
    const [strategies, setStrategies] = useState<IStrategyDefinition[]>(() => [...DEFAULT_STRATEGIES]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Load ticker
    useEffect(() => {
        let cancelled = false;
        const loadTicker = async () => {
            setLoading(true);
            if (ticker) await ticker.stop();
            const newTicker = new TickerModel(selectedTicker, services);
            await newTicker.start();
            if (!cancelled) { setTicker(newTicker); setLoading(false); }
        };
        loadTicker();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTicker, services]);

    useEffect(() => {
        return () => { if (ticker) ticker.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const results = useMemo(() => {
        if (!ticker || ticker.isLoading) return [];
        const _exps = ticker.expirations;
        if (_exps.length === 0) return [];
        return buildStrategyResults(ticker, strategies, side);
    }, [ticker, ticker?.expirations, ticker?.isLoading, side, strategies]);

    const validResults = results.filter(r => r.found);

    // ─── Strategy Editor Handlers ───────────────────────────────────────

    const handleAddStrategy = () => {
        if (strategies.length >= 5) return;
        const idx = strategies.length;
        const newId = `custom-${Date.now()}`;
        setStrategies(prev => [...prev, {
            id: newId, label: `Custom ${idx + 1}`,
            entryDte: 30, exitDte: 14, delta: 16,
            color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length],
        }]);
        setEditingId(newId);
    };

    const handleRemoveStrategy = (id: string) => {
        setStrategies(prev => prev.filter(s => s.id !== id));
        if (editingId === id) setEditingId(null);
    };

    const handleUpdateField = (id: string, field: 'entryDte' | 'exitDte' | 'delta', value: number) => {
        setStrategies(prev => prev.map(s =>
            s.id === id ? {...s, [field]: value} : s
        ));
    };

    // ─── Find winners ───────────────────────────────────────────────────

    const bestPerDayResult = validResults.length > 0
        ? validResults.reduce((best, r) => r.capturedPerDay > best.capturedPerDay ? r : best) : null;
    const bestRiskAdjResult = validResults.length > 0
        ? validResults.reduce((best, r) => r.riskAdjustedScore > best.riskAdjustedScore ? r : best) : null;

    return (
        <ContainerBox>
            {/* Ticker + Side controls */}
            <ControlsBox>
                <ChipsBox>
                    {TICKERS.map(t => (
                        <IonChip key={t} color={selectedTicker === t ? 'primary' : 'medium'}
                            onClick={() => setSelectedTicker(t)}>{t}</IonChip>
                    ))}
                </ChipsBox>
                <IonSegment value={side} onIonChange={e => setSide(e.detail.value as 'PUT' | 'CALL')}
                    style={{maxWidth: 200}}>
                    <IonSegmentButton value="PUT"><IonLabel>PUT</IonLabel></IonSegmentButton>
                    <IonSegmentButton value="CALL"><IonLabel>CALL</IonLabel></IonSegmentButton>
                </IonSegment>
            </ControlsBox>

            <InfoBox>
                Compare timing strategies with live data. Each strategy finds the option at its target delta
                at the entry DTE, then checks the same strike at the exit DTE to estimate captured premium.
                Click a strategy card to edit its Delta, Entry DTE, and Exit DTE.
            </InfoBox>

            {/* Strategy Editor Cards */}
            <StrategiesRowBox>
                {strategies.map(s => (
                    <StrategyCardBox key={s.id} $color={s.color} $editing={editingId === s.id}
                        onClick={() => setEditingId(editingId === s.id ? null : s.id)}>
                        <StrategyHeaderRow>
                            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                <StrategyColorDot $color={s.color}/>
                                <StrategyLabel>{s.label}</StrategyLabel>
                            </div>
                            {strategies.length > 1 && (
                                <RemoveButton onClick={e => {e.stopPropagation(); handleRemoveStrategy(s.id);}}>×</RemoveButton>
                            )}
                        </StrategyHeaderRow>

                        {editingId === s.id ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: 6}} onClick={e => e.stopPropagation()}>
                                <EditRowBox>
                                    <EditLabelBox>Delta</EditLabelBox>
                                    <EditDteInput type="number" value={s.delta}
                                        onIonChange={e => {
                                            const v = parseInt(e.detail.value ?? '', 10);
                                            if (!isNaN(v) && v >= 1 && v <= 50) handleUpdateField(s.id, 'delta', v);
                                        }}/>
                                </EditRowBox>
                                <EditRowBox>
                                    <EditLabelBox>Entry</EditLabelBox>
                                    <EditDteInput type="number" value={s.entryDte}
                                        onIonChange={e => {
                                            const v = parseInt(e.detail.value ?? '', 10);
                                            if (!isNaN(v) && v >= 1 && v <= 180) handleUpdateField(s.id, 'entryDte', v);
                                        }}/>
                                    <span>→</span>
                                    <EditLabelBox>Exit</EditLabelBox>
                                    <EditDteInput type="number" value={s.exitDte}
                                        onIonChange={e => {
                                            const v = parseInt(e.detail.value ?? '', 10);
                                            if (!isNaN(v) && v >= 0 && v <= 180) handleUpdateField(s.id, 'exitDte', v);
                                        }}/>
                                </EditRowBox>
                            </div>
                        ) : (
                            <StrategyDteLabel>Δ{s.delta} · {s.entryDte}→{s.exitDte}d</StrategyDteLabel>
                        )}
                    </StrategyCardBox>
                ))}
                {strategies.length < 5 && (
                    <AddButton onClick={handleAddStrategy} title="Add strategy">+</AddButton>
                )}
            </StrategiesRowBox>

            {loading ? (
                <NoDataBox><IonSpinner name="crescent"/></NoDataBox>
            ) : (
                <>
                    {/* Chart */}
                    <DteStrategySimulatorChartComponent results={results}/>

                    {/* Comparison Table */}
                    {validResults.length > 0 ? (
                        <TableContainerBox>
                            <ComparisonTable>
                                <thead>
                                    <tr>
                                        <th>Metric</th>
                                        {validResults.map(r => (
                                            <th key={r.strategy.id} style={{color: r.strategy.color}}>
                                                {r.strategy.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRIC_ROWS.map(metric => {
                                        let bestIdx = -1;
                                        if (HIGHLIGHT_LABELS.has(metric.label) && validResults.length > 1) {
                                            let bestVal = metric.higherIsBetter ? -Infinity : Infinity;
                                            validResults.forEach((r, i) => {
                                                const v = metric.getNumeric(r);
                                                if (metric.higherIsBetter ? v > bestVal : v < bestVal) {
                                                    bestVal = v; bestIdx = i;
                                                }
                                            });
                                        }
                                        return (
                                            <tr key={metric.label}>
                                                <td>{metric.label}</td>
                                                {validResults.map((r, i) => {
                                                    const CellTag = i === bestIdx ? BestCell : 'td';
                                                    return <CellTag key={r.strategy.id}>{metric.getValue(r)}</CellTag>;
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </ComparisonTable>
                        </TableContainerBox>
                    ) : (
                        <NoDataBox>No matching options found. Try adjusting delta or DTE values.</NoDataBox>
                    )}

                    {/* Winner Callout */}
                    {bestPerDayResult && bestRiskAdjResult && (
                        <WinnerBox>
                            <div>
                                <WinnerLabel>Best $/Day: </WinnerLabel>
                                <strong style={{color: bestPerDayResult.strategy.color}}>
                                    {bestPerDayResult.strategy.label}
                                </strong>
                                {' '}— ${bestPerDayResult.capturedPerDay.toFixed(2)}/day
                                (Δ{bestPerDayResult.strategy.delta} · {bestPerDayResult.strategy.entryDte}→{bestPerDayResult.strategy.exitDte}d)
                            </div>
                            <div>
                                <WinnerLabel>Best Risk-Adjusted: </WinnerLabel>
                                <strong style={{color: bestRiskAdjResult.strategy.color}}>
                                    {bestRiskAdjResult.strategy.label}
                                </strong>
                                {' '}— score {bestRiskAdjResult.riskAdjustedScore.toFixed(1)}
                                (Δ{bestRiskAdjResult.strategy.delta} · {bestRiskAdjResult.strategy.entryDte}→{bestRiskAdjResult.strategy.exitDte}d)
                            </div>
                        </WinnerBox>
                    )}
                </>
            )}
        </ContainerBox>
    );
});

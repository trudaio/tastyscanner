import React, {useEffect, useMemo, useState} from "react";
import {observer} from "mobx-react-lite";
import {useServices} from "../../hooks/use-services.hook";
import {TickerModel} from "../../models/ticker.model";
import {OptionModel} from "../../models/option.model";
import styled from "styled-components";
import {IonAccordion, IonAccordionGroup, IonChip, IonInput, IonItem, IonLabel, IonSegment, IonSegmentButton, IonSpinner} from "@ionic/react";
import {DteAnalyzerChartComponent} from "./dte-analyzer-chart.component";
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";

const TICKERS = ['SPX', 'SPY', 'QQQ'];

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
`

const DeltaInputsBox = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`

const DeltaInputLabel = styled.span`
    font-size: 0.85rem;
    color: var(--ion-color-medium);
    white-space: nowrap;
`

const DeltaInput = styled(IonInput)`
    width: 70px;
    --padding-start: 8px;
    --padding-end: 4px;
    border: 1px solid var(--ion-color-light-shade);
    border-radius: 6px;
    font-size: 0.9rem;
    text-align: center;
`

const SideSegment = styled(IonSegment)`
    width: 180px;
`

const LoadingBox = styled.div`
    display: flex;
    justify-content: center;
    padding: 48px;
`

const TableBox = styled.div`
    overflow-x: auto;
`

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;

    th, td {
        padding: 8px 10px;
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
    }
`

const ClickableRow = styled.tr<{$selected?: boolean}>`
    cursor: pointer;
    transition: background 0.15s;
    ${p => p.$selected && 'background: rgba(var(--ion-color-primary-rgb), 0.12);'}
    &:hover { background: rgba(var(--ion-color-primary-rgb), 0.08); }
`

const OptimalRow = styled(ClickableRow)`
    background: rgba(var(--ion-color-success-rgb), 0.1);
    font-weight: 600;
    ${(p: {$selected?: boolean}) => p.$selected && 'background: rgba(var(--ion-color-primary-rgb), 0.15);'}
`

const StrikeDecaySectionBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
    border-radius: 12px;
    background: rgba(var(--ion-color-primary-rgb), 0.03);
`

const StrikeDecayHeaderBox = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const StrikeDecayTitleBox = styled.h3`
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
`

const CloseButton = styled.button`
    background: none;
    border: 1px solid var(--ion-color-medium);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 0.8rem;
    color: var(--ion-color-medium);
    cursor: pointer;
    &:hover { border-color: var(--ion-color-primary); color: var(--ion-color-primary); }
`

const DeltaWarningBox = styled.td<{$delta: number}>`
    font-weight: 600;
    color: ${p =>
        p.$delta >= 50 ? '#ff3b30' :
        p.$delta >= 30 ? '#cc8800' :
        'inherit'};
`

const OptimalBadge = styled.span`
    background: var(--ion-color-success);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    margin-left: 4px;
`

const InfoBox = styled.div`
    padding: 12px 16px;
    background: rgba(var(--ion-color-primary-rgb), 0.08);
    border-radius: 8px;
    font-size: 0.85rem;
    color: var(--ion-color-medium);
    line-height: 1.5;
`

const GuideBox = styled.div`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--ion-color-medium);
`

const GuideSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`

const GuideSectionTitle = styled.h4`
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--ion-text-color);
`

const GuideMetric = styled.p`
    margin: 0;
    padding-left: 12px;
    border-left: 3px solid rgba(var(--ion-color-primary-rgb), 0.3);
`

export interface IDteAnalyzerRow {
    dte: number;
    delta: number;
    strikePrice: number;
    premium: number;
    premiumPctMax: number;  // % of highest premium in the list
    premiumPerDay: number;
    theta: number;
    gamma: number;
    thetaGammaRatio: number;
    isOptimal: boolean;
}

export interface IStrikeDecayRow {
    dte: number;
    expirationDate: string;
    delta: number;
    premium: number;
    premiumPctEntry: number; // % of entry premium
    premiumPerDay: number;
    theta: number;
    gamma: number;
}

function buildRows(
    ticker: TickerModel,
    side: 'PUT' | 'CALL',
    minDelta: number,
    maxDelta: number,
    maxDte: number
): IDteAnalyzerRow[] {
    const rows: IDteAnalyzerRow[] = [];

    for (const exp of ticker.expirations) {
        if (exp.daysToExpiration < 3 || exp.daysToExpiration > maxDte) continue;

        const options: OptionModel[] = side === 'PUT' ? exp.getOTMPuts() : exp.getOTMCalls();

        // Find options within delta range
        const inRange = options.filter(opt => {
            const absDelta = opt.absoluteDeltaPercent;
            return absDelta >= minDelta && absDelta <= maxDelta && opt.midPrice > 0;
        });

        // Pick the one closest to midpoint of range
        const targetDelta = (minDelta + maxDelta) / 2;
        const best = inRange.reduce<OptionModel | null>((closest, opt) => {
            if (!closest) return opt;
            const diffCurrent = Math.abs(opt.absoluteDeltaPercent - targetDelta);
            const diffClosest = Math.abs(closest.absoluteDeltaPercent - targetDelta);
            return diffCurrent < diffClosest ? opt : closest;
        }, null);

        if (!best) continue;

        const greeks = best.greeksData;
        if (!greeks) continue;

        const premium = best.midPrice;
        const dte = exp.daysToExpiration;
        const theta = Math.abs(greeks.theta);
        const gamma = Math.abs(greeks.gamma);

        rows.push({
            dte,
            delta: best.absoluteDeltaPercent,
            strikePrice: best.strikePrice,
            premium,
            premiumPctMax: 0, // computed below
            premiumPerDay: Math.round((premium / dte) * 100) / 100,
            theta: Math.round(theta * 100) / 100,
            gamma: Math.round(gamma * 10000) / 10000,
            thetaGammaRatio: gamma > 0 ? Math.round((theta / gamma) * 100) / 100 : 0,
            isOptimal: false,
        });
    }

    // Sort by DTE descending
    rows.sort((a, b) => b.dte - a.dte);

    if (rows.length === 0) return rows;

    // Compute %Max (relative to highest premium which is the highest DTE)
    const maxPremium = Math.max(...rows.map(r => r.premium));
    for (const r of rows) {
        r.premiumPctMax = maxPremium > 0 ? Math.round((r.premium / maxPremium) * 10000) / 100 : 0;
    }

    // Mark optimal (highest premium/day)
    const maxPremPerDay = Math.max(...rows.map(r => r.premiumPerDay));
    const optimalRow = rows.find(r => r.premiumPerDay === maxPremPerDay);
    if (optimalRow) optimalRow.isOptimal = true;

    return rows;
}

/**
 * For a FIXED strike price, find it across all expirations and show how delta/premium evolve.
 * This answers: "If I sell the 6000 put today at 44 DTE, what would this same strike
 * look like at shorter DTEs?"
 */
function buildStrikeDecayRows(
    ticker: TickerModel,
    side: 'PUT' | 'CALL',
    strikePrice: number,
    entryDte: number,
    maxDte: number
): IStrikeDecayRow[] {
    const rows: IStrikeDecayRow[] = [];
    let entryPremium = 0;

    for (const exp of ticker.expirations) {
        if (exp.daysToExpiration < 1 || exp.daysToExpiration > maxDte) continue;

        const strike = exp.getStrikeByPrice(strikePrice);
        if (!strike) continue;

        const option = side === 'PUT' ? strike.put : strike.call;
        if (!option || option.midPrice <= 0) continue;

        const greeks = option.greeksData;
        if (!greeks) continue;

        const dte = exp.daysToExpiration;
        const premium = option.midPrice;
        const theta = Math.abs(greeks.theta);
        const gamma = Math.abs(greeks.gamma);
        const delta = option.absoluteDeltaPercent;

        // Capture entry premium (the DTE we're comparing from)
        if (dte === entryDte) {
            entryPremium = premium;
        }

        rows.push({
            dte,
            expirationDate: exp.expirationDate,
            delta,
            premium,
            premiumPctEntry: 0, // computed below
            premiumPerDay: Math.round((premium / dte) * 100) / 100,
            theta: Math.round(theta * 100) / 100,
            gamma: Math.round(gamma * 10000) / 10000,
        });
    }

    // Sort by DTE descending
    rows.sort((a, b) => b.dte - a.dte);

    // If we didn't find the exact entry DTE, use the highest DTE as reference
    if (entryPremium === 0 && rows.length > 0) {
        entryPremium = rows[0].premium;
    }

    // Compute % of entry premium
    for (const r of rows) {
        r.premiumPctEntry = entryPremium > 0 ? Math.round((r.premium / entryPremium) * 10000) / 100 : 0;
    }

    return rows;
}

const DECAY_COLORS = {
    delta: '#ff6b6b',
    premium: '#4a9eff',
    grid: 'rgba(150, 150, 150, 0.08)',
    axis: '#555e6e',
    entry: '#00e676',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StrikeDecayTooltip = ({active, payload}: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as IStrikeDecayRow | undefined;
    if (!d) return null;
    return (
        <div style={{background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#ccc', lineHeight: 1.7}}>
            <div style={{fontWeight: 700, color: '#fff', marginBottom: 4}}>DTE {d.dte}</div>
            <div style={{color: DECAY_COLORS.delta}}>Delta: <strong>{d.delta}</strong></div>
            <div style={{color: DECAY_COLORS.premium}}>Premium: <strong>${d.premium.toFixed(2)}</strong> ({d.premiumPctEntry.toFixed(0)}% of entry)</div>
            <div>$/Day: <strong>${d.premiumPerDay.toFixed(2)}</strong></div>
            <div>Theta: {d.theta.toFixed(2)} | Gamma: {d.gamma.toFixed(4)}</div>
        </div>
    );
};

const StrikeDecayChartInline: React.FC<{rows: IStrikeDecayRow[]; entryDte: number}> = ({rows, entryDte}) => {
    const chartData = [...rows].sort((a, b) => a.dte - b.dte);
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <div style={{width: '100%', height: 280, background: 'rgba(13, 13, 26, 0.6)', borderRadius: 12, padding: '16px 8px 4px 0'}}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{top: 5, right: 15, left: 5, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={DECAY_COLORS.grid}/>
                        <XAxis
                            dataKey="dte"
                            tick={{fontSize: 11, fill: DECAY_COLORS.axis}}
                            tickLine={{stroke: DECAY_COLORS.grid}}
                            axisLine={{stroke: DECAY_COLORS.grid}}
                            label={{value: 'DTE', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: DECAY_COLORS.axis}}
                        />
                        <YAxis
                            yAxisId="premium"
                            tick={{fontSize: 11, fill: DECAY_COLORS.premium}}
                            tickLine={{stroke: DECAY_COLORS.grid}}
                            axisLine={{stroke: DECAY_COLORS.grid}}
                            tickFormatter={v => `$${v}`}
                        />
                        <YAxis
                            yAxisId="delta"
                            orientation="right"
                            tick={{fontSize: 11, fill: DECAY_COLORS.delta}}
                            tickLine={{stroke: DECAY_COLORS.grid}}
                            axisLine={{stroke: DECAY_COLORS.grid}}
                            tickFormatter={v => `Δ${v}`}
                        />
                        <Tooltip content={<StrikeDecayTooltip/>}/>

                        {/* Premium area + line */}
                        <Area
                            yAxisId="premium"
                            type="monotone"
                            dataKey="premium"
                            fill="rgba(74, 158, 255, 0.12)"
                            stroke="none"
                        />
                        <Line
                            yAxisId="premium"
                            type="monotone"
                            dataKey="premium"
                            stroke={DECAY_COLORS.premium}
                            strokeWidth={2.5}
                            dot={{r: 3, fill: DECAY_COLORS.premium, strokeWidth: 0}}
                            activeDot={{r: 5, fill: '#fff', stroke: DECAY_COLORS.premium, strokeWidth: 2}}
                        />

                        {/* Delta line */}
                        <Line
                            yAxisId="delta"
                            type="monotone"
                            dataKey="delta"
                            stroke={DECAY_COLORS.delta}
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={{r: 3, fill: DECAY_COLORS.delta, strokeWidth: 0}}
                            activeDot={{r: 5, fill: '#fff', stroke: DECAY_COLORS.delta, strokeWidth: 2}}
                        />

                        {/* Entry DTE marker */}
                        <ReferenceLine
                            x={entryDte}
                            yAxisId="premium"
                            stroke={DECAY_COLORS.entry}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            label={{
                                value: `ENTRY ${entryDte}d`,
                                position: 'top',
                                fontSize: 11,
                                fill: DECAY_COLORS.entry,
                                fontWeight: 700,
                            }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div style={{display: 'flex', justifyContent: 'center', gap: 24, fontSize: '0.75rem', color: DECAY_COLORS.axis}}>
                <span><span style={{color: DECAY_COLORS.premium}}>━━</span> Premium ($)</span>
                <span><span style={{color: DECAY_COLORS.delta}}>╍╍</span> Delta</span>
                <span><span style={{color: DECAY_COLORS.entry}}>┆┆</span> Entry DTE</span>
            </div>
        </div>
    );
};

export const DteAnalyzerComponent: React.FC = observer(() => {
    const services = useServices();
    const [selectedTicker, setSelectedTicker] = useState<string>('SPX');
    const [side, setSide] = useState<'PUT' | 'CALL'>('PUT');
    const [minDelta, setMinDelta] = useState<number>(14);
    const [maxDelta, setMaxDelta] = useState<number>(20);
    const [maxDte, setMaxDte] = useState<number>(60);
    const [ticker, setTicker] = useState<TickerModel | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedStrike, setSelectedStrike] = useState<{strike: number; dte: number} | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadTicker = async () => {
            setLoading(true);
            // Stop previous ticker
            if (ticker) {
                await ticker.stop();
            }
            const newTicker = new TickerModel(selectedTicker, services);
            await newTicker.start();
            if (!cancelled) {
                setTicker(newTicker);
                setLoading(false);
            }
        };
        loadTicker();
        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTicker, services]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (ticker) {
                ticker.stop();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rows = useMemo(() => {
        if (!ticker || ticker.isLoading) return [];
        // Access expirations to trigger MobX reactivity
        const _exps = ticker.expirations;
        if (_exps.length === 0) return [];
        return buildRows(ticker, side, minDelta, maxDelta, maxDte);
    }, [ticker, ticker?.expirations, ticker?.isLoading, side, minDelta, maxDelta, maxDte]);

    const strikeDecayRows = useMemo(() => {
        if (!ticker || !selectedStrike || ticker.isLoading) return [];
        const _exps = ticker.expirations;
        if (_exps.length === 0) return [];
        return buildStrikeDecayRows(ticker, side, selectedStrike.strike, selectedStrike.dte, maxDte);
    }, [ticker, ticker?.expirations, ticker?.isLoading, side, selectedStrike, maxDte]);

    return (
        <ContainerBox>
            <ControlsBox>
                <ChipsBox>
                    {TICKERS.map(t => (
                        <IonChip
                            key={t}
                            color={selectedTicker === t ? 'primary' : 'medium'}
                            onClick={() => setSelectedTicker(t)}
                        >
                            {t}
                        </IonChip>
                    ))}
                </ChipsBox>

                <DeltaInputsBox>
                    <DeltaInputLabel>Delta</DeltaInputLabel>
                    <DeltaInput
                        type="number"
                        value={minDelta}
                        onIonChange={e => {
                            const v = parseInt(e.detail.value ?? '14', 10);
                            if (!isNaN(v) && v >= 1 && v <= 50) setMinDelta(v);
                        }}
                    />
                    <span>—</span>
                    <DeltaInput
                        type="number"
                        value={maxDelta}
                        onIonChange={e => {
                            const v = parseInt(e.detail.value ?? '20', 10);
                            if (!isNaN(v) && v >= 1 && v <= 50) setMaxDelta(v);
                        }}
                    />
                </DeltaInputsBox>

                <DeltaInputsBox>
                    <DeltaInputLabel>Max DTE</DeltaInputLabel>
                    <DeltaInput
                        type="number"
                        value={maxDte}
                        onIonChange={e => {
                            const v = parseInt(e.detail.value ?? '60', 10);
                            if (!isNaN(v) && v >= 7 && v <= 180) setMaxDte(v);
                        }}
                    />
                </DeltaInputsBox>

                <SideSegment
                    value={side}
                    onIonChange={e => setSide(e.detail.value as 'PUT' | 'CALL')}
                >
                    <IonSegmentButton value="PUT">PUT</IonSegmentButton>
                    <IonSegmentButton value="CALL">CALL</IonSegmentButton>
                </SideSegment>
            </ControlsBox>

            <InfoBox>
                Compares the same delta option across all available expirations (3-90 DTE).
                $/Day = premium ÷ DTE. θ/γ = theta ÷ gamma (risk-adjusted decay — higher is better).
                ★ marks the DTE with best $/Day.
                {ticker && !loading && ` | ${selectedTicker} @ $${ticker.currentPrice.toFixed(2)}`}
            </InfoBox>

            {loading ? (
                <LoadingBox><IonSpinner name="crescent"/></LoadingBox>
            ) : rows.length === 0 ? (
                <LoadingBox style={{color: 'var(--ion-color-medium)'}}>
                    Waiting for data...
                </LoadingBox>
            ) : (
                <>
                    <DteAnalyzerChartComponent rows={rows}/>

                    <TableBox>
                        <Table>
                            <thead>
                                <tr>
                                    <th>DTE</th>
                                    <th>Delta</th>
                                    <th>Strike</th>
                                    <th>Premium</th>
                                    <th>% Max</th>
                                    <th>$/Day</th>
                                    <th>Theta</th>
                                    <th>Gamma</th>
                                    <th>θ/γ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const isSelected = selectedStrike?.strike === r.strikePrice && selectedStrike?.dte === r.dte;
                                    const Row = r.isOptimal ? OptimalRow : ClickableRow;
                                    return (
                                        <Row
                                            key={`${r.dte}-${r.strikePrice}-${i}`}
                                            $selected={isSelected}
                                            onClick={() => setSelectedStrike(
                                                isSelected ? null : {strike: r.strikePrice, dte: r.dte}
                                            )}
                                        >
                                            <td>
                                                {r.dte}
                                                {r.isOptimal && <OptimalBadge>★</OptimalBadge>}
                                            </td>
                                            <td>{r.delta}</td>
                                            <td>{r.strikePrice}</td>
                                            <td>${r.premium.toFixed(2)}</td>
                                            <td>{r.premiumPctMax.toFixed(1)}%</td>
                                            <td style={{fontWeight: 700}}>${r.premiumPerDay.toFixed(2)}</td>
                                            <td>{r.theta.toFixed(2)}</td>
                                            <td>{r.gamma.toFixed(4)}</td>
                                            <td>{r.thetaGammaRatio.toFixed(1)}</td>
                                        </Row>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableBox>
                </>
            )}

            {/* Strike Decay Section */}
            {selectedStrike && strikeDecayRows.length > 0 && (
                <StrikeDecaySectionBox>
                    <StrikeDecayHeaderBox>
                        <StrikeDecayTitleBox>
                            Strike Decay: {selectedTicker} {side} {selectedStrike.strike}
                            <span style={{fontWeight: 400, fontSize: '0.85rem', color: 'var(--ion-color-medium)', marginLeft: 8}}>
                                (entry at {selectedStrike.dte} DTE)
                            </span>
                        </StrikeDecayTitleBox>
                        <CloseButton onClick={() => setSelectedStrike(null)}>Close</CloseButton>
                    </StrikeDecayHeaderBox>

                    <InfoBox>
                        Shows how the {side} {selectedStrike.strike} strike evolves across all available expirations.
                        Same strike, different DTEs — observe how delta grows and premium decays as expiration approaches.
                    </InfoBox>

                    {/* Strike Decay Chart */}
                    <StrikeDecayChartInline rows={strikeDecayRows} entryDte={selectedStrike.dte}/>

                    <TableBox>
                        <Table>
                            <thead>
                                <tr>
                                    <th>DTE</th>
                                    <th>Delta</th>
                                    <th>Premium</th>
                                    <th>% of Entry</th>
                                    <th>$/Day</th>
                                    <th>Theta</th>
                                    <th>Gamma</th>
                                </tr>
                            </thead>
                            <tbody>
                                {strikeDecayRows.map((r, i) => (
                                    <tr
                                        key={`decay-${r.dte}-${i}`}
                                        style={r.dte === selectedStrike.dte ? {background: 'rgba(var(--ion-color-primary-rgb), 0.1)', fontWeight: 600} : undefined}
                                    >
                                        <td>
                                            {r.dte}
                                            {r.dte === selectedStrike.dte && <OptimalBadge>ENTRY</OptimalBadge>}
                                        </td>
                                        <DeltaWarningBox $delta={r.delta}>{r.delta}</DeltaWarningBox>
                                        <td>${r.premium.toFixed(2)}</td>
                                        <td>{r.premiumPctEntry.toFixed(1)}%</td>
                                        <td style={{fontWeight: 700}}>${r.premiumPerDay.toFixed(2)}</td>
                                        <td>{r.theta.toFixed(2)}</td>
                                        <td>{r.gamma.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </TableBox>
                </StrikeDecaySectionBox>
            )}

            {/* Interpretation Guide */}
            <IonAccordionGroup>
                <IonAccordion value="guide">
                    <IonItem slot="header" color="light">
                        <IonLabel style={{fontWeight: 600}}>Cum interpretezi graficul si tabelul</IonLabel>
                    </IonItem>
                    <GuideBox slot="content">
                        <GuideSection>
                            <GuideSectionTitle>Ce face acest tool?</GuideSectionTitle>
                            <p>
                                Compara aceeasi optiune (acelasi delta) pe toate expiratiile disponibile.
                                Scopul: sa gasesti DTE-ul la care primesti cel mai mult premium per zi de expunere la risc.
                            </p>
                        </GuideSection>

                        <GuideSection>
                            <GuideSectionTitle>Coloanele din tabel</GuideSectionTitle>
                            <GuideMetric><strong>$/Day</strong> (Premium per Day) — metrica principala. Premium total impartit la DTE.
                                Cu cat e mai mare, cu atat castigi mai mult pe zi. ★ marcheaza cel mai bun DTE.</GuideMetric>
                            <GuideMetric><strong>% Max</strong> — cat din premium-ul maxim (cel cu DTE cel mai mare) captezi la acest DTE.
                                Exemplu: daca 50 DTE = $77 si 30 DTE = $47, atunci 30 DTE capteaza 61% din premium
                                dar are cu 40% mai putine zile de risc.</GuideMetric>
                            <GuideMetric><strong>Theta</strong> — cat pierde optiunea pe zi din valoare (in favoarea ta ca vanzator).
                                Theta creste pe masura ce DTE scade — decay-ul se accelereaza.</GuideMetric>
                            <GuideMetric><strong>Gamma</strong> — cat de repede se schimba delta. Gamma mare = pozitia devine impredictibila.
                                Sub 14 DTE gamma explodeaza, facand managementul dificil.</GuideMetric>
                            <GuideMetric><strong>θ/γ Ratio</strong> (Theta/Gamma) — metrica de eficienta ajustata la risc.
                                Cat theta castigi per unitate de gamma risk. Un ratio mare = premium bun cu risc controlat.</GuideMetric>
                        </GuideSection>

                        <GuideSection>
                            <GuideSectionTitle>Cum citesti graficul</GuideSectionTitle>
                            <GuideMetric><strong>Linia albastra ($/Day)</strong> — arata eficienta premium-ului pe zi.
                                De obicei creste usor de la DTE mari spre DTE medii (sweet spot), apoi scade brusc sub 14 DTE.</GuideMetric>
                            <GuideMetric><strong>Linia mov punctata (θ/γ)</strong> — arata raportul risc/reward.
                                Cand aceasta linie scade, inseamna ca gamma creste mai repede decat theta — risc crescut.</GuideMetric>
                            <GuideMetric><strong>Barele albastre deschise</strong> — premium-ul absolut.
                                Scade liniar cu DTE-ul — dar $/Day nu scade la fel de repede, de aceea exista un sweet spot.</GuideMetric>
                            <GuideMetric><strong>Linia verde punctata (★)</strong> — DTE-ul optim cu cel mai bun $/Day.</GuideMetric>
                        </GuideSection>

                        <GuideSection>
                            <GuideSectionTitle>Reguli practice</GuideSectionTitle>
                            <GuideMetric><strong>Sweet spot 30-50 DTE:</strong> De obicei $/Day e cel mai bun in acest interval.
                                Primesti un premium decent pe zi cu gamma controlat.</GuideMetric>
                            <GuideMetric><strong>Evita sub 14 DTE:</strong> Desi theta e maxim, gamma explodeaza.
                                O miscare mica a pretului iti muta delta dramatic — pozitia devine greu de gestionat.</GuideMetric>
                            <GuideMetric><strong>Peste 50 DTE:</strong> Premium absolut mare, dar $/Day scade.
                                Capitalul e blocat mai mult timp pentru mai putin castig pe zi.</GuideMetric>
                            <GuideMetric><strong>θ/γ ratio scade = semnal de pericol:</strong> Cand vezi ratio-ul in scadere,
                                inseamna ca riscul creste mai repede decat recompensa. E momentul sa inchizi sau sa nu intri.</GuideMetric>
                        </GuideSection>

                        <GuideSection>
                            <GuideSectionTitle>Exemplu concret</GuideSectionTitle>
                            <p>
                                SPX Put la delta 16-20, DTE 50 = $77.2, $/Day = $1.54 |
                                DTE 30 = $47.0, $/Day = $1.57. Desi primesti cu 39% mai putin premium total,
                                $/Day e de fapt mai bun la 30 DTE. In plus, capitalul e blocat doar 30 zile in loc de 50.
                                Dar verifica si θ/γ — daca e semnificativ mai mic la 30 DTE, poate merita sa mergi la 35-40.
                            </p>
                        </GuideSection>
                    </GuideBox>
                </IonAccordion>
            </IonAccordionGroup>
        </ContainerBox>
    );
});

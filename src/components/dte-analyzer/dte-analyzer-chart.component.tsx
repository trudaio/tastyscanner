import React from "react";
import {
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ComposedChart,
} from "recharts";
import type {IDteAnalyzerRow} from "./dte-analyzer.component";
import styled from "styled-components";

const ChartsContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`

const ChartBox = styled.div`
    width: 100%;
    height: 220px;
    background: rgba(13, 13, 26, 0.6);
    border-radius: 12px;
    padding: 16px 8px 4px 0;
`

const ChartLabelBox = styled.div`
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ion-color-medium);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 0 0 16px;
`

interface Props {
    rows: IDteAnalyzerRow[];
}

// Brand colors
const COLORS = {
    premiumPerDay: '#4a9eff',       // primary blue
    thetaGamma: '#00c9a7',          // teal/green (complementary)
    premium: 'rgba(74, 158, 255, 0.15)',  // blue fill
    thetaFill: 'rgba(0, 201, 167, 0.1)',
    grid: 'rgba(150, 150, 150, 0.08)',
    optimal: '#00e676',             // green accent
    axis: '#555e6e',
};

const CustomTooltip = ({active, payload}: any) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0]?.payload as IDteAnalyzerRow | undefined;
    if (!data) return null;

    return (
        <div style={{
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '0.8rem',
            lineHeight: 1.7,
            color: '#ccc',
        }}>
            <div style={{fontWeight: 700, color: '#fff', marginBottom: 4, fontSize: '0.85rem'}}>
                DTE {data.dte} {data.isOptimal ? '  ★ BEST $/DAY' : ''}
            </div>
            <div>Strike: <strong>{data.strikePrice}</strong> | Delta: <strong>{data.delta}</strong></div>
            <div>Premium: <strong>${data.premium.toFixed(2)}</strong> ({data.premiumPctMax.toFixed(0)}% of max)</div>
            <div style={{color: COLORS.premiumPerDay, fontWeight: 700}}>
                $/Day: ${data.premiumPerDay.toFixed(2)}
            </div>
            <div style={{color: COLORS.thetaGamma}}>
                θ/γ: {data.thetaGammaRatio.toFixed(0)} | Theta: {data.theta.toFixed(2)} | Gamma: {data.gamma.toFixed(4)}
            </div>
        </div>
    );
};

export const DteAnalyzerChartComponent: React.FC<Props> = ({rows}) => {
    if (rows.length === 0) return null;

    // Sort by DTE ascending for left-to-right reading
    const chartData = [...rows].sort((a, b) => a.dte - b.dte);
    const optimalRow = rows.find(r => r.isOptimal);

    return (
        <ChartsContainerBox>
            {/* Chart 1: $/Day — the primary metric */}
            <ChartLabelBox>Premium Efficiency ($/Day)</ChartLabelBox>
            <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{top: 5, right: 15, left: 5, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid}/>
                        <XAxis
                            dataKey="dte"
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={{stroke: COLORS.grid}}
                            axisLine={{stroke: COLORS.grid}}
                        />
                        <YAxis
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={{stroke: COLORS.grid}}
                            axisLine={{stroke: COLORS.grid}}
                            tickFormatter={v => `$${v}`}
                        />
                        <Tooltip content={<CustomTooltip/>}/>

                        {/* Area fill under the $/Day line */}
                        <Area
                            type="monotone"
                            dataKey="premiumPerDay"
                            fill={COLORS.premium}
                            stroke="none"
                        />

                        {/* $/Day line */}
                        <Line
                            type="monotone"
                            dataKey="premiumPerDay"
                            stroke={COLORS.premiumPerDay}
                            strokeWidth={2.5}
                            dot={{r: 3, fill: COLORS.premiumPerDay, strokeWidth: 0}}
                            activeDot={{r: 5, fill: '#fff', stroke: COLORS.premiumPerDay, strokeWidth: 2}}
                        />

                        {/* Optimal DTE marker */}
                        {optimalRow && (
                            <ReferenceLine
                                x={optimalRow.dte}
                                stroke={COLORS.optimal}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                label={{
                                    value: `★ ${optimalRow.dte}d — $${optimalRow.premiumPerDay.toFixed(2)}/day`,
                                    position: 'top',
                                    fontSize: 11,
                                    fill: COLORS.optimal,
                                    fontWeight: 700,
                                }}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </ChartBox>

            {/* Chart 2: θ/γ Ratio — risk-adjusted efficiency */}
            <ChartLabelBox>Risk-Adjusted Decay (θ/γ Ratio)</ChartLabelBox>
            <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{top: 5, right: 15, left: 5, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid}/>
                        <XAxis
                            dataKey="dte"
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={{stroke: COLORS.grid}}
                            axisLine={{stroke: COLORS.grid}}
                        />
                        <YAxis
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={{stroke: COLORS.grid}}
                            axisLine={{stroke: COLORS.grid}}
                            tickFormatter={v => `${v}`}
                        />
                        <Tooltip content={<CustomTooltip/>}/>

                        <Area
                            type="monotone"
                            dataKey="thetaGammaRatio"
                            fill={COLORS.thetaFill}
                            stroke={COLORS.thetaGamma}
                            strokeWidth={2}
                            dot={{r: 3, fill: COLORS.thetaGamma, strokeWidth: 0}}
                            activeDot={{r: 5, fill: '#fff', stroke: COLORS.thetaGamma, strokeWidth: 2}}
                        />

                        {/* Optimal DTE reference */}
                        {optimalRow && (
                            <ReferenceLine
                                x={optimalRow.dte}
                                stroke={COLORS.optimal}
                                strokeWidth={1.5}
                                strokeDasharray="6 4"
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </ChartBox>
        </ChartsContainerBox>
    );
};

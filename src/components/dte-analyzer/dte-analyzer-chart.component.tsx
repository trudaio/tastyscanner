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
    gap: 12px;
`

const ChartBox = styled.div`
    width: 100%;
    height: 240px;
    background: #ffffff;
    border: 1px solid #e8ecf1;
    border-radius: 10px;
    padding: 16px 8px 4px 0;
`

const ChartLabelBox = styled.div`
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0 0 4px;
`

interface Props {
    rows: IDteAnalyzerRow[];
}

const COLORS = {
    premiumPerDay: '#1a73e8',
    thetaGamma: '#0d9488',
    premiumFill: 'rgba(26, 115, 232, 0.08)',
    thetaFill: 'rgba(13, 148, 136, 0.06)',
    grid: '#f0f0f0',
    optimal: '#16a34a',
    axis: '#888',
    tooltipBg: '#fff',
    tooltipBorder: '#e0e0e0',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({active, payload}: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0]?.payload as IDteAnalyzerRow | undefined;
    if (!data) return null;

    return (
        <div style={{
            background: COLORS.tooltipBg,
            border: `1px solid ${COLORS.tooltipBorder}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '0.8rem',
            lineHeight: 1.7,
            color: '#333',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
            <div style={{fontWeight: 700, color: '#111', marginBottom: 4, fontSize: '0.85rem'}}>
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

    const chartData = [...rows].sort((a, b) => a.dte - b.dte);
    const optimalRow = rows.find(r => r.isOptimal);

    return (
        <ChartsContainerBox>
            <ChartLabelBox>Premium Efficiency ($/Day)</ChartLabelBox>
            <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{top: 5, right: 15, left: 5, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid}/>
                        <XAxis
                            dataKey="dte"
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={false}
                            axisLine={{stroke: '#ddd'}}
                        />
                        <YAxis
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={v => `$${v}`}
                        />
                        <Tooltip content={<CustomTooltip/>}/>

                        <Area
                            type="monotone"
                            dataKey="premiumPerDay"
                            fill={COLORS.premiumFill}
                            stroke="none"
                        />

                        <Line
                            type="monotone"
                            dataKey="premiumPerDay"
                            stroke={COLORS.premiumPerDay}
                            strokeWidth={2}
                            dot={{r: 3, fill: COLORS.premiumPerDay, strokeWidth: 0}}
                            activeDot={{r: 5, fill: COLORS.premiumPerDay, stroke: '#fff', strokeWidth: 2}}
                        />

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

            <ChartLabelBox>Risk-Adjusted Decay (θ/γ Ratio)</ChartLabelBox>
            <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{top: 5, right: 15, left: 5, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid}/>
                        <XAxis
                            dataKey="dte"
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={false}
                            axisLine={{stroke: '#ddd'}}
                        />
                        <YAxis
                            tick={{fontSize: 11, fill: COLORS.axis}}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip/>}/>

                        <Area
                            type="monotone"
                            dataKey="thetaGammaRatio"
                            fill={COLORS.thetaFill}
                            stroke={COLORS.thetaGamma}
                            strokeWidth={2}
                            dot={{r: 3, fill: COLORS.thetaGamma, strokeWidth: 0}}
                            activeDot={{r: 5, fill: COLORS.thetaGamma, stroke: '#fff', strokeWidth: 2}}
                        />

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

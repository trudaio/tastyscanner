import React from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import styled from "styled-components";
import type {IStrategyResult} from "./dte-strategy-simulator.interface";

const ChartContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`

const ChartBox = styled.div`
    width: 100%;
    height: 280px;
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

const LegendBox = styled.div`
    display: flex;
    justify-content: center;
    gap: 24px;
    font-size: 0.75rem;
    color: #888;
`

interface Props {
    results: IStrategyResult[];
}

interface ChartDataItem {
    label: string;
    capturedPerDay: number;
    capturedPremium: number;
    color: string;
    colorLight: string;
    isBest: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({active, payload}: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0]?.payload as ChartDataItem | undefined;
    if (!data) return null;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '0.8rem',
            lineHeight: 1.7,
            color: '#333',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
            <div style={{fontWeight: 700, color: '#111', marginBottom: 4}}>
                {data.label} {data.isBest ? ' — BEST $/DAY' : ''}
            </div>
            <div style={{color: data.color, fontWeight: 700}}>$/Day: ${data.capturedPerDay.toFixed(2)}</div>
            <div>Captured Premium: ${data.capturedPremium.toFixed(2)}</div>
        </div>
    );
};

export const DteStrategySimulatorChartComponent: React.FC<Props> = ({results}) => {
    const validResults = results.filter(r => r.found);
    if (validResults.length === 0) return null;

    const bestPerDay = Math.max(...validResults.map(r => r.capturedPerDay));

    const chartData: ChartDataItem[] = validResults.map(r => ({
        label: r.strategy.label,
        capturedPerDay: Math.round(r.capturedPerDay * 100) / 100,
        capturedPremium: Math.round(r.capturedPremium * 100) / 100,
        color: r.strategy.color,
        colorLight: hexToRgba(r.strategy.color, 0.35),
        isBest: r.capturedPerDay === bestPerDay,
    }));

    return (
        <ChartContainerBox>
            <ChartLabelBox>Strategy Comparison — $/Day & Captured Premium</ChartLabelBox>
            <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{top: 10, right: 20, left: 5, bottom: 5}} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                        <XAxis
                            dataKey="label"
                            tick={{fontSize: 11, fill: '#888'}}
                            tickLine={false}
                            axisLine={{stroke: '#ddd'}}
                        />
                        <YAxis
                            yAxisId="perDay"
                            tick={{fontSize: 11, fill: '#888'}}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={v => `$${v}`}
                        />
                        <YAxis
                            yAxisId="captured"
                            orientation="right"
                            tick={{fontSize: 11, fill: '#888'}}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={v => `$${v}`}
                        />
                        <Tooltip content={<CustomTooltip/>}/>

                        <Bar yAxisId="captured" dataKey="capturedPremium" name="Captured Premium" radius={[4, 4, 0, 0]} barSize={28}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cap-${index}`} fill={entry.colorLight}/>
                            ))}
                        </Bar>

                        <Bar yAxisId="perDay" dataKey="capturedPerDay" name="$/Day" radius={[4, 4, 0, 0]} barSize={28}>
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`pd-${index}`}
                                    fill={entry.color}
                                    stroke={entry.isBest ? '#111' : 'none'}
                                    strokeWidth={entry.isBest ? 2 : 0}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartBox>
            <LegendBox>
                {chartData.map(d => (
                    <span key={d.label}>
                        <span style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: d.color,
                            marginRight: 4,
                            verticalAlign: 'middle',
                        }}/>
                        {d.label}
                    </span>
                ))}
            </LegendBox>
        </ChartContainerBox>
    );
};

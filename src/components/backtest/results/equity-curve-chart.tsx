/**
 * Equity Curve Chart — Backtest Results
 *
 * Renders an AreaChart of the equity curve over time using recharts.
 */

import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ChartContainer, formatDollar } from '../backtest-styled';
import type { IEquityPoint } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    equityCurve: IEquityPoint[];
}

export const EquityCurveChartComponent: React.FC<Props> = ({ equityCurve }) => (
    <ChartContainer>
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4a9eff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4a9eff" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis
                    dataKey="date"
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                    tickFormatter={(v: string) => v.substring(5)}
                />
                <YAxis
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8 }}
                    labelStyle={{ color: '#888' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [formatDollar(Number(v)), 'Equity']}
                />
                <Area type="monotone" dataKey="equity" stroke="#4a9eff" fill="url(#eqGrad)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    </ChartContainer>
);

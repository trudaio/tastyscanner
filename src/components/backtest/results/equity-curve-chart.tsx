/**
 * Equity Curve Chart — Backtest Results
 *
 * Renders an AreaChart of the equity curve over time using recharts.
 */

import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ChartContainer, PanelHeader, PanelHeaderText, PanelHeaderTitle, formatDollar } from '../backtest-styled';
import type { IEquityPoint } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    equityCurve: IEquityPoint[];
}

export const EquityCurveChartComponent: React.FC<Props> = ({ equityCurve }) => (
    <ChartContainer>
        <PanelHeader>
            <PanelHeaderTitle>Evolutia capitalului</PanelHeaderTitle>
            <PanelHeaderText>
                Curba arata ritmul in care setup-ul acumuleaza profit, pierdere si drawdown pe toata fereastra testata.
            </PanelHeaderText>
        </PanelHeader>
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4a9eff" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#4a9eff" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(162, 184, 219, 0.16)" />
                <XAxis
                    dataKey="date"
                    stroke="var(--app-text-muted)"
                    tick={{ fill: 'var(--app-text-muted)', fontSize: 11 }}
                    tickFormatter={(v: string) => v.substring(5)}
                />
                <YAxis
                    stroke="var(--app-text-muted)"
                    tick={{ fill: 'var(--app-text-muted)', fontSize: 11 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                    contentStyle={{ background: 'var(--app-panel-solid)', border: '1px solid var(--app-border)', borderRadius: 12, color: 'var(--app-text)' }}
                    labelStyle={{ color: 'var(--app-text-muted)' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [formatDollar(Number(v)), 'Equity']}
                />
                <Area type="monotone" dataKey="equity" stroke="#4a9eff" fill="url(#eqGrad)" strokeWidth={2.4} />
            </AreaChart>
        </ResponsiveContainer>
    </ChartContainer>
);

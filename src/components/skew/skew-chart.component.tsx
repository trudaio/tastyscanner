import React from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import type { ISkewChartPoint } from '../../services/skew-analysis/skew-analysis.service.interface';

interface IProps {
    data: ISkewChartPoint[];
}

export const SkewChartComponent: React.FC<IProps> = ({ data }) => {
    // Defensive plain-array clone, decouples Recharts mutations from any
    // observable container the snapshot may live in.
    const plainData = JSON.parse(JSON.stringify(data));
    return (
        <ResponsiveContainer width="100%" height={380} minWidth={320}>
            <LineChart data={plainData} margin={{ top: 12, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
                <XAxis dataKey="expirationLabel" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={['auto', 'auto']} />
                <Tooltip
                    formatter={(v: unknown) => (v == null ? '–' : `${(v as number).toFixed(2)}%`)}
                />
                <Legend />
                <Line type="monotone" dataKey="putIv10" name="Put 10Δ" stroke="#3b82f6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="callIv10" name="Call 10Δ" stroke="#3b82f6" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="putIv20" name="Put 20Δ" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="callIv20" name="Call 20Δ" stroke="#8b5cf6" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="putIv30" name="Put 30Δ" stroke="#06b6d4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="callIv30" name="Call 30Δ" stroke="#06b6d4" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="putIv40" name="Put 40Δ" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="callIv40" name="Call 40Δ" stroke="#f59e0b" dot={false} strokeDasharray="4 3" />
            </LineChart>
        </ResponsiveContainer>
    );
};

export default SkewChartComponent;

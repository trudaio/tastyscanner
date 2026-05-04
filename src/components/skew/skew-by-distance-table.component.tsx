import React from 'react';
import styled from 'styled-components';
import type { IStrikeRow } from '../../services/skew-analysis/skew-analysis.service.interface';

interface IExpirationOption {
    expiration: string;
    isMonthly: boolean;
}

interface IProps {
    ticker: string;
    stockPrice: number | null;
    strikesByExpiration: Record<string, IStrikeRow[]>;
    expirations: IExpirationOption[];
}

const DISTANCES = [1, 5, 10] as const;

const Wrapper = styled.div`
  background: #12121a;
  border: 1px solid #2a2a3a;
  border-radius: 12px;
  padding: 16px 18px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 10px;
  flex-wrap: wrap;
`;

const Title = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: #f0f0f5;
`;

const Interp = styled.div`
  margin-bottom: 14px;
  padding: 10px 14px;
  background: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #cfd5e0;

  strong { color: #38bdf8; }
`;

const Scroll = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  color: #f0f0f5;

  th {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    color: #606070;
    padding: 8px 10px;
    text-align: right;
    border-bottom: 1px solid #2a2a3a;
    background: #12121a;
  }
  th:first-child, td:first-child { text-align: left; }
  th.put-group { background: rgba(239, 68, 68, 0.06); color: #ef4444; }
  th.call-group { background: rgba(34, 197, 94, 0.06); color: #22c55e; }

  td {
    padding: 6px 10px;
    text-align: right;
    border-bottom: 1px solid #1a1a24;
  }
  td.put-cell { color: #ef4444; font-weight: 600; }
  td.call-cell { color: #22c55e; font-weight: 600; }
  td.dim { color: #606070; }
  tr.exp-divider td { border-top: 2px solid #2a2a3a; padding-top: 12px; }
`;

const DistChip = styled.span<{ $pct: number }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: ${(p) => (p.$pct === 1 ? 'rgba(59, 130, 246, 0.2)' : p.$pct === 5 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)')};
  color: ${(p) => (p.$pct === 1 ? '#3b82f6' : p.$pct === 5 ? '#f59e0b' : '#ef4444')};
  border: 1px solid ${(p) => (p.$pct === 1 ? '#3b82f6' : p.$pct === 5 ? '#f59e0b' : '#ef4444')};
`;

function fmtNum(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return v.toFixed(digits);
}
function fmtPctSigned(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function findClosestStrike(rows: IStrikeRow[], targetStrike: number, type: 'put' | 'call'): IStrikeRow | null {
    let best: IStrikeRow | null = null;
    let bestDiff = Infinity;
    for (const r of rows) {
        if (r.type !== type) continue;
        const diff = Math.abs(r.strike - targetStrike);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = r;
        }
    }
    return best;
}

interface IDistRow {
    expiration: string;
    isMonthly: boolean;
    pct: number;
    putStrike: number | null;
    putDelta: number | null;
    callStrike: number | null;
    callDelta: number | null;
    deltaDiff: number | null;
    deltaDiffPct: number | null;
}

function buildRows(
    stockPrice: number,
    strikesByExpiration: Record<string, IStrikeRow[]>,
    expirations: IExpirationOption[],
): IDistRow[] {
    const out: IDistRow[] = [];
    for (const e of expirations) {
        const rows = strikesByExpiration[e.expiration];
        if (!rows) continue;
        for (const pct of DISTANCES) {
            const putTarget = stockPrice * (1 - pct / 100);
            const callTarget = stockPrice * (1 + pct / 100);
            const bestPut = findClosestStrike(rows, putTarget, 'put');
            const bestCall = findClosestStrike(rows, callTarget, 'call');
            const putDelta = bestPut?.delta ?? null;
            const callDelta = bestCall?.delta ?? null;
            const deltaDiff = putDelta != null && callDelta != null ? Math.abs(putDelta) - callDelta : null;
            const deltaDiffPct = putDelta != null && callDelta != null && Math.abs(callDelta) > 0
                ? ((Math.abs(putDelta) - callDelta) / Math.abs(callDelta)) * 100
                : null;
            out.push({
                expiration: e.expiration,
                isMonthly: e.isMonthly,
                pct,
                putStrike: bestPut?.strike ?? null,
                putDelta,
                callStrike: bestCall?.strike ?? null,
                callDelta,
                deltaDiff,
                deltaDiffPct,
            });
        }
    }
    return out;
}

function buildInterpretation(rows: IDistRow[], ticker: string): string {
    if (rows.length === 0) return 'No data to summarize.';
    // Average δ-diff% per distance bucket across all expirations
    const buckets: Record<number, number[]> = { 1: [], 5: [], 10: [] };
    for (const r of rows) {
        if (r.deltaDiffPct != null && Number.isFinite(r.deltaDiffPct)) buckets[r.pct].push(r.deltaDiffPct);
    }
    const avg = (arr: number[]): number | null => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const a1 = avg(buckets[1]);
    const a5 = avg(buckets[5]);
    const a10 = avg(buckets[10]);

    const parts: string[] = [];
    parts.push(
        `Each ${ticker} row shows the put + call closest to a fixed % distance from spot. ` +
        `Δ Diff = |put delta| − call delta. Δ Diff % normalizes that vs the call delta. `,
    );
    if (a1 != null) {
        const sign = a1 >= 0 ? 'puts skew richer' : 'calls skew richer';
        parts.push(`At ±1% (near-the-money), ${sign} on average — Δ Diff % = ${a1.toFixed(1)}%. `);
    }
    if (a5 != null) {
        const sign = a5 >= 0 ? 'puts dominate' : 'calls dominate';
        parts.push(`At ±5% (typical IC short strikes), ${sign} (Δ Diff % = ${a5.toFixed(1)}%). `);
    }
    if (a10 != null) {
        const sign = a10 >= 0 ? 'put tail still bid' : 'call tail bid';
        parts.push(`At ±10% (deep tails), ${sign} — Δ Diff % = ${a10.toFixed(1)}%. `);
    }
    parts.push(
        'Read it as a fast skew gauge: large positive Δ Diff % across distances signals fear / hedging demand on the put side; ' +
        'negative values signal call buying / bullish positioning. Use the ±5% row to gauge IC short-strike pricing relative to neutral.',
    );
    return parts.join('');
}

export const SkewByDistanceTable: React.FC<IProps> = ({ ticker, stockPrice, strikesByExpiration, expirations }) => {
    if (!stockPrice) {
        return (
            <Wrapper>
                <Header><Title>Strike by Distance — {ticker}</Title></Header>
                <div style={{ color: '#a0a0b0', fontSize: 13 }}>No stock price available.</div>
            </Wrapper>
        );
    }
    const rows = buildRows(stockPrice, strikesByExpiration, expirations);
    const interp = buildInterpretation(rows, ticker);

    return (
        <Wrapper>
            <Header>
                <Title>Strike by Distance — {ticker} <span style={{ color: '#a0a0b0', fontWeight: 400 }}>(${stockPrice.toFixed(2)})</span></Title>
            </Header>
            <Interp>{interp}</Interp>

            <Scroll>
                <Table>
                    <thead>
                        <tr>
                            <th>Expiration</th>
                            <th>%</th>
                            <th className="put-group">Put Delta (Strike)</th>
                            <th className="call-group">Call Delta (Strike)</th>
                            <th>Δ Diff</th>
                            <th>Δ Diff %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const isFirstOfExp = r.pct === DISTANCES[0];
                            return (
                                <tr key={`${r.expiration}-${r.pct}`} className={isFirstOfExp && i > 0 ? 'exp-divider' : ''}>
                                    <td className="dim">
                                        {isFirstOfExp ? (
                                            <span>{r.expiration} <span style={{ color: r.isMonthly ? '#f59e0b' : '#606070' }}>{r.isMonthly ? '📅' : 'w'}</span></span>
                                        ) : null}
                                    </td>
                                    <td><DistChip $pct={r.pct}>±{r.pct}%</DistChip></td>
                                    <td className="put-cell">
                                        {fmtNum(r.putDelta, 2)} {r.putStrike != null && <span style={{ color: '#a0a0b0', fontWeight: 400 }}>(${r.putStrike.toFixed(2)})</span>}
                                    </td>
                                    <td className="call-cell">
                                        {fmtNum(r.callDelta, 2)} {r.callStrike != null && <span style={{ color: '#a0a0b0', fontWeight: 400 }}>(${r.callStrike.toFixed(2)})</span>}
                                    </td>
                                    <td style={{ color: r.deltaDiff == null ? undefined : r.deltaDiff > 0 ? '#ef4444' : r.deltaDiff < 0 ? '#22c55e' : '#a0a0b0' }}>
                                        {r.deltaDiff == null ? '–' : `${r.deltaDiff >= 0 ? '+' : ''}${r.deltaDiff.toFixed(2)}`}
                                    </td>
                                    <td style={{ color: r.deltaDiffPct == null ? undefined : r.deltaDiffPct > 0 ? '#ef4444' : r.deltaDiffPct < 0 ? '#22c55e' : '#a0a0b0' }}>
                                        {fmtPctSigned(r.deltaDiffPct, 1)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </Scroll>
        </Wrapper>
    );
};

export default SkewByDistanceTable;

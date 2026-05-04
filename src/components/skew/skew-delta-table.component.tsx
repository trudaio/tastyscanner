import React from 'react';
import styled from 'styled-components';
import type { IExpirationDetail, IDeltaLevelDetail } from '../../services/skew-analysis/skew-analysis.service.interface';

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
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const Title = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: #f0f0f5;
`;

const AnalysisCard = styled.div`
  margin: 12px 0;
  padding: 12px 14px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  font-size: 13px;
  color: #f0f0f5;

  strong { color: #f59e0b; font-weight: 700; }
  .label { font-weight: 700; color: #f59e0b; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 4px; }
`;

const FormulaBar = styled.div`
  margin: 8px 0 12px;
  font-size: 12px;
  color: #a0a0b0;

  code {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
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
    position: sticky;
    top: 0;
    z-index: 1;
  }
  th:first-child, td:first-child { text-align: left; }
  th.put-group { background: rgba(239, 68, 68, 0.06); color: #ef4444; }
  th.call-group { background: rgba(34, 197, 94, 0.06); color: #22c55e; }
  th.skew-group { color: #a0a0b0; }

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

const DeltaPill = styled.span<{ $delta: 10 | 20 | 30 | 40 }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: ${(p) => ({ 10: '#3b82f6', 20: '#8b5cf6', 30: '#06b6d4', 40: '#f59e0b' }[p.$delta])};
  color: white;
`;

interface IProps {
    ticker: string;
    stockPrice: number | null;
    expirationDetails: IExpirationDetail[];
}

function fmtMoney(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return `$${v.toFixed(2)}`;
}
function fmtMoneyParen(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '';
    return `($${Math.round(v)})`;
}
function fmtPctSigned(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
function fmtVol(v: number | null | undefined): string {
    if (v == null) return '–';
    return v.toLocaleString();
}
function fmtNum(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return v.toFixed(digits);
}

function buildAnalysis(monthlies: IExpirationDetail[]): string {
    if (monthlies.length === 0) return 'No monthly expirations available.';
    const first = monthlies[0];
    const ten = first.perDelta.find((p) => p.delta === 10);
    const twenty = first.perDelta.find((p) => p.delta === 20);
    const parts: string[] = [];

    if (ten?.skewPct != null && ten.putVolume > 0 && ten.callVolume > 0) {
        const more = ten.skewPct > 0;
        const ratio = ten.callVolume / Math.max(ten.putVolume, 1);
        parts.push(`The 10Δ put is ${Math.abs(ten.skewPct).toFixed(1)}% ${more ? 'more expensive' : 'cheaper'} than calls`);
        if (ratio > 1.5) parts.push(`but call volume is ${ratio.toFixed(1)}x higher`);
        else if (ratio < 0.67) parts.push(`but put volume is ${(1 / ratio).toFixed(1)}x higher`);
    }
    if (twenty?.skewPct != null) {
        const more = twenty.skewPct > 0;
        parts.push(`The 20Δ puts are ${Math.abs(twenty.skewPct).toFixed(1)}% ${more ? 'more expensive' : 'cheaper'} than calls`);
    }
    return parts.length ? parts.join('. ') + '.' : 'Insufficient data for monthly analysis.';
}

export const SkewDeltaTable: React.FC<IProps> = ({ ticker, stockPrice, expirationDetails }) => {
    const monthlies = expirationDetails.filter((d) => d.isMonthly);
    const analysis = buildAnalysis(monthlies);

    return (
        <Wrapper>
            <Header>
                <Title>Delta Table — {ticker} {stockPrice != null && <span style={{ color: '#a0a0b0', fontWeight: 400 }}>({fmtMoney(stockPrice)})</span>}</Title>
            </Header>

            <AnalysisCard>
                <div className="label">📅 Monthly Options Analysis</div>
                {analysis}
            </AnalysisCard>

            <FormulaBar>
                Formulas: <code>Skew % = (Put − Call) / Call × 100</code>
                {' | '}<code>Imbal = |Put Dist / Call Dist|</code>
            </FormulaBar>

            <Scroll>
                <Table>
                    <thead>
                        <tr>
                            <th>Exp</th>
                            <th>Δ</th>
                            <th className="put-group">Put $ (Strike)</th>
                            <th className="put-group">Put Dist</th>
                            <th className="put-group">Put Vol</th>
                            <th className="call-group">Call $ (Strike)</th>
                            <th className="call-group">Call Dist</th>
                            <th className="call-group">Call Vol</th>
                            <th className="skew-group">Skew $</th>
                            <th className="skew-group">Skew %</th>
                            <th className="skew-group">Imbal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expirationDetails.map((det) => (
                            det.perDelta.map((lvl: IDeltaLevelDetail, i) => (
                                <tr key={`${det.expiration}-${lvl.delta}`} className={i === 0 ? 'exp-divider' : ''}>
                                    <td className="dim">
                                        {i === 0 ? (
                                            <span>{det.expiration} {det.isMonthly ? <span style={{ color: '#f59e0b' }}>📅</span> : <span style={{ color: '#606070' }}>w</span>}</span>
                                        ) : null}
                                    </td>
                                    <td><DeltaPill $delta={lvl.delta as 10 | 20 | 30 | 40}>{lvl.delta}Δ</DeltaPill></td>
                                    <td className="put-cell">{fmtMoney(lvl.putPremium)} <span style={{ color: '#a0a0b0', fontWeight: 400 }}>{fmtMoneyParen(lvl.putStrike)}</span></td>
                                    <td className="put-cell">{lvl.putStrike != null && stockPrice != null ? `${(lvl.putStrike - stockPrice).toFixed(2)} (${fmtPctSigned(lvl.putDistPct, 1)})` : '–'}</td>
                                    <td>{fmtVol(lvl.putVolume)}</td>
                                    <td className="call-cell">{fmtMoney(lvl.callPremium)} <span style={{ color: '#a0a0b0', fontWeight: 400 }}>{fmtMoneyParen(lvl.callStrike)}</span></td>
                                    <td className="call-cell">{lvl.callStrike != null && stockPrice != null ? `${(lvl.callStrike - stockPrice).toFixed(2)} (${fmtPctSigned(lvl.callDistPct, 1)})` : '–'}</td>
                                    <td>{fmtVol(lvl.callVolume)}</td>
                                    <td>{fmtMoney(lvl.skewDollar)}</td>
                                    <td style={{ color: lvl.skewPct == null ? undefined : lvl.skewPct > 30 ? '#ef4444' : lvl.skewPct > 0 ? '#facc15' : '#22c55e' }}>{fmtPctSigned(lvl.skewPct, 1)}</td>
                                    <td style={{ color: lvl.imbalance != null && lvl.imbalance < 1 ? '#22c55e' : undefined }}>{fmtNum(lvl.imbalance, 2)}</td>
                                </tr>
                            ))
                        ))}
                    </tbody>
                </Table>
            </Scroll>
        </Wrapper>
    );
};

export default SkewDeltaTable;

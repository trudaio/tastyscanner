import React from 'react';
import styled from 'styled-components';
import type { IInsiderTrade } from '../../services/api-clients/fmp.client';
import { C, Card, CardTitle, CardTitleRow, Empty, ExternalLink, Table } from './analyst-insider-styled';

interface IProps {
    rows: IInsiderTrade[];
}

const TintedRow = styled.tr<{ $tone: 'sale' | 'proposed-sale' | 'purchase' | 'neutral' }>`
  background: ${(p) =>
        p.$tone === 'sale' ? C.rowSale
            : p.$tone === 'proposed-sale' ? C.rowProposedSale
                : 'transparent'};
  color: ${C.text};
`;

const Numeric = styled.td`
  font-variant-numeric: tabular-nums;
  text-align: right;
`;

function tone(t: IInsiderTrade['transactionType']): 'sale' | 'proposed-sale' | 'purchase' | 'neutral' {
    if (t === 'Sale') return 'sale';
    if (t === 'Proposed Sale') return 'proposed-sale';
    if (t === 'Purchase' || t === 'Proposed Purchase') return 'purchase';
    return 'neutral';
}

function fmtTxnDate(iso: string): string {
    if (!iso || iso.length < 10) return iso;
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    const yy = String(d.getFullYear()).slice(-2);
    return `${d.toLocaleDateString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')} '${yy}`;
}

function fmtFiledAt(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const yy = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${d.toLocaleDateString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')} '${yy} ${time}`;
}

function fmtNum(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPrice(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(2);
}

export const InsiderTradingTable: React.FC<IProps> = ({ rows }) => {
    if (rows.length === 0) {
        return (
            <Card>
                <CardTitleRow><CardTitle>Insider Trading</CardTitle></CardTitleRow>
                <Empty>No recent insider transactions.</Empty>
            </Card>
        );
    }

    return (
        <Card>
            <CardTitleRow><CardTitle>Insider Trading</CardTitle></CardTitleRow>
            <div style={{ overflowX: 'auto' }}>
                <Table>
                    <thead>
                        <tr>
                            <th>Insider</th>
                            <th>Relationship</th>
                            <th>Date</th>
                            <th>Transaction</th>
                            <Numeric as="th">Cost</Numeric>
                            <Numeric as="th">#Shares</Numeric>
                            <Numeric as="th">Value ($)</Numeric>
                            <Numeric as="th">#Shares Total</Numeric>
                            <th>SEC Form 4</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <TintedRow key={`${r.transactionDate}-${r.insiderName}-${i}`} $tone={tone(r.transactionType)}>
                                <td style={{ color: C.accent }}>{r.insiderName || '—'}</td>
                                <td>{r.relationship || '—'}</td>
                                <td>{fmtTxnDate(r.transactionDate)}</td>
                                <td>{r.transactionType}</td>
                                <Numeric>{fmtPrice(r.price)}</Numeric>
                                <Numeric>{fmtNum(r.shares)}</Numeric>
                                <Numeric>{fmtNum(r.value)}</Numeric>
                                <Numeric>{fmtNum(r.sharesTotal)}</Numeric>
                                <td>
                                    {r.formUrl
                                        ? <ExternalLink href={r.formUrl} target="_blank" rel="noreferrer">{fmtFiledAt(r.filedAt)}</ExternalLink>
                                        : fmtFiledAt(r.filedAt)}
                                </td>
                            </TintedRow>
                        ))}
                    </tbody>
                </Table>
            </div>
        </Card>
    );
};

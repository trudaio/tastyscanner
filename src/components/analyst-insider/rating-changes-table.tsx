import React, { useState } from 'react';
import styled from 'styled-components';
import type { IGradeChange, GradeAction } from '../../services/api-clients/fmp.client';
import { C, Card, CardTitle, CardTitleRow, Empty, Pill, Table } from './analyst-insider-styled';

interface IProps {
    rows: IGradeChange[];
    /** Initial visible row count. Default 10 — "Show Previous Ratings" expands to all. */
    initial?: number;
}

const RowText = styled.tr<{ $tone: 'up' | 'down' | 'neutral' }>`
  color: ${(p) => p.$tone === 'up' ? C.success : p.$tone === 'down' ? C.danger : C.text};
`;

const Disclosure = styled.button`
  margin-top: 12px;
  background: transparent;
  border: none;
  color: ${C.accent};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;
  &:hover { text-decoration: underline; }
`;

function tone(action: GradeAction): 'up' | 'down' | 'neutral' {
    if (action === 'Upgrade') return 'up';
    if (action === 'Downgrade') return 'down';
    return 'neutral';
}

function actionPillKind(action: GradeAction): 'up' | 'down' | 'neutral' {
    return tone(action);
}

function fmtDate(iso: string): string {
    if (!iso || iso.length < 10) return iso;
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' });
}

function fmtRatingChange(prev: string | null, next: string): React.ReactNode {
    if (!prev) return next;
    return (
        <>
            {prev} <span style={{ color: C.textMuted }}>→</span> {next}
        </>
    );
}

export const RatingChangesTable: React.FC<IProps> = ({ rows, initial = 10 }) => {
    const [expanded, setExpanded] = useState(false);

    if (rows.length === 0) {
        return (
            <Card>
                <CardTitleRow><CardTitle>Analyst Ratings</CardTitle></CardTitleRow>
                <Empty>No recent rating changes.</Empty>
            </Card>
        );
    }

    const visible = expanded ? rows : rows.slice(0, initial);

    return (
        <Card>
            <CardTitleRow><CardTitle>Analyst Ratings</CardTitle></CardTitleRow>
            <Table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Analyst</th>
                        <th>Rating Change</th>
                        <th style={{ textAlign: 'right' }}>Price Target</th>
                    </tr>
                </thead>
                <tbody>
                    {visible.map((r, i) => (
                        <RowText key={`${r.date}-${r.firm}-${i}`} $tone={tone(r.action)}>
                            <td>{fmtDate(r.date)}</td>
                            <td><Pill $kind={actionPillKind(r.action)}>{r.action}</Pill></td>
                            <td>{r.firm}</td>
                            <td>{fmtRatingChange(r.previousGrade, r.newGrade)}</td>
                            <td style={{ textAlign: 'right' }}>
                                {r.priceTarget != null ? `$${Math.round(r.priceTarget)}` : '—'}
                            </td>
                        </RowText>
                    ))}
                </tbody>
            </Table>
            {rows.length > initial && (
                <Disclosure onClick={() => setExpanded((v) => !v)}>
                    {expanded ? '▴ Hide Previous Ratings' : `▾ Show Previous Ratings (${rows.length - initial} more)`}
                </Disclosure>
            )}
        </Card>
    );
};

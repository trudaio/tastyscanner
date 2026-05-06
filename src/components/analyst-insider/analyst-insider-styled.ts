import styled, { css } from 'styled-components';

export const C = {
    bgPage: '#0a0a0f',
    bgCard: '#12121a',
    bgRow: '#0e0e16',
    bgRowAlt: '#16161f',
    border: '#2a2a3a',
    borderStrong: '#3a3a4a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    accent: '#3b82f6',
    success: '#22c55e',
    successDeep: '#0a5d2a',
    danger: '#ef4444',
    dangerDeep: '#7f1d1d',
    warning: '#facc15',
    info: '#38bdf8',
    rowSale: 'rgba(127, 29, 29, 0.35)',          // tinted red — completed Sales
    rowProposedSale: 'rgba(101, 60, 30, 0.35)',  // tinted brown — Proposed Sales
} as const;

export const ratingPalette = {
    'Strong Buy': C.successDeep,
    'Buy': C.success,
    'Hold': C.warning,
    'Sell': C.danger,
    'Strong Sell': C.dangerDeep,
} as const;

export type RatingBucket = keyof typeof ratingPalette;

export const SectionGrid = styled.div`
  display: grid;
  gap: 16px;
`;

export const TwoColRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  @media (max-width: 980px) { grid-template-columns: 1fr; }
`;

export const Card = styled.div`
  background: ${C.bgCard};
  border: 1px solid ${C.border};
  border-radius: 12px;
  padding: 16px 18px;
  color: ${C.text};
`;

export const CardTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
`;

export const CardTitle = styled.div`
  font-size: 16px;
  font-weight: 800;
  color: ${C.text};
`;

export const CardSubTitle = styled.div`
  font-size: 11px;
  color: ${C.textDim};
  margin-bottom: 8px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

export const Empty = styled.div`
  color: ${C.textDim};
  font-size: 13px;
  padding: 8px 2px;
`;

const tableShared = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid ${C.border};
  }
  th {
    font-weight: 700;
    font-size: 11px;
    color: ${C.textDim};
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: transparent;
  }
  tbody tr:last-child td { border-bottom: none; }
`;

export const Table = styled.table`
  ${tableShared}
`;

export const Pill = styled.span<{ $kind: 'up' | 'down' | 'neutral' }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: ${(p) => p.$kind === 'up' ? C.success : p.$kind === 'down' ? C.danger : '#2f2f3a'};
  color: #ffffff;
`;

export const ExternalLink = styled.a`
  color: ${C.accent};
  text-decoration: none;
  font-size: 12px;
  &:hover { text-decoration: underline; }
`;

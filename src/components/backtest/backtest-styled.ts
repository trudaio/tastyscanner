/**
 * Backtest — Shared Styled Components
 *
 * All reusable styled-components for the backtest UI.
 * Used by sections, results, and saved panels.
 */

import styled, { css } from 'styled-components';

// ─── Layout ──────────────────────────────────────────────────────────────────

export const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    min-height: 100%;
    @media (max-width: 480px) { padding: 12px; }
`;

export const SectionTitle = styled.h2`
    color: #fff;
    font-size: 18px;
    margin: 24px 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #2a2a3e;
    &:first-child { margin-top: 0; }
`;

// ─── Collapsible Card ────────────────────────────────────────────────────────

export const Card = styled.div`
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
`;

export const CardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    cursor: pointer;
    user-select: none;
    &:hover { background: rgba(74, 158, 255, 0.05); }
`;

export const CardHeaderTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
`;

export const OptionalBadge = styled.span`
    color: #555;
    font-size: 12px;
    font-weight: 400;
`;

export const ChevronIcon = styled.span<{ $open: boolean }>`
    color: #666;
    font-size: 18px;
    transition: transform 0.2s;
    transform: rotate(${p => p.$open ? '180deg' : '0deg'});
`;

export const CardContent = styled.div<{ $open: boolean }>`
    max-height: ${p => p.$open ? '2000px' : '0'};
    opacity: ${p => p.$open ? 1 : 0};
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.2s ease;
    padding: ${p => p.$open ? '0 16px 16px' : '0 16px'};
`;

// ─── Form Elements ───────────────────────────────────────────────────────────

export const ParamsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
`;

export const ParamGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

export const ParamLabel = styled.label`
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

export const ParamInput = styled.input`
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    border-radius: 6px;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    &:focus { border-color: #4a9eff; }
    &::placeholder { color: #555; }
`;

export const ParamInputOnCard = styled(ParamInput)`
    background: #0d0d1a;
`;

export const ParamSelect = styled.select`
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    border-radius: 6px;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    &:focus { border-color: #4a9eff; }
`;

export const ParamSelectOnCard = styled(ParamSelect)`
    background: #0d0d1a;
`;

export const ParamTextarea = styled.textarea`
    background: #0d0d1a;
    border: 1px solid #2a2a3e;
    border-radius: 6px;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
    &:focus { border-color: #4a9eff; }
    &::placeholder { color: #555; }
`;

// ─── Chips ───────────────────────────────────────────────────────────────────

export const ChipsRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
`;

export const Chip = styled.button<{ $active: boolean }>`
    background: ${p => p.$active ? '#4a9eff' : '#1a1a2e'};
    color: ${p => p.$active ? '#fff' : '#888'};
    border: 1px solid ${p => p.$active ? '#4a9eff' : '#2a2a3e'};
    border-radius: 16px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { border-color: #4a9eff; color: #fff; }
`;

// ─── Leg Table ───────────────────────────────────────────────────────────────

export const LegTable = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
`;

export const LegRow = styled.div<{ $type: 'buy' | 'sell' }>`
    display: grid;
    grid-template-columns: 120px 1fr 120px;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border-radius: 8px;
    background: ${p => p.$type === 'sell'
        ? 'rgba(255, 77, 109, 0.08)'
        : 'rgba(77, 255, 145, 0.08)'};
    border: 1px solid ${p => p.$type === 'sell'
        ? 'rgba(255, 77, 109, 0.2)'
        : 'rgba(77, 255, 145, 0.2)'};

    @media (max-width: 600px) {
        grid-template-columns: 100px 1fr 80px;
        gap: 8px;
        padding: 8px 10px;
    }
`;

export const LegLabel = styled.div<{ $type: 'buy' | 'sell' }>`
    font-size: 13px;
    font-weight: 600;
    color: ${p => p.$type === 'sell' ? '#ff4d6d' : '#4dff91'};
`;

export const LegCriteria = styled.div`
    font-size: 13px;
    color: #ccc;
    display: flex;
    align-items: center;
    gap: 6px;
`;

export const LegValue = styled.div`
    font-size: 13px;
    color: #888;
    text-align: right;
`;

// ─── Buttons ─────────────────────────────────────────────────────────────────

export const ButtonRow = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
`;

export const RunButton = styled.button`
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 12px 32px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    &:hover { background: #3a8eef; }
    &:disabled { background: #333; cursor: not-allowed; color: #666; }
`;

export const CancelButton = styled.button`
    background: transparent;
    color: #ff4d6d;
    border: 1px solid #ff4d6d;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 14px;
    cursor: pointer;
    &:hover { background: rgba(255, 77, 109, 0.1); }
`;

export const SaveButton = styled.button`
    background: #2a2a3e;
    color: #4dff91;
    border: 1px solid #4dff91;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { background: rgba(77, 255, 145, 0.1); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const DeleteButton = styled.button`
    background: transparent;
    color: #ff4d6d;
    border: 1px solid rgba(255, 77, 109, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    &:hover { background: rgba(255, 77, 109, 0.1); }
`;

export const LoadButton = styled.button`
    background: transparent;
    color: #4a9eff;
    border: 1px solid rgba(74, 158, 255, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    &:hover { background: rgba(74, 158, 255, 0.1); }
`;

// ─── Progress ────────────────────────────────────────────────────────────────

export const ProgressContainer = styled.div`
    margin: 16px 0;
`;

export const ProgressBar = styled.div<{ $pct: number }>`
    height: 8px;
    background: #1a1a2e;
    border-radius: 4px;
    overflow: hidden;
    &::after {
        content: '';
        display: block;
        height: 100%;
        width: ${p => p.$pct}%;
        background: #4a9eff;
        border-radius: 4px;
        transition: width 0.3s;
    }
`;

export const ProgressText = styled.div`
    color: #888;
    font-size: 13px;
    margin-top: 4px;
`;

// ─── Stat Cards ──────────────────────────────────────────────────────────────

export const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    @media (max-width: 768px) { grid-template-columns: repeat(2, 1fr); }
    @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

export const StatCard = styled.div<{ $color?: string }>`
    background: #1a1a2e;
    border-radius: 10px;
    padding: 16px;
    border-left: 3px solid ${p => p.$color || '#4a9eff'};
`;

export const StatLabel = styled.div`
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
`;

export const StatValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || '#fff'};
    font-size: 22px;
    font-weight: 700;
`;

// ─── Tables ──────────────────────────────────────────────────────────────────

export const TableContainer = styled.div`
    overflow-x: auto;
    margin-bottom: 16px;
`;

export const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
`;

export const Th = styled.th`
    text-align: left;
    padding: 10px 12px;
    color: #888;
    font-weight: 500;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #2a2a3e;
    white-space: nowrap;
`;

export const Td = styled.td<{ $color?: string }>`
    padding: 10px 12px;
    color: ${p => p.$color || '#ccc'};
    border-bottom: 1px solid #1a1a2e;
    white-space: nowrap;
`;

export const Badge = styled.span<{ $color: string }>`
    background: ${p => p.$color}22;
    color: ${p => p.$color};
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
`;

// ─── Chart ───────────────────────────────────────────────────────────────────

export const ChartContainer = styled.div`
    background: #1a1a2e;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
    height: 300px;
`;

// ─── Error ───────────────────────────────────────────────────────────────────

export const ErrorBox = styled.div`
    background: rgba(255, 77, 109, 0.1);
    border: 1px solid #ff4d6d;
    border-radius: 8px;
    padding: 12px 16px;
    color: #ff4d6d;
    margin: 12px 0;
`;

// ─── Save Name Input ─────────────────────────────────────────────────────────

export const SaveRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 16px 0;
`;

export const SaveInput = styled.input`
    background: #0d0d1a;
    border: 1px solid #2a2a3e;
    border-radius: 6px;
    color: #fff;
    padding: 8px 12px;
    font-size: 13px;
    outline: none;
    flex: 1;
    max-width: 300px;
    &:focus { border-color: #4dff91; }
    &::placeholder { color: #555; }
`;

// ─── Saved Tests ─────────────────────────────────────────────────────────────

export const SavedTestsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
`;

export const SavedTestCard = styled.div`
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const SavedTestName = styled.div`
    color: #fff;
    font-size: 14px;
    font-weight: 600;
`;

export const SavedTestMeta = styled.div`
    color: #666;
    font-size: 11px;
`;

export const SavedTestStats = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    font-size: 12px;
`;

export const SavedTestStatItem = styled.div<{ $color?: string }>`
    color: ${p => p.$color || '#888'};
    span { color: #555; font-size: 10px; display: block; }
`;

export const SavedTestActions = styled.div`
    display: flex;
    gap: 6px;
    margin-top: 4px;
`;

// ─── Helpers (shared formatters) ─────────────────────────────────────────────

export function formatDollar(v: number): string {
    return v >= 0
        ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(v: number): string {
    return `${v.toFixed(2)}%`;
}

export function plColor(v: number): string {
    return v > 0 ? '#4dff91' : v < 0 ? '#ff4d6d' : '#888';
}

export function winRateColor(v: number): string {
    return v >= 60 ? '#4dff91' : v >= 40 ? '#ffd93d' : '#ff4d6d';
}

export const EXIT_REASON_LABELS: Record<string, { label: string; color: string }> = {
    profit_target: { label: 'Profit', color: '#4dff91' },
    stop_loss: { label: 'Stop Loss', color: '#ff4d6d' },
    dte_close: { label: 'DTE Close', color: '#ffd93d' },
    expiration: { label: 'Expired', color: '#4a9eff' },
};

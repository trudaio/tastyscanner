/**
 * Backtest — Shared Styled Components
 *
 * All reusable styled-components for the backtest UI.
 * Used by sections, results, and saved panels.
 */

import styled, { css } from 'styled-components';

// ─── Layout ──────────────────────────────────────────────────────────────────

export const Container = styled.div`
    padding: 24px;
    background: transparent;
    min-height: 100%;
    @media (max-width: 480px) { padding: 16px; }
`;

export const SectionTitle = styled.h2`
    color: var(--app-text);
    font-size: 1rem;
    margin: 24px 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(162, 184, 219, 0.12);
    &:first-child { margin-top: 0; }
`;

export const SectionLead = styled.p`
    margin: 0 0 14px;
    color: var(--app-text-muted);
    line-height: 1.6;
`;

export const Hero = styled.div`
    padding: 24px;
    border-radius: var(--app-radius-lg);
    background: var(--app-hero-surface);
    border: 1px solid var(--app-hero-border);
    box-shadow: var(--app-shadow);
    margin-bottom: 18px;
`;

export const HeroTop = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
`;

export const HeroText = styled.div`
    display: grid;
    gap: 10px;
    max-width: 72ch;
`;

export const HeroEyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
`;

export const HeroTitle = styled.h1`
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.7rem, 3.4vw, 2.35rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
`;

export const HeroSummary = styled.p`
    margin: 0;
    color: var(--app-text-soft);
    line-height: 1.6;
`;

export const HeroMetrics = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;

    @media (max-width: 960px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 620px) {
        grid-template-columns: 1fr;
    }
`;

export const HeroMetric = styled.div`
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
`;

export const HeroMetricLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
    margin-bottom: 6px;
`;

export const HeroMetricValue = styled.div`
    color: var(--app-text);
    font-size: 1.08rem;
    font-weight: 800;
`;

export const WorkflowGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;

    @media (max-width: 860px) {
        grid-template-columns: 1fr;
    }
`;

export const WorkflowCard = styled.div`
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
    box-shadow: 0 16px 28px rgba(9, 17, 31, 0.08);
`;

export const WorkflowStep = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
`;

export const WorkflowTitle = styled.div`
    color: var(--app-text);
    font-size: 0.98rem;
    font-weight: 800;
`;

export const WorkflowText = styled.div`
    color: var(--app-text-soft);
    font-size: 0.88rem;
    line-height: 1.55;
`;

// ─── Collapsible Card ────────────────────────────────────────────────────────

export const Card = styled.div`
    background: var(--app-panel-solid);
    border: 1px solid var(--app-border);
    border-radius: 18px;
    margin-bottom: 12px;
    overflow: hidden;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
`;

export const CardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 18px;
    cursor: pointer;
    user-select: none;
    &:hover { background: var(--app-hover-surface); }
`;

export const CardHeaderTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--app-text);
    font-size: 15px;
    font-weight: 600;
`;

export const OptionalBadge = styled.span`
    color: var(--app-text-muted);
    font-size: 12px;
    font-weight: 400;
`;

export const ChevronIcon = styled.span<{ $open: boolean }>`
    color: var(--app-text-muted);
    font-size: 18px;
    transition: transform 0.2s;
    transform: rotate(${p => p.$open ? '180deg' : '0deg'});
`;

export const CardContent = styled.div<{ $open: boolean }>`
    max-height: ${p => p.$open ? '2000px' : '0'};
    opacity: ${p => p.$open ? 1 : 0};
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.2s ease;
    padding: ${p => p.$open ? '0 18px 18px' : '0 18px'};
`;

// ─── Form Elements ───────────────────────────────────────────────────────────

export const ParamsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 12px;

    @media (max-width: 720px) {
        grid-template-columns: 1fr;
    }
`;

export const ParamGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

export const ParamLabel = styled.label`
    color: var(--app-text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

export const ParamInput = styled.input`
    background: var(--app-subtle-surface-2);
    border: 1px solid rgba(162, 184, 219, 0.12);
    border-radius: 12px;
    color: var(--app-text);
    padding: 10px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    &:focus { border-color: #67a8ff; }
    &::placeholder { color: #66748d; }
`;

export const ParamInputOnCard = styled(ParamInput)`
    background: var(--app-subtle-surface);
`;

export const ParamSelect = styled.select`
    background: var(--app-subtle-surface-2);
    border: 1px solid rgba(162, 184, 219, 0.12);
    border-radius: 12px;
    color: var(--app-text);
    padding: 10px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    &:focus { border-color: #67a8ff; }
`;

export const ParamSelectOnCard = styled(ParamSelect)`
    background: var(--app-subtle-surface);
`;

export const ParamTextarea = styled.textarea`
    background: var(--app-subtle-surface);
    border: 1px solid rgba(162, 184, 219, 0.12);
    border-radius: 12px;
    color: var(--app-text);
    padding: 10px 12px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
    &:focus { border-color: #67a8ff; }
    &::placeholder { color: #66748d; }
`;

// ─── Chips ───────────────────────────────────────────────────────────────────

export const ChipsRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
`;

export const Chip = styled.button<{ $active: boolean }>`
    background: ${p => p.$active ? 'rgba(103, 168, 255, 0.18)' : 'var(--app-subtle-surface)'};
    color: ${p => p.$active ? 'var(--app-text)' : 'var(--app-text-soft)'};
    border: 1px solid ${p => p.$active ? 'rgba(103, 168, 255, 0.28)' : 'rgba(162, 184, 219, 0.12)'};
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { border-color: rgba(103, 168, 255, 0.28); color: var(--app-text); }
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
    color: var(--app-text-soft);
    display: flex;
    align-items: center;
    gap: 6px;
`;

export const LegValue = styled.div`
    font-size: 13px;
    color: var(--app-text-muted);
    text-align: right;
`;

// ─── Buttons ─────────────────────────────────────────────────────────────────

export const ButtonRow = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
    flex-wrap: wrap;
`;

export const RunButton = styled.button`
    background: linear-gradient(135deg, #67a8ff, #7de2d1);
    color: #08111f;
    border: none;
    border-radius: 14px;
    padding: 12px 32px;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.2s;
    min-height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    &:hover { background: linear-gradient(135deg, #5e9cef, #72d3c3); }
    &:disabled { background: var(--app-subtle-surface-2); cursor: not-allowed; color: var(--app-text-muted); }
`;

export const CancelButton = styled.button`
    background: transparent;
    color: #ff6b7e;
    border: 1px solid rgba(255, 107, 126, 0.3);
    border-radius: 14px;
    padding: 12px 24px;
    font-size: 14px;
    cursor: pointer;
    min-height: 52px;
    &:hover { background: rgba(255, 107, 126, 0.1); }
`;

export const SaveButton = styled.button`
    min-height: 46px;
    padding: 0 20px;
    background: linear-gradient(135deg, rgba(77, 255, 145, 0.16), rgba(103, 168, 255, 0.16));
    color: var(--app-text);
    border: 1px solid rgba(77, 255, 145, 0.24);
    border-radius: 14px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { filter: brightness(1.02); border-color: rgba(77, 255, 145, 0.32); }
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
    background: var(--app-subtle-surface-3);
    border-radius: 4px;
    overflow: hidden;
    &::after {
        content: '';
        display: block;
        height: 100%;
        width: ${p => p.$pct}%;
        background: linear-gradient(90deg, #67a8ff, #7de2d1);
        border-radius: 4px;
        transition: width 0.3s;
    }
`;

export const ProgressText = styled.div`
    color: var(--app-text-muted);
    font-size: 13px;
    margin-top: 8px;
    line-height: 1.5;
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
    background: var(--app-panel-solid);
    border-radius: 16px;
    padding: 16px 16px 18px;
    border-left: 3px solid ${p => p.$color || '#4a9eff'};
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

export const StatLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
    margin-bottom: 6px;
`;

export const StatValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || 'var(--app-text)'};
    font-size: 22px;
    font-weight: 700;
`;

// ─── Tables ──────────────────────────────────────────────────────────────────

export const TableContainer = styled.div`
    overflow-x: auto;
    margin-bottom: 16px;
    border-radius: 16px;
    border: 1px solid var(--app-border);
    background: var(--app-panel-surface);
    box-shadow: var(--app-shadow);
`;

export const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;

    tbody tr:nth-child(even) {
        background: var(--app-subtle-surface);
    }

    tbody tr:hover {
        background: var(--app-hover-surface);
    }
`;

export const Th = styled.th`
    text-align: left;
    padding: 12px 14px;
    color: var(--app-text-muted);
    font-weight: 800;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--app-border);
    background: var(--app-table-head-surface);
    white-space: nowrap;
`;

export const Td = styled.td<{ $color?: string }>`
    padding: 12px 14px;
    color: ${p => p.$color || 'var(--app-text-soft)'};
    border-bottom: 1px solid rgba(162, 184, 219, 0.06);
    white-space: nowrap;
`;

export const Badge = styled.span<{ $color: string }>`
    background: ${p => p.$color}22;
    color: ${p => p.$color};
    border: 1px solid ${p => p.$color}33;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
`;

// ─── Chart ───────────────────────────────────────────────────────────────────

export const ChartContainer = styled.div`
    background: var(--app-panel-surface);
    border-radius: 18px;
    padding: 18px;
    margin-bottom: 16px;
    height: 340px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);

    @media (max-width: 600px) {
        height: 260px;
        padding: 12px;
    }
`;

// ─── Error ───────────────────────────────────────────────────────────────────

export const ErrorBox = styled.div`
    background: rgba(255, 107, 126, 0.1);
    border: 1px solid rgba(255, 107, 126, 0.28);
    border-radius: 14px;
    padding: 12px 16px;
    color: #ff6b7e;
    margin: 12px 0;
`;

// ─── Save Name Input ─────────────────────────────────────────────────────────

export const SaveRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 16px 0;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);

    @media (max-width: 640px) {
        flex-direction: column;
        align-items: stretch;
    }
`;

export const SaveInput = styled.input`
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
    border-radius: 12px;
    color: var(--app-text);
    padding: 12px 14px;
    font-size: 13px;
    outline: none;
    flex: 1;
    max-width: 360px;
    &:focus { border-color: #4dff91; }
    &::placeholder { color: #66748d; }
`;

export const ResultsHeader = styled.div`
    display: grid;
    gap: 10px;
    margin: 18px 0 12px;
`;

export const ResultsTitle = styled.div`
    color: var(--app-text);
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

export const ResultsCaption = styled.p`
    margin: 0;
    color: var(--app-text-muted);
    line-height: 1.55;
`;

export const ResultsMetaRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

export const ResultsMetaChip = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 999px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 0.78rem;
    font-weight: 700;
`;

export const PanelHeader = styled.div`
    display: grid;
    gap: 8px;
    margin: 18px 0 12px;
`;

export const PanelHeaderTitle = styled.div`
    color: var(--app-text);
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

export const PanelHeaderText = styled.div`
    color: var(--app-text-muted);
    font-size: 0.9rem;
    line-height: 1.55;
`;

// ─── Saved Tests ─────────────────────────────────────────────────────────────

export const SavedTestsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
`;

export const PanelEmptyState = styled.div`
    display: grid;
    gap: 12px;
    justify-items: flex-start;
    padding: 18px;
    border-radius: 18px;
    border: 1px dashed var(--app-border);
    background: var(--app-surface-1);
`;

export const PanelEmptyTitle = styled.div`
    color: var(--app-text);
    font-size: 1rem;
    font-weight: 800;
`;

export const PanelEmptyText = styled.div`
    color: var(--app-text-soft);
    line-height: 1.6;
`;

export const PanelHintRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

export const PanelHint = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 0.78rem;
    font-weight: 700;
`;

export const SavedTestCard = styled.div`
    background: var(--app-panel-solid);
    border: 1px solid var(--app-border);
    border-radius: 16px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const SavedTestName = styled.div`
    color: var(--app-text);
    font-size: 14px;
    font-weight: 600;
`;

export const SavedTestMeta = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
`;

export const SavedTestStats = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    font-size: 12px;
`;

export const SavedTestStatItem = styled.div<{ $color?: string }>`
    color: ${p => p.$color || 'var(--app-text-muted)'};
    span { color: var(--app-text-muted); font-size: 10px; display: block; }
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
    return v > 0 ? '#4dff91' : v < 0 ? '#ff4d6d' : 'var(--app-text-muted)';
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

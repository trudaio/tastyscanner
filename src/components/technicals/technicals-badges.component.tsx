import React from 'react';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import type {
    ITechnicals, RsiVerdict, BbVerdict, AtrVerdict,
} from '../../services/technicals/technicals.service.interface';

const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;

    @media (max-width: 720px) {
        gap: 4px;
    }
`;

const Separator = styled.span`
    color: var(--ion-color-medium);
    font-weight: 300;
`;

type BadgeTone = 'ok' | 'warn' | 'bad' | 'muted';

const Badge = styled.span<{ $tone: BadgeTone }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;

    ${(p) => {
        switch (p.$tone) {
            case 'ok':   return 'background: rgba(76,175,80,0.18); color:#2e7d32; border-color: rgba(76,175,80,0.35);';
            case 'warn': return 'background: rgba(255,152,0,0.20); color:#b36b00; border-color: rgba(255,152,0,0.40);';
            case 'bad':  return 'background: rgba(244,67,54,0.20); color:#b71c1c; border-color: rgba(244,67,54,0.40);';
            case 'muted':
            default:     return 'background: rgba(120,120,120,0.15); color: var(--ion-color-medium); border-color: rgba(120,120,120,0.30);';
        }
    }}

    @media (max-width: 720px) {
        font-size: 0.78rem;
        padding: 1px 6px;
    }
`;

function rsiTone(verdict: RsiVerdict): BadgeTone {
    switch (verdict) {
        case 'neutral': return 'ok';
        case 'oversold':
        case 'overbought': return 'warn';
        case 'oversold_extreme':
        case 'overbought_extreme': return 'bad';
    }
}

function rsiShortLabel(verdict: RsiVerdict): string {
    switch (verdict) {
        case 'neutral': return '';
        case 'oversold': return 'OS';
        case 'oversold_extreme': return 'OS!';
        case 'overbought': return 'OB';
        case 'overbought_extreme': return 'OB!';
    }
}

function bbTone(verdict: BbVerdict): BadgeTone {
    switch (verdict) {
        case 'neutral': return 'ok';
        case 'near_lower':
        case 'near_upper': return 'warn';
        case 'below_lower':
        case 'above_upper': return 'bad';
    }
}

function atrTone(verdict: AtrVerdict): BadgeTone {
    switch (verdict) {
        case 'low':
        case 'normal': return 'ok';
        case 'elevated': return 'warn';
    }
}

function formatSigma(v: number): string {
    const sign = v >= 0 ? '+' : '−';
    return `${sign}${Math.abs(v).toFixed(2)}σ`;
}

interface Props {
    ticker: string;
}

export const TechnicalsBadgesComponent: React.FC<Props> = observer(({ ticker }) => {
    const services = useServices();
    const t: ITechnicals | null = services.technicals.getTechnicals(ticker);
    const loading = services.technicals.isLoading(ticker);
    const error = services.technicals.getError(ticker);

    // Placeholder chips while loading / no data
    if (!t) {
        const label = loading ? '…' : error ? '—' : '—';
        return (
            <Row>
                <Separator>|</Separator>
                <Badge $tone="muted" title={error ?? 'Loading technicals…'}>RSI {label}</Badge>
                <Badge $tone="muted" title={error ?? 'Loading technicals…'}>BB {label}</Badge>
                <Badge $tone="muted" title={error ?? 'Loading technicals…'}>ATR {label}</Badge>
            </Row>
        );
    }

    const staleTone: BadgeTone | null = t.stale ? 'warn' : null;
    const rsiT: BadgeTone = staleTone ?? rsiTone(t.rsi.verdict);
    const bbT: BadgeTone = staleTone ?? bbTone(t.bb.verdict);
    const atrT: BadgeTone = staleTone ?? atrTone(t.atr.verdict);
    const suffix = t.stale ? ' (stale)' : '';
    const rsiLabel = rsiShortLabel(t.rsi.verdict);

    return (
        <Row>
            <Separator>|</Separator>
            <Badge $tone={rsiT} title={`RSI(14): ${t.rsi.value} — ${t.rsi.verdict.replace('_', ' ')}${suffix}`}>
                RSI {Math.round(t.rsi.value)}{rsiLabel && ` ${rsiLabel}`}
            </Badge>
            <Badge $tone={bbT} title={`BB distance from mid: ${formatSigma(t.bb.distanceSigma)} (upper ${t.bb.upper}, lower ${t.bb.lower})${suffix}`}>
                BB {formatSigma(t.bb.distanceSigma)}
            </Badge>
            <Badge $tone={atrT} title={`ATR(14): ${t.atr.value} — ${t.atr.verdict}${suffix}`}>
                ATR {t.atr.value}
            </Badge>
        </Row>
    );
});

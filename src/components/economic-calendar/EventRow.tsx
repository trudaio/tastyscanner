import { useState } from 'react';
import styled from 'styled-components';
import type { IEconomicEvent, Impact } from '../../models/economic-event.model';
import { formatCountdown } from '../../services/economic-calendar/event-formatting';

function impactColor(impact: Impact): string {
    switch (impact) {
        case 'critical': return '#e74c3c';
        case 'major': return '#e67e22';
        case 'medium': return '#f1c40f';
        case 'low': return '#95a5a6';
    }
}

const Row = styled.div<{ $impact: Impact }>`
    padding: 12px 16px;
    border-left: 3px solid ${p => impactColor(p.$impact)};
    background: var(--ion-item-background);
    border-bottom: 1px solid var(--ion-color-step-100);
    cursor: pointer;
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 12px;
    align-items: center;
    font-size: 14px;

    &:hover {
        background: var(--ion-color-step-50);
    }
`;

const Time = styled.span`
    font-weight: 600;
    min-width: 80px;
`;
const Name = styled.span`
    font-weight: 500;
`;
const Values = styled.span`
    color: var(--ion-color-medium);
    font-size: 13px;
    white-space: nowrap;
`;
const Expanded = styled.div`
    padding: 12px 16px;
    background: var(--ion-color-step-50);
    border-bottom: 1px solid var(--ion-color-step-100);
    font-size: 13px;
    display: grid;
    gap: 6px;
`;
const ImpactDot = styled.span<{ $impact: Impact }>`
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${p => impactColor(p.$impact)};
    display: inline-block;
`;

export interface EventRowProps {
    event: IEconomicEvent;
}

export function EventRow({ event }: EventRowProps) {
    const [expanded, setExpanded] = useState(false);
    const hasValues = event.previousValue !== null || event.forecastValue !== null || event.actualValue !== null;
    const values = hasValues
        ? `prev ${event.previousValue ?? '—'} · fcst ${event.forecastValue ?? '—'} · actual ${event.actualValue ?? '—'}`
        : null;

    return (
        <>
            <Row
                $impact={event.impact}
                onClick={() => setExpanded(x => !x)}
                data-testid="event-row"
            >
                <Time>{event.scheduledEtString}</Time>
                <ImpactDot $impact={event.impact} />
                <Name>{event.name}</Name>
                <Values>{values ?? '—'}</Values>
            </Row>
            {expanded && (
                <Expanded>
                    <div>
                        <strong>Local:</strong> {event.scheduledEestString}
                    </div>
                    <div>
                        <strong>Countdown:</strong> {formatCountdown(event.scheduledUtc as Date)}
                    </div>
                    <div>
                        <strong>Impact:</strong> {event.impact}
                    </div>
                    <div>
                        <strong>Gates:</strong>
                        {event.gatesLadderingPause && ' laddering'}
                        {event.gatesPreEventClose && ' close-window'}
                        {!event.gatesLadderingPause && !event.gatesPreEventClose && ' none'}
                    </div>
                    {event.sourceUrl && (
                        <div>
                            <strong>Source:</strong>{' '}
                            <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                                {event.source}
                            </a>
                        </div>
                    )}
                </Expanded>
            )}
        </>
    );
}

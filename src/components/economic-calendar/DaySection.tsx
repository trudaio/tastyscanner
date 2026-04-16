import styled from 'styled-components';
import { DateTime } from 'luxon';
import type { IEconomicEvent } from '../../models/economic-event.model';
import { getDayBadge } from '../../services/economic-calendar/event-formatting';
import { EventRow } from './EventRow';

const Section = styled.div`
    margin-bottom: 20px;
`;
const Header = styled.div<{ $paused: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: ${p => p.$paused ? 'rgba(231, 76, 60, 0.12)' : 'var(--ion-color-step-100)'};
    border-radius: 8px 8px 0 0;
    font-weight: 600;
    font-size: 14px;
`;
const Badge = styled.span<{ $paused: boolean }>`
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 4px;
    background: ${p => p.$paused ? '#e74c3c' : 'rgba(39, 174, 96, 0.15)'};
    color: ${p => p.$paused ? 'white' : '#27ae60'};
`;
const EmptyRow = styled.div`
    padding: 12px 16px;
    color: var(--ion-color-medium);
    font-style: italic;
`;

const ET_ZONE = 'America/New_York';

function formatDayLabel(day: string): string {
    const dt = DateTime.fromISO(day, { zone: ET_ZONE });
    const today = DateTime.now().setZone(ET_ZONE).toISODate();
    const tomorrow = DateTime.now().setZone(ET_ZONE).plus({ days: 1 }).toISODate();
    if (day === today) return `Today · ${dt.toFormat('EEE MMM d')}`;
    if (day === tomorrow) return `Tomorrow · ${dt.toFormat('EEE MMM d')}`;
    return dt.toFormat('EEE MMM d');
}

export interface DaySectionProps {
    day: string;
    events: IEconomicEvent[];
}

export function DaySection({ day, events }: DaySectionProps) {
    const badge = getDayBadge(events);
    const paused = badge === 'paused';
    return (
        <Section>
            <Header $paused={paused}>
                <span>📅 {formatDayLabel(day)}</span>
                <Badge $paused={paused}>
                    {paused ? '🔴 LADDERING PAUSED' : '🟢 OK to ladder'}
                </Badge>
            </Header>
            {events.length === 0
                ? <EmptyRow>(no scheduled events)</EmptyRow>
                : events.map(e => <EventRow key={e.id} event={e} />)
            }
        </Section>
    );
}

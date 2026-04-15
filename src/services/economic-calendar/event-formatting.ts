import type { IEconomicEvent } from '../../models/economic-event.model';

export type FilterMode = 'all' | 'criticalMajor' | 'criticalOnly';

export function formatCountdown(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    if (diffMs < 0) return 'past';
    const totalMinutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

export function getDayBadge(events: IEconomicEvent[]): 'paused' | 'ok' {
    return events.some(e => e.gatesLadderingPause) ? 'paused' : 'ok';
}

export function matchesFilter(event: IEconomicEvent, mode: FilterMode): boolean {
    if (mode === 'all') return true;
    if (mode === 'criticalMajor') return event.impact === 'critical' || event.impact === 'major';
    if (mode === 'criticalOnly') return event.impact === 'critical';
    return false;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatCountdown, getDayBadge, matchesFilter } from './event-formatting';
import type { IEconomicEvent } from '../../models/economic-event.model';

function mk(overrides: Partial<IEconomicEvent>): IEconomicEvent {
    return {
        id: 'x', eventType: 'CPI', name: 'CPI', country: 'US', impact: 'critical',
        scheduledUtc: new Date(), scheduledEtString: '08:30 ET', scheduledEestString: '15:30 EEST',
        gatesLadderingPause: true, gatesPreEventClose: true,
        previousValue: null, forecastValue: null, actualValue: null,
        source: 'bls', sourceUrl: '',
        seededAt: new Date(), seededBy: 'test', verifiedAt: null,
        ...overrides,
    };
}

describe('formatCountdown', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('formats hours and minutes', () => {
        vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
        const target = new Date('2026-04-16T15:30:00Z');
        expect(formatCountdown(target)).toBe('3h 30m');
    });

    it('formats minutes only under 1h', () => {
        vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
        const target = new Date('2026-04-16T12:45:00Z');
        expect(formatCountdown(target)).toBe('45m');
    });

    it('returns past string for past dates', () => {
        vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
        const target = new Date('2026-04-16T10:00:00Z');
        expect(formatCountdown(target)).toBe('past');
    });
});

describe('getDayBadge', () => {
    it('returns paused when events include gating event', () => {
        const events = [mk({ gatesLadderingPause: true })];
        expect(getDayBadge(events)).toBe('paused');
    });
    it('returns ok when no gating events', () => {
        const events = [mk({ gatesLadderingPause: false, impact: 'low' })];
        expect(getDayBadge(events)).toBe('ok');
    });
    it('returns ok when no events', () => {
        expect(getDayBadge([])).toBe('ok');
    });
});

describe('matchesFilter', () => {
    it('all matches everything', () => {
        expect(matchesFilter(mk({ impact: 'low' }), 'all')).toBe(true);
        expect(matchesFilter(mk({ impact: 'critical' }), 'all')).toBe(true);
    });
    it('criticalMajor matches critical and major only', () => {
        expect(matchesFilter(mk({ impact: 'critical' }), 'criticalMajor')).toBe(true);
        expect(matchesFilter(mk({ impact: 'major' }), 'criticalMajor')).toBe(true);
        expect(matchesFilter(mk({ impact: 'medium' }), 'criticalMajor')).toBe(false);
        expect(matchesFilter(mk({ impact: 'low' }), 'criticalMajor')).toBe(false);
    });
    it('criticalOnly matches critical only', () => {
        expect(matchesFilter(mk({ impact: 'critical' }), 'criticalOnly')).toBe(true);
        expect(matchesFilter(mk({ impact: 'major' }), 'criticalOnly')).toBe(false);
    });
});

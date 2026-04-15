import { describe, it, expect } from 'vitest';
import {
    getLadderingPauseEvents,
    getCloseWindowEvents,
    isInLadderingPauseWindow,
} from './economic-calendar';
import type { IEconomicEvent } from './economic-event.types';

function makeEvent(overrides: Partial<IEconomicEvent>): IEconomicEvent {
    return {
        id: 'test',
        eventType: 'CPI',
        name: 'CPI Test',
        country: 'US',
        impact: 'critical',
        scheduledUtc: new Date(),
        scheduledEtString: '08:30 ET',
        scheduledEestString: '15:30 EEST',
        gatesLadderingPause: true,
        gatesPreEventClose: true,
        previousValue: null,
        forecastValue: null,
        actualValue: null,
        source: 'bls',
        sourceUrl: '',
        seededAt: new Date(),
        seededBy: 'test',
        verifiedAt: null,
        ...overrides,
    };
}

describe('getLadderingPauseEvents', () => {
    const now = new Date('2026-04-16T12:00:00Z'); // noon UTC

    it('returns empty for empty input', () => {
        expect(getLadderingPauseEvents(now, [])).toEqual([]);
    });

    it('returns gating event within 48h', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-17T12:30:00Z'),
            gatesLadderingPause: true,
        });
        expect(getLadderingPauseEvents(now, [event])).toHaveLength(1);
    });

    it('excludes non-gating events', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-17T12:30:00Z'),
            gatesLadderingPause: false,
            impact: 'low',
        });
        expect(getLadderingPauseEvents(now, [event])).toHaveLength(0);
    });

    it('excludes events beyond 48h window', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-19T00:00:00Z'),  // 60h out
        });
        expect(getLadderingPauseEvents(now, [event])).toHaveLength(0);
    });

    it('excludes past events', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T08:00:00Z'),  // 4h ago
        });
        expect(getLadderingPauseEvents(now, [event])).toHaveLength(0);
    });

    it('respects custom lookAheadHours', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T20:00:00Z'),  // 8h out
        });
        expect(getLadderingPauseEvents(now, [event], 4)).toHaveLength(0);
        expect(getLadderingPauseEvents(now, [event], 12)).toHaveLength(1);
    });
});

describe('getCloseWindowEvents', () => {
    const now = new Date('2026-04-16T12:00:00Z');

    it('returns empty for empty input', () => {
        expect(getCloseWindowEvents(now, [])).toEqual([]);
    });

    it('returns event within 4h', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T14:00:00Z'),
            gatesPreEventClose: true,
        });
        expect(getCloseWindowEvents(now, [event], 4)).toHaveLength(1);
    });

    it('excludes event beyond 4h', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T17:00:00Z'),  // 5h out
        });
        expect(getCloseWindowEvents(now, [event], 4)).toHaveLength(0);
    });

    it('excludes past event', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T10:00:00Z'),
        });
        expect(getCloseWindowEvents(now, [event], 4)).toHaveLength(0);
    });
});

describe('isInLadderingPauseWindow', () => {
    // 2026-04-16 12:00 UTC = 08:00 EDT (Thursday morning in ET)
    const now = new Date('2026-04-16T12:00:00Z');

    it('returns paused=false for empty events', () => {
        const result = isInLadderingPauseWindow(now, []);
        expect(result.paused).toBe(false);
        expect(result.blockingEvents).toEqual([]);
    });

    it('pauses when event exists today (ET)', () => {
        const event = makeEvent({
            name: 'CPI',
            scheduledUtc: new Date('2026-04-16T12:30:00Z'),  // 08:30 EDT same day
        });
        const result = isInLadderingPauseWindow(now, [event]);
        expect(result.paused).toBe(true);
        expect(result.blockingEvents).toHaveLength(1);
        expect(result.reason).toContain('CPI');
    });

    it('pauses when event is tomorrow (ET)', () => {
        const event = makeEvent({
            name: 'FOMC',
            scheduledUtc: new Date('2026-04-17T18:00:00Z'),  // 14:00 EDT Friday
        });
        const result = isInLadderingPauseWindow(now, [event]);
        expect(result.paused).toBe(true);
    });

    it('does NOT pause for day-after-tomorrow events', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-18T12:30:00Z'),  // Saturday
        });
        const result = isInLadderingPauseWindow(now, [event]);
        expect(result.paused).toBe(false);
    });

    it('does NOT pause for low-impact events', () => {
        const event = makeEvent({
            scheduledUtc: new Date('2026-04-16T12:30:00Z'),
            gatesLadderingPause: false,
            impact: 'low',
        });
        const result = isInLadderingPauseWindow(now, [event]);
        expect(result.paused).toBe(false);
    });

    it('handles DST spring-forward period (2026-03-11)', () => {
        // After spring forward on 2026-03-08, Wednesday 2026-03-11 is EDT
        // Event at 08:30 ET = 12:30 UTC (EDT = UTC-4)
        const springForwardNow = new Date('2026-03-10T16:00:00Z');  // Tue 12:00 EDT
        const event = makeEvent({
            scheduledUtc: new Date('2026-03-11T12:30:00Z'),  // Wed 08:30 EDT
        });
        const result = isInLadderingPauseWindow(springForwardNow, [event]);
        expect(result.paused).toBe(true);
    });

    it('combines multiple blocking events in reason string', () => {
        const cpi = makeEvent({ name: 'CPI', scheduledUtc: new Date('2026-04-16T12:30:00Z') });
        const fomc = makeEvent({ name: 'FOMC', scheduledUtc: new Date('2026-04-17T18:00:00Z') });
        const result = isInLadderingPauseWindow(now, [cpi, fomc]);
        expect(result.blockingEvents).toHaveLength(2);
        expect(result.reason).toContain('CPI');
        expect(result.reason).toContain('FOMC');
    });
});

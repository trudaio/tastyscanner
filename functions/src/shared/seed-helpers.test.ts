import { describe, it, expect } from 'vitest';
import { eventTypeToImpact, computeDeterministicId, expandSeed } from './seed-helpers';
import type { IEconomicEventSeed } from './economic-event.types';

describe('eventTypeToImpact', () => {
    it('marks FOMC_DECISION as critical', () => {
        expect(eventTypeToImpact('FOMC_DECISION')).toBe('critical');
    });
    it('marks FOMC_PRESS_CONF as critical', () => {
        expect(eventTypeToImpact('FOMC_PRESS_CONF')).toBe('critical');
    });
    it('marks CPI as critical', () => {
        expect(eventTypeToImpact('CPI')).toBe('critical');
    });
    it('marks NFP as critical', () => {
        expect(eventTypeToImpact('NFP')).toBe('critical');
    });
    it('marks PPI as major', () => {
        expect(eventTypeToImpact('PPI')).toBe('major');
    });
    it('marks GDP as major', () => {
        expect(eventTypeToImpact('GDP')).toBe('major');
    });
    it('marks FOMC_MINUTES as medium', () => {
        expect(eventTypeToImpact('FOMC_MINUTES')).toBe('medium');
    });
    it('marks RETAIL_SALES as medium', () => {
        expect(eventTypeToImpact('RETAIL_SALES')).toBe('medium');
    });
    it('marks ISM_MANUFACTURING as medium', () => {
        expect(eventTypeToImpact('ISM_MANUFACTURING')).toBe('medium');
    });
    it('marks ISM_SERVICES as medium', () => {
        expect(eventTypeToImpact('ISM_SERVICES')).toBe('medium');
    });
    it('marks JOBLESS_CLAIMS as low', () => {
        expect(eventTypeToImpact('JOBLESS_CLAIMS')).toBe('low');
    });
    it('marks CONSUMER_CONFIDENCE as low', () => {
        expect(eventTypeToImpact('CONSUMER_CONFIDENCE')).toBe('low');
    });
    it('marks DURABLE_GOODS as low', () => {
        expect(eventTypeToImpact('DURABLE_GOODS')).toBe('low');
    });
    it('marks FED_SPEECH as medium by default', () => {
        expect(eventTypeToImpact('FED_SPEECH')).toBe('medium');
    });
    it('marks OTHER as low', () => {
        expect(eventTypeToImpact('OTHER')).toBe('low');
    });
});

describe('computeDeterministicId', () => {
    it('produces stable IDs for identical inputs', () => {
        const seed: IEconomicEventSeed = { type: 'CPI', date: '2026-04-16', timeET: '08:30' };
        expect(computeDeterministicId(seed)).toBe(computeDeterministicId(seed));
    });
    it('formats as date-type-time', () => {
        const seed: IEconomicEventSeed = { type: 'CPI', date: '2026-04-16', timeET: '08:30' };
        expect(computeDeterministicId(seed)).toBe('2026-04-16-cpi-0830');
    });
    it('distinguishes FOMC decision from press conference at same time', () => {
        const a: IEconomicEventSeed = { type: 'FOMC_DECISION', date: '2026-03-18', timeET: '14:00' };
        const b: IEconomicEventSeed = { type: 'FOMC_PRESS_CONF', date: '2026-03-18', timeET: '14:30' };
        expect(computeDeterministicId(a)).not.toBe(computeDeterministicId(b));
    });
});

describe('expandSeed', () => {
    it('expands CPI seed to full IEconomicEvent', () => {
        const seed: IEconomicEventSeed = {
            type: 'CPI',
            date: '2026-04-16',
            timeET: '08:30',
            period: 'March 2026',
        };
        const event = expandSeed(seed, 'admin:test@example.com');
        expect(event.id).toBe('2026-04-16-cpi-0830');
        expect(event.eventType).toBe('CPI');
        expect(event.impact).toBe('critical');
        expect(event.gatesLadderingPause).toBe(true);
        expect(event.gatesPreEventClose).toBe(true);
        expect(event.country).toBe('US');
        expect(event.name).toBe('CPI (March 2026)');
        expect(event.source).toBe('bls');
        expect(event.seededBy).toBe('admin:test@example.com');
        expect(event.scheduledEtString).toBe('08:30 ET');
    });
    it('converts ET to UTC correctly before DST (Feb)', () => {
        const seed: IEconomicEventSeed = { type: 'CPI', date: '2026-02-11', timeET: '08:30' };
        const event = expandSeed(seed, 'test');
        // Feb 11 2026 is EST (UTC-5): 08:30 ET = 13:30 UTC
        expect(event.scheduledUtc.toISOString()).toBe('2026-02-11T13:30:00.000Z');
    });
    it('converts ET to UTC correctly after DST (April)', () => {
        const seed: IEconomicEventSeed = { type: 'CPI', date: '2026-04-16', timeET: '08:30' };
        const event = expandSeed(seed, 'test');
        // Apr 16 2026 is EDT (UTC-4): 08:30 ET = 12:30 UTC
        expect(event.scheduledUtc.toISOString()).toBe('2026-04-16T12:30:00.000Z');
    });
    it('marks low-impact events as non-gating', () => {
        const seed: IEconomicEventSeed = { type: 'JOBLESS_CLAIMS', date: '2026-04-16', timeET: '08:30' };
        const event = expandSeed(seed, 'test');
        expect(event.gatesLadderingPause).toBe(false);
        expect(event.gatesPreEventClose).toBe(false);
    });
    it('uses fallback name for FOMC (no period)', () => {
        const seed: IEconomicEventSeed = { type: 'FOMC_DECISION', date: '2026-03-18', timeET: '14:00' };
        const event = expandSeed(seed, 'test');
        expect(event.name).toBe('FOMC Decision (2026-03-18)');
    });
});

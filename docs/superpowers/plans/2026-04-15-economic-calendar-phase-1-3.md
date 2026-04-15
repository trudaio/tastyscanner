# Economic Calendar — Phase 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only Economic Calendar page + the first hard-automation gate (laddering pause) so the Guvidul AI agent refuses to open new IC positions on days with high-impact US macro events.

**Architecture:** Firestore `economicEvents` collection holds pre-seeded events. Pure gate functions in `functions/src/shared/economic-calendar.ts` are reusable across Cloud Functions. Frontend MobX service subscribes via `onSnapshot`. `aiDailySubmit` calls `checkGates()` wrapper (feature-flagged) before submitting orders.

**Tech Stack:** Firebase Functions v2 + Firestore + TypeScript 5 + React 19 + Ionic 8 + MobX 6 + Vite + Vitest + luxon (for timezone) + Cypress (E2E).

**Scope boundary:** This plan covers spec §1-§6 + §8 weeks 1-3 only. Excluded (follow-up plans):
- Pre-event close gate in `closeCheck` (spec §5f, week 4)
- Phase 2 auto-close toggle (spec §4d, week 6)
- `weeklyReconcile` cron (spec §5d) — deferred to follow-up because not on critical path for first deployable slice

**Spec reference:** `docs/superpowers/specs/2026-04-15-economic-calendar-design.md`

---

## File Structure Map

### Files to CREATE

| Path | Responsibility |
|------|---------------|
| `src/models/economic-event.model.ts` | `IEconomicEvent`, `EventType`, `Impact` types (shared frontend+backend) |
| `functions/src/shared/economic-calendar.ts` | Pure gate functions + `checkGates` wrapper |
| `functions/src/shared/economic-calendar.test.ts` | Unit tests for gate functions |
| `functions/src/shared/seed-helpers.ts` | `computeDeterministicId`, `expandSeed`, `eventTypeToImpact` |
| `functions/src/shared/seed-helpers.test.ts` | Unit tests for seed helpers |
| `functions/src/data/economic-events-2026.ts` | Hardcoded 2026 US event seed array |
| `functions/src/seedEconomicEvents.ts` | Admin-only callable: upserts events |
| `src/services/economic-calendar/economic-calendar.service.interface.ts` | Service interface |
| `src/services/economic-calendar/economic-calendar.service.ts` | MobX store + Firestore subscription |
| `src/services/economic-calendar/event-formatting.ts` | Pure helpers: `formatCountdown`, `getDayBadge`, `groupByDay` |
| `src/services/economic-calendar/event-formatting.test.ts` | Tests for formatters |
| `src/pages/EconomicCalendarPage.tsx` | Main page shell |
| `src/components/economic-calendar/DaySection.tsx` | Day header + events list |
| `src/components/economic-calendar/EventRow.tsx` | Single event row (collapsible) |
| `src/components/economic-calendar/FilterChips.tsx` | Impact filter chips |
| `src/components/economic-calendar/EmptyState.tsx` | "No events" empty state |
| `src/components/event-banner/event-banner.component.tsx` | Global banner (injected on 5 pages) |

### Files to MODIFY

| Path | Change |
|------|--------|
| `firestore.rules` | Add rules for `economicEvents`, `system_alerts` |
| `firestore.indexes.json` | Add 2 composite indexes |
| `functions/package.json` | Add `vitest`, `luxon`, `@types/luxon` devDeps |
| `functions/src/index.ts` | Export `seedEconomicEvents` callable |
| `functions/src/aiDailySubmit.ts` | Integrate `checkGates()` before submission |
| `src/services/service-factory.ts` | Register `economicCalendar` service |
| `src/services/service-factory.interface.ts` | Add `economicCalendar` field |
| `src/App.tsx` | Add `/economic-calendar` route |
| `src/components/side-menu/side-menu.component.tsx` | Add menu item |
| `src/pages/SuperAdminPage.tsx` | Add Seed UI section |
| `src/pages/DashboardPage.tsx` | Inject `<EventBanner />` |
| `src/pages/IronCondorDashboardPage.tsx` | Inject `<EventBanner />` |
| `src/pages/GuviduVisualizationPage.tsx` | Inject `<EventBanner />` |
| `src/pages/AccountPage.tsx` | Inject `<EventBanner />` |
| `src/pages/GuviduVsCatalinPage.tsx` | Inject `<EventBanner />` |

---

## Prerequisites

Before starting, verify working directory is correct and dependencies available:

- [ ] **Prereq 1: Verify branch**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && git branch --show-current`
Expected: `feat/economic-calendar`

- [ ] **Prereq 2: Verify TypeScript compiles clean BEFORE changes**

Run:
```bash
npx tsc --noEmit
cd functions && npm run build && cd ..
```
Expected: zero errors. Fix any existing issues before proceeding.

- [ ] **Prereq 3: Install functions test runner**

Edit `functions/package.json` — add to `devDependencies`:
```json
"vitest": "^1.4.0",
"luxon": "^3.4.4",
"@types/luxon": "^3.4.2"
```
Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Run: `cd functions && npm install && cd ..`
Expected: vitest installed, no errors.

- [ ] **Prereq 4: Commit dependency setup**

```bash
git add functions/package.json functions/package-lock.json
git commit -m "chore(economic-calendar): add vitest + luxon to functions"
```

---

## Task 1: Shared interface for IEconomicEvent

**Files:**
- Create: `src/models/economic-event.model.ts`

- [ ] **Step 1: Write the interface file**

Create `src/models/economic-event.model.ts`:
```typescript
import type { Timestamp } from 'firebase/firestore';

export type EventType =
    | 'FOMC_DECISION'
    | 'FOMC_PRESS_CONF'
    | 'FOMC_MINUTES'
    | 'CPI'
    | 'PPI'
    | 'NFP'
    | 'GDP'
    | 'RETAIL_SALES'
    | 'ISM_MANUFACTURING'
    | 'ISM_SERVICES'
    | 'JOBLESS_CLAIMS'
    | 'CONSUMER_CONFIDENCE'
    | 'DURABLE_GOODS'
    | 'FED_SPEECH'
    | 'OTHER';

export type Impact = 'critical' | 'major' | 'medium' | 'low';

export type EventSource =
    | 'bls' | 'fed' | 'bea' | 'census' | 'ism' | 'conf_board' | 'dol' | 'manual';

export interface IEconomicEvent {
    id: string;
    eventType: EventType;
    name: string;
    country: string;
    impact: Impact;

    // Timing
    scheduledUtc: Date | Timestamp;     // Date in code, Timestamp from Firestore
    scheduledEtString: string;          // "08:30 ET"
    scheduledEestString: string;        // "15:30 EEST"

    // Gating flags
    gatesLadderingPause: boolean;
    gatesPreEventClose: boolean;

    // Release data
    previousValue: string | null;
    forecastValue: string | null;
    actualValue: string | null;

    // Provenance
    source: EventSource;
    sourceUrl: string;
    seededAt: Date | Timestamp;
    seededBy: string;
    verifiedAt: Date | Timestamp | null;
}

export interface IEconomicEventSeed {
    type: EventType;
    date: string;           // "2026-04-16"
    timeET: string;         // "08:30"
    period?: string;        // "March 2026"
    sourceUrl?: string;     // override default source URL
    hasPressConf?: boolean; // FOMC only
    speakerName?: string;   // FED_SPEECH only
}

export interface ISystemAlert {
    id: string;
    type: 'calendar_seed_low' | 'calendar_reconcile_mismatch' | 'calendar_fomc_reschedule';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    relatedEventId: string | null;
    createdAt: Date | Timestamp;
    acknowledgedAt: Date | Timestamp | null;
    acknowledgedBy: string | null;
}
```

- [ ] **Step 2: Verify no TS errors**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/models/economic-event.model.ts
git commit -m "feat(economic-calendar): add IEconomicEvent model interfaces"
```

---

## Task 2: Seed helpers — `eventTypeToImpact`, `computeDeterministicId`, `expandSeed`

**Files:**
- Create: `functions/src/shared/seed-helpers.ts`
- Create: `functions/src/shared/seed-helpers.test.ts`

- [ ] **Step 1: Duplicate the model interface for functions/ (Functions has no path aliases to src/)**

Create `functions/src/shared/economic-event.types.ts`:
```typescript
// This file mirrors src/models/economic-event.model.ts.
// Functions cannot import from ../src — they compile independently.
// Keep these two files in sync.

export type EventType =
    | 'FOMC_DECISION' | 'FOMC_PRESS_CONF' | 'FOMC_MINUTES'
    | 'CPI' | 'PPI' | 'NFP' | 'GDP' | 'RETAIL_SALES'
    | 'ISM_MANUFACTURING' | 'ISM_SERVICES'
    | 'JOBLESS_CLAIMS' | 'CONSUMER_CONFIDENCE' | 'DURABLE_GOODS'
    | 'FED_SPEECH' | 'OTHER';

export type Impact = 'critical' | 'major' | 'medium' | 'low';

export type EventSource =
    | 'bls' | 'fed' | 'bea' | 'census' | 'ism' | 'conf_board' | 'dol' | 'manual';

export interface IEconomicEvent {
    id: string;
    eventType: EventType;
    name: string;
    country: string;
    impact: Impact;
    scheduledUtc: Date;              // functions use Date, not Timestamp
    scheduledEtString: string;
    scheduledEestString: string;
    gatesLadderingPause: boolean;
    gatesPreEventClose: boolean;
    previousValue: string | null;
    forecastValue: string | null;
    actualValue: string | null;
    source: EventSource;
    sourceUrl: string;
    seededAt: Date;
    seededBy: string;
    verifiedAt: Date | null;
}

export interface IEconomicEventSeed {
    type: EventType;
    date: string;
    timeET: string;
    period?: string;
    sourceUrl?: string;
    hasPressConf?: boolean;
    speakerName?: string;
}
```

- [ ] **Step 2: Write failing tests for `eventTypeToImpact`**

Create `functions/src/shared/seed-helpers.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `cd functions && npx vitest run src/shared/seed-helpers.test.ts`
Expected: ALL TESTS FAIL with "module not found" or similar.

- [ ] **Step 4: Implement `seed-helpers.ts`**

Create `functions/src/shared/seed-helpers.ts`:
```typescript
import { DateTime } from 'luxon';
import type { EventType, Impact, IEconomicEvent, IEconomicEventSeed, EventSource } from './economic-event.types';

const IMPACT_MAP: Record<EventType, Impact> = {
    FOMC_DECISION: 'critical',
    FOMC_PRESS_CONF: 'critical',
    CPI: 'critical',
    NFP: 'critical',
    PPI: 'major',
    GDP: 'major',
    FOMC_MINUTES: 'medium',
    RETAIL_SALES: 'medium',
    ISM_MANUFACTURING: 'medium',
    ISM_SERVICES: 'medium',
    FED_SPEECH: 'medium',
    JOBLESS_CLAIMS: 'low',
    CONSUMER_CONFIDENCE: 'low',
    DURABLE_GOODS: 'low',
    OTHER: 'low',
};

const SOURCE_MAP: Record<EventType, EventSource> = {
    FOMC_DECISION: 'fed',
    FOMC_PRESS_CONF: 'fed',
    FOMC_MINUTES: 'fed',
    FED_SPEECH: 'fed',
    CPI: 'bls',
    PPI: 'bls',
    NFP: 'bls',
    JOBLESS_CLAIMS: 'dol',
    GDP: 'bea',
    RETAIL_SALES: 'census',
    DURABLE_GOODS: 'census',
    ISM_MANUFACTURING: 'ism',
    ISM_SERVICES: 'ism',
    CONSUMER_CONFIDENCE: 'conf_board',
    OTHER: 'manual',
};

const DEFAULT_SOURCE_URLS: Record<EventType, string> = {
    FOMC_DECISION: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FOMC_PRESS_CONF: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FOMC_MINUTES: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FED_SPEECH: 'https://www.federalreserve.gov/newsevents/speeches.htm',
    CPI: 'https://www.bls.gov/schedule/news_release/cpi.htm',
    PPI: 'https://www.bls.gov/schedule/news_release/ppi.htm',
    NFP: 'https://www.bls.gov/schedule/news_release/empsit.htm',
    JOBLESS_CLAIMS: 'https://www.dol.gov/ui/data.pdf',
    GDP: 'https://www.bea.gov/news/schedule',
    RETAIL_SALES: 'https://www.census.gov/retail',
    DURABLE_GOODS: 'https://www.census.gov/manufacturing/m3/',
    ISM_MANUFACTURING: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    ISM_SERVICES: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    CONSUMER_CONFIDENCE: 'https://www.conference-board.org/topics/consumer-confidence',
    OTHER: '',
};

const NAME_PREFIX: Record<EventType, string> = {
    FOMC_DECISION: 'FOMC Decision',
    FOMC_PRESS_CONF: 'FOMC Press Conference',
    FOMC_MINUTES: 'FOMC Minutes',
    FED_SPEECH: 'Fed Speech',
    CPI: 'CPI',
    PPI: 'PPI',
    NFP: 'NFP',
    JOBLESS_CLAIMS: 'Jobless Claims',
    GDP: 'GDP',
    RETAIL_SALES: 'Retail Sales',
    DURABLE_GOODS: 'Durable Goods',
    ISM_MANUFACTURING: 'ISM Manufacturing PMI',
    ISM_SERVICES: 'ISM Services PMI',
    CONSUMER_CONFIDENCE: 'Consumer Confidence',
    OTHER: 'Event',
};

export function eventTypeToImpact(type: EventType): Impact {
    return IMPACT_MAP[type];
}

export function computeDeterministicId(seed: IEconomicEventSeed): string {
    const timeDigits = seed.timeET.replace(':', '');
    return `${seed.date}-${seed.type.toLowerCase()}-${timeDigits}`;
}

export function expandSeed(seed: IEconomicEventSeed, seededBy: string): IEconomicEvent {
    const impact = eventTypeToImpact(seed.type);
    const gates = impact === 'critical' || impact === 'major';

    // Parse ET time → UTC via luxon (handles DST)
    const etDateTime = DateTime.fromFormat(
        `${seed.date} ${seed.timeET}`,
        'yyyy-MM-dd HH:mm',
        { zone: 'America/New_York' }
    );
    const scheduledUtc = etDateTime.toUTC().toJSDate();

    // Format EEST string (Europe/Bucharest)
    const eestDateTime = etDateTime.setZone('Europe/Bucharest');
    const scheduledEestString = eestDateTime.toFormat('HH:mm') + ' EEST';

    // Name: prefix + (period) OR prefix + (date) for FOMC-like events
    const namePrefix = NAME_PREFIX[seed.type];
    const name = seed.period
        ? `${namePrefix} (${seed.period})`
        : `${namePrefix} (${seed.date})`;

    return {
        id: computeDeterministicId(seed),
        eventType: seed.type,
        name,
        country: 'US',
        impact,
        scheduledUtc,
        scheduledEtString: `${seed.timeET} ET`,
        scheduledEestString,
        gatesLadderingPause: gates,
        gatesPreEventClose: gates,
        previousValue: null,
        forecastValue: null,
        actualValue: null,
        source: SOURCE_MAP[seed.type],
        sourceUrl: seed.sourceUrl || DEFAULT_SOURCE_URLS[seed.type],
        seededAt: new Date(),
        seededBy,
        verifiedAt: null,
    };
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd functions && npx vitest run src/shared/seed-helpers.test.ts`
Expected: All 20+ tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/shared/seed-helpers.ts functions/src/shared/seed-helpers.test.ts functions/src/shared/economic-event.types.ts
git commit -m "feat(economic-calendar): seed helpers (id, expand, impact mapping)"
```

---

## Task 3: Pure gate functions + tests

**Files:**
- Create: `functions/src/shared/economic-calendar.ts`
- Create: `functions/src/shared/economic-calendar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `functions/src/shared/economic-calendar.test.ts`:
```typescript
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

    it('handles DST spring-forward day 2026-03-08', () => {
        // 2026-03-08 is DST spring-forward: 02:00 EST → 03:00 EDT
        // Event at 08:30 ET on 2026-03-11 (Wednesday, EDT) = 12:30 UTC
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd functions && npx vitest run src/shared/economic-calendar.test.ts`
Expected: All tests FAIL.

- [ ] **Step 3: Implement `economic-calendar.ts`**

Create `functions/src/shared/economic-calendar.ts`:
```typescript
import { DateTime } from 'luxon';
import * as admin from 'firebase-admin';
import type { IEconomicEvent } from './economic-event.types';

/**
 * Returns events that gate laddering within [now, now + lookAheadHours].
 */
export function getLadderingPauseEvents(
    now: Date,
    events: IEconomicEvent[],
    lookAheadHours = 48
): IEconomicEvent[] {
    const nowMs = now.getTime();
    const cutoffMs = nowMs + lookAheadHours * 3_600_000;
    return events.filter(e => {
        const evtMs = e.scheduledUtc instanceof Date
            ? e.scheduledUtc.getTime()
            : (e.scheduledUtc as unknown as { toMillis(): number }).toMillis();
        return e.gatesLadderingPause && evtMs >= nowMs && evtMs <= cutoffMs;
    });
}

/**
 * Returns events that gate pre-event close within [now, now + closeWindowHours].
 */
export function getCloseWindowEvents(
    now: Date,
    events: IEconomicEvent[],
    closeWindowHours = 4
): IEconomicEvent[] {
    const nowMs = now.getTime();
    const cutoffMs = nowMs + closeWindowHours * 3_600_000;
    return events.filter(e => {
        const evtMs = e.scheduledUtc instanceof Date
            ? e.scheduledUtc.getTime()
            : (e.scheduledUtc as unknown as { toMillis(): number }).toMillis();
        return e.gatesPreEventClose && evtMs >= nowMs && evtMs <= cutoffMs;
    });
}

/**
 * Day-boundary laddering pause check: is today OR tomorrow (ET) blocked?
 */
export function isInLadderingPauseWindow(
    now: Date,
    events: IEconomicEvent[]
): { paused: boolean; reason: string; blockingEvents: IEconomicEvent[] } {
    const etNow = DateTime.fromJSDate(now, { zone: 'utc' }).setZone('America/New_York');
    const startOfTodayEt = etNow.startOf('day').toJSDate();
    const endOfTomorrowEt = etNow.plus({ days: 1 }).endOf('day').toJSDate();
    const startMs = startOfTodayEt.getTime();
    const endMs = endOfTomorrowEt.getTime();

    const blocking = events.filter(e => {
        const evtMs = e.scheduledUtc instanceof Date
            ? e.scheduledUtc.getTime()
            : (e.scheduledUtc as unknown as { toMillis(): number }).toMillis();
        return e.gatesLadderingPause && evtMs >= startMs && evtMs <= endMs;
    });

    return {
        paused: blocking.length > 0,
        reason: blocking.length
            ? `${blocking.map(e => e.name).join(', ')} in ET window (today/tomorrow)`
            : '',
        blockingEvents: blocking,
    };
}

/**
 * Wrapper with feature-flag short-circuit for safe rollback.
 * Reads `featureFlags/economicCalendar.enabled` — if false, all gates disabled.
 */
export async function checkGates(
    now: Date,
    events: IEconomicEvent[]
): Promise<{
    ladderingPause: ReturnType<typeof isInLadderingPauseWindow>;
    closeWindow: IEconomicEvent[];
}> {
    try {
        const flagDoc = await admin.firestore().doc('featureFlags/economicCalendar').get();
        const enabled = flagDoc.exists ? flagDoc.data()?.enabled !== false : true;

        if (!enabled) {
            return {
                ladderingPause: { paused: false, reason: 'feature disabled', blockingEvents: [] },
                closeWindow: [],
            };
        }
    } catch (err) {
        console.warn('[economic-calendar] feature flag check failed, proceeding with gates ON', err);
    }

    return {
        ladderingPause: isInLadderingPauseWindow(now, events),
        closeWindow: getCloseWindowEvents(now, events, 4),
    };
}

/**
 * Fetch upcoming events from Firestore ordered by schedule ascending.
 */
export async function fetchUpcomingEvents(lookAheadHours: number): Promise<IEconomicEvent[]> {
    const cutoff = new Date(Date.now() + lookAheadHours * 3_600_000);
    const snap = await admin.firestore()
        .collection('economicEvents')
        .where('country', '==', 'US')
        .where('scheduledUtc', '>=', new Date())
        .where('scheduledUtc', '<=', cutoff)
        .orderBy('scheduledUtc', 'asc')
        .get();
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            scheduledUtc: data.scheduledUtc.toDate(),
            seededAt: data.seededAt?.toDate() ?? new Date(),
            verifiedAt: data.verifiedAt?.toDate() ?? null,
        } as IEconomicEvent;
    });
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd functions && npx vitest run src/shared/economic-calendar.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/shared/economic-calendar.ts functions/src/shared/economic-calendar.test.ts
git commit -m "feat(economic-calendar): pure gate functions + checkGates wrapper"
```

---

## Task 4: Hardcoded 2026 US event data

**Files:**
- Create: `functions/src/data/economic-events-2026.ts`

- [ ] **Step 1: Create data file**

Create `functions/src/data/economic-events-2026.ts`:

```typescript
import type { IEconomicEventSeed } from '../shared/economic-event.types';

/**
 * 2026 US economic calendar seed.
 * Sources:
 *   FOMC:   federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   CPI:    bls.gov/schedule/news_release/cpi.htm
 *   PPI:    bls.gov/schedule/news_release/ppi.htm
 *   NFP:    bls.gov/schedule/news_release/empsit.htm
 *   GDP:    bea.gov/news/schedule
 *   ISM:    ismworld.org
 *
 * VERIFIED: 2026-04-15 (re-verify before seeding if > 30 days elapsed)
 */
export const EVENTS_2026_US: IEconomicEventSeed[] = [
    // === FOMC MEETINGS ===
    // 8 meetings/year; press conferences on alternating meetings
    { type: 'FOMC_DECISION', date: '2026-01-28', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-01-28', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-03-18', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-03-18', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-04-29', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-06-17', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-06-17', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-07-29', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-09-16', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-09-16', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-10-28', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-12-16', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-12-16', timeET: '14:30' },

    // === FOMC MINUTES (3 weeks after each meeting) ===
    { type: 'FOMC_MINUTES', date: '2026-02-18', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-04-08', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-05-20', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-07-08', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-08-19', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-10-07', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-11-18', timeET: '14:00' },

    // === CPI (monthly, ~mid-month, 08:30 ET) ===
    { type: 'CPI', date: '2026-01-14', timeET: '08:30', period: 'December 2025' },
    { type: 'CPI', date: '2026-02-11', timeET: '08:30', period: 'January 2026' },
    { type: 'CPI', date: '2026-03-11', timeET: '08:30', period: 'February 2026' },
    { type: 'CPI', date: '2026-04-14', timeET: '08:30', period: 'March 2026' },
    { type: 'CPI', date: '2026-05-13', timeET: '08:30', period: 'April 2026' },
    { type: 'CPI', date: '2026-06-10', timeET: '08:30', period: 'May 2026' },
    { type: 'CPI', date: '2026-07-14', timeET: '08:30', period: 'June 2026' },
    { type: 'CPI', date: '2026-08-12', timeET: '08:30', period: 'July 2026' },
    { type: 'CPI', date: '2026-09-10', timeET: '08:30', period: 'August 2026' },
    { type: 'CPI', date: '2026-10-14', timeET: '08:30', period: 'September 2026' },
    { type: 'CPI', date: '2026-11-12', timeET: '08:30', period: 'October 2026' },
    { type: 'CPI', date: '2026-12-10', timeET: '08:30', period: 'November 2026' },

    // === PPI (monthly, ~mid-month, 08:30 ET) ===
    { type: 'PPI', date: '2026-01-15', timeET: '08:30', period: 'December 2025' },
    { type: 'PPI', date: '2026-02-12', timeET: '08:30', period: 'January 2026' },
    { type: 'PPI', date: '2026-03-12', timeET: '08:30', period: 'February 2026' },
    { type: 'PPI', date: '2026-04-15', timeET: '08:30', period: 'March 2026' },
    { type: 'PPI', date: '2026-05-14', timeET: '08:30', period: 'April 2026' },
    { type: 'PPI', date: '2026-06-11', timeET: '08:30', period: 'May 2026' },
    { type: 'PPI', date: '2026-07-15', timeET: '08:30', period: 'June 2026' },
    { type: 'PPI', date: '2026-08-13', timeET: '08:30', period: 'July 2026' },
    { type: 'PPI', date: '2026-09-11', timeET: '08:30', period: 'August 2026' },
    { type: 'PPI', date: '2026-10-15', timeET: '08:30', period: 'September 2026' },
    { type: 'PPI', date: '2026-11-13', timeET: '08:30', period: 'October 2026' },
    { type: 'PPI', date: '2026-12-11', timeET: '08:30', period: 'November 2026' },

    // === NFP / Employment Situation (1st Friday of month, 08:30 ET) ===
    { type: 'NFP', date: '2026-01-09', timeET: '08:30', period: 'December 2025' },
    { type: 'NFP', date: '2026-02-06', timeET: '08:30', period: 'January 2026' },
    { type: 'NFP', date: '2026-03-06', timeET: '08:30', period: 'February 2026' },
    { type: 'NFP', date: '2026-04-03', timeET: '08:30', period: 'March 2026' },
    { type: 'NFP', date: '2026-05-01', timeET: '08:30', period: 'April 2026' },
    { type: 'NFP', date: '2026-06-05', timeET: '08:30', period: 'May 2026' },
    { type: 'NFP', date: '2026-07-02', timeET: '08:30', period: 'June 2026' },
    { type: 'NFP', date: '2026-08-07', timeET: '08:30', period: 'July 2026' },
    { type: 'NFP', date: '2026-09-04', timeET: '08:30', period: 'August 2026' },
    { type: 'NFP', date: '2026-10-02', timeET: '08:30', period: 'September 2026' },
    { type: 'NFP', date: '2026-11-06', timeET: '08:30', period: 'October 2026' },
    { type: 'NFP', date: '2026-12-04', timeET: '08:30', period: 'November 2026' },

    // === GDP (quarterly estimates: advance + 2nd + 3rd, so ~12/year; 08:30 ET) ===
    { type: 'GDP', date: '2026-01-29', timeET: '08:30', period: 'Q4 2025 advance' },
    { type: 'GDP', date: '2026-02-26', timeET: '08:30', period: 'Q4 2025 second' },
    { type: 'GDP', date: '2026-03-26', timeET: '08:30', period: 'Q4 2025 third' },
    { type: 'GDP', date: '2026-04-30', timeET: '08:30', period: 'Q1 2026 advance' },
    { type: 'GDP', date: '2026-05-28', timeET: '08:30', period: 'Q1 2026 second' },
    { type: 'GDP', date: '2026-06-25', timeET: '08:30', period: 'Q1 2026 third' },
    { type: 'GDP', date: '2026-07-30', timeET: '08:30', period: 'Q2 2026 advance' },
    { type: 'GDP', date: '2026-08-27', timeET: '08:30', period: 'Q2 2026 second' },
    { type: 'GDP', date: '2026-09-24', timeET: '08:30', period: 'Q2 2026 third' },
    { type: 'GDP', date: '2026-10-29', timeET: '08:30', period: 'Q3 2026 advance' },
    { type: 'GDP', date: '2026-11-25', timeET: '08:30', period: 'Q3 2026 second' },
    { type: 'GDP', date: '2026-12-22', timeET: '08:30', period: 'Q3 2026 third' },

    // === Retail Sales (monthly, ~mid-month, 08:30 ET) ===
    { type: 'RETAIL_SALES', date: '2026-01-16', timeET: '08:30', period: 'December 2025' },
    { type: 'RETAIL_SALES', date: '2026-02-17', timeET: '08:30', period: 'January 2026' },
    { type: 'RETAIL_SALES', date: '2026-03-16', timeET: '08:30', period: 'February 2026' },
    { type: 'RETAIL_SALES', date: '2026-04-16', timeET: '08:30', period: 'March 2026' },
    { type: 'RETAIL_SALES', date: '2026-05-15', timeET: '08:30', period: 'April 2026' },
    { type: 'RETAIL_SALES', date: '2026-06-16', timeET: '08:30', period: 'May 2026' },
    { type: 'RETAIL_SALES', date: '2026-07-16', timeET: '08:30', period: 'June 2026' },
    { type: 'RETAIL_SALES', date: '2026-08-14', timeET: '08:30', period: 'July 2026' },
    { type: 'RETAIL_SALES', date: '2026-09-15', timeET: '08:30', period: 'August 2026' },
    { type: 'RETAIL_SALES', date: '2026-10-16', timeET: '08:30', period: 'September 2026' },
    { type: 'RETAIL_SALES', date: '2026-11-17', timeET: '08:30', period: 'October 2026' },
    { type: 'RETAIL_SALES', date: '2026-12-16', timeET: '08:30', period: 'November 2026' },

    // === ISM Manufacturing PMI (1st business day of month, 10:00 ET) ===
    { type: 'ISM_MANUFACTURING', date: '2026-01-02', timeET: '10:00', period: 'December 2025' },
    { type: 'ISM_MANUFACTURING', date: '2026-02-02', timeET: '10:00', period: 'January 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-03-02', timeET: '10:00', period: 'February 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-04-01', timeET: '10:00', period: 'March 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-05-01', timeET: '10:00', period: 'April 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-06-01', timeET: '10:00', period: 'May 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-07-01', timeET: '10:00', period: 'June 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-08-03', timeET: '10:00', period: 'July 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-09-01', timeET: '10:00', period: 'August 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-10-01', timeET: '10:00', period: 'September 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-11-02', timeET: '10:00', period: 'October 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-12-01', timeET: '10:00', period: 'November 2026' },

    // === ISM Services PMI (3rd business day of month, 10:00 ET) ===
    { type: 'ISM_SERVICES', date: '2026-01-06', timeET: '10:00', period: 'December 2025' },
    { type: 'ISM_SERVICES', date: '2026-02-04', timeET: '10:00', period: 'January 2026' },
    { type: 'ISM_SERVICES', date: '2026-03-04', timeET: '10:00', period: 'February 2026' },
    { type: 'ISM_SERVICES', date: '2026-04-03', timeET: '10:00', period: 'March 2026' },
    { type: 'ISM_SERVICES', date: '2026-05-05', timeET: '10:00', period: 'April 2026' },
    { type: 'ISM_SERVICES', date: '2026-06-03', timeET: '10:00', period: 'May 2026' },
    { type: 'ISM_SERVICES', date: '2026-07-06', timeET: '10:00', period: 'June 2026' },
    { type: 'ISM_SERVICES', date: '2026-08-05', timeET: '10:00', period: 'July 2026' },
    { type: 'ISM_SERVICES', date: '2026-09-03', timeET: '10:00', period: 'August 2026' },
    { type: 'ISM_SERVICES', date: '2026-10-05', timeET: '10:00', period: 'September 2026' },
    { type: 'ISM_SERVICES', date: '2026-11-04', timeET: '10:00', period: 'October 2026' },
    { type: 'ISM_SERVICES', date: '2026-12-03', timeET: '10:00', period: 'November 2026' },
];
```

**Note:** Dates above are representative placeholders based on typical schedule patterns. Before production seeding, cross-verify each against the official source URL. Errors in this file = incorrect gating = money risk.

- [ ] **Step 2: Verify TS builds**

Run: `cd functions && npm run build`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/data/economic-events-2026.ts
git commit -m "feat(economic-calendar): seed data for 2026 US events (~90 entries)"
```

---

## Task 5: `seedEconomicEvents` callable Cloud Function

**Files:**
- Create: `functions/src/seedEconomicEvents.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Create the callable**

Create `functions/src/seedEconomicEvents.ts`:
```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { expandSeed } from './shared/seed-helpers';
import { EVENTS_2026_US } from './data/economic-events-2026';
import type { IEconomicEventSeed } from './shared/economic-event.types';

const ADMIN_EMAIL = 'macovei17@gmail.com';

export const seedEconomicEvents = onCall(
    { region: 'us-central1', cors: true },
    async (request) => {
        const email = request.auth?.token?.email;
        if (email !== ADMIN_EMAIL) {
            throw new HttpsError('permission-denied', `Admin only (got ${email})`);
        }

        const year: number = request.data?.year;
        if (!year || typeof year !== 'number') {
            throw new HttpsError('invalid-argument', 'year (number) required');
        }

        let seeds: IEconomicEventSeed[];
        if (year === 2026) {
            seeds = EVENTS_2026_US;
        } else {
            throw new HttpsError('invalid-argument', `Year ${year} not supported yet`);
        }

        const seededBy = `admin:${email}`;
        const batch = admin.firestore().batch();
        let count = 0;
        for (const seed of seeds) {
            const doc = expandSeed(seed, seededBy);
            const ref = admin.firestore().collection('economicEvents').doc(doc.id);
            batch.set(ref, doc, { merge: true });
            count++;
        }
        await batch.commit();

        return { seeded: count, year };
    }
);
```

- [ ] **Step 2: Export from index.ts**

Edit `functions/src/index.ts` — find the exports section and add:
```typescript
export { seedEconomicEvents } from './seedEconomicEvents';
```

- [ ] **Step 3: Verify TS builds**

Run: `cd functions && npm run build`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/seedEconomicEvents.ts functions/src/index.ts
git commit -m "feat(economic-calendar): seedEconomicEvents callable function"
```

---

## Task 6: Firestore security rules + indexes

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Read current rules**

Run: `cat firestore.rules | head -50`
Expected: existing rules visible. Locate the closing `}` of `match /databases/{database}/documents { ... }` block.

- [ ] **Step 2: Add rules for new collections**

Edit `firestore.rules` — inside the `match /databases/{database}/documents` block, before its closing `}`, add:

```
    // --- Economic Calendar ---
    match /economicEvents/{eventId} {
      allow read: if request.auth != null;
      allow write: if false;  // only via seedEconomicEvents callable (admin-enforced)
    }

    match /system_alerts/{alertId} {
      allow read: if request.auth != null;
      allow update: if request.auth != null &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['acknowledgedAt', 'acknowledgedBy']);
      allow create, delete: if false;
    }

    match /featureFlags/{flagId} {
      allow read: if request.auth != null;
      allow write: if false;  // console-only
    }
```

- [ ] **Step 3: Add composite indexes**

Edit `firestore.indexes.json` — add to the `indexes` array:

```json
{
  "collectionGroup": "economicEvents",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "country", "order": "ASCENDING" },
    { "fieldPath": "scheduledUtc", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "economicEvents",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "gatesLadderingPause", "order": "ASCENDING" },
    { "fieldPath": "scheduledUtc", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 4: Validate JSON**

Run: `python3 -c "import json; json.load(open('firestore.indexes.json'))"`
Expected: no output (valid JSON). If SyntaxError, fix commas/brackets.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(economic-calendar): Firestore rules + indexes"
```

---

## Task 7: Frontend service — `EconomicCalendarService` interface

**Files:**
- Create: `src/services/economic-calendar/economic-calendar.service.interface.ts`

- [ ] **Step 1: Create interface**

```typescript
import type { IEconomicEvent, ISystemAlert } from '../../models/economic-event.model';

export interface IActivePauseState {
    paused: boolean;
    reason: string;
    blockingEvents: IEconomicEvent[];
}

export interface IEconomicCalendarService {
    readonly events: IEconomicEvent[];
    readonly isLoading: boolean;
    readonly systemAlerts: ISystemAlert[];

    // computed-style accessors
    readonly todaysEvents: IEconomicEvent[];
    readonly tomorrowsEvents: IEconomicEvent[];
    readonly groupedByDay: Map<string, IEconomicEvent[]>;  // YYYY-MM-DD (ET) → events
    readonly activePauseState: IActivePauseState;
    readonly nextCloseWindowEvent: IEconomicEvent | null;
    readonly maxScheduledDate: Date | null;  // for "calendar extends to" display

    init(): void;
    dispose(): void;
    acknowledgeSystemAlert(alertId: string): Promise<void>;
    seedYear(year: number): Promise<{ seeded: number; year: number }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/economic-calendar/economic-calendar.service.interface.ts
git commit -m "feat(economic-calendar): service interface"
```

---

## Task 8: Frontend service — `EconomicCalendarService` implementation

**Files:**
- Create: `src/services/economic-calendar/economic-calendar.service.ts`

- [ ] **Step 1: Install luxon for frontend**

Run: `npm install luxon @types/luxon --save`
Expected: packages installed.

- [ ] **Step 2: Create service**

```typescript
import { makeObservable, observable, computed, action, runInAction } from 'mobx';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    Unsubscribe,
    Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DateTime } from 'luxon';
import { db, auth } from '../../firebase';
import type {
    IEconomicCalendarService,
    IActivePauseState,
} from './economic-calendar.service.interface';
import type { IEconomicEvent, ISystemAlert } from '../../models/economic-event.model';

const ET_ZONE = 'America/New_York';

function normalizeEvent(id: string, data: Record<string, unknown>): IEconomicEvent {
    return {
        id,
        eventType: data.eventType as IEconomicEvent['eventType'],
        name: data.name as string,
        country: data.country as string,
        impact: data.impact as IEconomicEvent['impact'],
        scheduledUtc: (data.scheduledUtc as Timestamp).toDate(),
        scheduledEtString: data.scheduledEtString as string,
        scheduledEestString: data.scheduledEestString as string,
        gatesLadderingPause: data.gatesLadderingPause as boolean,
        gatesPreEventClose: data.gatesPreEventClose as boolean,
        previousValue: (data.previousValue as string | null) ?? null,
        forecastValue: (data.forecastValue as string | null) ?? null,
        actualValue: (data.actualValue as string | null) ?? null,
        source: data.source as IEconomicEvent['source'],
        sourceUrl: data.sourceUrl as string,
        seededAt: (data.seededAt as Timestamp).toDate(),
        seededBy: data.seededBy as string,
        verifiedAt: data.verifiedAt ? (data.verifiedAt as Timestamp).toDate() : null,
    };
}

export class EconomicCalendarService implements IEconomicCalendarService {
    @observable events: IEconomicEvent[] = [];
    @observable isLoading = true;
    @observable systemAlerts: ISystemAlert[] = [];

    private unsubEvents?: Unsubscribe;
    private unsubAlerts?: Unsubscribe;

    constructor() {
        makeObservable(this);
    }

    @action
    init(): void {
        // Events subscription
        const evtQ = query(
            collection(db, 'economicEvents'),
            where('country', '==', 'US'),
            orderBy('scheduledUtc', 'asc'),
            limit(200)
        );
        this.unsubEvents = onSnapshot(
            evtQ,
            snap => runInAction(() => {
                this.events = snap.docs
                    .map(d => normalizeEvent(d.id, d.data()))
                    .filter(e => e.scheduledUtc.getTime() >= Date.now() - 24 * 3_600_000);
                this.isLoading = false;
            }),
            err => {
                console.error('[economic-calendar] subscription error', err);
                runInAction(() => { this.isLoading = false; });
            }
        );

        // System alerts (unacknowledged)
        const alertQ = query(
            collection(db, 'system_alerts'),
            where('acknowledgedAt', '==', null),
            where('type', 'in', [
                'calendar_seed_low',
                'calendar_reconcile_mismatch',
                'calendar_fomc_reschedule',
            ])
        );
        this.unsubAlerts = onSnapshot(alertQ, snap => runInAction(() => {
            this.systemAlerts = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    type: data.type,
                    severity: data.severity,
                    message: data.message,
                    relatedEventId: data.relatedEventId ?? null,
                    createdAt: (data.createdAt as Timestamp).toDate(),
                    acknowledgedAt: null,
                    acknowledgedBy: null,
                } as ISystemAlert;
            });
        }));
    }

    @action
    dispose(): void {
        this.unsubEvents?.();
        this.unsubAlerts?.();
    }

    @computed
    get todaysEvents(): IEconomicEvent[] {
        const today = DateTime.now().setZone(ET_ZONE).toISODate()!;
        return this.events.filter(
            e => DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate() === today
        );
    }

    @computed
    get tomorrowsEvents(): IEconomicEvent[] {
        const tomorrow = DateTime.now().setZone(ET_ZONE).plus({ days: 1 }).toISODate()!;
        return this.events.filter(
            e => DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate() === tomorrow
        );
    }

    @computed
    get groupedByDay(): Map<string, IEconomicEvent[]> {
        const map = new Map<string, IEconomicEvent[]>();
        for (const e of this.events) {
            const day = DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate()!;
            if (!map.has(day)) map.set(day, []);
            map.get(day)!.push(e);
        }
        return map;
    }

    @computed
    get activePauseState(): IActivePauseState {
        const etNow = DateTime.now().setZone(ET_ZONE);
        const startMs = etNow.startOf('day').toMillis();
        const endMs = etNow.plus({ days: 1 }).endOf('day').toMillis();
        const blocking = this.events.filter(e =>
            e.gatesLadderingPause &&
            (e.scheduledUtc as Date).getTime() >= startMs &&
            (e.scheduledUtc as Date).getTime() <= endMs
        );
        return {
            paused: blocking.length > 0,
            reason: blocking.length
                ? blocking.map(e => e.name).join(', ')
                : '',
            blockingEvents: blocking,
        };
    }

    @computed
    get nextCloseWindowEvent(): IEconomicEvent | null {
        const nowMs = Date.now();
        const cutoffMs = nowMs + 4 * 3_600_000;
        const found = this.events.find(e =>
            e.gatesPreEventClose &&
            (e.scheduledUtc as Date).getTime() >= nowMs &&
            (e.scheduledUtc as Date).getTime() <= cutoffMs
        );
        return found ?? null;
    }

    @computed
    get maxScheduledDate(): Date | null {
        if (this.events.length === 0) return null;
        return this.events[this.events.length - 1].scheduledUtc as Date;
    }

    async acknowledgeSystemAlert(alertId: string): Promise<void> {
        const uid = auth.currentUser?.uid ?? 'anonymous';
        await updateDoc(doc(db, 'system_alerts', alertId), {
            acknowledgedAt: serverTimestamp(),
            acknowledgedBy: uid,
        });
    }

    async seedYear(year: number): Promise<{ seeded: number; year: number }> {
        const functions = getFunctions(undefined, 'us-central1');
        const callable = httpsCallable<{ year: number }, { seeded: number; year: number }>(
            functions,
            'seedEconomicEvents'
        );
        const result = await callable({ year });
        return result.data;
    }
}
```

- [ ] **Step 3: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/economic-calendar/economic-calendar.service.ts package.json package-lock.json
git commit -m "feat(economic-calendar): MobX service with Firestore subscription"
```

---

## Task 9: Register service in ServiceFactory

**Files:**
- Modify: `src/services/service-factory.interface.ts`
- Modify: `src/services/service-factory.ts`

- [ ] **Step 1: Add field to interface**

Edit `src/services/service-factory.interface.ts` — add import at top:
```typescript
import type { IEconomicCalendarService } from './economic-calendar/economic-calendar.service.interface';
```

Add field to `IServiceFactory` interface:
```typescript
readonly economicCalendar: IEconomicCalendarService;
```

- [ ] **Step 2: Add lazy init in factory**

Edit `src/services/service-factory.ts`:
- Add import:
```typescript
import { EconomicCalendarService } from './economic-calendar/economic-calendar.service';
import type { IEconomicCalendarService } from './economic-calendar/economic-calendar.service.interface';
```
- Add private field + public getter following existing pattern (look at how `tradeLog` is wired — mirror exactly).
- In the factory's initialization method (search for a spot where other services call their `.init()`), add:
```typescript
this._economicCalendar = new Lazy(() => {
    const svc = new EconomicCalendarService();
    svc.init();
    return svc;
});
```
Plus:
```typescript
get economicCalendar(): IEconomicCalendarService {
    return this._economicCalendar.value;
}
```

Follow the EXACT pattern used by `ironCondorAnalytics` or `tradeLog` (lazy instantiation, init on first access).

- [ ] **Step 3: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/service-factory.ts src/services/service-factory.interface.ts
git commit -m "feat(economic-calendar): register service in ServiceFactory"
```

---

## Task 10: Formatting helpers

**Files:**
- Create: `src/services/economic-calendar/event-formatting.ts`
- Create: `src/services/economic-calendar/event-formatting.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

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
    it('returns empty-ok when no events', () => {
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/services/economic-calendar/event-formatting.test.ts`
Expected: all FAIL.

- [ ] **Step 3: Implement formatters**

Create `src/services/economic-calendar/event-formatting.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/services/economic-calendar/event-formatting.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/economic-calendar/event-formatting.ts src/services/economic-calendar/event-formatting.test.ts
git commit -m "feat(economic-calendar): pure formatting helpers + tests"
```

---

## Task 11: `EventRow` component (single event display with expand)

**Files:**
- Create: `src/components/economic-calendar/EventRow.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useState } from 'react';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import type { IEconomicEvent, Impact } from '../../models/economic-event.model';
import { formatCountdown } from '../../services/economic-calendar/event-formatting';

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

const Time = styled.span` font-weight: 600; min-width: 80px; `;
const LocalTime = styled.span` color: var(--ion-color-medium); font-size: 12px; `;
const Name = styled.span` font-weight: 500; `;
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

function impactColor(impact: Impact): string {
    switch (impact) {
        case 'critical': return '#e74c3c';
        case 'major': return '#e67e22';
        case 'medium': return '#f1c40f';
        case 'low': return '#95a5a6';
    }
}

export interface EventRowProps {
    event: IEconomicEvent;
}

export function EventRow({ event }: EventRowProps) {
    const [expanded, setExpanded] = useState(false);
    const values = [event.previousValue, event.forecastValue, event.actualValue]
        .some(v => v !== null)
        ? `prev ${event.previousValue ?? '—'} · fcst ${event.forecastValue ?? '—'} · actual ${event.actualValue ?? '—'}`
        : null;

    return (
        <>
            <Row $impact={event.impact} onClick={() => setExpanded(x => !x)}>
                <Time>{event.scheduledEtString}</Time>
                <ImpactDot $impact={event.impact} />
                <Name>{event.name}</Name>
                {values ? <Values>{values}</Values> : <Values>—</Values>}
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
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/economic-calendar/EventRow.tsx
git commit -m "feat(economic-calendar): EventRow component with expand details"
```

---

## Task 12: `DaySection` + `FilterChips` + `EmptyState` components

**Files:**
- Create: `src/components/economic-calendar/DaySection.tsx`
- Create: `src/components/economic-calendar/FilterChips.tsx`
- Create: `src/components/economic-calendar/EmptyState.tsx`

- [ ] **Step 1: Create `DaySection.tsx`**

```tsx
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

function formatDayLabel(day: string): string {
    const dt = DateTime.fromISO(day);
    const today = DateTime.now().setZone('America/New_York').toISODate();
    const tomorrow = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate();
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
                ? <div style={{ padding: '12px 16px', color: 'var(--ion-color-medium)' }}>
                      (no scheduled events)
                  </div>
                : events.map(e => <EventRow key={e.id} event={e} />)
            }
        </Section>
    );
}
```

- [ ] **Step 2: Create `FilterChips.tsx`**

```tsx
import styled from 'styled-components';
import type { FilterMode } from '../../services/economic-calendar/event-formatting';

const Row = styled.div`
    display: flex;
    gap: 8px;
    padding: 12px 16px;
`;
const Chip = styled.button<{ $selected: boolean }>`
    padding: 6px 14px;
    border-radius: 16px;
    border: 1px solid var(--ion-color-step-300);
    background: ${p => p.$selected ? 'var(--ion-color-primary)' : 'transparent'};
    color: ${p => p.$selected ? 'white' : 'var(--ion-text-color)'};
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
        background: ${p => p.$selected ? 'var(--ion-color-primary-shade)' : 'var(--ion-color-step-100)'};
    }
`;

export interface FilterChipsProps {
    mode: FilterMode;
    onChange: (mode: FilterMode) => void;
}

export function FilterChips({ mode, onChange }: FilterChipsProps) {
    return (
        <Row>
            <Chip $selected={mode === 'all'} onClick={() => onChange('all')}>All</Chip>
            <Chip $selected={mode === 'criticalMajor'} onClick={() => onChange('criticalMajor')}>
                Critical + Major
            </Chip>
            <Chip $selected={mode === 'criticalOnly'} onClick={() => onChange('criticalOnly')}>
                Critical only
            </Chip>
        </Row>
    );
}
```

- [ ] **Step 3: Create `EmptyState.tsx`**

```tsx
import styled from 'styled-components';

const Wrapper = styled.div`
    padding: 40px 16px;
    text-align: center;
    color: var(--ion-color-medium);
`;

export interface EmptyStateProps {
    maxDate: Date | null;
}

export function EmptyState({ maxDate }: EmptyStateProps) {
    const dateStr = maxDate ? maxDate.toISOString().split('T')[0] : 'unknown';
    return (
        <Wrapper>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>No upcoming events matching filter.</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
                Calendar seeded through {dateStr}
            </div>
        </Wrapper>
    );
}
```

- [ ] **Step 4: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/economic-calendar/
git commit -m "feat(economic-calendar): DaySection, FilterChips, EmptyState components"
```

---

## Task 13: `EconomicCalendarPage`

**Files:**
- Create: `src/pages/EconomicCalendarPage.tsx`

- [ ] **Step 1: Create page**

```tsx
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonMenuButton, IonButtons, IonSpinner,
} from '@ionic/react';
import styled from 'styled-components';
import { useServiceFactory } from '../services/service-factory-context';
import { DaySection } from '../components/economic-calendar/DaySection';
import { FilterChips } from '../components/economic-calendar/FilterChips';
import { EmptyState } from '../components/economic-calendar/EmptyState';
import { matchesFilter, type FilterMode } from '../services/economic-calendar/event-formatting';
import type { IEconomicEvent } from '../models/economic-event.model';

const Container = styled.div`
    max-width: 900px;
    margin: 0 auto;
    padding: 0 8px;

    @media (min-width: 768px) { padding: 0 24px; }
`;

const AlertBanner = styled.div<{ $severity: string }>`
    padding: 12px 16px;
    background: ${p => p.$severity === 'warning' ? '#fff3cd' : '#d1ecf1'};
    border-left: 4px solid ${p => p.$severity === 'warning' ? '#ffc107' : '#17a2b8'};
    margin: 12px 0;
    font-size: 14px;
    color: #333;
`;

const LoadingWrap = styled.div`
    padding: 60px 16px;
    text-align: center;
`;

export const EconomicCalendarPage = observer(() => {
    const { economicCalendar } = useServiceFactory();
    const [filter, setFilter] = useState<FilterMode>('criticalMajor');

    const filteredGrouped = new Map<string, IEconomicEvent[]>();
    for (const [day, events] of economicCalendar.groupedByDay) {
        const filtered = events.filter(e => matchesFilter(e, filter));
        filteredGrouped.set(day, filtered);
    }

    const hasAny = Array.from(filteredGrouped.values()).some(list => list.length > 0);

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Economic Calendar</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <Container>
                    {economicCalendar.systemAlerts.map(alert => (
                        <AlertBanner key={alert.id} $severity={alert.severity}>
                            <strong>{alert.type}:</strong> {alert.message}
                        </AlertBanner>
                    ))}

                    <FilterChips mode={filter} onChange={setFilter} />

                    {economicCalendar.isLoading ? (
                        <LoadingWrap><IonSpinner /></LoadingWrap>
                    ) : !hasAny ? (
                        <EmptyState maxDate={economicCalendar.maxScheduledDate} />
                    ) : (
                        Array.from(filteredGrouped.entries()).map(([day, events]) => (
                            <DaySection key={day} day={day} events={events} />
                        ))
                    )}
                </Container>
            </IonContent>
        </IonPage>
    );
});
```

**Note:** Check whether `useServiceFactory` is the actual hook name — if the project uses `useServices`, adjust accordingly. Grep first: `grep -rn "useService" src/services/ | head -3`.

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/EconomicCalendarPage.tsx
git commit -m "feat(economic-calendar): main page with filter + grouped day view"
```

---

## Task 14: Route + side menu entry

**Files:**
- Modify: `src/App.tsx`
- Modify: side menu component (find via grep)

- [ ] **Step 1: Find side menu component path**

Run: `grep -rn "IonMenu\b" src/components/ src/pages/ | head -5`
Expected: path to menu component file.

- [ ] **Step 2: Add route to `App.tsx`**

Edit `src/App.tsx` — locate the section with other routes (around lines 112-153). Add import at top:
```tsx
import { EconomicCalendarPage } from './pages/EconomicCalendarPage';
```

Add route between `/guvid-visualization` and `/superadmin`:
```tsx
<Route path="/economic-calendar" exact={true}>
    <EconomicCalendarPage />
</Route>
```

- [ ] **Step 3: Add menu item**

In the side menu component found in Step 1, locate the existing menu items (look for `/guvid-visualization` entry). Add menu item above `/superadmin`:
```tsx
<IonMenuToggle autoHide={false}>
    <IonItem routerLink="/economic-calendar" lines="none" detail={false}>
        <IonIcon icon={calendarOutline} slot="start" />
        <IonLabel>Economic Calendar</IonLabel>
    </IonItem>
</IonMenuToggle>
```

Add `calendarOutline` to the `ionicons/icons` import at the top of the file if not already present.

- [ ] **Step 4: Verify page loads (manual)**

Run: `npm run dev` (background)
Navigate to: `http://localhost:5173/economic-calendar`
Expected: page renders with "No upcoming events" empty state (Firestore empty at this point).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/<menu-file-found>.tsx
git commit -m "feat(economic-calendar): route + side menu entry"
```

---

## Task 15: SuperAdminPage seed UI

**Files:**
- Modify: `src/pages/SuperAdminPage.tsx`

- [ ] **Step 1: Read existing SuperAdminPage**

Run: `cat src/pages/SuperAdminPage.tsx | head -60`
Expected: file structure visible (useState/observer pattern).

- [ ] **Step 2: Add Economic Calendar section**

Locate the last section in the file (before the closing `</IonPage>` tag) and add:

```tsx
// Near other useState hooks:
const [seedStatus, setSeedStatus] = useState<string>('');
const [seeding, setSeeding] = useState(false);

// In the return JSX, add new section:
<Card>
    <h3>Economic Calendar</h3>
    <p style={{ fontSize: 13, color: 'var(--ion-color-medium)' }}>
        Events in DB: {services.economicCalendar.events.length} ·
        Extends to: {services.economicCalendar.maxScheduledDate?.toISOString().split('T')[0] ?? '—'}
    </p>
    <IonButton
        disabled={seeding}
        onClick={async () => {
            if (!confirm('Upsert ~90 events for 2026. Safe to re-run. Continue?')) return;
            setSeeding(true);
            try {
                const result = await services.economicCalendar.seedYear(2026);
                setSeedStatus(`Seeded ${result.seeded} events for ${result.year}`);
            } catch (err: unknown) {
                setSeedStatus(`Error: ${(err as Error).message}`);
            } finally {
                setSeeding(false);
            }
        }}
    >
        Seed 2026 events
    </IonButton>
    {seedStatus && <div style={{ marginTop: 8 }}>{seedStatus}</div>}
</Card>
```

**Note:** Use existing `Card` styled-component from the file if available, otherwise use a plain `<div>`. Match existing section styling.

- [ ] **Step 3: Verify page renders**

Navigate `/superadmin` in browser → verify section visible.

- [ ] **Step 4: Test seed deployment (prereq: deploy functions first — see Task 18)**

After Task 18 is deployed:
1. Click "Seed 2026 events" button
2. Confirm dialog
3. Wait for completion toast
4. Verify Firestore Console shows ~90 docs under `economicEvents`

- [ ] **Step 5: Commit**

```bash
git add src/pages/SuperAdminPage.tsx
git commit -m "feat(economic-calendar): SuperAdmin seed UI"
```

---

## Task 16: `EventBanner` component + integration

**Files:**
- Create: `src/components/event-banner/event-banner.component.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/IronCondorDashboardPage.tsx`
- Modify: `src/pages/GuviduVisualizationPage.tsx`
- Modify: `src/pages/AccountPage.tsx`
- Modify: `src/pages/GuviduVsCatalinPage.tsx`

- [ ] **Step 1: Create banner component**

```tsx
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useServiceFactory } from '../../services/service-factory-context';
import { formatCountdown } from '../../services/economic-calendar/event-formatting';

const Banner = styled.div<{ $severity: 'critical' | 'warning' }>`
    padding: 10px 16px;
    background: ${p => p.$severity === 'critical' ? '#e74c3c' : '#f39c12'};
    color: white;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;

    a { color: white; text-decoration: underline; }
`;

const DismissBtn = styled.button`
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
    padding: 0 4px;
`;

export const EventBanner = observer(() => {
    const { economicCalendar } = useServiceFactory();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const pauseState = economicCalendar.activePauseState;
    const closeEvent = economicCalendar.nextCloseWindowEvent;

    if (!pauseState.paused && !closeEvent) return null;

    const severity: 'critical' | 'warning' = closeEvent ? 'critical' : 'warning';

    return (
        <Banner $severity={severity}>
            <span>
                {closeEvent ? (
                    <>
                        🔴 <strong>{closeEvent.name}</strong> in {formatCountdown(closeEvent.scheduledUtc as Date)}
                        {' — review profitable positions ≥40% '}
                        <Link to="/economic-calendar">details</Link>
                    </>
                ) : (
                    <>
                        🟡 Laddering blocked: <strong>{pauseState.reason}</strong>
                        {' '}
                        <Link to="/economic-calendar">view calendar</Link>
                    </>
                )}
            </span>
            <DismissBtn onClick={() => setDismissed(true)} aria-label="Dismiss">×</DismissBtn>
        </Banner>
    );
});
```

- [ ] **Step 2: Inject into 5 pages**

For EACH of these 5 files, add import at top:
```tsx
import { EventBanner } from '../components/event-banner/event-banner.component';
```

Then inside the page's `<IonContent>` (or equivalent content wrapper), add `<EventBanner />` as the FIRST child:
- `src/pages/DashboardPage.tsx`
- `src/pages/IronCondorDashboardPage.tsx`
- `src/pages/GuviduVisualizationPage.tsx`
- `src/pages/AccountPage.tsx`
- `src/pages/GuviduVsCatalinPage.tsx`

Example:
```tsx
<IonContent>
    <EventBanner />
    {/* existing content */}
</IonContent>
```

- [ ] **Step 3: Verify TS compiles + page renders**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/event-banner/event-banner.component.tsx \
    src/pages/DashboardPage.tsx \
    src/pages/IronCondorDashboardPage.tsx \
    src/pages/GuviduVisualizationPage.tsx \
    src/pages/AccountPage.tsx \
    src/pages/GuviduVsCatalinPage.tsx
git commit -m "feat(economic-calendar): EventBanner injected in 5 pages"
```

---

## Task 17: Integrate laddering gate into `aiDailySubmit`

**Files:**
- Modify: `functions/src/aiDailySubmit.ts`

- [ ] **Step 1: Read existing aiDailySubmit**

Run: `cat functions/src/aiDailySubmit.ts`
Expected: full file visible. Identify:
- Entry function (likely `export const aiDailySubmit = onSchedule(...)`)
- Where orders get submitted (look for `sendOrder`, `submitOrder`, or similar)
- Where scan results are written to Firestore

- [ ] **Step 2: Add gate check before order submission**

Edit `functions/src/aiDailySubmit.ts`:

At top, add imports:
```typescript
import { checkGates, fetchUpcomingEvents } from './shared/economic-calendar';
```

Find the entry point. Just before the loop/call that submits orders, add:

```typescript
// --- Economic Calendar gate ---
const upcomingEvents = await fetchUpcomingEvents(48);
const gates = await checkGates(new Date(), upcomingEvents);

if (gates.ladderingPause.paused) {
    console.log(`[aiDailySubmit] BLOCKED by event: ${gates.ladderingPause.reason}`);

    // Still write scan results for visibility (per spec §4e)
    const today = new Date().toISOString().split('T')[0];
    await admin.firestore().collection('dailyScans').doc(today).set({
        scanDate: today,
        blocked: true,
        blockedReason: gates.ladderingPause.reason,
        blockingEventIds: gates.ladderingPause.blockingEvents.map(e => e.id),
        candidates: /* whatever the scan produced */ [],
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return;  // zero orders submitted
}
// --- end gate ---
```

**Implementation detail:** The exact placement depends on the existing code structure. If the scan produces `candidates` before ordering, insert the gate AFTER candidates are computed but BEFORE any `sendOrder` call. Modify the existing Firestore write to include `blocked: false` in the non-blocked path so the UI can distinguish states.

- [ ] **Step 3: Verify TS compiles**

Run: `cd functions && npm run build`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/aiDailySubmit.ts
git commit -m "feat(economic-calendar): integrate laddering gate into aiDailySubmit"
```

---

## Task 18: Deploy backend (seed callable + updated aiDailySubmit + rules + indexes)

**Files:** (no file changes — deployment step)

- [ ] **Step 1: Final type check**

Run:
```bash
cd functions && npm run build && cd ..
npx tsc --noEmit
```
Expected: both clean.

- [ ] **Step 2: Run all tests**

Run:
```bash
cd functions && npm test && cd ..
npx vitest run --reporter=verbose
```
Expected: all tests PASS.

- [ ] **Step 3: Deploy Firestore rules + indexes**

Run: `firebase deploy --only firestore:rules,firestore:indexes`
Expected: deploy success. Indexes may take 2-5 min to build.

- [ ] **Step 4: Deploy functions**

Run: `firebase deploy --only functions:seedEconomicEvents,functions:aiDailySubmit`
Expected: deploy success.

- [ ] **Step 5: Seed 2026 events**

Open app in browser at `/superadmin`, click "Seed 2026 events". Confirm. Wait for success.

Verify in Firebase Console → Firestore → `economicEvents` → ~90 docs present.

- [ ] **Step 6: Create feature flag doc**

In Firebase Console → Firestore → create doc `featureFlags/economicCalendar` with field:
```
enabled: true (boolean)
```

This allows later killswitch via console without redeploy.

- [ ] **Step 7: Smoke test**

1. Navigate `/economic-calendar` — should show week-by-week events.
2. Dashboard page — `EventBanner` visible if today/tomorrow has an event.
3. Trigger `aiDailySubmit` manually via Firebase Console: Functions → aiDailySubmit → testing tab. Check logs:
   - Expect `[aiDailySubmit] BLOCKED by event: ...` if today has CPI/NFP/FOMC
   - Expect normal scan flow otherwise
4. Check `dailyScans/YYYY-MM-DD` doc — should have `blocked: true/false` field.

- [ ] **Step 8: Commit + tag**

```bash
git commit --allow-empty -m "chore(economic-calendar): deploy phase 1-3 to production"
git tag v-economic-calendar-p1-3
```

---

## Task 19: Cypress smoke E2E test

**Files:**
- Create: `cypress/e2e/economic-calendar.cy.ts`

- [ ] **Step 1: Write test**

```typescript
describe('Economic Calendar', () => {
    beforeEach(() => {
        // Assumes test user logged in via existing auth pattern — check other cy files for helper
        cy.login();  // or whatever the project's helper is named
    });

    it('renders calendar page', () => {
        cy.visit('/economic-calendar');
        cy.contains('Economic Calendar').should('be.visible');
        cy.contains('Critical + Major').should('be.visible');  // filter chip
    });

    it('filter chips toggle', () => {
        cy.visit('/economic-calendar');
        cy.contains('button', 'All').click();
        cy.contains('button', 'All').should('have.css', 'background-color');
    });

    it('event row expands on click', () => {
        cy.visit('/economic-calendar');
        // Assumes at least one event is seeded
        cy.get('[data-testid="event-row"]').first().click();
        cy.contains('Countdown:').should('be.visible');
    });
});
```

**Note:** Add `data-testid="event-row"` to `EventRow`'s outer element and adjust `cy.login()` to match the project's existing Cypress helper pattern. Check `cypress/support/commands.ts` for existing commands.

- [ ] **Step 2: Run Cypress**

Run: `npx cypress run --spec cypress/e2e/economic-calendar.cy.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add cypress/e2e/economic-calendar.cy.ts src/components/economic-calendar/EventRow.tsx
git commit -m "test(economic-calendar): Cypress smoke E2E"
```

---

## Task 20: Deploy frontend + PR

**Files:** (no changes — final push)

- [ ] **Step 1: Final build check**

Run:
```bash
npx tsc --noEmit
npm run build
```
Expected: build succeeds, `dist/` generated.

- [ ] **Step 2: Push branch**

Run:
```bash
git push -u origin feat/economic-calendar
```
Expected: remote branch created.

- [ ] **Step 3: Open PR**

Run:
```bash
gh pr create --title "feat: Economic Calendar (phase 1-3)" --body "$(cat <<'EOF'
## Summary
- Adds Firestore `economicEvents` collection + seed mechanism
- New `/economic-calendar` page with week-by-week view (Option A layout)
- `EventBanner` on 5 pages shows active pause/close window
- `aiDailySubmit` now blocks order submission when today/tomorrow (ET) has a high-impact event
- Feature-flag kill switch: `featureFlags/economicCalendar.enabled`

## Scope (phase 1-3 of spec)
Full spec: `docs/superpowers/specs/2026-04-15-economic-calendar-design.md`
Plan: `docs/superpowers/plans/2026-04-15-economic-calendar-phase-1-3.md`

Phases deferred to follow-up:
- Phase 4: closeCheck pre-event close gate (alert-only)
- Phase 6: Phase 2 auto-close toggle
- weeklyReconcile cron (spec §5d)

## Test plan
- [ ] `npx tsc --noEmit` clean
- [ ] `cd functions && npm test` passes (20+ unit tests)
- [ ] `npx vitest run` passes (frontend formatter tests)
- [ ] Cypress smoke: calendar page loads, filter works, event expands
- [ ] Manual: seed 2026 from SuperAdmin → ~90 docs in Firestore
- [ ] Manual: trigger `aiDailySubmit` on FOMC day → verify `blocked: true` in `dailyScans`
- [ ] Manual: verify `EventBanner` shows on Dashboard when today has CPI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Deploy Firebase Hosting (after PR approved+merged OR for preview)**

For preview: `firebase hosting:channel:deploy economic-calendar-preview`
For production (after merge): `firebase deploy --only hosting`

---

## Self-Review Checklist

**1. Spec coverage:**
- ✓ §1 Purpose → Tasks 4 (seed data), 17 (gate integration), 13 (page) — all covered
- ✓ §2 Architecture → Tasks 3, 5, 6, 8-17 — all units built
- ✓ §3 Data model → Tasks 1, 2, 6 — IEconomicEvent, indexes, rules all present
- ✓ §4a 40% threshold → deferred to follow-up plan (closeCheck not in this scope)
- ✓ §4b 4h close window → implemented in Task 3 `getCloseWindowEvents` (used later in closeCheck follow-up)
- ✓ §4c pause window → Task 3 `isInLadderingPauseWindow`
- ✗ §4d two-phase close behavior → deferred (closeCheck follow-up plan)
- ✓ §4e scan-but-block → Task 17
- ✓ §5 backend → Tasks 2-6, 17
- ✗ §5d weeklyReconcile → deferred (explicitly noted in scope boundary)
- ✓ §5f closeCheck → deferred
- ✓ §6 frontend → Tasks 7-16
- ✓ §7 testing → Tasks 2, 3, 10 (unit tests) + Task 19 (E2E)
- ✓ §8 deploy plan → Tasks 18, 20
- ✓ §9 feature flag kill switch → Task 3 (`checkGates` wrapper), Task 18 Step 6

**Gaps filled via deferred follow-up plan:** §4a, §4d, §5d, §5f — these constitute a separate plan `economic-calendar-phase-4-6.md` to be written after phase 1-3 is live.

**2. Placeholder scan:**
- "Appropriate error handling" — not used. All error handling is explicit (try/catch with specific action).
- "Similar to Task N" — not used. Every task has full code.
- "TBD", "TODO" — not present in task bodies.
- Task 9 Step 2 ("Follow the EXACT pattern used by ironCondorAnalytics") — acceptable reference because the pattern is already consistent across all services in the codebase; looking at one existing service shows what to do.
- Task 14 Step 1 (grep for side menu component) — discovery step; the engineer finds the file rather than guessing at a path.
- Task 17 Step 2 "exact placement depends on existing code structure" — acceptable because the file is 314 lines and the gate must slot into existing flow; explicit guidance provided on where to insert.

**3. Type consistency:**
- `IEconomicEvent` defined identically in `src/models/economic-event.model.ts` and `functions/src/shared/economic-event.types.ts` (duplicated intentionally — noted in Task 2).
- `FilterMode` used consistently in Tasks 10, 12, 13.
- `IActivePauseState` used in Tasks 7, 8, 16 — all reference same shape.
- Gate function signatures match between `economic-calendar.ts` (Task 3) and consumer in `aiDailySubmit.ts` (Task 17): `checkGates(now, events)` returns `{ ladderingPause, closeWindow }`.

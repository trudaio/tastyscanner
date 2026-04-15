# Economic Calendar — Design Spec

**Date:** 2026-04-15
**Status:** Approved (brainstorming), pending implementation plan
**Author:** Macovei Catalin + Claude
**Scope:** TastyScanner — new page + backend gating for Guvidul AI agent

---

## 1. Purpose

Build a hard-automation gate that prevents the Guvidul AI agent from opening or holding Iron Condor positions during high-impact US macro-economic events (FOMC, CPI, PPI, NFP, GDP, Retail Sales, ISM).

**Three concrete outcomes:**

1. **Display-only reference** — user-facing `/economic-calendar` page showing upcoming events grouped by day, with impact badges and gate status per day.
2. **Context for Picker agent** — LLM prompt for morning scan receives list of upcoming events as additional context.
3. **Hard automation gate**:
   - `aiDailySubmit` (morning scan) refuses to submit new IC orders when today or tomorrow has a high-impact event.
   - `closeCheck` (afternoon) detects open positions ≥40% profit within 4h of a high-impact event and creates alert/auto-close suggestions.

**Success criteria:**

- Zero IC positions opened on days with FOMC decision or BLS major release (CPI/PPI/NFP).
- User has single pane of glass for upcoming macro calendar.
- Automation never makes a decision based on stale or missing calendar data without failing safely (prefer skip-gate over false-gate).

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Firestore: collection `economicEvents`                     │
│  (Source of truth — pre-seeded annually via admin callable) │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
            ▼                         ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│  Frontend Service    │   │  Backend Cloud Functions         │
│  EconomicCalendar    │   │  - aiDailySubmit (MODIFY)        │
│  Service (MobX)      │   │  - closeCheck (MODIFY)           │
│  - groupedByDay()    │   │  - weeklyReconcile (NEW cron)    │
│  - activePauseState  │   │  - seedEconomicEvents (callable) │
│  - nextCloseEvent    │   │                                  │
└────────┬─────────────┘   │  all share: shared/              │
         │                 │      economic-calendar.ts        │
         │                 │  (pure gate functions)           │
         ▼                 └──────────────────────────────────┘
┌──────────────────────┐
│ EconomicCalendarPage │
│ + EventBanner        │
│ + SuperAdmin seed UI │
└──────────────────────┘
```

**Unit boundaries:**

1. **`economicEvents` Firestore collection** — schema-fixed source of truth.
2. **`shared/economic-calendar.ts`** — three pure functions reusable across all backend functions.
3. **`EconomicCalendarService`** — MobX store with real-time Firestore subscription.
4. **`EconomicCalendarPage`** — UI consumer.
5. **`EventBanner`** component — reusable across Dashboard, IC Dashboard, Guvid Visualization, AccountPage.
6. **`weeklyReconcile`** Cloud Function — Sunday cron, cross-checks federalreserve.gov against Firestore.
7. **`seedEconomicEvents`** callable — admin-only seed mechanism.

Frontend and backend share NO React/MobX code. The `shared/` layer exposes only pure functions that take `(now, events[])` inputs.

---

## 3. Data Model

### Collection `economicEvents`

```typescript
interface IEconomicEvent {
  id: string;                      // deterministic: "2026-04-16-cpi-0830"
  eventType: EventType;            // see enum below
  name: string;                    // "CPI (March 2026)"
  country: string;                 // "US" (forward-compat)
  impact: 'critical' | 'major' | 'medium' | 'low';

  // Timing (UTC stored, multi-format cache for display)
  scheduledUtc: Timestamp;
  scheduledEtString: string;       // "08:30 ET"
  scheduledEestString: string;     // "15:30 EEST" (Catalin's local)

  // Gating (derived from impact, explicit for query perf)
  gatesLadderingPause: boolean;    // true if impact ∈ {critical, major}
  gatesPreEventClose: boolean;     // true if impact ∈ {critical, major}

  // Release values (null for FOMC/speeches)
  previousValue: string | null;
  forecastValue: string | null;
  actualValue: string | null;      // post-release

  // Provenance
  source: 'bls' | 'fed' | 'bea' | 'census' | 'ism' | 'conf_board' | 'dol' | 'manual';
  sourceUrl: string;
  seededAt: Timestamp;
  seededBy: string;                // "seed-script-v1" | "admin:macovei17@gmail.com"
  verifiedAt: Timestamp | null;
}

type EventType =
  | 'FOMC_DECISION'        // critical
  | 'FOMC_PRESS_CONF'      // critical
  | 'FOMC_MINUTES'         // medium
  | 'CPI'                  // critical
  | 'PPI'                  // major
  | 'NFP'                  // critical
  | 'GDP'                  // major
  | 'RETAIL_SALES'         // medium
  | 'ISM_MANUFACTURING'    // medium
  | 'ISM_SERVICES'         // medium
  | 'JOBLESS_CLAIMS'       // low
  | 'CONSUMER_CONFIDENCE'  // low
  | 'DURABLE_GOODS'        // low
  | 'FED_SPEECH'           // variable (default medium; Powell → major)
  | 'OTHER';
```

**Impact → gating mapping (implicit, codified in seed logic):**

| Impact | gatesLadderingPause | gatesPreEventClose |
|--------|---------------------|---------------------|
| critical | ✓ | ✓ |
| major | ✓ | ✓ |
| medium | ✗ | ✗ |
| low | ✗ | ✗ |

### Firestore indexes (`firestore.indexes.json`)

```json
[
  { "collectionGroup": "economicEvents", "fields": [
    { "fieldPath": "country", "order": "ASCENDING" },
    { "fieldPath": "scheduledUtc", "order": "ASCENDING" }
  ]},
  { "collectionGroup": "economicEvents", "fields": [
    { "fieldPath": "gatesLadderingPause", "order": "ASCENDING" },
    { "fieldPath": "scheduledUtc", "order": "ASCENDING" }
  ]}
]
```

### Collection `system_alerts`

```typescript
interface ISystemAlert {
  id: string;
  type: 'calendar_seed_low' | 'calendar_reconcile_mismatch' | 'calendar_fomc_reschedule';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  relatedEventId: string | null;
  createdAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  acknowledgedBy: string | null;
}
```

### Collection `eventCloseSuggestions` (Phase 1 alert-only)

```typescript
interface IEventCloseSuggestion {
  id: string;
  tradeId: string;                 // FK to IIronCondorTrade.id
  ticker: string;
  currentProfitPct: number;
  triggeredByEventId: string;
  hoursUntilEvent: number;
  suggestedAction: 'close_at_market';
  suggestedAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  executedAt: Timestamp | null;    // populated in Phase 2 when auto toggle is ON
}
```

### Firestore Security Rules

```
match /economicEvents/{eventId} {
  allow read: if request.auth != null;
  allow write: if false;  // only via callable (admin-enforced)
}

match /system_alerts/{alertId} {
  allow read: if request.auth != null;
  allow update: if request.auth != null &&
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(['acknowledgedAt', 'acknowledgedBy']);
  allow create, delete: if false;
}

match /eventCloseSuggestions/{sugId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

### Scale estimate

- `economicEvents`: ~80 docs/year × 2 years cached ≈ 160 docs total. Query cost negligible.
- `system_alerts`: ~5-10/year.
- `eventCloseSuggestions`: ~30-50/year.

---

## 4. Behavior Specification

### 4a. Profit threshold (pre-event close)

**40% of openCredit** (approved — aligned with todo.md, between conservative 30% and aggressive 50%).

### 4b. Pre-event close window

**4h before scheduled event** (approved — gives buffer for order execution latency, broader than the 1h from original note).

### 4c. Laddering pause window

**Day-boundary rule: if today OR tomorrow (computed in `America/New_York` trading timezone) has any high-impact event (critical|major) → pause all new position submissions.**

"Today" and "tomorrow" are computed using ET calendar boundaries regardless of server or user timezone, because event scheduling is relative to US market hours. The morning scan runs at 9:30 AM ET; "today" always covers the current ET trading day.

Rationale:
- BLS 8:30 AM ET releases: by 9:30 AM market open, reaction is gapped in. But intraday follow-through real → pause day of.
- FOMC 2 PM ET: morning scan at 9:30 AM opens positions exposed to afternoon volatility; follow-through into Thu-Fri after Powell.
- Uniform rule simpler than per-event-type windows; cost ≈ 40-50 blocked days/year (~18% of trading days).

### 4d. Pre-event close execution (two phases)

**Phase 1 (launch default):** `closeCheck` detects qualifying trades and writes to `eventCloseSuggestions` collection. UI surfaces as notification; user manually closes.

**Phase 2 (after ≥2 weeks of verified Phase 1 suggestions):** User flips `settings.autoCloseOnEvent` toggle → `closeCheck` submits close orders automatically (reusing existing 75% TP logic pathway).

### 4e. Morning scan in pause window

Scan runs to completion for visibility; blocks only the order-submission step.

Firestore write pattern:
```typescript
await admin.firestore().collection('dailyScans').doc(today).set({
  ...scanResults,
  blocked: true,
  blockedReason: gate.reason,
  blockingEvents: gate.blockingEvents.map(e => e.id),
});
```

UI `GuviduVsCatalinPage` surfaces scan-but-blocked state.

---

## 5. Backend Implementation

### 5a. Directory structure

```
functions/src/
├── data/
│   ├── economic-events-2026.ts    # NEW: hardcoded schedule
│   └── economic-events-2027.ts    # NEW: populated Q4 2026
├── shared/
│   └── economic-calendar.ts        # NEW: pure gate functions
├── seedEconomicEvents.ts           # NEW: admin callable
├── weeklyReconcile.ts              # NEW: Sunday cron
├── aiDailySubmit.ts                # MODIFY: integrate laddering pause gate
├── closeCheck.ts                   # MODIFY: integrate pre-event close gate
└── index.ts                        # MODIFY: export new functions
```

### 5b. Pure gate functions (`shared/economic-calendar.ts`)

```typescript
/** Events in [now, now + lookAheadHours] that gate laddering. */
export function getLadderingPauseEvents(
  now: Date,
  events: IEconomicEvent[],
  lookAheadHours = 48
): IEconomicEvent[] { ... }

/** Events in [now, now + closeWindowHours] that gate pre-event close. */
export function getCloseWindowEvents(
  now: Date,
  events: IEconomicEvent[],
  closeWindowHours = 4
): IEconomicEvent[] { ... }

/** Day-boundary check: is today or tomorrow (ET) blocked? */
export function isInLadderingPauseWindow(
  now: Date,
  events: IEconomicEvent[]
): { paused: boolean; reason: string; blockingEvents: IEconomicEvent[] } { ... }
```

All three:
- Pure functions (no Firestore calls, no side effects).
- Return empty/safe defaults on empty input.
- Unit-tested with 8+ cases each including DST transitions and timezone boundaries.

**Feature-flag short-circuit wrapper** (for safe rollback per §8):

```typescript
// Wrapper used by aiDailySubmit and closeCheck instead of calling gate fns directly
export async function checkGates(
  now: Date,
  events: IEconomicEvent[]
): Promise<{ ladderingPause: ReturnType<typeof isInLadderingPauseWindow>; closeWindow: IEconomicEvent[] }> {
  const flagDoc = await admin.firestore().doc('featureFlags/economicCalendar').get();
  const enabled = flagDoc.exists ? flagDoc.data()?.enabled !== false : true;

  if (!enabled) {
    return {
      ladderingPause: { paused: false, reason: 'feature disabled', blockingEvents: [] },
      closeWindow: [],
    };
  }

  return {
    ladderingPause: isInLadderingPauseWindow(now, events),
    closeWindow: getCloseWindowEvents(now, events, 4),
  };
}
```

This lets us kill-switch all gating by setting `featureFlags/economicCalendar.enabled = false` without redeploying.

### 5c. Seed mechanism

**Data source:** Hardcoded TypeScript arrays per year, manually curated from:
- FOMC dates → federalreserve.gov/monetarypolicy/fomccalendars.htm
- CPI/PPI/NFP/Jobless Claims → bls.gov/schedule/news_release/
- GDP → bea.gov/news/schedule
- Retail Sales/Durable Goods → census.gov/economic-indicators/calendar
- ISM → ismworld.org (Manufacturing + Services PMI)

**Expansion logic:** seed tuple `(type, date, timeET, period?)` → expanded to full `IEconomicEvent` via:
- Deterministic ID: `${date}-${type.toLowerCase()}-${timeET.replace(':', '')}`
- UTC conversion using luxon with `America/New_York` zone (handles DST automatically)
- `gatesLadderingPause` / `gatesPreEventClose` derived from `eventTypeToImpact(type)`

**Seed callable (`seedEconomicEvents`):**
```typescript
export const seedEconomicEvents = onCall({ region: 'us-central1' }, async (request) => {
  if (request.auth?.token?.email !== 'macovei17@gmail.com') {
    throw new HttpsError('permission-denied', 'Admin only');
  }
  const { year } = request.data;
  const seeds = year === 2026 ? EVENTS_2026_US : EVENTS_2027_US;

  const batch = admin.firestore().batch();
  for (const seed of seeds) {
    const docId = computeDeterministicId(seed);
    const ref = admin.firestore().collection('economicEvents').doc(docId);
    batch.set(ref, expandSeed(seed, 'admin:' + request.auth.token.email), { merge: true });
  }
  await batch.commit();
  return { seeded: seeds.length, year };
});
```

Idempotent via deterministic IDs + `merge: true`.

### 5d. Weekly reconcile (`weeklyReconcile.ts`)

```typescript
export const weeklyReconcile = onSchedule({
  schedule: '0 10 * * SUN',      // Sundays 10:00 UTC = 6:00 ET
  timeZone: 'UTC',
  region: 'us-central1',
}, async () => {
  // 1. Cross-check FOMC dates against Fed website via Firecrawl
  const fedDates = await fetchFomcDatesFromFed();   // string[] of YYYY-MM-DD
  const dbDates  = await getFomcDatesFromFirestore();

  const missing = fedDates.filter(d => !dbDates.includes(d));
  const extra   = dbDates.filter(d => !fedDates.includes(d));

  if (missing.length || extra.length) {
    await createSystemAlert({
      type: 'calendar_reconcile_mismatch',
      severity: 'warning',
      message: `FOMC mismatch: ${missing.length} missing, ${extra.length} extra`,
    });
  }

  // 2. Depth check
  const maxScheduledUtc = await getMaxScheduledUtc();
  const daysRemaining = Math.floor((maxScheduledUtc - Date.now()) / 86400000);
  if (daysRemaining < 60) {
    await createSystemAlert({
      type: 'calendar_seed_low',
      severity: 'warning',
      message: `Calendar ends in ${daysRemaining} days — seed next year`,
    });
  }
});
```

Firecrawl API key already in `~/Downloads/ai-projects/.env.secrets` (key `FIRECRAWL_API_KEY`, reused from Firecrawl MCP setup).

### 5e. aiDailySubmit integration

```typescript
// At start of scan, BEFORE any submission:
const events = await fetchUpcomingEvents(48 /* hours */);
const gate = isInLadderingPauseWindow(new Date(), events);

// Always run scan for visibility (see 4e):
const scanResults = await runScan(...);

if (gate.paused) {
  await admin.firestore().collection('dailyScans').doc(today).set({
    ...scanResults,
    blocked: true,
    blockedReason: gate.reason,
    blockingEvents: gate.blockingEvents.map(e => e.id),
  });
  logger.info(`[aiDailySubmit] Scan blocked: ${gate.reason}`);
  return;
}

// Normal submission path
await submitOrders(scanResults);
```

Additionally, the Picker LLM prompt receives upcoming events (next 48h) as context regardless of gate state (covers outcome #2 from §1).

### 5f. closeCheck integration (Phase 1)

```typescript
const events = await fetchUpcomingEvents(4);
const closeWindowEvents = getCloseWindowEvents(new Date(), events, 4);

for (const trade of openTrades) {
  if (trade.profitPct >= 40 && closeWindowEvents.length > 0) {
    await admin.firestore().collection('eventCloseSuggestions').add({
      tradeId: trade.id,
      ticker: trade.ticker,
      currentProfitPct: trade.profitPct,
      triggeredByEventId: closeWindowEvents[0].id,
      hoursUntilEvent: hoursBetween(new Date(), closeWindowEvents[0].scheduledUtc),
      suggestedAction: 'close_at_market',
      suggestedAt: admin.firestore.FieldValue.serverTimestamp(),
      acknowledgedAt: null,
      executedAt: null,
    });

    // Phase 2 (gated behind settings toggle):
    // const settings = await fetchSettings();
    // if (settings.autoCloseOnEvent) { await sendCloseOrder(trade); }
  }
}
```

---

## 6. Frontend Implementation

### 6a. `EconomicCalendarService` (MobX)

`src/services/economic-calendar/economic-calendar.service.ts` — extends `ServiceBase`, registered in `ServiceFactory` as `economicCalendar`.

```typescript
@observable events: IEconomicEvent[] = [];
@observable isLoading = true;
@observable systemAlerts: ISystemAlert[] = [];

// Real-time onSnapshot subscription: country='US', scheduledUtc>=now, limit 200
// Separate subscription for unack'd system_alerts

@computed get groupedByDay(): Map<string, IEconomicEvent[]>
@computed get todaysEvents(): IEconomicEvent[]
@computed get tomorrowsEvents(): IEconomicEvent[]
@computed get activePauseState(): { paused: boolean; reason: string }
@computed get nextCloseWindowEvent(): IEconomicEvent | null
```

### 6b. `EconomicCalendarPage`

`src/pages/EconomicCalendarPage.tsx` — route `/economic-calendar`, added to App.tsx and side menu (between "Guvid Visualization" and "Super Admin").

**Layout** (Option A from brainstorming — list grouped by day, mobile-first):

```
📅 Today · Thu Apr 16           [🔴 LADDERING PAUSED]
  08:30 ET  🔴 CPI (March)             prev 3.2% · fcst 3.1% · actual —
  14:00 ET  🔴 FOMC Minutes            (release)
──────────────────────────────────────
📅 Tomorrow · Fri Apr 17         [🔴 LADDERING PAUSED]
  08:30 ET  🔴 Retail Sales            prev 0.6% · fcst 0.4%
──────────────────────────────────────
📅 Mon Apr 20                    [🟢 OK to ladder]
  10:00 ET  🟡 ISM Services PMI        prev 51.2 · fcst 51.5
```

**Elements:**
- Max-width 900px container on desktop (centered); full width on mobile.
- Filter chips: `[All] [Critical+Major] [Critical only]`, default `Critical+Major`.
- Day badges: `🔴 LADDERING PAUSED` / `🟢 OK to ladder` / `🟡 Close window active`.
- Event rows clickable → accordion expand with source URL, full release values, countdown.
- Banner at top when `systemAlerts` present (seed low, reconcile mismatch).
- Empty state: "No upcoming events — calendar seeded through {maxDate}".

### 6c. `EventBanner` component

`src/components/event-banner/event-banner.component.tsx` — mounted at top of:
- `DashboardPage`
- `IronCondorDashboardPage`
- `GuviduVisualizationPage`
- `AccountPage`
- `GuviduVsCatalinPage`

Renders only when `activePauseState.paused` or `nextCloseWindowEvent != null`.

```tsx
{closeEvent && (
  <>🔴 {closeEvent.name} in {formatCountdown(closeEvent.scheduledUtc)} —
      review profitable positions ≥40%
    <Link to="/economic-calendar">View details</Link>
  </>
)}
{!closeEvent && pauseState.paused && (
  <>🟡 Laddering blocked today: {pauseState.reason}
    <Link to="/economic-calendar">View calendar</Link>
  </>
)}
```

Dismissible per session (stored in component state, resets on reload).

### 6d. Timezone display

- Primary: ET (trading standard) — pre-computed in `scheduledEtString` at seed time.
- Secondary: user's local (auto-detect via `Intl.DateTimeFormat().resolvedOptions().timeZone`) — formatted client-side from `scheduledUtc`.
- Example: `08:30 ET (15:30 EEST)`.

### 6e. SuperAdminPage — seed controls

New section with buttons:
- `[Seed 2026 events]` → calls `seedEconomicEvents({year: 2026})`
- `[Seed 2027 events]` → calls `seedEconomicEvents({year: 2027})`
- `[Run reconcile now]` → triggers `weeklyReconcile` via callable wrapper

Confirmation dialog before each: "This will upsert ~80 events for YYYY. Safe to re-run. Continue?"

Status readout:
- Last seeded timestamp per year
- Total events in DB
- Max scheduled date (calendar extent)

---

## 7. Testing

### 7a. Unit tests

`functions/src/shared/economic-calendar.test.ts` (Vitest):

- `isInLadderingPauseWindow`:
  - empty events → `paused: false`
  - event today CRITICAL → `paused: true`
  - event tomorrow MAJOR → `paused: true`
  - event day-after-tomorrow → `paused: false`
  - boundary at midnight ET (23:59:59 today vs 00:00:00 tomorrow)
  - Sunday→Monday weekend rollover
  - only LOW impact events → `paused: false`
  - multiple blocking events (combined reason string)

- `getCloseWindowEvents`:
  - empty → `[]`
  - event in 2h CRITICAL → returned
  - event in 5h → not returned (outside 4h window)
  - event in past → not returned
  - multiple in window → all returned, sorted ascending

- `computeDeterministicId`:
  - same seed input → same ID
  - different timeET → different ID

### 7b. Integration tests

`cypress/e2e/economic-calendar.cy.ts`:
- Page opens without crash on empty Firestore
- Events render grouped by day when seeded
- Filter chips toggle correctly
- Click event → accordion expands
- Banner navigation from Dashboard → Calendar page works

### 7c. DST test cases

Specific test cases for 2026 DST transitions:
- **2026-03-08 (spring forward)**: CPI release 2026-03-11 at 08:30 ET → verify UTC conversion before/after DST boundary.
- **2026-11-01 (fall back)**: FOMC 2026-10-28 at 14:00 ET → verify UTC consistent.

### 7d. Manual verification checklist (pre-deploy)

1. Run `seedEconomicEvents({year: 2026})` from SuperAdmin UI → verify ~80 docs in Firestore with correct `scheduledUtc` timestamps.
2. Force-trigger `aiDailySubmit` on a simulated FOMC day → verify scan runs but `dailyScans/{today}.blocked === true`.
3. Simulate open trade at 45% profit with synthetic event in 3h → verify `eventCloseSuggestions` doc created.
4. Deploy and verify Cloud Scheduler trigger fires `weeklyReconcile` on Sunday.
5. Verify `system_alerts` doc created when reconcile detects calendar end < 60 days.

---

## 8. Deployment Plan (phased rollout)

| Week | Deliverable | Impact |
|------|-------------|--------|
| 0 | Spec approved, implementation plan written | none |
| 1 | Backend: Firestore rules, gate functions (pure), callable seed, `economic-events-2026.ts` data. Seed 2026 from SuperAdmin. | backend only, zero live impact |
| 2 | Frontend: `EconomicCalendarPage`, service, side menu, SuperAdmin seed UI. User testing. | read-only UI |
| 3 | `EventBanner` across Dashboard/IC/Visualization/Account. Integrate gate into `aiDailySubmit` (laddering pause). | first live automation change |
| 4 | Integrate gate into `closeCheck` (Phase 1 alert-only). Observe suggestions ≥2 weeks. | alert-only, no order submission |
| 6 | Settings toggle `autoCloseOnEvent` + Phase 2 auto-close enablement. | live auto-close (after toggle ON) |

**Rollback mechanism:** Firestore `featureFlags/economicCalendar.enabled` boolean. When `false`, all gate functions short-circuit to `{paused: false}`. Safe kill switch if anything misbehaves.

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Seed data incorrect (wrong date/time) | Medium | HIGH (gate miss or false-positive) | Manual cross-check at seed + weekly reconcile cron |
| Firestore subscription lag → gate uses stale data | Low | HIGH | Check `now - maxSeededAt < 90 days`; else fail-safe `paused=false` + system_alert |
| Timezone bug (ET vs UTC vs EEST) | Medium | HIGH | UTC as primary storage; DST transitions covered in test suite; use luxon for conversions |
| Firecrawl fails during reconcile | Low | MEDIUM | Alert `calendar_reconcile_mismatch severity=warning`; retry next week |
| User forgets to seed next year | Medium | MEDIUM | UI banner when <60 days remaining + system_alert |
| Phase 2 auto-close bug → wrong order | Low | HIGH ($) | Phase 1 alert-only ≥2 weeks before toggle; settings toggle default OFF |
| Fed emergency meeting not in whitelist | Very low (<1/decade) | HIGH | Manual admin override; accepted risk — no data source catches unscheduled events |

---

## 10. Non-Goals (explicit out of scope)

- Non-US events (EU CPI, China PMI, BoE, ECB, etc.) — schema allows `country` field but seed is US-only.
- Automatic scraping of `actualValue` post-release — manual population later if useful.
- Native push notifications (iOS/web push) — Firestore + UI banner only.
- Fed speaker auto-detection (day-of announcements) — manual add post-hoc if needed.
- Historical event archive (>60 days past) — TTL cleanup in reconcile function.

---

## 11. Open Questions (deferred — not blocking implementation)

None blocking. All product decisions made during brainstorming.

Future enhancements tracked in memory `project_todo_guvidul.md`:
- International events (EU/UK/China) — if Guvidul expands beyond SPX/QQQ.
- Actual value auto-ingestion — nice-to-have for post-release analysis.
- Push notifications — if mobile usage grows.

---

## 12. Approval

- Brainstorming session: **2026-04-15** (conversation with Catalin)
- All 5 design sections approved verbally during session
- Ready for `writing-plans` phase after user re-reads this doc

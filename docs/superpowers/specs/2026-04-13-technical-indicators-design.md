# Technical Indicators Panel — Design Spec

**Date:** 2026-04-13
**Author:** Catalin + Claude (brainstormed via superpowers:brainstorming)
**Status:** Approved for implementation

## Goal

Add RSI(14), Bollinger Bands(20, 2σ), and ATR(14) to TastyScanner:
1. **Header badges** — 3 compact chips next to existing `IVR | Beta` showing current values with color-coded verdicts.
2. **Collapsible chart panel** — 90-day line chart with BB overlay and RSI strip, above the existing "Chart" section.
3. **Guvid Guide page** — rename `GreeksGuidePage` → `GuvidGuidePage`, add Technical Indicators section with formulas and interpretations.
4. **Autonomous Picker wiring** — pass latest indicators to Claude Opus in `aiDailySubmit.ts` as informational context (not mechanical triggers).

## Scope

**Tickers:**
- **Hot path** (SPX, QQQ): pre-computed daily, read from Firestore. Instant load.
- **Cold path** (any other ticker): on-demand via callable Function. Spinner ~2s.

**Indicators:**
- RSI(14) — daily closes, 14-period Wilder's smoothing
- Bollinger Bands(20, 2σ) — 20-period SMA ± 2 standard deviations
- ATR(14) — 14-period Wilder's smoothing of True Range

**Not in scope:**
- Intraday refresh (daily close only — see Decisions § Cadence)
- MACD, SMA-50/200, stochastics (see Decisions § Indicator Set)
- Mechanical trading rules (Picker sees numbers but decides contextually — see Decisions § Picker Wiring)

## Decisions

| Question | Chosen | Rejected | Reason |
|----------|--------|----------|--------|
| Scope | Hybrid (C) | SPX/QQQ only (A), any ticker (B) | SPX/QQQ are hot path — need instant. Other tickers are occasional — on-demand is fine. |
| Data source | Polygon.io (A) | TastyTrade (B), Yahoo (C) | Existing `GB_POLYGON_API_KEY`, clean index data, fits Function rate limits. |
| Indicators | RSI+BB+ATR (B) | RSI+BB only (A), full suite (C) | ATR drives wing-width decisions; MACD redundant with RSI for this strategy. |
| Refresh cadence | Daily 16:15 ET (A) | Daily + intraday (B), pure intraday (C) | RSI(14) is academically a close-of-day decision. Picker runs at 10:30 ET with yesterday's close. |
| Picker wiring | Info context (A) | Deterministic rules (B), rationale-only (C) | Claude Opus integrates context better than hard rules; rules risk overriding judgment in trends. |
| Chart type | Line + BB zone + RSI strip (B) | Candlestick (A), minimal sparkline (C) | Compact, answers "where are we in the band" instantly, no heavy library. |
| Lookback | 90 days | 30, 60, 180 | ~4.2 months — enough context, not too compressed. |
| RSI thresholds | 70/30 standard | 65/35, 75/25 | Standard convention, no surprise interpretations. |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Firebase Scheduler: cron "15 16 * * 1-5" (16:15 ET, M-F)   │
│  computeTechnicals                                           │
│  └─→ For [SPX, QQQ]: Polygon fetch → compute → Firestore    │
├─────────────────────────────────────────────────────────────┤
│  Firestore: marketTechnicals/{ticker}                        │
├─────────────────────────────────────────────────────────────┤
│  Callable Function: getTechnicalsOnDemand(ticker)            │
│  └─→ auth + rate-limit (10/min/user) → fetch → return       │
├─────────────────────────────────────────────────────────────┤
│  Front-end TechnicalsService (MobX)                          │
│  ├─ SPX/QQQ: Firestore subscription (onSnapshot)            │
│  └─ Other: callable Function, in-session cache              │
├─────────────────────────────────────────────────────────────┤
│  UI                                                          │
│  ├─ TechnicalsBadges: 3 chips in Page.tsx header            │
│  ├─ TechnicalsChart: collapsible panel above "Chart"        │
│  └─ GuvidGuidePage: formulas + interpretations              │
├─────────────────────────────────────────────────────────────┤
│  Picker (aiDailySubmit.ts)                                   │
│  └─→ Read marketTechnicals → add to marketContext.technicals │
│      → extended prompt with interpretation guidance         │
└─────────────────────────────────────────────────────────────┘
```

## Modules

Each module has a single purpose, a well-defined interface, and can be tested in isolation.

### Pure compute — `functions/src/shared/technicals.ts`
Zero I/O. All functions deterministic.

```ts
interface OHLC { date: string; open: number; high: number; low: number; close: number; volume: number; }

interface BBResult {
  upper: number; mid: number; lower: number;
  stdDev: number;
  percentB: number;         // 0 = at lower, 1 = at upper
  distanceSigma: number;    // (close - mid) / stdDev, signed
}

computeRSI(closes: number[], period: number = 14): number
computeBB(closes: number[], period: number = 20, sigma: number = 2): BBResult
computeATR(ohlc: OHLC[], period: number = 14): number

// Verdict helpers (pure, threshold-based):
rsiVerdict(value: number): 'oversold' | 'neutral' | 'overbought'          // <30, 30-70, >70
bbVerdict(distanceSigma: number): 'below_lower' | 'near_lower' | 'neutral' | 'near_upper' | 'above_upper'
atrVerdict(ticker: 'SPX' | 'QQQ', value: number): 'low' | 'normal' | 'elevated'
```

Error: throws `InsufficientDataError` if input array shorter than required period.

### Polygon client — `functions/src/shared/polygon-client.ts`
Narrow wrapper. Only used by `computeTechnicals` scheduler and `getTechnicalsOnDemand` callable.

```ts
fetchDailyBars(ticker: string, days: number): Promise<OHLC[]>
// Maps: SPX → I:SPX, QQQ → QQQ, default: as-is
// Returns oldest → newest, filters weekends/holidays from API response
```

### Scheduler — `functions/src/computeTechnicals.ts`
Glue. Uses `onSchedule("15 16 * * 1-5", ...)` with timezone `America/New_York`.

For each ticker in `['SPX', 'QQQ']`:
1. Fetch 120 bars (buffer for Wilder warmup — 90 + 30)
2. Compute RSI, BB, ATR on last 90
3. Write `marketTechnicals/{ticker}` with trailing 90 bars + verdicts
4. On retry exhaustion: set `stale: true`, keep previous `bars`/indicators

### Callable — `functions/src/getTechnicalsOnDemand.ts`
`onCall` (requires auth). Input: `{ ticker: string }`. Output: same shape as Firestore doc (minus `stale`).

Rate limit: 10 calls/min/user via sliding window in `users/{uid}/rateLimits/technicals`.

### Front-end service — `src/services/technicals/technicals.service.ts`
MobX service, added to `ServiceFactory`.

```ts
class TechnicalsService {
  @observable technicalsByTicker: Map<string, ITechnicals | null>
  @observable loadingByTicker: Map<string, boolean>

  watch(ticker: string): void
    // SPX/QQQ: onSnapshot Firestore doc, pushes into map
    // Other: calls getTechnicalsOnDemand, caches result in-session
    //   (no refetch until page reload)

  getTechnicals(ticker: string): ITechnicals | null
  isLoading(ticker: string): boolean
}
```

### UI components
- `src/components/technicals/technicals-badges.component.tsx` — 3 colored chips (RSI, BB, ATR), each with tooltip. Reads from `TechnicalsService` via `useServices()`.
- `src/components/technicals/technicals-chart.component.tsx` — SVG raw (pattern from `guvid-visualization.component.tsx`), viewBox 1200×340 (chart 280 + RSI strip 60), stretches 100% width.
- `src/components/technicals/technicals-panel.component.tsx` — wrapper with toggle button, collapse state in `localStorage['technicalsPanelExpanded']` (default: true).

### Picker integration — `functions/src/aiDailySubmit.ts`
Before LLM call:
```ts
const techDoc = await db.doc(`marketTechnicals/${ticker}`).get();
const technicals = techDoc.exists && !techDoc.data()?.stale
  ? extractLatest(techDoc.data())
  : null;
marketContext.technicals = technicals;
```

Prompt extension (in `llm-picker.ts`):
```
Technical context (daily close yesterday):
- RSI(14): {value} — {verdict}
- BB position: {distanceSigma signed σ} from 20-day mid ({verdict})
- ATR(14): {value} — {verdict}

Interpret these as RISK signals, not mechanical triggers.
- Elevated RSI (>70) + upper band proximity = reversal risk on CALL side
- Low RSI (<30) + lower band proximity = bounce risk on PUT side
- Elevated ATR = consider wider wings ($15 instead of $10)

Do NOT override structural rules (symmetric delta, credit-to-wing, POP)
unless a signal is extreme: RSI >75 or <25, or |distanceSigma| >2.
```

### Docs updates
- Rename `src/pages/GreeksGuidePage.tsx` → `src/pages/GuvidGuidePage.tsx`
- Update imports in `App.tsx`, `Menu.tsx` (menu entry text too)
- Add new section `Technical Indicators` to the page with:
  - **RSI(14)** — FormulaBox (Wilder formula), InterpretBox (>70 overbought / <30 oversold / divergence notes), WarningBox (RSI fails in strong trends)
  - **Bollinger Bands(20, 2σ)** — FormulaBox (mid + 2σ), InterpretBox (%B meaning, distanceSigma as context), WarningBox (band walk in trends)
  - **ATR(14)** — FormulaBox (True Range + Wilder smoothing), InterpretBox (vol regime, wing-width guidance for IC), WarningBox (not a direction signal)
- Update `docs/system-architecture.md` with new Function + data flow
- Update `docs/project-overview-pdr.md` with the feature entry

## Data contracts

### Firestore `marketTechnicals/{ticker}`
```ts
{
  ticker: 'SPX' | 'QQQ',
  computedAt: string,   // ISO 8601
  stale: boolean,

  bars: Array<{
    date: string,        // YYYY-MM-DD
    open: number, high: number, low: number, close: number,
    volume: number,
  }>,  // length 90, oldest → newest

  rsi: { value: number, verdict: 'oversold' | 'neutral' | 'overbought' },
  bb: {
    upper: number, mid: number, lower: number,
    stdDev: number,
    percentB: number,
    distanceSigma: number,
    verdict: 'below_lower' | 'near_lower' | 'neutral' | 'near_upper' | 'above_upper',
  },
  atr: { value: number, verdict: 'low' | 'normal' | 'elevated' },
}
```

### Picker `marketContext.technicals` (in prompt)
Simplified — only latest values, no bars.
```ts
{
  rsi: number, rsiVerdict: string,
  bbDistance: number, bbVerdict: string,
  atr: number, atrVerdict: string,
  computedAt: string,
}
```

## Verdicts & color thresholds

### RSI (intervals: lower bound inclusive, upper bound exclusive)
| Value | Verdict | Badge color |
|-------|---------|-------------|
| [0, 25) | oversold (extreme) | red |
| [25, 30) | oversold | yellow |
| [30, 70] | neutral | green |
| (70, 75] | overbought | yellow |
| (75, 100] | overbought (extreme) | red |

Note: RSI exactly at 30 or 70 is treated as `neutral` (non-triggering). Threshold crossings require strict inequality.

### BB distanceSigma
| Value | Verdict | Badge color |
|-------|---------|-------------|
| < -2 | below_lower | red |
| -2 to -1 | near_lower | yellow |
| -1 to +1 | neutral | green |
| +1 to +2 | near_upper | yellow |
| > +2 | above_upper | red |

### ATR (SPX)
| Value | Verdict | Badge color |
|-------|---------|-------------|
| < 40 | low | green |
| 40–70 | normal | green |
| > 70 | elevated | yellow |

### ATR (QQQ)
| Value | Verdict | Badge color |
|-------|---------|-------------|
| < 5 | low | green |
| 5–9 | normal | green |
| > 9 | elevated | yellow |

## Chart spec

**Dimensions:** viewBox 1200 × 340 total (chart 280 + RSI strip 60). Width 100% of container.

**Y-axis scale (chart):** `[min(bbLower[]) × 0.995, max(bbUpper[]) × 1.005]`.

**Visual layers (bottom → top):**
1. Zone fill above BB upper: `rgba(255,99,71,0.10)` (light red)
2. Zone fill below BB lower: `rgba(76,175,80,0.10)` (light green)
3. BB mid line: dashed, `var(--ion-color-medium)`, 1px
4. BB upper/lower lines: solid, `var(--ion-color-medium-shade)`, 1px
5. Close line: solid, `var(--ion-color-primary)`, 2px

**RSI strip (60px):**
- Colored bar per day: green RGB if RSI < 30 OR > 70, yellow if 65–70 or 30–35, else gray neutral. Height fills full strip.
- Horizontal reference lines at RSI=30 and RSI=70 (dashed, semi-transparent)
- Current RSI value + label "RSI" on right side

**Axis labels:** 4 tick marks on X-axis (today, -30d, -60d, -90d). No Y-axis ticks on main chart (values shown in header badges). RSI strip shows "30" and "70" on right.

**Hover:** tooltip follows cursor, shows `date / close / RSI / BB distanceSigma`.

**Footer:** 1 line: `Computed: {computedAt formatted} ET` — or if `stale`: `⚠ Stale data — last fresh: {computedAt}` in yellow.

**Panel toggle:** button "▼ Technical Analysis (90d)" in header. Click collapses body with CSS transition. State in `localStorage['technicalsPanelExpanded']`. Default: expanded.

## Error handling

| Failure mode | Behavior |
|--------------|----------|
| Polygon fetch fails in scheduler | Retry 3× (1s, 3s, 9s). If all fail: keep existing Firestore doc, set `stale: true`. |
| Scheduler throws | Firebase retries via its own policy; next day's 16:15 run is independent. |
| `marketTechnicals/{ticker}` missing | Front-end shows "—" in badges, chart shows "No data available", no spinner stuck. |
| Callable on-demand fails | Return `{ error: 'unavailable' }`. Front-end shows "TA unavailable" chip (gray). |
| Rate limit exceeded | Return `{ error: 'rate_limit' }`. Front-end: "Try again in 60s". |
| Picker has no technicals | `marketContext.technicals = null`. Prompt adapts: "No technical context for this round." Does not block the pick. |
| Stale data (> 48h old) | Picker treats as null. UI badges are yellow + warning icon. |

## Testing

### Unit — `functions/src/shared/__tests__/technicals.test.ts`
- `computeRSI` validated against known vector (hardcoded closes → expected RSI, cross-checked against TradingView)
- `computeBB` edge cases: all closes equal → stdDev=0 → handles gracefully (returns percentB=0.5, distanceSigma=0)
- `computeATR` edge: identical closes → ATR ≈ 0; gap up 5% → ATR spike
- Verdict boundary tests: 69.99, 70.00, 70.01 → correct labels
- Insufficient data → throws `InsufficientDataError`

### Integration (manual, via Firebase CLI)
- Deploy scheduler, manually trigger via `firebase functions:shell` or `gcloud functions call`
- Verify `marketTechnicals/SPX` and `.../QQQ` written with valid shape
- Verify `bars.length === 90`, numbers in plausible range
- Manually call `getTechnicalsOnDemand('AAPL')` → verify response shape

### E2E (Cypress)
- Open SPX ticker → header shows 3 numeric chips (not `—`) within 1s
- Toggle panel → chart hides; reload → state persisted
- Open AAPL (cold path) → spinner briefly → chips populate

### Picker regression
- Trigger `aiDailySubmit` with SPX: audit log contains `technicals` section in prompt
- Manually clear `marketTechnicals/SPX` → trigger Picker → verify fallback prompt ("No technical context") + valid pick

## Rollout

1. Land compute module + Polygon client (unit tests green) — shippable but unused.
2. Land scheduler. Verify `marketTechnicals/SPX` and `/QQQ` populate over 2 cycles (Mon/Tue after close).
3. Land callable. Manual test with 2-3 tickers.
4. Land front-end service + header badges. Ship behind feature flag if desired; otherwise direct.
5. Land chart panel (collapsible).
6. Land Guvid Guide page (rename + TA section).
7. Land Picker wiring — monitor audit logs for 1 week to verify Claude uses context meaningfully.

## Open questions

None — all decisions captured above.

## Non-goals

- Alerts when RSI crosses threshold (future)
- Per-user threshold customization (future)
- Multi-timeframe (weekly RSI, 4h BB) — only daily
- Sector or market-breadth indicators (future; breadth is valuable but out of scope)

# Skew Dashboard Integration — Plan

Branch: `feature/skew-integration`

## Goal

Integrate features from `github.com/trudaio/skew-dashboard` into TastyScanner as two **stand-alone** left-menu pages:

1. **Skew Analysis** (`/skew-analysis`) — per-ticker IV skew chart, IV rank, max pain, expected move, P/C ratio, fundamentals, suggested trades, strike-by-distance
2. **Skew Scanner** (`/skew-scanner`) — multi-ticker scanner with editable watchlist (default 100, persisted in Firestore)

The original Backtest tab is **dropped**. We reuse TastyScanner's existing TastyTrade OAuth session (no separate refresh token).

## Design summary

- **Tech**: Full port — TS strict + MobX + Ionic 8 + React 19. Service-oriented (`ServiceFactory` pattern). No plain JS, no separate `.css` files outside theme.
- **APIs**: Polygon.io (chains/history/snapshots), TastyTrade (market metrics — via existing client), FMP (fundamentals, optional with fallback)
- **Persistence**: Firestore `users/{uid}/skewWatchlist/main` (single doc with `tickers: string[]`)
- **Rate limit**: 8s/request in Scanner (Polygon free tier) + exponential backoff on 429

## Phased delivery

| Phase | Goal | Push? |
|------|------|-------|
| **F1** | Foundation: branch, env vars, scaffold servicii goale + 2 pagini placeholder + meniu + rute | ✅ branch + Firebase deploy |
| **F2** | Skew Analysis page complet funcțional (toate cele 9 secțiuni, fundamentals cu fallback) | ✅ branch + deploy |
| **F3** | Scanner + watchlist editabil + persistență Firestore | ✅ branch + deploy |
| **F4** | QA final + merge în master + deploy producție | ✅ master |

---

## F1 — Foundation (CURRENT)

### Setup
- [x] Create branch `feature/skew-integration`
- [x] Add `VITE_POLYGON_API_KEY` to `.env.local` (from old `skew-dashboard-v13`)
- [x] Add empty `VITE_FMP_API_KEY=` placeholder (filled later by user)
- [x] Write `tasks/skew-integration-todo.md` (this file)

### Math utilities (port from `App.jsx` ~280-600)
- [ ] Create `src/utils/skew-math.ts`:
  - `bsDelta(S, K, T, r, sigma, type)` — Black-Scholes delta
  - `normalCDF(x)`
  - `calculateRSI(closes, period)`
  - `calculateATR(highs, lows, closes, period)`
  - `calculateIVRank(currentIV, ivs[])`
  - `calculateMaxPain(strikes, putOI, callOI)`
  - `calculateExpectedMove(atmStraddle, S, daysToExp)`
  - `extractPremium(option)` — bid/ask mid with bid>0&&ask>0 guard

### API clients (stubs only in F1, full impl in F2)
- [ ] `src/services/api-clients/polygon.client.ts` — class shell, methods declared, all return `null`/`[]` for now
- [ ] `src/services/api-clients/fmp.client.ts` — same; checks for `VITE_FMP_API_KEY`, returns `null` if missing

### Service stubs
- [ ] `src/services/skew-analysis/` — `skew-analysis.service.interface.ts` + `.service.ts` (MobX observable; observable maps for `snapshotByTicker`, loading, errors; method stubs)
- [ ] `src/services/skew-scanner/` — `skew-scanner.service.interface.ts` + `.service.ts` (observable rows + status + start/stop method stubs)
- [ ] `src/services/skew-watchlist/` — `skew-watchlist.service.interface.ts` + `.service.ts` (observable `tickers: string[]`, Firestore subscribe stub, load/add/remove method stubs; default 100 tickers constant)

### ServiceFactory wiring
- [ ] Add to `service-factory.interface.ts`: `skewAnalysis`, `skewScanner`, `skewWatchlist`
- [ ] Add to `service-factory.ts`: Lazy registrations + getters

### Pages (placeholder content for F1)
- [ ] `src/pages/SkewAnalysisPage.tsx` — Ionic page with header "Skew Analysis" + "Coming soon" banner
- [ ] `src/pages/SkewScannerPage.tsx` — Ionic page with header "Skew Scanner" + "Coming soon" banner

### Routing + menu
- [ ] `src/App.tsx`: add 2 routes `/skew-analysis`, `/skew-scanner`
- [ ] `src/components/Menu.tsx`: add 2 menu entries with icons (`trendingUpOutline`, `scanOutline`)

### Verification
- [ ] `npx tsc --noEmit` passes (zero errors)
- [ ] `npm run dev` — manually click both menu entries, verify pages render

### Ship
- [ ] Commit on `feature/skew-integration`
- [ ] Push to origin
- [ ] `npm run build` + `firebase deploy --only hosting:preview` (or production if no preview channel) and share URL

---

## F2 — Skew Analysis page (FUTURE)

Sections to implement:
1. Date range picker (today → today+90 days, max 6 months)
2. Skew chart — Recharts line chart, IV across strikes for 4 deltas (10/20/30/40), color-coded
3. IV metrics card — IV rank, IV percentile, 5-day change (from TastyTrade)
4. Max pain card
5. Expected move card (from ATM straddle)
6. P/C ratio card (total open interest)
7. Fundamentals table (FMP-backed, fallback when key missing)
8. Suggested trades section
9. Strike by distance table (1%, 5%, 10% OTM)

CSP update needed: add `https://api.polygon.io https://financialmodelingprep.com` to `connect-src` in `firebase.json`.

## F3 — Scanner + Watchlist (FUTURE)

- Scanner controls (Start/Stop, delay, progress N/M)
- Sortable rows table (ticker, IV rank, skew %, last update, status)
- Watchlist edit modal — add/remove/reorder
- Firestore persistence
- Default 100-ticker list constant
- Rate-limit handling (8s default delay, exponential backoff on 429)

## F4 — QA + ship to master

- Full regression in dev mode
- `npx tsc --noEmit` clean
- `npm run build` clean
- Merge to master
- Deploy production

---

## Phase 2 — Inline ticker enrichment (DEFERRED)

User will specify what skew data to surface inline when searching a ticker (in TastyScanner's existing search/ticker flow). Scope TBD.

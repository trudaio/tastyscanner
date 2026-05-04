# Skew Dashboard Integration — Status & TODO

**Branch:** `feature/skew-integration`
**Production URL:** https://operatiunea-guvidul.web.app/skew-analysis
**Started:** 2026-05-04

---

## ✅ Done

### F1 — Foundation (commit `be7e5f3`)
- [x] Branch `feature/skew-integration`
- [x] `VITE_POLYGON_API_KEY` în `.env.local` (gitignored)
- [x] `VITE_FMP_API_KEY` placeholder (fallback mode activ)
- [x] Schelă servicii: `SkewAnalysisService`, `SkewScannerService`, `SkewWatchlistService`
- [x] API clients: `PolygonClient`, `FmpClient`
- [x] Pagini placeholder + 2 intrări meniu + rute (`/skew-analysis`, `/skew-scanner`)
- [x] Type check + build clean

### F2 — Skew Analysis page complete (commits `fc7d9a7` → `34b8b73`)
- [x] `src/utils/skew-math.ts` — toate funcțiile pure (BS delta, RSI, ATR, IV rank, max pain, expected move, P/C ratio, HV, 52W range, isMonthlyExpiration, daysToExpiration)
- [x] Polygon client full implementation (chains snapshot cu cursor pagination, history, prev close, 429 detection)
- [x] FMP client cu graceful fallback când lipsește cheia
- [x] Reuse TastyTrade `getSymbolMetrics` din `MarketDataProvider` existent
- [x] CSP actualizat: `api.polygon.io` + `financialmodelingprep.com` adăugate în `firebase.json`
- [x] **Bug fix**: TastyTrade `beta` și IV fields vin ca string-uri — coerce defensiv prin `toNumOrNull`
- [x] **Hot fix**: `IonInput type="date"` cauza crash — înlocuit cu plain `<input>` styled
- [x] **Hot fix**: MobX `observable` default cu deep proxy crăpa pe Recharts → switched la `observable.shallow` / `observable.ref`
- [x] AppErrorBoundary global ca să prevină vreodată blank-screen pe crash-uri viitoare
- [x] Production source maps active pentru debugging

### F2.5 — V13 design parity (commit `e6944d6`)
- [x] **Stats Row** — 7 carduri: Stock Price • Avg Skew • Term Struct (cu pill + explicație) • Max Pain • Exp Move • P/C Gauge SVG • Total Contracts (60d) Puts/Calls
- [x] **Premium Skew chart** — 4 linii skew % (10/20/30/40Δ) + bare put/call volume + 4 toggle-uri (Monthly/Weekly/Put Vol/Call Vol) + zero-line + caption
- [x] **IV Skew chart** — păstrat (8 linii put/call IV)
- [x] **Skew Bell Curve** — scatter Delta(-0.5..0.5) vs Premium($), red puts / green calls, ATM line, dropdown selector expirare
- [x] **Volatility Smile** — scatter Strike vs IV%, ATM line, dropdown
- [x] **Delta Table** — 11 coloane (Exp/Δ/Put/Call/Skew$/Skew%/Imbal), Monthly Analysis card + Formula bar
- [x] Theme dark v13 (#0a0a0f, #12121a, #2a2a3a) scoped doar pe pagina asta
- [x] Title cu gradient albastru→violet
- [x] 10 ETF shortcut buttons (SPY/QQQ/IWM/GLD/SLV/DIA/VTI/VOO/EEM/XLF)
- [x] Plain styled inputs (text + date) cu color-scheme dark

### F2.6 — Polish (commit `e2b2e7c`)
- [x] **Bell Curve Y-range fix** — filtrez Y range doar la punctele din intervalul vizibil X + cap la percentila 95
- [x] **Strike by Distance redesign** — per-expiration (3 rânduri ±1%/±5%/±10%) cu coloanele Put Delta(Strike) | Call Delta(Strike) | Δ Diff | Δ Diff %
- [x] Interpretări scurte (≤300 cuvinte) deasupra fiecărui chart/tabel: IV chart, Bell Curve, Vol Smile, Strike by Distance

### F2.7 — Tooltips + OI (commit `498facd`)
- [x] **Hover tooltip pe Premium Skew chart** — linie verticală + dot-uri pe linii + tooltip cu skew % la fiecare delta + Put Vol / Call Vol totale + P/C ratio per expiration
- [x] **Coloane Put Vol + Call Vol în Strike by Distance**
- [x] **Open Interest By Strikes** chart nou — bare paired per strike, toggle Aggregate / per Expiration, SPOT marker, hover tooltip, interpretare auto-generată

### F2.8 — Gamma Exposure (commit `f70d266`)
- [x] **Gamma Exposure (GEX) chart** — bare paired (call GEX verde, put GEX roșu sign-flipped), linie albă cumulative, SPOT marker
- [x] Toggle: Aggregate / Exp Filter / DTE Filter (All / <30 / 30-60 / 60-90 / >90)
- [x] Toggle: GEX (activ) / Spot GEX (activ) / Vanna (disabled, BSM pending) / VannaGEX (disabled)
- [x] Hover tooltip cu Call GEX / Put GEX / Net / Cumulative
- [x] Interpretare auto-generată: net GEX, zero-gamma flip strike, regime framing
- [x] Formula: γ × OI × 100 × spot² × 1%, în milioane $

---

## 🚧 În așteptare / Următoarele faze

### F3 — Skew Scanner cu watchlist editabil (NU pornit)
Pagina `/skew-scanner` e încă placeholder. Are nevoie de:
- [ ] Watchlist editabil persistat în Firestore (`users/{uid}/skewWatchlist/main`)
- [ ] Modal add/remove/reorder tickere (default 100 deja seedat în memorie)
- [ ] Scanner care iterează lista cu delay 8s (Polygon free tier rate limit)
- [ ] Tabel sortabil cu rândurile (ticker, IV rank, skew %, last update, status, retry pe 429)
- [ ] Buton Start/Stop, indicator progres N/M
- [ ] 25Δ skew per ticker (monthly expirations only)

### Vanna + VannaGEX (necesită BSM math)
- [ ] Implementare formulă Vanna în `skew-math.ts`: `Vanna = -e^(-rT) × φ(d1) × d2 / σ`
- [ ] Helper-uri BSM (`d1`, `d2`, `normalPDF`)
- [ ] Activare butoanelor Vanna și VannaGEX în GEX chart
- [ ] Switching între moduri în chart (recompute buckets cu vanna în loc de gamma)

### FMP integration
- [ ] User obține cheie FMP gratis de la `financialmodelingprep.com/developer/docs/free`
- [ ] Adaugă `VITE_FMP_API_KEY=...` în `.env.local`
- [ ] FMP client deja implementat — automat detectează cheia și completează tabelul Fundamentals (P/E, EPS, market cap, dividend, beta, ratios)

### Phase 2 — Inline ticker enrichment (DEFERRED, urmează după F3)
User a menționat în brainstorming-ul inițial că vrea ca atunci când caută un ticker în TastyScanner-ul existent (search bar etc.), să apară inline câteva info de skew (skew %, IV rank, max pain). Scope TBD — așteaptă să-mi spună exact ce date vrea expuse și unde.

### Igienizare după ce e gata
- [ ] **Cheia Polygon din `~/Downloads/skew-dashboard-v13/src/App.jsx` e expusă în Downloads.** Recomand să generezi o nouă cheie pe `polygon.io/dashboard` și să o înlocuiești în `.env.local`. Vechile fișiere v8/v13 din Downloads pot fi șterse.
- [ ] Pre-existing TastyScanner toFixed bug în account-info.component (Greeks rendering) — defensiv prin AppErrorBoundary, dar ideal de fixat la sursă cu coerce la number.

---

## 🚀 Production deploy

**Production URL:** https://operatiunea-guvidul.web.app/skew-analysis

Branch `feature/skew-integration` mergeat în `master` și deployat în producție via `firebase deploy --only hosting`.

Următorul deploy de producție: după F3 (Scanner) sau după update Vanna/VannaGEX, când vor exista funcționalități noi notabile.

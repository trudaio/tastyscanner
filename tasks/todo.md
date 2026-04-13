# TastyScanner — Suggestions & TODO

## Performance & Build
- [ ] **Code-splitting**: Bundle-ul principal e 2.3MB (608KB gzip). Implementare lazy loading cu `React.lazy()` + `Suspense` pe paginile mari (Backtest, Guvid History, Dashboard) pentru a reduce initial load time

## Guvid History
- [ ] **Rolling metrics**: Adauga metrici pe 30/60/90 zile in plus fata de YTD (pentru a vedea trenduri recente)
- [ ] **Drawdown tracking**: Calculeaza si afiseaza max drawdown si current drawdown in stat cards
- [ ] **Sharpe Ratio / Sortino Ratio**: Metrici de risk-adjusted return bazate pe daily P&L
- [ ] **Expected value per trade**: EV = (winRate * avgWin) - (lossRate * avgLoss) in sectiunea Guvid History ca metric de performanta (distinct de EV-ul calculat per strategie in builder)
- [ ] **Trade History paginatie UI**: Afiseaza N trades per pagina cu controale prev/next in tabelul Trade History din Guvid History (backend-ul incarca 250/pagina, dar UI-ul nu are paginatie vizuala)

## Iron Condor Builder
- [ ] **Watchlist alerts**: Notificari cand un ticker din watchlist atinge IV Rank target (>30 sau >50) — momentan exista doar afisare color-coded, nu notificari
- [ ] **Quick-roll functionality**: Buton de roll direct din pozitiile deschise (selecteaza automat urmatoarea expirare)

## UI/UX
- [ ] **Dark/Light theme toggle**: Momentan e doar dark system — adauga toggle manual
- [ ] **Mobile swipe navigation**: Swipe intre pagini pe iPhone (Ionic are suport partial, dar fara gesture handlers)
- [ ] **Keyboard shortcuts**: Rapid navigation (e.g., 1=Dashboard, 2=IC Builder, 3=Guvid History)
- [ ] **Toast notifications**: Feedback vizual cand un order e trimis, etc.

## New Features
- [ ] **Copy Trader**: Replică automat trades-urile unui trader (intern sau extern) — selectezi un cont/portofoliu sursă, definești ratio de sizing, și ordinele se trimit automat în contul tău
- [ ] **Risk Exposer**: Vizualizare dedicata max win vs max loss pentru pozitiile curente — breakeven points, grafic P&L curve pe strike range (maxProfit/maxLoss exista in modele, dar nu sunt vizualizate ca feature separat)
- [ ] **Dashboard Suggestion**: Setare personalizată bazată pe alegerile istorice ale userului — analizează ce DTE, delta, spread width, tickere alege userul cel mai des și sugerează automat parametrii optimi la deschiderea unui nou IC

## Trade Journal
- [ ] **Trade lifecycle tracking**: Salvează automat momentul deschiderii și închiderii fiecărei poziții IC — timestamp, preț entry/exit, credit primit, debit la close, P&L realizat. Stochează în Firestore (`users/{uid}/tradeJournal/{tradeId}`)
- [ ] **Trade study/review**: Pagină dedicată unde poți analiza fiecare trade individual — grafic P&L evolution pe durata trade-ului, Greeks la entry vs la exit, ce a mers bine/rău, notes personale
- [ ] **Trade tagging**: Adaugă tag-uri pe trade-uri (e.g., "high IV", "rescue", "ladder", "FOMC week", "expiry day") pentru filtrare și analiză ulterioară. Focus pe SPX/QQQ — fără earnings, doar open/close lifecycle și context macro (VIX level, event calendar)

## Onboarding / Docs
- [x] **TastyTrade refresh token how-to**: Implementat in OnboardingPage cu 5 pasi detaliati + helper inline in AddBrokerModal
- [x] **Video tutorials pe prima pagina**: Playlist embed complet pe LandingPage si OnboardingPage

## Infrastructure
- [ ] **Error boundary component**: Wrap paginile intr-un error boundary ca sa nu cada toata app-ul cand o pagina are eroare
- [ ] **Offline support**: Service worker cu cache strategy pentru a functiona offline
- [ ] **Analytics**: Firebase Analytics — infrastructure exista (firebase.ts), de adaugat event tracking in componente (logEvent)

## Bugs & Architectural Issues (discovered 2026-04-13 during Guvid Visualization build)

### Analytics Service
- [ ] **Stale "open" status in order history path**: `fetchYTDTrades()` marks trades as `status: 'open'` when order history can't find matching closing orders, even if the position is actually closed. Fix: cross-reference with `marketDataProvider.getPositions()` before marking as open, or add a post-process step to reconcile with live positions.
- [ ] **fetchOpenICsFromPositions() silent failures**: Returns `[]` without throwing when:
  - `brokerAccount.currentAccount` is null (async loading not finished)
  - IC pattern matching fails for partial rolls or asymmetric spreads
  - No debug logging to identify WHICH condition failed
  - Fix: surface errors, add structured logging per group

### Data Format Inconsistency (HIGH — bit us 3x today)
- [ ] **openCredit/currentPrice unit mismatch**: 
  - `fetchOpenICsFromPositions()` stores values as TOTAL dollars (multiplier × qty × per-share baked in)
  - `fetchYTDTrades()` stores per-share values
  - Same field, two meanings. Fix: normalize to a single unit (total dollars) at the service boundary, OR add explicit fields `openCreditPerShare` vs `openCreditTotal`
- [ ] **currentPrice=0 ambiguity**: Could mean "no data available" OR "worthless to close" — indistinguishable. Fix: use `null` for missing, `0` for worthless.

### Visualization Page
- [ ] **SPX current price streaming unreliable**: Tried `$SPX.X`, `SPX`, `$SPX` fallbacks. Works for QQQ/IWM/SPY but intermittent for SPX. Investigate correct streamer symbol format for indices.
- [ ] **ResizeObserver timing with async-loaded refs**: When chart ref div is conditionally rendered after data loads, ResizeObserver doesn't fire reliably. Currently mitigated with fixed viewBox — but if we want responsive per-viewport sizing, need a robust pattern.
- [ ] **Performance with 60+ ICs per ticker**: Each row is a separate SVG — virtualization needed for large portfolios.

### Account Loading UX
- [ ] **Component flash on page load**: When `currentAccount` transitions from null → object, components briefly show "empty state" before re-rendering with data. Fix: distinguish "loading" from "empty" consistently across all pages.
- [ ] **No retry on account load failure**: If auth is delayed/fails, pages silently show empty. Add retry button or toast.

### Position Detection Edge Cases
- [ ] **Asymmetric ICs (different put/call wing widths)** may not be detected by `fetchOpenICsFromPositions()` — requires review of IC matching logic at lines 694-737.
- [ ] **Multi-contract ICs with mismatched quantities** (e.g., 2 puts + 3 calls after partial close) — currently uses `Math.min(qty)` which loses info.

---
*Last updated: 2026-04-13*

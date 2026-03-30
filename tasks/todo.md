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

## Onboarding / Docs
- [x] **TastyTrade refresh token how-to**: Implementat in OnboardingPage cu 5 pasi detaliati + helper inline in AddBrokerModal
- [x] **Video tutorials pe prima pagina**: Playlist embed complet pe LandingPage si OnboardingPage

## Infrastructure
- [ ] **Error boundary component**: Wrap paginile intr-un error boundary ca sa nu cada toata app-ul cand o pagina are eroare
- [ ] **Offline support**: Service worker cu cache strategy pentru a functiona offline
- [ ] **Analytics**: Firebase Analytics — infrastructure exista (firebase.ts), de adaugat event tracking in componente (logEvent)

---
*Last updated: 2026-03-30*

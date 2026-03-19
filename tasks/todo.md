# TastyScanner — Suggestions & TODO

## Performance & Build
- [ ] **Code-splitting**: Bundle-ul principal e 2.3MB (608KB gzip). Implementare lazy loading cu `React.lazy()` + `Suspense` pe paginile mari (Backtest, Guvid History, Dashboard) pentru a reduce initial load time
- [ ] **Recharts tree-shaking**: Importa doar componentele necesare din Recharts (AreaChart, XAxis, etc.) in loc de tot pachetul

## Backtest Engine
- [ ] **Polygon API caching**: Cache-uieste datele historice Polygon in Firestore sau IndexedDB ca sa nu faci request-uri duplicate pentru aceleasi tickere/perioade
- [ ] **Backtest progress granularity**: Arata progresul per ticker (e.g., "SPY 3/5 tickers...") nu doar procentaj global
- [ ] **Backtest comparison**: Permite compararea side-by-side a 2-3 backtest-uri salvate (equity curves suprapuse, metrici in paralel)
- [ ] **Export backtest results**: Export CSV/PDF cu rezultatele backtest-ului (trade history, equity curve data)

## Guvid History
- [ ] **Rolling metrics**: Adauga metrici pe 30/60/90 zile in plus fata de YTD (pentru a vedea trenduri recente)
- [ ] **Drawdown tracking**: Calculeaza si afiseaza max drawdown si current drawdown in stat cards
- [ ] **Sharpe Ratio / Sortino Ratio**: Metrici de risk-adjusted return bazate pe daily P&L
- [ ] **Expected value per trade**: EV = (winRate * avgWin) - (lossRate * avgLoss) — metric important pentru edge

## Iron Condor Builder
- [ ] **Watchlist alerts**: Notificari cand un ticker din watchlist atinge IV Rank target (>30 sau >50)
- [ ] **Quick-roll functionality**: Buton de roll direct din pozitiile deschise (selecteaza automat urmatoarea expirare)
- [ ] **Position P&L real-time**: Afiseaza P&L curent (unrealized) pe fiecare pozitie deschisa in dashboard

## UI/UX
- [ ] **Dark/Light theme toggle**: Momentan e doar dark — unii traderi prefera light mode
- [ ] **Mobile swipe navigation**: Swipe intre pagini pe iPhone
- [ ] **Keyboard shortcuts**: Rapid navigation (e.g., 1=Dashboard, 2=IC Builder, 3=Guvid History)
- [ ] **Toast notifications**: Feedback vizual cand un order e trimis, backtest salvat, etc.

## Infrastructure
- [ ] **Error boundary component**: Wrap paginile intr-un error boundary ca sa nu cada toata app-ul cand o pagina are eroare
- [ ] **Offline support**: Service worker cu cache strategy pentru a functiona offline (cel putin dashboard-ul)
- [ ] **Analytics**: Firebase Analytics events pentru tracking usage patterns (ce tickere sunt cele mai cautate, cat dureaza un backtest, etc.)

---
*Last updated: 2026-03-17*

# TastyScanner — TODO

## Priority 1 — In Progress / Next Up

### IBKR Integration
- [ ] Research IBKR Client Portal API / TWS API for web-based access
- [ ] Implement `IbkrMarketDataProvider` (stub exists at `src/services/market-data-provider/ibkr-market-data-provider.ts`)
- [ ] Add IBKR credential flow in My Account page
- [ ] Test dual-broker switching (TastyTrade ↔ IBKR)
- [ ] Handle IBKR's different symbol format and data structures

### Delta Alert Improvements
- [ ] Save initial delta automatically when trades are executed through the app
- [ ] Add notification system (push / email / Discord) when alerts trigger
- [ ] Historical delta tracking — chart showing delta evolution over time per position
- [ ] Add "roll" suggestion when delta exceeds threshold

### DTE Analyzer Enhancements
- [ ] Add MAX DTE input field to limit the range displayed
- [ ] Add CALL side analysis (currently PUT-focused)
- [ ] Add interpretation documentation panel in-page
- [ ] Compare multiple tickers side-by-side

## Priority 2 — Features

### Trading Improvements
- [ ] Auto-close at 75% profit (monitor + execute)
- [ ] Roll management — suggest and execute rolls at 21 DTE
- [ ] Position sizing calculator based on Kelly criterion
- [ ] Earnings calendar integration — avoid selling before earnings
- [ ] Multi-leg order templates (save favorite IC configurations)

### Dashboard Enhancements
- [ ] Real-time P&L streaming (not just on refresh)
- [ ] Portfolio heat map by sector/ticker
- [ ] Greeks chart over time (delta, theta, gamma trends)
- [ ] Comparison view: this month vs last month vs YTD

### Scanner Bot (Paused)
- [ ] Resume TradeProposalService development
- [ ] Automated IC scanning on schedule
- [ ] Approve/reject queue with push notifications
- [ ] Backtested filters for auto-approval rules

## Priority 3 — Technical Debt

### Security (Remaining)
- [ ] M2: Fix 24 npm dependency vulnerabilities (`npm audit fix` + Vite upgrade)
- [ ] M3: Move analytics data from localStorage to Firestore
- [ ] Rewrite git history to purge old `.env-andrei.local` secrets (BFG Repo Cleaner)
- [ ] Add audit logging for superadmin credential access
- [ ] Rate limiting on Firebase Functions endpoints

### Code Quality
- [ ] Code-split large bundle (2.3MB) — lazy load pages with React.lazy()
- [ ] Add unit tests for critical services (IronCondorModel, DeltaAlertService)
- [ ] Upgrade Vite to v6+ (fixes rollup/esbuild vulnerabilities)
- [ ] Upgrade Firebase Functions runtime from Node.js 20 (deprecated April 2026)
- [ ] Clean up unused IBKR Functions (ibkrKeepAlive, ibkrProxy) from Firebase

### UX / Design
- [ ] Dark mode support (TradingView widgets already support it)
- [ ] Mobile-optimized Delta Alert cards
- [ ] Loading skeletons instead of spinners
- [ ] Error boundary components for graceful failures
- [ ] Onboarding flow improvements for new users

## Completed (Recent)

- [x] Delta Alert refactored to use live API positions (not just trade log)
- [x] DTE Analyzer page — $/Day, θ/γ ratio, Strike Decay
- [x] Charts redesigned — white background, brand colors
- [x] Firebase migrated to `operatiunea-guvidul` project
- [x] Firestore rules — subcollection access fix
- [x] "Am uitat parola" on login page
- [x] Removed Backtest feature (moved to guvid-backtest project)
- [x] Removed Istoric Tranzactii (duplicated by Guvid History)
- [x] Security audit — 11 issues fixed (C1-C3, H1-H5, M1/M4/M5, L1)
- [x] Hardcoded superadmin UID → Firebase custom claims
- [x] CORS restricted, CSP added, security headers deployed
- [x] Plaintext credential storage removed
- [x] TradingView XSS vector fixed

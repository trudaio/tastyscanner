# Operatiunea Guvidul — TastyScanner

Iron Condor options trading platform connected to TastyTrade API + DxLink WebSocket. Live streaming of Greeks/quotes, IC combo filtering by delta/DTE/wings/EV/Alpha/POP, expiration accordions, order execution.

**Live:** https://operatiunea-guvidul.web.app

## Goal

Systematic premium selling targeting **$1,000/day** with defined risk iron condor strategies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Ionic 8 + TypeScript (strict) |
| State | MobX 6 (observables, autorun, runInAction) |
| Build | Vite |
| Broker API | `@tastytrade/api` v6.0.1 (REST + DxLink WebSocket) |
| Charts | Recharts |
| Backend | Firebase Functions (Node.js) + Express |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Hosting | Firebase Hosting |
| Testing | Cypress (E2E) |

## Features

### IC Builder (Iron Condor)
- Scan the entire options chain for iron condor opportunities
- Filter by delta, DTE, spread width, EV, Alpha, POP
- Symmetric / Bullish / Bearish IC types
- Single or Fill-All laddering modes
- Real-time Greeks streaming via DxLink WebSocket
- Conflict detection with existing positions
- One-click order execution to TastyTrade

### Dashboard
- P&L summary (realized + unrealized)
- Net liquidity chart (reconstructed from transaction history)
- Open IC trades table with live Greeks
- Profit-by-ticker breakdown

### Delta Alert
- Monitors ALL short option positions from your TastyTrade account
- Alerts when current delta reaches threshold vs initial delta (ratio-based)
- Absolute delta threshold (40+) for positions without trade log entry
- Shows DTE, underlying price, strike distance %
- Background monitoring every 4 hours

### DTE Analyzer
- Compare same-delta option across all available expirations (3-90 DTE)
- $/Day = premium / DTE (premium efficiency)
- Theta/Gamma ratio (risk-adjusted decay)
- Strike Decay: click any row to see how a fixed strike evolves across DTEs
- Interactive charts + interpretation guide

### Guvid Management
- IC Savior: find rescue positions for underwater trades
- Position sizing: max 5% of net liquidity per trade
- Kelly criterion (fractional) position sizing guidance

### Guvid History
- YTD performance tracking
- Win/loss analysis
- P&L by ticker and month

### Multi-Broker Foundation
- TastyTrade fully integrated
- IBKR stub prepared for future integration
- Broker-agnostic credential storage (Firestore subcollections)

## Architecture

### Service Layer (ServiceFactory pattern with lazy initialization)

| Service | Purpose |
|---------|---------|
| MarketDataProvider | WebSocket streaming, options chains, Greeks, quotes, orders |
| BrokerAccount | Account management, balances, portfolio Greeks aggregation |
| IronCondorAnalytics | YTD performance, win/loss, P&L by ticker/month |
| IronCondorSavior | Rescue position finder for underwater trades |
| TradingDashboard | P&L aggregation, net liquidity history |
| Positions | Current holdings with conflict detection |
| DeltaAlert | Live position monitoring with delta ratio alerts |
| TradeLog | Trade execution logging with Discord webhook |
| WatchlistData | Real-time watchlist with auto-refresh |
| Settings | Strategy filter preferences |
| Tickers | Symbol search and recent tracking |
| Credentials | Encrypted broker credential storage |

### Models
- **IronCondorModel** — 4-leg strategy with credit, risk/reward, POP, delta, theta
- **CreditSpreadModel** — 2-leg spread building blocks
- **OptionModel / OptionStrikeModel / OptionsExpirationModel** — Options chain hierarchy
- **TickerModel** — Underlying with IV Rank, beta, earnings date

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Type check
npx tsc --noEmit

# E2E tests
npx cypress open

# Deploy
firebase deploy
```

## Environment Variables

Create `.env.local` in the project root:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=operatiunea-guvidul.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=operatiunea-guvidul
VITE_FIREBASE_STORAGE_BUCKET=operatiunea-guvidul.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FUNCTIONS_BASE_URL=https://us-central1-operatiunea-guvidul.cloudfunctions.net
```

## Critical Knowledge

### Symbol Format Mismatch
TastyTrade API: `QQQ   260227C00665000` — DxLink streamer: `.QQQ260227C665`

**Always use `pos['streamer-symbol']`** for WebSocket subscriptions. TastyTrade format silently fails.

### quantityDirection
Returns strings `"Long"` or `"Short"`, NOT numbers. Use string comparison.

### Portfolio Greeks
Uses MobX `autorun` to reactively aggregate from streamer data. Must call `waitForConnection()` before subscribing.

## Trading Rules (enforced in code)

- **Position sizing**: Max 5% of net liquidity per trade
- **Profit target**: Close at 75% of max profit
- **DTE management**: Close or roll at 21 DTE
- **IV preference**: IV Rank > 30 preferred, > 50 ideal
- **Portfolio balance**: Target delta-neutral, positive theta

## Security

- AES-256-GCM encrypted credential storage (Firebase Functions)
- Firebase custom claims for RBAC (superadmin role)
- CORS restricted to production domain + localhost
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers
- API fails closed when API_KEY unset in production
- No plaintext secrets in Firestore or client bundle

# Operatiunea Guvidul — Iron Condor Builder

A systematic options premium-selling tool built for TastyTrade, focused on Iron Condor strategies with real-time Greeks streaming, EV/Alpha filtering, and trade logging.

**Goal**: Identify and execute high-probability Iron Condors targeting $1,000/day in premium collected with defined risk.

---

## Features

- **Iron Condor Builder** — Scans expirations and builds IC combos filtered by delta, DTE, wing width, bid/ask spread, POP, Expected Value, and Alpha
- **IC Type (Bias)** — Symmetric (delta-neutral), Bullish (net Δ ≥ +5), or Bearish (net Δ ≤ −5)
- **No-Edge Signal** — Red banner when filters are active but no ICs pass them
- **Real-time Streaming** — Live quotes + Greeks via DxLink WebSocket
- **Dashboard** — P&L summary, net liquidity chart, open IC trades table, profit by ticker
- **Portfolio Greeks** — Account-level Δ, Θ, Γ, V aggregated in real time
- **Position Conflict Detection** — Warns when a new trade conflicts with existing positions
- **Iron Condor Savior** — Finds rescue spreads to offset underwater trades
- **Trade Log** — Logs every placed trade to Discord webhook + local storage
- **Multi-user Auth** — Firebase email/password auth with per-user encrypted credentials (AES-256 via Firebase Functions)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Ionic 8 + TypeScript (strict) |
| State | MobX 6 (observables, autorun, computed) |
| Build | Vite |
| Broker API | `@tastytrade/api` v6.0.1 (REST + DxLink WebSocket) |
| Auth / Backend | Firebase Auth + Firebase Functions (Node 20) |
| Hosting | Firebase Hosting |
| Testing | Cypress E2E |

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- A [TastyTrade](https://tastytrade.com) account (live or sandbox)
- Firebase project (for auth + credential storage) — *optional for local dev*

### 2. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 3. TastyTrade API credentials

You need two tokens from TastyTrade:

| Token | Where to find |
|-------|-------------|
| **Client Secret** | TastyTrade → Settings → API Tokens → *Client Secret* (40 hex chars) |
| **Refresh Token** | TastyTrade → Settings → API Tokens → *Remember Token* (long JWT) |

### 4. Local dev setup

Create `.env.local` in the project root (this file is git-ignored):

```bash
# TastyTrade credentials — local dev fallback (used when Firebase Functions are unreachable)
VITE_CLIENT_SECRET=your_40_char_hex_client_secret
VITE_REFRESH_TOKEN=eyJhbGci...your_long_refresh_token_jwt
```

> **Note**: In production, credentials are stored encrypted on the server via Firebase Functions. Locally, the app falls back to these env vars automatically when Functions are not reachable (CORS).

### 5. Run the dev server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 6. First login

1. Click **Register** to create an account (Firebase Auth)
2. After login, go to the **Account** page (profile icon in the menu)
3. Enter your TastyTrade **Client Secret** and **Refresh Token**
4. Click **Save & Reconnect** — the app will authenticate with TastyTrade and start streaming

---

## Usage Guide

### Iron Condor Builder

1. **Search for a ticker** using the search bar (e.g. SPY, QQQ, AAPL)
2. The app loads the options chain and computes ICs across all expirations
3. **Filters** (tap the filter icon):
   - **Delta range**: short strike delta (default 15–30)
   - **DTE range**: days to expiration window
   - **Wing width**: spread width in points (e.g. 5, 10, 15)
   - **Bid/Ask spread**: max acceptable spread per leg
   - **POP %**: minimum probability of profit
   - **EV $**: minimum expected value per contract
   - **Alpha %**: minimum alpha (edge above random)
   - **IC Type**: Symmetric / Bullish / Bearish
   - **Earnings**: filter before/after earnings date
4. **Expiration accordion** — tap an expiration to expand and see all valid ICs
5. Each IC card shows: strikes, credit, POP, EV, Alpha, delta, theta, risk/reward
6. Highlighted cards: **yellow** = best POP, **blue** = best risk/reward, **gradient** = both
7. Delta bias color: **green** = bullish bias, **red** = bearish bias, **transparent** = neutral
8. Tap **Trade** to open the order dialog and send the order to TastyTrade

### IC Type Bias

| Type | Logic |
|------|-------|
| Symmetric | Short put Δ ≈ short call Δ (matched by index) |
| Bullish | Short put Δ − short call Δ ≥ 5 (net positive delta, more room downside) |
| Bearish | Short call Δ − short put Δ ≥ 5 (net negative delta, more room upside) |

### Dashboard

- **P&L Today / YTD** — aggregated from transaction history
- **Net Liquidity Chart** — reconstructed from transaction P&L history
- **Open Trades** — current IC positions with unrealized P&L
- **Profit by Ticker** — breakdown of closed P&L per symbol

### Portfolio Greeks

Shown in the sidebar/menu: account-level Δ, Θ, Γ, V aggregated in real time from all open positions via DxLink WebSocket.

### Iron Condor Savior

Find rescue spreads when an existing IC is underwater. The Savior suggests offsetting spreads to reduce net delta and theta damage.

---

## Trading Rules (enforced in the app)

| Rule | Value |
|------|-------|
| Position sizing | Max 5% of net liquidity per trade |
| Profit target | Close at 75% of max profit |
| DTE management | Close or roll at 21 DTE |
| IV preference | IV Rank > 30 preferred, > 50 ideal |
| Portfolio target | Delta-neutral, positive theta |

---

## Deployment

### Firebase Hosting (frontend)

```bash
npm run build
firebase deploy --only hosting
```

### Firebase Functions (credential storage backend)

```bash
cd functions
npm run build
firebase deploy --only functions
```

> **Important**: Functions must be deployed for credential storage to work in production. Without deployed Functions, the app falls back to env vars (local dev only).

---

## Commands

```bash
npm run dev          # Start Vite dev server on :5173
npm run build        # Production build → dist/
npx tsc --noEmit     # TypeScript type check (zero errors required)
npx cypress open     # Open Cypress E2E test runner
firebase deploy      # Deploy hosting + functions
```

---

## Architecture Notes

### Credential flow
```
Login → Firebase Auth → onAuthStateChanged → loadCredentials() from Functions
  → success: initialize(clientSecret, refreshToken)
  → CORS/fail: fallback to VITE_CLIENT_SECRET + VITE_REFRESH_TOKEN env vars
```

### Symbol formats
- TastyTrade REST API: `QQQ   260227C00665000`
- DxLink WebSocket: `.QQQ260227C665`

Always use `streamer-symbol` from positions for WebSocket subscriptions. Using TastyTrade format with the streamer silently fails (no errors, just empty data).

### Service initialization (race condition fix)
`BrokerAccountService` is created via Lazy initialization before credentials are ready. The `ServiceFactory.initialize()` method explicitly calls `brokerAccount.reload()` and `marketDataProvider.start()` after credentials are set, ensuring accounts load and WebSocket connects on every credential update.

---

## Contributing

- Never commit directly to `master` — use feature branches
- Run `npx tsc --noEmit` before every PR — zero TypeScript errors required
- Follow existing patterns: MobX observables for state, `.interface.ts` for interfaces, `.model.ts` for domain models
- All monetary values: 2 decimal places. Greeks: Δ/Θ/V = 2 decimals, Γ = 4 decimals

---

## License

Private — for personal use only.

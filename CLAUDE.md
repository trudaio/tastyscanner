# TastyScanner — IRONCONDOR Builder

## Project Overview

TastyScanner is an options trading tool focused on iron condor strategies, connected to TastyTrade's API and DxLink WebSocket streamer. The goal is systematic premium selling targeting $1,000/day with defined risk.

## Tech Stack

- **Frontend**: React 19 + Ionic 8 + TypeScript (strict mode)
- **State Management**: MobX 6 (observables, autorun, runInAction)
- **Build**: Vite
- **Broker API**: `@tastytrade/api` v6.0.1 (REST + DxLink WebSocket)
- **Deployment**: Firebase Hosting
- **Testing**: Cypress (E2E)

## Architecture

### Service Layer (12 services)

All services use a **ServiceFactory** pattern with lazy initialization. The factory is in `src/services/service-factory.ts`.

| Service | Path | Purpose |
|---------|------|---------|
| MarketDataProvider | `src/services/market-data-provider/` | WebSocket streaming, options chains, greeks, quotes, orders, positions |
| BrokerAccount | `src/services/broker-account/` | Account management, balances, portfolio greeks aggregation (delta, theta, gamma, vega) |
| IronCondorAnalytics | `src/services/iron-condor-analytics/` | YTD performance tracking, win/loss analysis, P&L by ticker/month |
| IronCondorSavior | `src/services/iron-condor-savior/` | Rescue position finder for underwater trades |
| TradingDashboard | `src/services/trading-dashboard/` | P&L aggregation, net liquidity history, ticker-level breakdown |
| Positions | `src/services/positions/` | Current holdings with conflict detection |
| WatchlistData | `src/services/watchlist-data/` | Real-time watchlist with auto-refresh |
| Settings | `src/services/settings/` | Strategy filter preferences (delta, DTE, spread width) |
| Tickers | `src/services/tickers/` | Symbol search and recent ticker tracking |
| Storage | `src/services/storage/` | Local persistence layer |
| Logger | `src/services/logger/` | Application diagnostics |
| Language | `src/services/language/` | i18n support |

### Models (`src/models/`)

- **IronCondorModel** — 4-leg strategy: long put + short put + short call + long call. Calculates credit, risk/reward, POP, delta, theta. Includes conflict detection and order sending.
- **CreditSpreadModel** / PutCreditSpreadModel / CallCreditSpreadModel — 2-leg spread building blocks.
- **OptionModel** / OptionStrikeModel / OptionsExpirationModel — Options chain hierarchy.
- **TickerModel** — Underlying with IV Rank, beta, earnings date, available expirations.

### Key Components (`src/components/`)

- **Dashboard** (`dashboard/dashboard.component.tsx`) — Combined view: P&L summary, net liquidity chart, IC open trades table, profit-by-ticker breakdown.
- **AccountInfo** (`account-info.component.tsx`) — Sidebar: account balances (net liq, buying power, cash) + portfolio greeks (Δ, Θ, Γ, V).
- **IronCondorSavior** — Find rescue positions to offset losses on existing trades.

### Pages (`src/pages/`)

- DashboardPage, IronCondorPage, IronCondorSaviorPage, PositionsPage

## Critical Knowledge

### Symbol Format Mismatch
TastyTrade API returns symbols in TastyTrade format: `QQQ   260227C00665000`
DxLink streamer uses dxFeed format: `.QQQ260227C665`

**Always use `pos['streamer-symbol']` (mapped to `streamerSymbol` in IPositionRawData) for WebSocket subscriptions and lookups.** Using TastyTrade format for streamer operations will silently fail (no errors, just empty data).

### quantityDirection
`pos['quantity-direction']` returns strings "Long" or "Short", NOT numbers. Use direct string comparison, never `parseFloat()`.

### Portfolio Greeks Pattern
Uses MobX `autorun` to reactively aggregate greeks from streamer data. Must call `waitForConnection()` before subscribing. The autorun re-runs whenever observable greeks/quotes/trades maps update.

### Net Liquidity Chart
Reconstructed from transaction history: `startNetLiq = currentNetLiq - totalCumulativePL`, then for each point: `netLiq = startNetLiq + cumulativePL`.

## Trading Rules (enforced in code)

- **Position sizing**: Max 5% of net liquidity per trade
- **Profit target**: Close at 75% of max profit
- **DTE management**: Close or roll at 21 DTE
- **IV preference**: IV Rank > 30 preferred, > 50 ideal
- **Portfolio balance**: Target delta-neutral, positive theta

## Development Rules

- ALWAYS maintain zero TypeScript errors. Run `npx tsc --noEmit` before declaring changes complete.
- Use feature branches, never commit directly to main.
- Follow existing patterns: MobX observables for state, interfaces in `.interface.ts` files, models in `.model.ts` files.
- All monetary values use 2 decimal places. Greeks: delta/theta/vega = 2 decimals, gamma = 4 decimals.
- The app is responsive — designed for both desktop and iPhone.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npx tsc --noEmit     # Type check without emitting
npx cypress open     # Open Cypress E2E tests
firebase deploy      # Deploy to Firebase Hosting
```

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

# Codebase Summary

> File inventory, service catalog, page routes, and key dependencies for TastyScanner.

## Project Layout

```
tastyscanner/
├── src/                        # Frontend application (157 .ts/.tsx files)
│   ├── components/             # React components organized by feature area
│   ├── pages/                  # 20 route-level page components
│   ├── services/               # 16 services via ServiceFactory pattern
│   ├── models/                 # Domain models (IC, spreads, options, ticker)
│   ├── utils/                  # Utility functions (Lazy<T>, formatters)
│   ├── theme/                  # CSS variables (dark theme palette)
│   ├── firebase.ts             # Firebase app initialization
│   └── App.tsx                 # Root component with routing
├── functions/                  # Firebase Cloud Functions (14 .ts files)
│   └── src/
│       ├── index.ts            # Express API + function exports
│       ├── aiDailySubmit.ts    # Scheduled: daily AI IC picker
│       ├── closeCheck.ts       # Scheduled: position close check
│       ├── weeklyReflect.ts    # Scheduled: strategy memo generation
│       ├── aiLearning.ts       # Firestore trigger: feature extraction
│       └── shared/             # Shared modules (10 files)
├── docs/                       # Project documentation
│   └── superpowers/specs/      # Feature design specifications
├── tasks/                      # TODO tracking (todo.md)
├── agents/                     # Paperclip agent templates
├── cypress/                    # E2E test specs
├── public/                     # Static assets
├── CLAUDE.md                   # AI assistant context
├── firebase.json               # Firebase project configuration
├── firestore.rules             # Firestore security rules
├── tsconfig.json               # TypeScript config (strict mode)
├── vite.config.ts              # Vite bundler configuration
└── eslint.config.js            # ESLint flat config
```

**Total TypeScript files:** 157 in `src/` + 14 in `functions/src/` = **171 files**

## Frontend Services (16 via ServiceFactory)

All services use the `ServiceFactory` pattern (`src/services/service-factory.ts`) with `Lazy<T>` initialization. Services are instantiated on first access and receive the factory reference for cross-service dependencies.

| # | Service | Directory | Purpose |
|---|---------|-----------|---------|
| 1 | **credentials** | `src/services/credentials/` | TastyTrade API credential management (client secret + refresh token) |
| 2 | **brokerCredentials** | `src/services/credentials/` | Multi-broker credential CRUD via Firestore subcollections |
| 3 | **brokerAccount** | `src/services/broker-account/` | Account balances, portfolio Greeks aggregation (delta, theta, gamma, vega) |
| 4 | **marketDataProvider** | `src/services/market-data-provider/` | WebSocket streaming, options chains, Greeks, quotes, order execution |
| 5 | **positions** | `src/services/positions/` | Current holdings with conflict detection against new orders |
| 6 | **ironCondorAnalytics** | `src/services/iron-condor-analytics/` | YTD performance tracking, win/loss analysis, P&L by ticker/month |
| 7 | **ironCondorSavior** | `src/services/iron-condor-savior/` | Rescue position finder for underwater trades |
| 8 | **tradingDashboard** | `src/services/trading-dashboard/` | P&L aggregation, net liquidity history, ticker-level breakdown |
| 9 | **tickers** | `src/services/tickers/` | Symbol search, recent ticker tracking, current ticker management |
| 10 | **watchlistData** | `src/services/watchlist-data/` | Real-time watchlist with auto-refresh |
| 11 | **settings** | `src/services/settings/` | Strategy filter preferences (delta range, DTE, spread width) |
| 12 | **deltaAlert** | `src/services/delta-alert/` | Live position monitoring with delta ratio alerts (4h background cycle) |
| 13 | **tradeLog** | `src/services/trade-log/` | Trade execution logging |
| 14 | **language** | `src/services/language/` | i18n support |
| 15 | **logger** | `src/services/logger/` | Application diagnostics (`ConsoleLoggerService`) |
| 16 | **rawLocalStorage** | `src/services/storage/` | Browser localStorage persistence layer |

The `ServiceFactory` constructor listens to `onAuthStateChanged` from Firebase Auth. When a user authenticates, it loads broker credentials and calls `initialize()`, which re-creates the `MarketDataProvider` with fresh credentials and starts the WebSocket connection.

## Frontend Pages (20 routes)

Defined in `src/App.tsx`. Public routes have no sidebar; protected routes render inside `IonSplitPane` with the sidebar `Menu`.

| Page | Route | Auth | Description |
|------|-------|------|-------------|
| LandingPage | `/welcome` | Public | Marketing page with video tutorials |
| LoginPage | `/login` | Public | Firebase email/password login |
| RegisterPage | `/register` | Public | Account registration |
| OnboardingPage | `/onboarding` | Auth | Broker credential setup wizard |
| IbkrCallbackPage | `/ibkr-callback` | Auth | IBKR OAuth redirect handler |
| Page (IC Builder) | `/app` | Auth | Main ticker selector + IC chain scanner |
| DashboardPage | `/dashboard` | Auth | P&L summary, net liq chart, open trades |
| GuvidHistoryPage | `/guvid-history` | Auth | YTD performance and trade history |
| GuviduVsCatalinPage | `/guvid-vs-user` | Auth | AI competition rounds and leaderboard |
| GuviduVisualizationPage | `/guvid-visualization` | Auth | IC positions on price-axis SVG charts |
| IronCondorDashboardPage | (sub-route) | Auth | IC-specific dashboard view |
| IronCondorSaviorPage | `/iron-condor-savior` | Auth | Rescue position finder |
| DeltaAlertPage | `/delta-alert` | Auth | Short option delta monitoring |
| DteAnalyzerPage | `/dte-analyzer` | Auth | Premium efficiency across expirations |
| StrategySimulatorPage | `/strategy-simulator` | Auth | Strategy parameter simulation |
| RiskExposerPage | `/risk-exposer` | Auth | Max win/loss + breakeven visualization |
| TradingDashboardPage | (sub-route) | Auth | Trading activity overview |
| AccountPage | `/account` | Auth | Account settings, broker management |
| GreeksGuidePage | `/guide` | Auth | Interactive Greeks reference |
| SuperAdminPage | `/superadmin` | Auth | Admin tools (superadmin role required) |

## Frontend Components by Feature Area

```
src/components/
├── strategies/                     # IC/spread builder UI
│   ├── ticker-options-strategies   # Per-ticker strategy list
│   ├── all-expirations-strategies  # Cross-expiration view
│   ├── options-strategy            # Single strategy card
│   ├── condors/                    # IC-specific components
│   ├── credit-spreads/             # Spread components
│   ├── boxes/                      # Layout containers
│   └── send-order-dialog           # Order execution modal
├── dashboard/                      # Dashboard components
│   └── dashboard.component.tsx     # P&L summary + net liq chart + open trades
├── guvid-vs-catalin/               # AI competition components
│   └── guvid-vs-catalin.component  # Round display + leaderboard
├── guvid-history/                  # History components
├── guvid-visualization/            # SVG price-axis position charts
├── iron-condor-dashboard/          # IC-specific dashboard
├── iron-condor-savior/             # Rescue position UI
├── delta-alert/                    # Alert display components
├── dte-analyzer/                   # Expiration comparison charts
├── positions-visualization/        # Position display
├── risk-exposer/                   # Risk visualization
├── trading-dashboard/              # Trading activity views
├── broker-manager/                 # Multi-broker management UI
├── super-admin/                    # Admin panel components
├── Menu.tsx                        # Sidebar navigation
├── account-info.component.tsx      # Account balances + portfolio Greeks
├── market-overview.component.tsx   # Market data display
├── ticker-chart.component.tsx      # Price chart per ticker
├── trading-view-widget.component   # TradingView embed
├── strategy-filters.component.tsx  # Filter controls for IC builder
├── symbol-search-drop-down         # Ticker search autocomplete
├── watch-lists.component.tsx       # Watchlist display
├── ticker-menu-item.component.tsx  # Sidebar ticker item
├── earnings-date-marker.component  # Earnings date indicator
└── input-base.box.ts               # Shared input styling
```

## Backend Functions (5 deployed)

Source: `functions/src/`. Built with `tsc` + copy of `best-practices.md` to `lib/shared/`.

| Function | Type | Schedule | Description |
|----------|------|----------|-------------|
| **api** | HTTP (Express) | On-demand | Credentials CRUD, IBKR OAuth token exchange/refresh, Polygon.io proxy (stock-bars, options-contracts, option-bars, option-bars-batch) |
| **aiDailySubmit** | Cloud Scheduler | `30 14 * * 1-5` (10:30 AM ET weekdays) | Multi-agent IC picker: rule-based candidates -> Claude Opus selection -> Claude Sonnet risk review. Stores rounds in `competitionV2`. |
| **closeCheck** | Cloud Scheduler | `0 21 * * 1-5` (4:00 PM ET weekdays) | Checks open AI virtual positions for 75% profit or 10 DTE. Scans user transactions for actual closes. Sets winner when both sides resolved. |
| **aiLearning** | Firestore trigger | On `competitionV2/{roundId}` update | Fires when round winner changes from Pending. Extracts feature vector (wings, DTE, delta, POP, VIX, IVR, days held). Updates rule adjustments and exploration weights. |
| **weeklyReflect** | Cloud Scheduler | `0 1 * * 1` (Sunday 8 PM ET) | Reads past 7 days of rounds + learning log. Claude Opus writes a strategy memo stored in `aiState/current/weeklyMemos/{weekId}`. |

### Shared Modules (`functions/src/shared/`)

| Module | Purpose |
|--------|---------|
| `credentials.ts` | Decrypt user credentials from Firestore, find active TastyTrade user |
| `tasty-rest-client.ts` | TastyTrade REST API wrapper (auth, accounts, options chains, snapshots, transactions, balances) |
| `ic-picker.ts` | Rule-based IC candidate generator (top 5 per ticker/expiration) |
| `llm-picker.ts` | Claude Opus integration: present candidates, get selection with rationale |
| `risk-manager.ts` | Claude Sonnet integration: APPROVE/MODIFY/REJECT verdicts |
| `llm-client.ts` | Shared Anthropic SDK wrapper with budget enforcement and audit logging |
| `prompts.ts` | System and user prompt templates for picker, risk manager, reflector |
| `research-loader.ts` | Loads research context for LLM prompts |
| `types.ts` | Shared TypeScript interfaces (`ICompetitionRoundV2`, `IAiState`, `IFeatureVector`, etc.) |
| `best-practices.md` | Trading rules document loaded into LLM context |

## Models (`src/models/`)

| Model | File | Lines | Purpose |
|-------|------|-------|---------|
| IronCondorModel | `iron-condor.model.ts` | 140 | 4-leg IC strategy: credit, risk/reward, POP, EV, Alpha, conflict detection, order sending |
| CreditSpreadModel | `credit-spread.model.ts` | -- | Base 2-leg spread with shared calculation logic |
| PutCreditSpread | `put-credit-spread.model.ts` | -- | Bull put spread (short put + long put) |
| CallCreditSpread | `call-credit-spread.model.ts` | -- | Bear call spread (short call + long call) |
| OptionModel | `option.model.ts` | -- | Single option with Greeks, bid/ask, mid price |
| OptionStrikeModel | `option-strike.model.ts` | -- | Strike price level with put + call pair |
| OptionsExpirationModel | `options-expiration.model.ts` | -- | Expiration date with all available strikes |
| OptionsStrategyLegModel | `options-strategy-leg.model.ts` | -- | Individual leg (BTO/STO, put/call, strike, qty) |
| TickerModel | `ticker.model.ts` | -- | Underlying with IV Rank, beta, earnings date, expirations |
| StrategiesBuilder | `strategies-builder.ts` | -- | Orchestrates IC construction from chain data |
| StrategyProfile | `strategy-profile.ts` | -- | Conservative/neutral/aggressive profile definitions for AI |

### Critical Formulas (from `IronCondorModel`)

```
credit       = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid
maxProfit    = credit (per contract, x100 for dollar value)
maxLoss      = wings - credit
POP          = 100 - max(|short put delta|, |short call delta|)
EV           = (POP/100 x maxProfit) - ((1 - POP/100) x maxLoss)
Alpha        = EV / maxLoss x 100
RiskReward   = wings / credit
```

## Key Dependencies

### Frontend (`package.json`)

| Dependency | Version | Purpose | Runtime/Dev |
|-----------|---------|---------|-------------|
| react | 19.0.0 | UI framework | Runtime |
| react-dom | 19.0.0 | DOM rendering | Runtime |
| @ionic/react | ^8.5.0 | Mobile-first UI components (IonPage, IonContent, IonList) | Runtime |
| @ionic/react-router | ^8.5.0 | Ionic route integration with react-router | Runtime |
| react-router-dom | ^5.3.4 | Client-side routing | Runtime |
| mobx | ^6.15.0 | Reactive state management (observables, autorun) | Dev (peer) |
| mobx-react | ^9.2.1 | MobX-React bindings (observer HOC) | Dev (peer) |
| @tastytrade/api | ^6.0.1 | TastyTrade REST API + DxLink WebSocket client | Runtime |
| firebase | ^11.10.0 | Firebase Auth + Firestore client SDK | Runtime |
| recharts | ^3.8.0 | Chart components (LineChart, BarChart, PieChart) | Runtime |
| styled-components | ^6.1.19 | CSS-in-JS styling with theme support | Dev (peer) |
| typescript | ~5.9.0 | TypeScript compiler (strict mode) | Dev |
| vite | ^5.0.0 | Build tool and dev server | Dev |
| cypress | ^13.5.0 | End-to-end testing framework | Dev |
| vitest | ^0.34.6 | Unit testing framework (Vite-native) | Dev |
| eslint | ^9.20.1 | Linting (flat config with React + hooks plugins) | Dev |

### Backend (`functions/package.json`)

| Dependency | Version | Purpose | Runtime/Dev |
|-----------|---------|---------|-------------|
| @anthropic-ai/sdk | ^0.88.0 | Claude API client (Opus + Sonnet calls) | Runtime |
| @tastytrade/api | ^7.0.1 | TastyTrade REST API (server-side, newer version) | Runtime |
| firebase-admin | ^13.0.0 | Firestore, Auth admin SDK | Runtime |
| firebase-functions | ^6.0.0 | Cloud Functions v2 runtime (onSchedule, onRequest, onDocumentUpdated) | Runtime |
| express | ^4.18.2 | HTTP server for the `api` function | Runtime |
| cors | ^2.8.5 | CORS middleware | Runtime |
| typescript | ^5.9.3 | TypeScript compiler | Dev |

## Existing Design Specifications

Located in `docs/superpowers/specs/`:

| Spec | Date | Description |
|------|------|-------------|
| `2026-04-12-guvid-visualization-design.md` | 2026-04-12 | IC position visualization on price-axis SVG charts |
| `2026-04-13-guvid-vs-user-v2-design.md` | 2026-04-13 | Competition v2 with multi-agent architecture |
| `2026-04-13-llm-agent-phase1-design.md` | 2026-04-13 | Phase 1 LLM agent design (Picker + Risk Manager) |

## See Also

- [Project Overview & Roadmap](project-overview-pdr.md) -- Vision, features, success metrics
- [System Architecture](system-architecture.md) -- Diagrams and data flows
- [Code Standards](code-standards.md) -- Patterns and conventions
- [Design Guidelines](design-guidelines.md) -- UI theme and component patterns

---

*Last updated: 2026-04-13*

# Operatiunea Guvidul -- TastyScanner

**Systematic Iron Condor premium selling platform targeting $1,000/day.**

Live: [https://operatiunea-guvidul.web.app](https://operatiunea-guvidul.web.app)

## What Is This?

TastyScanner connects to TastyTrade's API and DxLink WebSocket to scan the entire options chain for iron condor opportunities. It filters by delta, DTE, spread width, EV, Alpha, and POP -- then lets you execute trades with one click. An autonomous multi-agent AI (Claude Opus + Sonnet) competes against the human trader daily, picking its own ICs, managing risk, and learning from outcomes.

## Key Features

- **IC Builder** -- Scan, filter, and execute iron condor strategies across SPX/QQQ with real-time Greeks streaming
- **Multi-Agent AI Competition** ("Guvidul vs Catalin") -- Claude Opus picks trades, Claude Sonnet manages risk, weekly strategy memos auto-generated
- **Dashboard** -- P&L summary, net liquidity chart, open IC trades with live Greeks
- **Delta Alert** -- Monitors short option deltas and alerts when risk thresholds are breached
- **DTE Analyzer** -- Compare premium efficiency ($/day, theta/gamma ratio) across expirations
- **IC Savior** -- Find rescue positions for underwater trades
- **Guvid History** -- YTD performance tracking with 364+ closed trades, win/loss analysis
- **Position Visualization** -- IC positions plotted on price-axis charts per ticker
- **Risk Exposer** -- Max win/loss visualization with breakeven points

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + Ionic + TypeScript (strict) | 19 / 8.5 / 5.9 |
| State | MobX (observables, autorun, runInAction) | 6.15 |
| Build | Vite | 5.x |
| Styling | styled-components | 6.1 |
| Charts | Recharts | 3.8 |
| Broker API | @tastytrade/api (REST + DxLink WebSocket) | 6.0.1 (frontend) / 7.0.1 (functions) |
| AI | Anthropic SDK (Claude Opus 4.6 + Sonnet 4.6) | 0.88 |
| Backend | Firebase Functions (Node 20) + Express | v2 / 4.18 |
| Database | Cloud Firestore | -- |
| Auth | Firebase Authentication (email/password) | -- |
| Hosting | Firebase Hosting | -- |
| Testing | Cypress (E2E) + Vitest (unit) | 13.5 / 0.34 |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/trudaio/tastyscanner.git
cd tastyscanner

# Install frontend dependencies
npm install

# Install backend dependencies
cd functions && npm install && cd ..

# Create environment file
cp .env.example .env.local
# Fill in Firebase config + TastyTrade credentials (see docs/deployment-guide.md)

# Start dev server
npm run dev
# App available at http://localhost:5173

# Type check
npx tsc --noEmit

# Run tests
npm run test.unit     # Vitest
npm run test.e2e      # Cypress
```

## Project Structure

```
tastyscanner/
├── src/                    # Frontend application
│   ├── components/         # React components (28 dirs/files)
│   ├── pages/              # 20 route pages
│   ├── services/           # 16 services via ServiceFactory
│   ├── models/             # Domain models (IC, spreads, options, ticker)
│   ├── theme/              # CSS variables (dark theme)
│   └── firebase.ts         # Firebase initialization
├── functions/              # Firebase Cloud Functions (Node 20)
│   └── src/
│       ├── index.ts        # Express API (credentials, IBKR OAuth, Polygon proxy)
│       ├── aiDailySubmit.ts    # Scheduled: AI picks IC daily 10:30 AM ET
│       ├── closeCheck.ts       # Scheduled: Auto-close positions 4:00 PM ET
│       ├── weeklyReflect.ts    # Scheduled: Strategy memo Sunday 8 PM ET
│       ├── aiLearning.ts       # Firestore trigger: Feature extraction on round close
│       └── shared/             # LLM client, prompts, TastyTrade REST, IC picker
├── docs/                   # Project documentation
├── tasks/                  # TODO and task tracking
├── cypress/                # E2E test specs
├── firebase.json           # Hosting + Functions + Firestore config
├── firestore.rules         # Security rules (user isolation)
└── CLAUDE.md               # AI assistant context file
```

## Environment Variables

Frontend (`.env.local`):
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=operatiunea-guvidul.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=operatiunea-guvidul
VITE_FIREBASE_STORAGE_BUCKET=operatiunea-guvidul.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FUNCTIONS_BASE_URL=https://us-central1-operatiunea-guvidul.cloudfunctions.net
```

Firebase Secrets (Cloud Functions): `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `IBKR_CONSUMER_SECRET`, `POLYGON_API_KEY`

## Branch Model

- **main** -- stable production
- **feature/guvid-vs-catalin** -- active development branch (multi-agent AI competition)
- Feature branches only; never commit directly to main

## Documentation

| Document | Description |
|----------|-------------|
| [Project Overview & Roadmap](docs/project-overview-pdr.md) | Vision, features, roadmap, success metrics |
| [Codebase Summary](docs/codebase-summary.md) | File inventory, services, pages, dependencies |
| [Code Standards](docs/code-standards.md) | TypeScript, MobX, naming, precision conventions |
| [System Architecture](docs/system-architecture.md) | Architecture diagrams (Mermaid), data flows, Firestore schema |
| [Deployment Guide](docs/deployment-guide.md) | Build, deploy, monitoring, rollback |
| [Design Guidelines](docs/design-guidelines.md) | Dark theme, responsive breakpoints, component patterns |

---

*Last updated: 2026-04-13*

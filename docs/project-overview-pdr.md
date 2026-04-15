# Project Overview & Roadmap

> **TastyScanner / Operatiunea Guvidul** -- Iron Condor options trading platform with autonomous AI competition.

## Vision & Mission

**Vision:** Build a platform where a human options trader and an AI agent compete head-to-head picking iron condor trades -- driving both to improve through systematic, data-driven premium selling.

**Mission:** Achieve systematic premium selling generating **$1,000/day** from defined-risk iron condor strategies on SPX and QQQ, with the AI agent eventually matching or exceeding human performance.

The name "Operatiunea Guvidul" (Romanian for "Operation Guvidul") reflects the project's personal origin -- built by and for Catalin, a Romanian options trader. The codebase mixes Romanian and English naming in some older areas, with newer code standardized in English.

## Target Users

1. **Primary:** Catalin (the creator) -- active options trader on TastyTrade, focused on SPX/QQQ iron condors
2. **Secondary:** Future options traders who want a systematic IC screening tool with AI-assisted selection
3. **Tertiary:** Developers interested in multi-agent LLM architectures applied to financial decisions

## Core Problem Solved

Manual iron condor selection is time-consuming and emotionally biased. Traders must:
- Scan hundreds of strike combinations across multiple expirations
- Evaluate risk/reward, delta, theta, POP, and expected value simultaneously
- Track open positions for profit targets and roll decisions
- Maintain discipline during drawdowns

TastyScanner automates the scanning and filtering. The AI competition ("Guvidul vs Catalin") adds a systematic counterparty that picks trades without emotion, learns from outcomes, and provides a benchmark for human performance.

## Key Features by Category

### Live Trading
- **IC Builder** -- Full options chain scanning with filters for delta (2-50), DTE (3-90), spread width, EV, Alpha, POP. Supports symmetric, bullish, and bearish IC types. Single or fill-all laddering modes.
- **One-Click Execution** -- Send IC orders directly to TastyTrade from the builder interface
- **Position Monitoring** -- Real-time Greeks streaming via DxLink WebSocket for all open positions
- **IC Savior** -- Find rescue/adjustment positions for underwater trades
- **Conflict Detection** -- Prevents overlapping strikes with existing positions

### Analytics & Risk
- **Dashboard** -- P&L summary (realized + unrealized), net liquidity chart reconstructed from transaction history, profit-by-ticker breakdown
- **Delta Alert** -- Background monitoring every 4 hours. Alerts when short option delta exceeds threshold vs initial delta (ratio-based) or absolute 40+ for untracked positions
- **DTE Analyzer** -- Compare premium efficiency ($/day), theta/gamma ratio, and strike decay across expirations
- **Risk Exposer** -- Max win/loss visualization with breakeven point mapping
- **Guvid History** -- YTD performance: win rate, average win/loss, P&L by ticker and month (364+ closed trades tracked)
- **Position Visualization** -- IC positions plotted on price-axis SVG charts per ticker
- **Technical Indicators** -- RSI(14), Bollinger Bands(20, 2σ), and ATR(14) shown in ticker header with color-coded verdicts. Collapsible 90-day chart panel with line + BB overlay + RSI strip. Computed daily at 4:15 PM ET for SPX/QQQ (Firestore-cached), on-demand via callable Function for other tickers. Indicators are passed to the autonomous Picker as informational context (not mechanical triggers).

### AI Agent ("Guvidul")
- **Daily IC Picker** (Cloud Scheduler, 10:30 AM ET) -- Multi-agent pipeline:
  1. Rule-based `ic-picker` generates top 5 candidates per ticker/expiration
  2. Claude Opus 4.6 (with `web_search` tool) selects or proposes a custom IC
  3. Claude Sonnet 4.6 Risk Manager issues APPROVE / MODIFY / REJECT verdict
- **Automatic Close Check** (4:00 PM ET) -- Closes virtual positions at 75% profit target or 10 DTE
- **Firestore Trigger Learning** -- On round close, extracts feature vectors (wings, DTE, delta, POP, VIX, IVR, days held) and updates rule adjustments + exploration weights
- **Weekly Reflection** (Sunday 8 PM ET) -- Claude Opus reads past 7 days of rounds, learning log, and feedback to write a strategy memo
- **Audit Trail** -- Every Claude API call logged to `users/{uid}/aiAuditLog` with model, tokens, cost. Daily budget cap ($10/day default)

### Education & Onboarding
- **Guvid Guide** -- Interactive reference for Greeks (delta, theta, gamma, vega), strategy metrics (POP, EV, α, R/R), the Strategia Guvidul itself, and technical indicators (RSI/BB/ATR) with formulas, interpretations, and caveats
- **Onboarding Flow** -- Step-by-step TastyTrade credential setup with video tutorials
- **Landing Page** -- Public-facing overview with embedded YouTube playlist

### Multi-Broker Foundation
- **TastyTrade** -- Fully integrated (REST API + DxLink WebSocket)
- **IBKR** -- OAuth token exchange implemented in Cloud Functions; frontend stub prepared
- **Broker-agnostic credential storage** -- Firestore subcollections per broker account

## Roadmap

### Completed (as of 2026-04-13)
- IC Builder with full filtering and execution
- Dashboard with P&L, net liquidity chart, open trades
- Guvid History with YTD tracking
- Multi-agent AI competition (v2) with Picker + Risk Manager + Learner + Reflector
- Delta Alert with background monitoring
- DTE Analyzer with $/day and theta/gamma metrics
- Position Visualization (SVG price-axis charts)
- IBKR OAuth in Cloud Functions
- Polygon.io proxy for historical data
- Technical Indicators panel (RSI/BB/ATR) — header badges + collapsible chart + Picker wiring

### Near-Term (from `tasks/todo.md`)
- **Code-splitting** -- Bundle is 2.3MB (608KB gzip); lazy-load heavy pages with `React.lazy()` + `Suspense`
- **Rolling metrics** -- 30/60/90 day windows in Guvid History (beyond YTD)
- **Drawdown tracking** -- Max drawdown and current drawdown in stat cards
- **Sharpe/Sortino Ratio** -- Risk-adjusted return metrics based on daily P&L
- **Trade lifecycle journal** -- Full entry/exit tracking with timestamps, Greeks at open vs close, personal notes
- **Error boundary** -- Wrap pages to prevent full-app crashes
- **Data format normalization** -- Fix openCredit/currentPrice unit mismatch between analytics paths (see `tasks/todo.md` "HIGH" items)

### Mid-Term
- **Copy Trader** -- Replicate trades from a source account with configurable sizing ratio
- **Dashboard Suggestion** -- ML-based parameter recommendations from historical user preferences
- **Quick-roll** -- One-click roll to next expiration from open positions
- **Watchlist alerts** -- Notifications when a ticker hits IV Rank targets (>30 or >50)
- **Mobile swipe navigation** -- Gesture handlers for page transitions on iPhone
- **Keyboard shortcuts** -- Rapid navigation (1=Dashboard, 2=IC Builder, etc.)
- **Firebase Analytics** -- Event tracking infrastructure exists; needs component integration

### Long-Term
- **Offline support** -- Service worker with cache strategy
- **Dark/Light theme toggle** -- Currently dark-only (system preference)
- **Portfolio-level risk modeling** -- Aggregate Greeks correlation analysis across positions
- **Public multi-user mode** -- Beyond Catalin's personal instance

## Success Metrics

| Metric | Target | Current Status |
|--------|--------|---------------|
| AI win rate vs Catalin | >50% by 2026-06-13 | Competition running daily since v2 launch |
| Daily P&L target | $1,000/day average | Tracking in Guvid History |
| AI budget efficiency | <$10/day Claude API cost | Audit log + budget cap enforced |
| Build health | Zero TypeScript errors | Enforced via `npx tsc --noEmit` |
| Closed trades tracked | 500+ YTD | 364+ as of early April 2026 |
| Feature velocity | 2-3 features/week | Active development on `feature/guvid-vs-catalin` |

## See Also

- [Codebase Summary](codebase-summary.md) -- File inventory and dependency map
- [System Architecture](system-architecture.md) -- Diagrams and data flow
- [Code Standards](code-standards.md) -- Conventions and patterns
- [Deployment Guide](deployment-guide.md) -- Build and deploy instructions

---

*Last updated: 2026-04-13*

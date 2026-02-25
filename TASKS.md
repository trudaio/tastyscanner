# TastyScanner Task Tracker

_Source of truth: `KanbanBoardComponent` default cards (mirrors soon-to-be standalone Kanban app)._ 

## ✅ Delivered in current branch
- Added backlog lane + "Testat de Cătălin" status in embedded Kanban
- Seeded board with the full roadmap cards (IBKR spike, DCF module, Discord config, etc.)
- Responsive board layout (auto-fit columns)

## 🟡 Outstanding Work

### Near-term
1. **Trade Log page / UI** — Dedicated view for entries stored by Trade Automation Log (open/closed/expired, manual close w/ exit price + P&L).
2. **UI polish — cards layout (desktop)** — Fix Iron Condor cards overlapping on desktop: consistent width, spacing, warnings, table alignment.
3. **Trade Ideas Scanner (multi-symbol)** — Rank SPY/QQQ/IWM/TLT/GLD by Alpha, only positive-EV setups, auto-refresh 60s.
4. **Pre-set Exit Rules per trade** — Capture profit target %, 21 DTE exit, max loss % at entry; store in log and alert when triggered.
5. **Trade Automation Log analytics** — Aggregate metrics: win rate, avg EV, avg hold time, P&L by symbol, dashboard charts.
6. **Beta Exposure Check** — Beta-weighted delta guardrail before recommending new ICs; suggest hedge spread if too directional.
7. **Payoff Diagram — interactive** — Real-time payoff chart with break-evens, max profit/loss zones updated with strike changes.
8. **Discord Webhook Config UI** — Settings screen to save webhook URL + test ping for #trade-log channel.
9. **Kanban Standalone App** — React (non-Ionic) board + JSON history export (in progress; tracked separately).

### Backlog / Research
- **IBKR integration spike** — Research IBKR API for workflows + mapping.
- **DCF calculator module** — Inputs for revenue/FCF, discount rate, terminal value.
- **Public app onboarding (self-serve auth)** — Client credential intake, secure storage, reset flows.

> When the standalone Kanban ships, this file should stay aligned via automated export.

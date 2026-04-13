# Guvid vs User Competition v2 — Design Spec

## Overview

Transform the existing `/guvid-vs-user` page from a hardcoded demo into a live competition where:
- User picks Iron Condors daily (on any expiration they choose)
- AI picks ONE IC per expiration where user submitted, independently
- Poker-style reveal (neither sees the other's pick until cutoff)
- Both positions tracked through close (AI closes virtual at 75%/10 DTE; user's actual close detected from transaction history)
- Winner determined by risk-adjusted P&L per round
- AI has its own rules, starting as a copy of Catalin's, then experimenting over time via feature-vector learning
- Deadline: **2026-06-13** (2 months from 2026-04-13)

## Hard Requirements (from Catalin)

- **100% autonomous AI** — no dependency on user opening the app
- **No Paperclip** — Firebase Functions + Cloud Scheduler only
- **REST-only market data** acceptable (no DxLink WebSocket in Functions)
- **us-east1 region** for Functions
- **AI has own rules** — not constrained by Catalin's VIX/sizing/etc.
- **Ghost mode** — AI plays even when Catalin skips (tracked but excluded from leaderboard)

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│  TastyScanner   │         │  Firebase Project    │
│  (Browser app)  │◄───────►│  ironcondor-catalin  │
└─────────────────┘  auth/  └──────────────────────┘
        │           firestore         │
        │                             │
        │ user submit picks           │
        │                             ▼
        │                    ┌─────────────────┐
        │                    │ Firestore       │
        └───────────────────►│ competition/{} │
                             │ aiState/{}      │
                             └─────────────────┘
                                     ▲
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
          ┌─────────────┐    ┌───────────────┐    ┌─────────────┐
          │aiDailySubmit│    │  closeCheck   │    │ aiLearning  │
          │ (Scheduler) │    │  (Scheduler)  │    │(Firestore   │
          │ 10:30 AM ET │    │  4:00 PM ET   │    │ trigger)    │
          └─────────────┘    └───────────────┘    └─────────────┘
                 │                   │                   │
                 └─────────► TastyTrade REST API ◄──────┘
                          (credentials from Secrets Mgr)
```

### Three Firebase Functions

1. **`aiDailySubmit`** (Cloud Scheduler, daily 10:30 AM ET)
   - Read Catalin's submitted rounds for today (Firestore)
   - For each unique expiration user picked: scan SPX + QQQ, pick 1 AI IC using current AI rules + learning state
   - Write AI pick to Firestore with `rationale`, `confidenceScore`, `rulesApplied`
   - Also run in "ghost mode" for expirations where Catalin did NOT submit: tracked in Firestore but flagged `ghost: true`

2. **`closeCheck`** (Cloud Scheduler, daily 4:00 PM ET)
   - For each open AI virtual position:
     - Fetch current option prices via REST
     - If P&L >= 75% max profit OR DTE <= 10: mark as closed
     - Write `exitPl`, `exitDate`, `closedBy: 'target' | 'dte'`
   - For each open user position (from competition rounds):
     - Scan user's TastyTrade transactions
     - Match by expiration + strikes to find closing order
     - If found: write `exitPl`, `exitDate`, `closedBy: 'user'`
   - When BOTH sides are closed for a round: trigger `aiLearning`

3. **`aiLearning`** (Firestore trigger on round completion)
   - Extract feature vector from round (see below)
   - Compute outcome (win/loss) using risk-adjusted P&L
   - Apply rule adjustments (penalize loser patterns, reinforce winner patterns)
   - Update `aiState` document in Firestore

## Firestore Schema

### `users/{uid}/competition/{roundId}`

```typescript
interface ICompetitionRoundV2 {
  id: string;
  roundNumber: number;
  date: string;              // YYYY-MM-DD
  userEmail: string;
  expirationDate: string;    // the expiration this round is about
  ticker: 'SPX' | 'QQQ';

  // User side (may be null if ghost round)
  userTrade: ICompetitionTrade | null;

  // AI side (always present)
  aiTrade: ICompetitionTradeWithAi;

  // Round outcome
  winner: 'User' | 'AI' | 'Draw' | 'Pending' | 'GhostOnly';
  ghost: boolean;            // true if user did not submit for this expiration

  // Market context at submit
  marketContext: {
    underlyingPrice: number;
    vix: number;
    ivRank: number;
  };

  // Risk-adjusted P&L for winner calc
  userScore: number | null;  // P&L / maxBPE, null until closed
  aiScore: number | null;
  winnerDecidedAt: string | null; // ISO timestamp when winner was set
}

interface ICompetitionTrade {
  ticker: string;
  strategy: string;          // "IC 6350/6360p 7250/7260c"
  expiration: string;
  legs: { type: string; optionType: string; strike: number }[];
  credit: number;            // per-share credit (e.g. 1.25)
  quantity: number;
  maxProfit: number;         // credit * 100 * qty
  maxLoss: number;           // (wings - credit) * 100 * qty
  pop: number;
  ev: number;
  alpha: number;
  rr: number;
  delta: number;
  theta: number;
  wings: number;             // $5, $10, etc.
  exitPl: number | null;     // filled when closed
  exitDate: string | null;
  closedBy: 'target' | 'dte' | 'user' | null;
  status: 'open' | 'closed';
}

interface ICompetitionTradeWithAi extends ICompetitionTrade {
  rationale: string;         // "Picked 16-delta symmetric because VIX=22, IVR=45..."
  confidenceScore: number;   // 0-100
  rulesApplied: string[];    // ["min_pop_70", "max_rr_4to1", "exp_seed_catalin"]
  experimentVariant: string | null; // "rule_variant_X" if AI is testing something new
}
```

### `users/{uid}/aiState/current`

```typescript
interface AiState {
  version: number;
  lastUpdated: string;        // ISO timestamp

  // Scoring weights (start = Catalin's rules copy, evolve with learning)
  weights: {
    popWeight: number;        // default 0.6
    evWeight: number;         // default 0.25
    alphaWeight: number;      // default 0.15
  };

  // Rule adjustments (penalties/bonuses on feature combinations)
  ruleAdjustments: Array<{
    id: string;
    condition: string;        // "POP<70 AND wings==5"
    effect: number;           // positive = bonus, negative = penalty
    samplesSeen: number;      // for confidence weighting
    winRate: number;
  }>;

  // Exploration params (epsilon-greedy)
  explorationRate: number;    // 0.2 start, decay to 0.05 by round 30

  // Performance stats
  totalRounds: number;
  wins: number;
  losses: number;
  draws: number;
  ghostRounds: number;
}
```

### `users/{uid}/learningLog/{logId}`

```typescript
// One doc per round close — append-only audit trail
interface LearningLogEntry {
  roundId: string;
  timestamp: string;
  featureVector: Record<string, number | string>;
  outcome: 'win' | 'loss' | 'draw';
  userScore: number;
  aiScore: number;
  adjustmentsApplied: string[];
  postMortem: string;         // 2-3 sentence summary
}
```

## AI Picking Algorithm

### Seed rules (copy of Catalin's)

Starting state — AI behaves like Catalin:
- VIX gate: ≥ 18
- Sizing: wings $10-$15 → 2-3 contracts; wings $20+ → 1 contract; wings $5 → 1 contract
- Strike: symmetric 16-20 delta (default), directional 30/16 (requires bias signal)
- Skip $25 strike spacing expirations
- Credit:wing ratio max 5:1
- POP ≥ 70% default (60-70% in VIX-crunch conditions with $5 wings)
- Exit: 75% profit or 10 DTE

### Experimentation (after seed)

AI diverges via three mechanisms:

1. **Epsilon-greedy exploration** — with probability `explorationRate`, pick a variant instead of best-scoring
2. **Rule adjustments** — `aiLearning` can relax/tighten rules based on outcomes (e.g., "POP<70 works in VIX>22")
3. **Weight tuning** — `popWeight/evWeight/alphaWeight` shift based on which dimension correlated with wins

### Per-expiration pick process

```
for each expiration E where user submitted (or ghost expirations):
    chain = fetchChain(SPX or QQQ)  // REST
    candidates = buildICs(chain, AI.currentRules)
    filtered = applyRules(candidates, AI.ruleAdjustments)

    if random() < AI.explorationRate:
        pick = selectExperimentVariant(filtered)
    else:
        pick = max(filtered, key=score)

    pick.rationale = explainPick(pick, AI.state)
    pick.confidenceScore = computeConfidence(pick.score, samples)
    pick.rulesApplied = listActiveRules(AI.state)

    writeToFirestore(pick)
```

## Close Detection

### AI side (virtual)

At 4:00 PM ET daily, for each AI trade `status: 'open'`:
1. Fetch current option prices via REST snapshot
2. Compute current price-to-close: `(spShort.mid + scShort.mid - pbLong.mid - cbLong.mid)`
3. Compute current P&L: `credit - currentPrice` (per share) × 100 × qty
4. Profit %: `(credit - currentPrice) / credit × 100`
5. If profit% ≥ 75 OR DTE ≤ 10 → mark closed
6. Write `exitPl`, `exitDate`, `closedBy`

### User side (from transaction history)

At 4:00 PM ET daily, for each user trade `status: 'open'`:
1. Fetch user's transactions from TastyTrade REST (last N days)
2. Group transactions by order-id
3. Find order that closes the specific 4 legs (match by expiration + strikes + direction flip)
4. If found: compute `exitPl = credit_received - debit_paid` at close
5. Write `exitPl`, `exitDate`, `closedBy: 'user'`

Edge case: partial closes (rolls). If only 2 of 4 legs closed, treat as "still open". Re-check next day.

## Risk-Adjusted P&L (Winner Score)

```typescript
score = realizedPL / maxBPE
// where maxBPE = (wings - credit) * 100 * qty  (same as maxLoss)
// score > 0: profit; score < 0: loss
// score range: -1 (total loss) to +credit/maxLoss (typically 0.3 to 0.6 max win)
```

Winner per round:
- `userScore > aiScore` → winner = 'User'
- `aiScore > userScore` → winner = 'AI'
- `|userScore - aiScore| < 0.05` → 'Draw'

## Learning Engine

### Feature vector (extracted per round close)

```typescript
interface FeatureVector {
  ticker: 'SPX' | 'QQQ';
  wings: number;              // $5, $10, etc.
  dte_at_entry: number;
  delta_short_put: number;
  delta_short_call: number;
  pop: number;
  credit_ratio: number;       // credit / wings
  ev_dollars: number;
  vix_at_entry: number;
  ivrank_at_entry: number;
  days_held: number;
  closed_by: string;          // 'target' | 'dte' | 'user'
  symmetric: boolean;         // was this a symmetric delta pick?
  experiment_variant: string | null;
}
```

### Rule adjustment logic

After each round close:
1. Add to `learningLog`
2. If outcome = loss:
   - Find 1-2 "distinguishing features" in the vector
   - Create/update `ruleAdjustment` with `effect = -0.1` (penalty) against those features
3. If outcome = win:
   - Reinforce matching rules (`effect += 0.05`)
4. Decay old adjustments: any rule with `samplesSeen > 20` and `winRate < 40%` → disable
5. Update `weights` slightly: if `pop_high` correlated with wins → `popWeight += 0.01`
6. Decay `explorationRate`: `0.2 * (0.95 ^ round_number)`, floor at 0.05

### Post-mortem generation

Simple template (Phase 1):
```
"AI {won/lost} round {N}. Position: {strategy}. Key features: VIX={vix}, POP={pop}, wings={wings}. 
Outcome: {plDollars} ({pct}% of max profit). 
{rule_change_description if any}."
```

Phase 3: upgrade to 2-3 sentence human-readable narrative.

## UI Changes

### Poker reveal

Current state: shows both picks always.
New state:
1. Before user submit: user sees "Submit your pick" form, AI pick hidden
2. After user submit but before 11:00 AM cutoff: user sees own pick, AI pick shows "🂠 Locked until cutoff"
3. After 11:00 AM cutoff: both picks revealed side-by-side

### Round card extension

Show for each round:
- User pick (with metrics)
- AI pick + **rationale** + **confidence score** + **rules applied badges**
- Live P&L for both (updates via Firestore listener)
- Close status per side
- Risk-adjusted scores
- Winner badge

### Leaderboard

Top of page:
- **Days remaining: 60**
- User: {W-L-D} record, cumulative risk-adjusted P&L
- AI: {W-L-D} record, cumulative risk-adjusted P&L
- Ghost rounds (AI only): count

## Files to Create

| Action | Path |
|--------|------|
| Create | `functions/` (entire new directory) |
| Create | `functions/package.json` |
| Create | `functions/tsconfig.json` |
| Create | `functions/src/index.ts` |
| Create | `functions/src/aiDailySubmit.ts` |
| Create | `functions/src/closeCheck.ts` |
| Create | `functions/src/aiLearning.ts` |
| Create | `functions/src/shared/tasty-rest-client.ts` |
| Create | `functions/src/shared/ic-picker.ts` |
| Create | `functions/src/shared/learning-engine.ts` |
| Create | `functions/src/shared/feature-vector.ts` |
| Create | `functions/src/shared/credentials.ts` |
| Create | `firebase.json` (add functions config) |
| Create | `src/shared-ic-core/` (browser-agnostic logic used by both browser + functions via symlink or npm workspace) |
| Modify | `src/services/competition/competition.service.ts` — add AI state read, poker reveal logic |
| Modify | `src/components/guvid-vs-catalin/guvid-vs-catalin.component.tsx` — poker UI, reasoning display, leaderboard |

## Credentials & Secrets

- Catalin's TastyTrade refresh token: stored encrypted in Firestore (existing)
- Decryption key: Firebase Secrets Manager (`firebase functions:secrets:set ENCRYPTION_KEY`)
- Functions decrypt on-demand, use token to authenticate with TastyTrade REST

## Out of Scope (for MVP)

- Multi-user competition (only Catalin's account matters)
- Mobile-specific UI (keeps existing responsive behavior)
- Historical backtest of AI rules on past trades
- Real-time learning mid-round (only on close)
- Rollback/undo for bad rule adjustments (manual override via Firestore console)

## Success Criteria

By **2026-06-13**:
- [ ] At least 30 real competition rounds played
- [ ] AI has closed loop ≥ 20 times (with learning applied)
- [ ] Leaderboard shows a clear winner
- [ ] AI demonstrates at least 3 meaningful rule adjustments from seed state
- [ ] Zero manual intervention required from Catalin beyond his own trade submissions

---

**Spec written 2026-04-13 by Catalin + AI pair.**

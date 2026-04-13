# Guvid Agent Phase 1 — Claude Opus Integration

## Goal

Transform Guvidul from rule-based scheduler into a real **LLM-powered agent** that:
- Reasons about market conditions before picking
- Cites research when justifying decisions
- Reflects weekly on its own performance
- Asks for approval before deviating from rules
- Receives structured feedback from Catalin

Single-agent design (multi-agent deferred to Phase 2).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  aiDailySubmit (10:30 AM ET)                            │
│    1. Rule-based picker → top 5 candidates              │
│    2. Build Claude prompt:                              │
│       - Market context (VIX, IVR, calendar)             │
│       - Last week's strategy memo (RAG)                 │
│       - Best-practices excerpts (RAG)                   │
│       - 5 candidates with scoring                       │
│    3. Claude Opus selects + writes rationale            │
│    4. If selection deviates from rules + conf >70%:     │
│       → set requiresApproval: true                      │
│    5. Write to Firestore + audit log                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  weeklyReflect (Sunday 8 PM ET)                         │
│    1. Read last 7 days rounds + feedback + learningLog  │
│    2. Claude writes strategy memo (~500 words)          │
│    3. Save to users/{uid}/aiState/weeklyMemos/{week}    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  llm-client.ts (shared)                                 │
│    - Anthropic SDK wrapper                              │
│    - Retry with exponential backoff                    │
│    - Daily budget cap ($5/day default)                  │
│    - Audit log to users/{uid}/aiAuditLog/{id}          │
└─────────────────────────────────────────────────────────┘
```

## LLM Configuration

- **Model**: `claude-opus-4-6` (most capable for reasoning)
- **Max tokens output**: 4000 (rationale + selection)
- **Temperature**: 0.3 (deterministic but allows variance)
- **Daily budget**: $5/day hard cap (configurable per user)
- **Token cost estimate**: input $15/M, output $75/M
  - Per pick: ~3K input + 1K output = ~$0.13
  - Per weekly memo: ~10K input + 1K output = ~$0.23
  - 60 picks + 8 memos in 2 months = **~$10**

## Prompt Template — IC Selection

```
You are Guvidul, an AI Iron Condor trader competing against Catalin.

# Today's Context
- Date: {date}
- Ticker: {ticker}
- Underlying price: {price}
- VIX: {vix}
- IV Rank: {ivrank}
- Days to expiration: {dte}
- Catalin's submission: {if user submitted, summarize}

# Your Strategy State
- Rounds played: {totalRounds}
- Win/Loss: {wins}-{losses}
- Current exploration rate: {explorationRate}
- Recent rule adjustments: {top 5 rules with effect}

# Last Week's Strategy Memo
{weeklyMemo or "No memo yet — first week"}

# Research Excerpts (from best-practices.md)
{relevant snippets based on current conditions}

# Top 5 Candidates (rule-based scoring)
1. {strategy} | POP {pop}% | Credit ${credit} | Wings ${wings} | Score {score}
   Rationale: {brief from picker}
2. ...

# Your Task
Select ONE candidate (or propose a custom variant if you see a better opportunity).
Output JSON exactly:
{
  "selection": "candidate_index" | "custom",
  "customStrategy": null | { putBuy, putSell, callSell, callBuy, wings, ... },
  "rationale": "3-5 sentence explanation citing research/conditions",
  "confidenceScore": 0-100,
  "rulesApplied": ["seed_vix_gate", "research_45dte_optimal", ...],
  "deviatesFromRules": true | false,
  "deviationReason": null | "string"
}

If you deviate from Catalin's seed rules (VIX>=18, symmetric 16-20 delta, max RR 5:1, POP>=70),
set deviatesFromRules=true and explain why in deviationReason.
```

## Prompt Template — Weekly Reflection

```
You are Guvidul, reflecting on the past week of competition with Catalin.

# Period: {weekStart} to {weekEnd}
- Rounds played: {N}
- Wins: {W} (risk-adjusted P&L: {sumScore})
- Losses: {L}
- Catalin's wins: {userW}
- AI's wins: {aiW}

# Round Summaries
{for each round: ticker, strategy, outcome, key features, Catalin's feedback}

# Active Rule Adjustments
{current ruleAdjustments with samplesSeen and winRate}

# Catalin's Feedback Themes
{aggregated 5-star ratings + text comments}

# Your Task
Write a strategy memo for next week (~500 words). Cover:
1. **What worked** — patterns in winning picks
2. **What didn't** — common features in losses
3. **Adjustments** — concrete changes to scoring/rules for next week
4. **Open questions** — what would you experiment with?
5. **Catalin feedback integration** — how does his feedback change your approach?

Be specific. Cite individual rounds. No platitudes.
```

## Approval Flow

When Claude proposes a pick that deviates from seed rules:
1. `aiDailySubmit` writes round with `requiresApproval: true`
2. UI shows "⚠️ Approval Required" banner with rationale
3. Catalin clicks Approve or Reject
4. On Approve: pick stands, AI tracks outcome
5. On Reject: round becomes ghost, no scoring impact, AI reads rejection in next reflection

## Feedback Flow

For each closed round, Catalin can submit:
- **Pick rating**: 1-5 stars
- **Rationale rating**: 1-5 stars
- **Free text**: optional comment

Stored at `users/{uid}/competitionV2/{roundId}.userFeedback`. Read by weeklyReflect.

## Audit Log

Every Claude call appended to `users/{uid}/aiAuditLog/{autoId}`:
```typescript
{
  timestamp: ISO,
  function: "aiDailySubmit" | "weeklyReflect",
  context: "round_pick" | "weekly_memo",
  promptTokens: number,
  responseTokens: number,
  costUsd: number,
  rawPrompt: string,
  rawResponse: string,
  metadata: { roundId? weekId? }
}
```

Daily cost summed for budget cap enforcement.

## Files to Create

- `functions/src/shared/llm-client.ts` — Anthropic wrapper
- `functions/src/shared/best-practices.md` — copy of research doc
- `functions/src/shared/research-loader.ts` — load + select relevant excerpts
- `functions/src/shared/prompts.ts` — template builders
- `functions/src/weeklyReflect.ts` — Sunday scheduler

## Files to Modify

- `functions/src/aiDailySubmit.ts` — call Claude after rule-based picker
- `functions/src/index.ts` — export weeklyReflect
- `functions/src/shared/types.ts` — add `requiresApproval`, `userFeedback`, `claudeRationale` fields
- `functions/package.json` — add `@anthropic-ai/sdk`
- `src/services/competition/competition-v2.service.ts` — mirror new fields
- `src/components/guvid-vs-catalin/guvid-vs-catalin.component.tsx` — approval banner + feedback modal

## Out of Scope (Phase 2+)

- Multi-agent (separate picker/risk/reflective agents)
- Tools beyond REST + Firestore (news API, economic calendar, web search)
- Vector DB / semantic memory
- Chat interface
- Real-time intra-day reaction to events

## Success Criteria

By end of week 1:
- [ ] Claude Opus reasoning visible in every AI pick
- [ ] At least one weekly reflection memo written
- [ ] Audit log shows token usage + cost per call
- [ ] Daily budget cap prevents runaway costs
- [ ] Approval flow works end-to-end (test with manual deviation)

By end of 2-month deadline (2026-06-13):
- [ ] AI's rationale demonstrates knowledge of best-practices research
- [ ] Weekly memos show strategic evolution
- [ ] Catalin's feedback measurably influences next-week picks

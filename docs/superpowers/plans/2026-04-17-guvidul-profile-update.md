# Guvidul Profile Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply research-validated best-practice rules to all 3 strategy profiles (frontend + backend), replacing stale hardcoded defaults with Catalin's confirmed decisions from 14 YouTube studies (71,000+ trades).

**Architecture:** Frontend profiles (`strategy-profile.ts`) are the source of truth for the browser-side IC scanner. Backend picker (`ic-picker.ts`) has its own hardcoded rules that must be updated to match. `closeCheck.ts` enforces exit/DTE management rules. Changes are pure data + filter logic — no new UI components, no new services.

**Tech Stack:** TypeScript, MobX 6, Firebase Functions (Node.js), Vitest

**Branch:** Create `feature/best-practices-profiles` from `master`

---

## Summary of Changes

**Current vs Target profile values:**

| Field | Conservative (current → target) | Neutral (current → target) | Aggressive (current → target) |
|-------|------|------|------|
| wings | [10] → [10] | [10] → [10] | **[5] → [10]** |
| minDelta | 11 → 11 | 11 → 11 | **15 → 15** |
| maxDelta | 16 → 16 | 24 → 24 | 24 → 24 |
| minDTE | 30 → 30 | 19 → 19 | 19 → 19 |
| maxDTE | 47 → 47 | 47 → 47 | **35 → 35** |
| minPOP | 80 → 80 | 60 → 60 | 60 → 60 |
| exitProfitPercent | 50 → 50 | 75 → 75 | **90 → 50** |
| minCredit | **1 → 2.50** | **1 → 2.50** | **1 → 2.50** |
| **minVIX** (NEW) | — → **18** | — → **20** | — → **23** |
| **dteManagement** (NEW) | — → **14** | — → **14** | — → **14** |

**Backend changes:**
- `ic-picker.ts`: wingWidths `[5,10,15,20]` → `[10]`, minCredit `1.0` → `2.5`, remove $5-wing POP exception
- `closeCheck.ts`: DTE gate `10` → `14`, exit target `75%` → per-profile (read from trade)
- `types.ts`: add optional `profileType` + `exitTarget` to trade interface

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/models/strategy-profile.ts` | Add `minVIX`, `dteManagement` fields; fix aggressive wings/exit/credit |
| Modify | `src/models/strategies-builder.ts` | No change needed (minCredit filter already works with new value) |
| Modify | `functions/src/shared/types.ts` | Add `profileType`, `exitTarget` to trade interfaces |
| Modify | `functions/src/shared/ic-picker.ts` | Update hardcoded rules: wings, credit, remove $5 POP exception |
| Modify | `functions/src/aiDailySubmit.ts` | No structural change (rules flow from ic-picker) |
| Modify | `functions/src/closeCheck.ts` | Profile-aware exit target, DTE 14 |
| Modify | `~/.claude/skills/skill-guvidul/SKILL.md` | Reflect new rules |
| Test | `src/models/strategy-profile.test.ts` | New — test scoring + credit validation |

---

### Task 1: Create feature branch

**Files:** None

- [ ] **Step 1: Create branch from master**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git checkout -b feature/best-practices-profiles master
```

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: On branch `feature/best-practices-profiles`, nothing to commit (working tree clean, ignore `.firebase` cache).

---

### Task 2: Update frontend strategy profiles

**Files:**
- Modify: `src/models/strategy-profile.ts`

- [ ] **Step 1: Add `minVIX` and `dteManagement` fields to `IStrategyProfile`**

Add two new fields to the interface after `exitProfitPercent`:

```typescript
export interface IStrategyProfile {
    type: StrategyProfileType;
    name: string;
    color: string;
    wings: number[];
    minDelta: number;
    maxDelta: number;
    minDTE: number;
    maxDTE: number;
    minPOP: number;
    maxRiskRewardRatio: number;
    maxBidAskSpread: number;
    minCredit: number;
    scoring: {
        popWeight: number;
        evWeight: number;
        alphaWeight: number;
    };
    exitProfitPercent: number;
    /** Minimum VIX level required to open new positions with this profile. */
    minVIX: number;
    /** DTE threshold for position management (close/roll when DTE <= this). */
    dteManagement: number;
}
```

- [ ] **Step 2: Update all 3 profile defaults**

Replace the `STRATEGY_PROFILES` constant:

```typescript
export const STRATEGY_PROFILES: Record<StrategyProfileType, IStrategyProfile> = {
    conservative: {
        type: 'conservative',
        name: 'Conservative',
        color: '#4dff91',
        wings: [10],
        minDelta: 11,
        maxDelta: 16,
        minDTE: 30,
        maxDTE: 47,
        minPOP: 80,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 2.50,    // was 1 — now 1/4 wing width ($10/4)
        scoring: { popWeight: 0.70, evWeight: 0.20, alphaWeight: 0.10 },
        exitProfitPercent: 50,
        minVIX: 18,
        dteManagement: 14,
    },
    neutral: {
        type: 'neutral',
        name: 'Neutral',
        color: '#4a9eff',
        wings: [10],
        minDelta: 11,
        maxDelta: 24,
        minDTE: 19,
        maxDTE: 47,
        minPOP: 60,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 2.50,    // was 1 — now 1/4 wing width ($10/4)
        scoring: { popWeight: 0.60, evWeight: 0.25, alphaWeight: 0.15 },
        exitProfitPercent: 75,
        minVIX: 20,
        dteManagement: 14,
    },
    aggressive: {
        type: 'aggressive',
        name: 'Aggressive',
        color: '#ff8c00',
        wings: [10],         // was [5] — $5 wings unprofitable per 12-yr study
        minDelta: 15,
        maxDelta: 24,
        minDTE: 19,
        maxDTE: 35,
        minPOP: 60,
        maxRiskRewardRatio: 4,
        maxBidAskSpread: 8,
        minCredit: 2.50,    // was 1 — now 1/4 wing width ($10/4)
        scoring: { popWeight: 0.40, evWeight: 0.35, alphaWeight: 0.25 },
        exitProfitPercent: 50,  // was 90 — Catalin's decision (2026-04-17)
        minVIX: 23,             // REQUIRED for 30-delta range — sub-23 = negative expectancy
        dteManagement: 14,
    },
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
npx tsc --noEmit 2>&1 | head -20
```

Expected: Errors will appear if other files reference `IStrategyProfile` without the new fields. Fix any consumers that construct `IStrategyProfile` literals — they need `minVIX` and `dteManagement`.

- [ ] **Step 4: Fix any TypeScript errors from new required fields**

Search for any code that creates `IStrategyProfile` objects outside of `STRATEGY_PROFILES`:

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
grep -rn "IStrategyProfile" src/ --include="*.ts" --include="*.tsx"
```

If any files construct profile objects, add the two new fields. The `STRATEGY_PROFILES` constant is the only expected place, but verify.

- [ ] **Step 5: Commit**

```bash
git add src/models/strategy-profile.ts
git commit -m "feat(profiles): add minVIX + dteManagement fields, fix aggressive wings/exit/credit

- Aggressive wings: $5 → $10 (12-yr study: $5 unprofitable)
- Aggressive exit: 90% → 50% (Catalin's decision)
- All profiles minCredit: $1 → $2.50 (1/4 wing width)
- New fields: minVIX (18/20/23), dteManagement (14 for all)
- Research source: 14 YouTube studies, 71K+ trades"
```

---

### Task 3: Update backend shared types

**Files:**
- Modify: `functions/src/shared/types.ts`

- [ ] **Step 1: Add `profileType` and `exitTarget` to `ICompetitionTradeV2`**

Add two optional fields to `ICompetitionTradeV2` after the `status` field (optional for backward compatibility with existing Firestore docs):

```typescript
export interface ICompetitionTradeV2 {
    ticker: string;
    strategy: string;
    expiration: string;
    legs: ICompetitionLeg[];
    credit: number;              // per-share
    quantity: number;
    wings: number;
    maxProfit: number;           // dollars (credit x 100 x qty)
    maxLoss: number;             // dollars ((wings - credit) x 100 x qty)
    pop: number;
    ev: number;
    alpha: number;
    rr: number;
    delta: number;
    theta: number;
    exitPl: number | null;       // dollars, filled on close
    exitDate: string | null;     // ISO date
    closedBy: 'target' | 'dte' | 'user' | null;
    status: 'open' | 'closed';
    /** Strategy profile used for this trade. Used by closeCheck for exit target. */
    profileType?: StrategyProfileType;
    /** Exit profit target (%) at time of entry. Stored so closeCheck doesn't need profile lookup. */
    exitTarget?: number;
}
```

Note: `StrategyProfileType` is already defined at the top of this file as `'Conservative' | 'Neutral' | 'Aggressive'`.

- [ ] **Step 2: Verify functions compile**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner/functions
npx tsc --noEmit 2>&1 | head -20
```

Expected: PASS — new fields are optional, so existing code compiles without changes.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git add functions/src/shared/types.ts
git commit -m "feat(types): add profileType + exitTarget to trade interface

Optional fields for backward compat. closeCheck will use exitTarget
to apply per-profile exit rules (50%/75%/50%)."
```

---

### Task 4: Update backend IC picker rules

**Files:**
- Modify: `functions/src/shared/ic-picker.ts`

- [ ] **Step 1: Update `getTopCandidates()` rules (line 317-355)**

Replace the hardcoded rules block inside `getTopCandidates()`:

OLD (lines 322-339):
```typescript
    if (marketCtx.vix < 18) {
        return {
            candidates: [], topN: [],
            reason: `VIX ${marketCtx.vix} < 18 — gate closed`,
            rules: { minPOP: 70, maxRRRatio: 5, minCredit: 1.0, wingWidths: [5, 10, 15, 20] },
        };
    }

    // POP rules: default 70% for all wings; VIX-crunch exception (VIX 18-22) allows 60% ONLY for $5 wings
    const rules = {
        wingWidths: [5, 10, 15, 20],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 1.0,
        minPOP: 70,
        minPOPForWings5: marketCtx.vix < 22 ? 60 : 70, // only relaxes for $5 wings during VIX crunch
    };
```

NEW:
```typescript
    if (marketCtx.vix < 18) {
        return {
            candidates: [], topN: [],
            reason: `VIX ${marketCtx.vix} < 18 — gate closed`,
            rules: { minPOP: 70, maxRRRatio: 5, minCredit: 2.5, wingWidths: [10] },
        };
    }

    // Best-practices update (2026-04-17): wings $10 only, credit = 1/4 wing width
    // Source: 14 YouTube studies, 71K+ trades. $5 wings unprofitable per 12-yr TastyTrade study.
    const rules = {
        wingWidths: [10],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 2.5,    // 1/4 wing width ($10/4) — was $1 flat
        minPOP: 70,
    };
```

- [ ] **Step 2: Update `pickBestIC()` rules (line 357-449)**

Replace the hardcoded rules block inside `pickBestIC()`:

OLD (lines 362-376):
```typescript
    // VIX gate — AI inherits from Catalin seed (adjustable via learning)
    if (marketCtx.vix < 18) {
        return { pick: null, reason: `VIX ${marketCtx.vix} < 18 — skip (seed rule)`, candidatesEvaluated: 0 };
    }

    // Seed rules (copy of Catalin's as starting point)
    // POP exception: VIX-crunch (18-22) allows 60% POP ONLY on $5 wings
    const rules = {
        wingWidths: [5, 10, 15, 20],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 1.0,
        minPOP: 70,
        minPOPForWings5: marketCtx.vix < 22 ? 60 : 70,
    };
```

NEW:
```typescript
    if (marketCtx.vix < 18) {
        return { pick: null, reason: `VIX ${marketCtx.vix} < 18 — skip (seed rule)`, candidatesEvaluated: 0 };
    }

    // Best-practices update (2026-04-17): wings $10 only, proportional credit
    const rules = {
        wingWidths: [10],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 2.5,
        minPOP: 70,
    };
```

- [ ] **Step 3: Update `rulesApplied` in `pickBestIC()` trade output (line 439-444)**

OLD:
```typescript
        rulesApplied: [
            `seed_vix_gate_18`,
            `seed_symmetric_delta_16_20`,
            `seed_max_rr_${rules.maxRRRatio}to1`,
            `seed_min_pop_${rules.minPOP}`,
        ],
```

NEW:
```typescript
        rulesApplied: [
            `seed_vix_gate_18`,
            `seed_symmetric_delta_16_20`,
            `seed_max_rr_${rules.maxRRRatio}to1`,
            `seed_min_pop_${rules.minPOP}`,
            `bp_wings_10_only`,
            `bp_min_credit_quarter_wing`,
        ],
```

- [ ] **Step 4: Remove `minPOPForWings5` from `buildCandidates()` rules interface**

In the `buildCandidates` function signature (line 174-183), remove the optional `minPOPForWings5` parameter since we no longer have $5 wings:

OLD:
```typescript
export function buildCandidates(
    input: ChainInput,
    rules: {
        wingWidths: number[];
        targetDeltaSymmetric: [number, number];
        maxRRRatio: number;
        minCredit: number;
        minPOP: number;
        minPOPForWings5?: number;
    },
): IcCandidate[] {
```

NEW:
```typescript
export function buildCandidates(
    input: ChainInput,
    rules: {
        wingWidths: number[];
        targetDeltaSymmetric: [number, number];
        maxRRRatio: number;
        minCredit: number;
        minPOP: number;
    },
): IcCandidate[] {
```

And inside `buildCandidates`, simplify the POP threshold (line 216):

OLD:
```typescript
            const popThreshold = wings === 5 && rules.minPOPForWings5 !== undefined ? rules.minPOPForWings5 : rules.minPOP;
            if (pop < popThreshold) continue;
```

NEW:
```typescript
            if (pop < rules.minPOP) continue;
```

- [ ] **Step 5: Update `CandidatesResult.rules` type to match**

In the `CandidatesResult` interface (line 78-88), the `rules` object should match:

No change needed — the existing type `{ minPOP, maxRRRatio, minCredit, wingWidths }` already works.

- [ ] **Step 6: Verify functions compile**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner/functions
npx tsc --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git add functions/src/shared/ic-picker.ts
git commit -m "feat(picker): apply best-practices to IC rules

- Wings: [5,10,15,20] → [10] only ($5 unprofitable per 12-yr study)
- MinCredit: $1 flat → $2.50 (1/4 wing width)
- Remove $5-wing POP exception (no more $5 wings)
- Add bp_* rule tags for audit trail"
```

---

### Task 5: Update closeCheck — DTE management + profile-aware exit

**Files:**
- Modify: `functions/src/closeCheck.ts`

- [ ] **Step 1: Update `maybeCloseAiTrade()` — profile-aware exit target + DTE 14**

Replace the function (lines 44-89):

```typescript
/** Check AI virtual trade — close if profit target hit or DTE<=14 */
async function maybeCloseAiTrade(trade: IAiCompetitionTrade, quotes: Map<string, import('./shared/tasty-rest-client').IOptionQuote>, streamerSymLookup: (strike: number, type: 'P' | 'C') => string | null): Promise<IAiCompetitionTrade | null> {
    const dte = daysUntil(trade.expiration);

    // Exit target: use per-trade exitTarget if set, otherwise default to 75% (neutral profile)
    const exitTarget = trade.exitTarget ?? 75;

    // Compute current close price from snapshots if we have them
    let currentClose: number | null = null;
    const psSym = streamerSymLookup(trade.legs.find(l => l.type === 'STO' && l.optionType === 'P')!.strike, 'P');
    const pbSym = streamerSymLookup(trade.legs.find(l => l.type === 'BTO' && l.optionType === 'P')!.strike, 'P');
    const scSym = streamerSymLookup(trade.legs.find(l => l.type === 'STO' && l.optionType === 'C')!.strike, 'C');
    const cbSym = streamerSymLookup(trade.legs.find(l => l.type === 'BTO' && l.optionType === 'C')!.strike, 'C');

    if (psSym && pbSym && scSym && cbSym) {
        const ps = quotes.get(psSym); const pb = quotes.get(pbSym);
        const sc = quotes.get(scSym); const cb = quotes.get(cbSym);
        if (ps && pb && sc && cb) {
            currentClose = ps.mid + sc.mid - pb.mid - cb.mid;
        }
    }

    // Profit % = (credit - currentClose) / credit * 100
    if (currentClose !== null && trade.credit > 0) {
        const profitPct = ((trade.credit - currentClose) / trade.credit) * 100;
        if (profitPct >= exitTarget) {
            return {
                ...trade,
                status: 'closed',
                exitPl: Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100,
                exitDate: new Date().toISOString().split('T')[0],
                closedBy: 'target',
            };
        }
    }

    // DTE management: 14 days (was 10). Best-practices update 2026-04-17.
    if (dte <= 14) {
        return {
            ...trade,
            status: 'closed',
            exitPl: currentClose !== null
                ? Math.round((trade.credit - currentClose) * 100 * trade.quantity * 100) / 100
                : Math.round(trade.credit * 100 * trade.quantity * 100) / 100,
            exitDate: new Date().toISOString().split('T')[0],
            closedBy: 'dte',
        };
    }

    return null;
}
```

Key changes:
- `profitPct >= 75` → `profitPct >= exitTarget` (reads from `trade.exitTarget`, defaults to 75%)
- `dte <= 10` → `dte <= 14`

- [ ] **Step 2: Update the function JSDoc comment at the top of the file (line 2)**

OLD:
```typescript
// For each open AI virtual position: check current price, close if 75% profit or 10 DTE
```

NEW:
```typescript
// For each open AI virtual position: check current price, close if exit target hit or DTE<=14
```

- [ ] **Step 3: Verify functions compile**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner/functions
npx tsc --noEmit 2>&1 | head -20
```

Expected: PASS — `trade.exitTarget` is valid because we added it as optional in Task 3.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git add functions/src/closeCheck.ts
git commit -m "feat(closeCheck): profile-aware exit target + DTE 14

- Exit: reads trade.exitTarget (default 75% for backward compat)
- DTE management: 10 → 14 days (Catalin's preference, more theta)
- Best-practices update 2026-04-17"
```

---

### Task 6: Wire exitTarget into AI trade creation

**Files:**
- Modify: `functions/src/shared/ic-picker.ts`

- [ ] **Step 1: Add `exitTarget` to `candidateToTrade()` output (line 286-314)**

The `candidateToTrade` function builds the trade object. Add `exitTarget: 75` (AI default = neutral profile):

In the return object, add after the `status` line:

```typescript
        exitPl: null,
        exitDate: null,
        closedBy: null,
        status: 'open',
        exitTarget: 75,     // AI uses neutral profile exit target
```

- [ ] **Step 2: Add `exitTarget` to `pickBestIC()` trade output (line 412-446)**

In the `aiTrade` object construction, add after the `status` line:

```typescript
        status: 'open',
        exitTarget: 75,
```

- [ ] **Step 3: Verify functions compile**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner/functions
npx tsc --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git add functions/src/shared/ic-picker.ts
git commit -m "feat(picker): set exitTarget=75 on AI trades

Wires exitTarget into trade objects so closeCheck can use
per-trade exit rules instead of hardcoded 75%."
```

---

### Task 7: Update Guvidul skill with new rules

**Files:**
- Modify: `~/.claude/skills/skill-guvidul/SKILL.md`

- [ ] **Step 1: Read the current skill file**

```bash
cat ~/.claude/skills/skill-guvidul/SKILL.md
```

- [ ] **Step 2: Update the strategy profiles table in the skill**

Find the profiles table and replace with:

```markdown
| Param | Conservative (Green) | Neutral (Blue) | Aggressive (Orange) |
|-------|---------------------|----------------|---------------------|
| Wings | $10 | $10 | $10 |
| Delta | 11-16 | 11-24 | 15-24 |
| DTE | 30-47 | 19-47 | 19-35 |
| Min POP | 80% | 60% | 60% |
| Min Credit | $2.50 (1/4 wing) | $2.50 (1/4 wing) | $2.50 (1/4 wing) |
| Min VIX | 18 | 20 | 23 |
| Scoring | POP 70% + EV 20% + Alpha 10% | POP 60% + EV 25% + Alpha 15% | EV 35% + Alpha 25% + POP 40% |
| Exit | 50% profit | 75% profit | 50% profit |
| DTE Mgmt | Close/roll at 14 DTE | Close/roll at 14 DTE | Close/roll at 14 DTE |
```

- [ ] **Step 3: Update any references to old values in the skill**

Search for and update:
- `$5 wings` → removed (note: "$5 wings eliminated per 12-yr study")
- `minCredit: 1` → `minCredit: 2.50 (1/4 wing width)`
- `21 DTE` or `10 DTE` management references → `14 DTE`
- `90% exit` for aggressive → `50% exit`
- Any VIX rules that conflict with the new per-profile thresholds

- [ ] **Step 4: Add a changelog entry at the bottom of the skill**

```markdown
## Changelog
- **2026-04-17**: Best-practices update — $5 wings eliminated, aggressive exit 90%→50%,
  credit rule proportional (1/4 wing), VIX thresholds per profile, DTE management 14 days.
  Source: 14 YouTube studies (71K+ trades). Catalin's hybrid decisions override pure research
  on exit targets and DTE.
```

- [ ] **Step 5: Commit**

```bash
git add ~/.claude/skills/skill-guvidul/SKILL.md
git commit -m "docs(skill): update Guvidul skill with best-practices rules

Reflects 2026-04-17 profile update: $10 wings only, proportional
credit, per-profile VIX thresholds, 14 DTE management, aggressive
exit 50%."
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full frontend type check**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Run full backend type check**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner/functions
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Run unit tests**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
npm run test.unit 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 4: Build frontend**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Review all changes**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git log --oneline feature/best-practices-profiles...master
git diff master --stat
```

Verify: ~5 commits, touching 4-5 files, no unintended changes.

- [ ] **Step 6: Final commit (if any fixups needed)**

Only if previous steps revealed issues.

---

## Post-Plan Notes

**What this plan does NOT cover (separate tasks):**
- Direction param for asymmetric 30/16 delta IC (#5) — separate feature, builds on existing `icType` mechanism
- Frontend UI changes for VIX display/filter toggle — profiles already have `minVIX`, UI can read it
- Economic Calendar page (#7)
- currentPrice bug (#8)
- LLM prompt updates (`prompts.ts`) — the LLM already reads `best-practices.md` via `research-loader.ts`; the rule-based picker changes are what matter

**Credit rule note:** `minCredit: 2.50` is `wing/4` for $10 wings. If Catalin scales to $15/$20 wings later, update to `wing/4` accordingly ($3.75 / $5.00). The target credit is `wing/3` ($3.33 for $10 wings) — this is a scoring preference, not a hard filter. The hard filter is the floor (1/4).

# Guvidul — Observational Metrics Design
**Date:** 2026-04-21
**Scope:** Item #2 extension — adds observational (non-filtering) metrics from options books research. No changes to scan filtering, profiles, UI pages, or DB schema.
**Branch:** `feature/best-practices-profiles` (continues)

---

## 1. Motivation

5 canonical options books (Jabbour, Kaeppel, McMillan, Trester, Gallacher) were reviewed on 2026-04-21. Full findings in `~/.claude/projects/-Users-catmac/memory/project_guvidul_book_research_2026_04.md`. Current rules (profile thresholds, DTE, wings, credit, exit) align with canon. Gap identified: several canonical metrics are absent from current scan and monitoring outputs — not as filters, but as information surfaces that aid Catalin's judgment.

This spec adds four observational additions: (1) per-symbol IV Rank visibility, (2) Probability of Touch, (3) PROVEST-structured rationale, (4) touch-strike heads-up alert on open positions.

## 2. Non-Goals

- Do **not** modify `src/models/strategy-profile.ts` (profiles frozen at current state).
- Do **not** change scan filter logic — candidate set is unchanged.
- Do **not** change roll / adjustment / stop-loss rules.
- Do **not** add UI components or pages.
- Do **not** persist new fields to Firestore `competitionV2` collection.

## 3. Design Decisions

### 3.1 Probability of Touch
Computed as `Math.min(100, 2 × 100 × max(|shortPutDelta|, |shortCallDelta|))`.

**Input contract:** Deltas are decimals in `[-1, 1]` (existing codebase convention — e.g. short put delta ≈ `-0.16`).
**Output:** Percentage in `[0, 100]` (e.g. `32` for a 16Δ short).

**Rationale:** Wall-Street rule-of-thumb "prob of touch ≈ 2× delta" is adequate for a heads-up metric. McMillan and Trester cite touch probability ≤ 25% (ideally 10-15%) as a guideline — this is the value being surfaced for operator judgment, not a hard filter. Black-Scholes first-passage or Monte Carlo can replace the formula later without changing the display contract.

**Location:** `functions/src/shared/metrics.ts` — new pure helper `probTouch(shortPutDelta: number, shortCallDelta: number): number`.

### 3.2 Per-symbol IV Rank
Already stored on `IMarketContext.ivRank` and `IFeatureVector.ivrank_at_entry`. No code path addition — surfaced in PROVEST rationale block only.

### 3.3 Touch-strike heads-up alert levels
Computed per open position in `closeCheck`. Let `m = max(|shortPutDelta|, |shortCallDelta|)` with delta as a decimal in `[-1, 1]`:

| Level | Condition (decimal delta) | Visual prefix |
|-------|---------------------------|---------------|
| `normal` | `m < 0.30` | *(none)* |
| `yellow` | `0.30 ≤ m < 0.40` | `[🟡 WATCH]` |
| `orange` | `0.40 ≤ m < 0.50` | `[🟠 WARN]` |
| `red` | `m ≥ 0.50` | `[🔴 ADJUST]` |

**Rationale:** Delta-based thresholds reuse data the afternoon check already fetches (short-leg greeks). The 40Δ boundary aligns with the existing roll trigger ("roll only when OTM delta > 40 with max debit $1/$2") — `yellow` is the earlier heads-up, `orange` is the existing trigger, `red` is ITM/imminent assignment territory. No new API calls, no new math.

**Location:** `functions/src/shared/metrics.ts` — new pure helper `touchAlertLevel(shortPutDelta: number, shortCallDelta: number): 'normal' | 'yellow' | 'orange' | 'red'`.

### 3.4 PROVEST-structured rationale block
In `IAiCompetitionTrade.rationale`, prepend a fixed 7-line block in the order below, followed by a blank line, then the existing narrative rationale (unchanged).

```
P — POP {pop}% | ProbTouch {probTouch}%
R — Score {compositeScore} | fits {profileName} (wings ${wings}, Δ {minDelta}-{maxDelta})
O — short {shortPutDelta}Δ put / {shortCallDelta}Δ call, {symmetryNote}
V — VIX {vix} | {ticker} IVR {ivRank} ({ivrVerdict})
E — {dte} DTE | management at {dteManagement}
S — {skewNote}
T — {timingNote}
```

**Field semantics:**
- `{symmetryNote}`: either `"symmetric"` or `"asymmetric (tilt {diff})"` where `diff` = `shortPutDelta - shortCallDelta` (signed)
- `{ivrVerdict}`: `"low"` if `ivRank < 30`, `"preferred"` if `30 ≤ ivRank < 50`, `"ideal"` if `≥ 50`
- `{skewNote}`: `"put skew +{n} vol pts vs call"` if put IV > call IV by meaningful margin, else `"balanced"`. If per-leg IV unavailable, emit `"skew unavailable"`.
- `{timingNote}`: fixed for now — `"market-hours scan"` (future: macro-event window detection)

**Rationale:** Kaeppel's PROVEST framework (Probability, Rating, Option, Volatility, Expiration, Skew, Timing) imposes discipline on rationale generation. Fixed order + fixed field names makes the LLM output parseable for future analytics and verifies all 7 dimensions were considered.

**Location:**
- `functions/src/shared/prompts.ts` — prompt updated to require the 7-line prelude verbatim.
- `functions/src/shared/metrics.ts` — new pure helper `buildProvestBlock(inputs): string` for deterministic composition (used in tests and as reference for LLM compliance verification).

## 4. File-Level Changes

| File | Change |
|------|--------|
| `functions/src/shared/metrics.ts` | **new** — `probTouch()`, `touchAlertLevel()`, `buildProvestBlock()`, `ivrVerdict()`. Pure functions, no imports from services. |
| `functions/src/shared/prompts.ts` | not modified — PROVEST is post-processed, not prompted. More robust than depending on LLM compliance. |
| `functions/src/shared/ic-picker.ts` | `pickBestIC` rule-based path prepends PROVEST block to rationale via `buildProvestBlock()`. |
| `functions/src/shared/llm-picker.ts` | post-process: after Claude selects a candidate, prepend deterministic PROVEST block (from the chosen `IcCandidate`) to Claude's narrative rationale. Applies to main path, risk-modified path, and rule-based fallback. |
| `functions/src/closeCheck.ts` | compute `touchAlertLevel()` per open position from streamer deltas; emit structured `console.log` lines (visible in Firebase Functions logs). closeCheck is mechanical — no LLM prompt involved. |
| `functions/src/shared/metrics.test.ts` | **new** — unit tests for each helper. |

## 5. Data Flow

```
picker (ic-picker.ts)
  ├─ candidate ICs with per-leg deltas (existing)
  ├─ marketContext.ivRank (existing)
  ├─ compute probTouch(), ivrVerdict(), symmetryNote, skewNote (new)
  └─ LLM prompt includes PROVEST fields → rationale begins with 7-line block

closeCheck (closeCheck.ts) — mechanical, no LLM
  ├─ open positions with per-leg quotes (existing)
  ├─ compute touchAlertLevel() from short-leg deltas (new)
  └─ emit `[🟡 WATCH]`/`[🟠 WARN]`/`[🔴 ADJUST]` lines via console.log to Firebase logs
```

## 6. Testing

- `metrics.test.ts` — pure-function tests (deltas as decimals in `[-1, 1]`):
  - `probTouch(-0.16, 0.16) === 32`
  - `probTouch(-0.50, 0.50) === 100` (clamp)
  - `probTouch(-0.60, 0.10) === 100` (clamp upper)
  - `touchAlertLevel(-0.25, 0.29) === 'normal'`
  - `touchAlertLevel(-0.31, 0.20) === 'yellow'`
  - `touchAlertLevel(-0.45, 0.10) === 'orange'`
  - `touchAlertLevel(-0.55, 0.10) === 'red'`
  - `buildProvestBlock(...)` snapshot — exactly 7 lines, fixed order, all placeholders replaced
- `npx tsc --noEmit` passes (universal rule).
- No change to candidate set → existing backtest / integration tests unaffected.

## 7. Rollout

1. Merge to `feature/best-practices-profiles`.
2. Deploy Cloud Functions (`firebase deploy --only functions`).
3. Watch one morning scan + one afternoon check live.
4. If PROVEST block malformed on first LLM output: adjust prompt; no rollback needed (rationale is append-only).
5. If alert level noisy on closeCheck: tune thresholds inline (pure function, single commit).

## 8. Open Items for Future Specs

The following book findings are intentionally deferred:
- **Support/Resistance strike alignment** (Kaeppel) — needs S/R level data source.
- **IV skew tilt as strike selection bias** (Kaeppel) — changes `strategies-builder.ts` logic; merits its own spec.
- **Credit-roll opportunity flag on IV spike** (McMillan) — requires historical IV tracking per position.
- **BPE buffer reservation** — requires BPE accounting change.
- Per-symbol IVR hard filter (IVR ≥ 50/60/70 per profile) — explicitly rejected as filter; left as observational only for this iteration.

## 9. References
- Book research: `~/.claude/projects/-Users-catmac/memory/project_guvidul_book_research_2026_04.md`
- Current profile state: `src/models/strategy-profile.ts`
- Prior design: `docs/superpowers/specs/2026-04-13-guvid-vs-user-v2-design.md`
- Backend shared module: `functions/src/shared/`

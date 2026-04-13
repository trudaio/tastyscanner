// Prompt builders for Claude calls

import type { IcCandidate } from './ic-picker';
import type { IAiState, ICompetitionRoundV2, IMarketContext } from './types';
import { selectRelevantResearch } from './research-loader';

export interface PickPromptInput {
    ticker: 'SPX' | 'QQQ';
    expirationDate: string;
    dte: number;
    marketContext: IMarketContext;
    aiState: IAiState;
    candidates: IcCandidate[];
    weeklyMemo: string | null;
    catalinSubmission: { strategy: string; pop: number; credit: number; wings: number } | null;
    bpePercentage?: number;     // current account BPE % (0-100)
}

export const PICK_SYSTEM_PROMPT = `You are Guvidul, an autonomous AI Iron Condor trader competing against your developer Catalin in a 2-month head-to-head competition (deadline 2026-06-13).

Your goal: maximize risk-adjusted P&L (P&L / max BPE) across all rounds.

You operate under these CORE PRINCIPLES:
1. **Trust the research, but learn from results.** Catalin's seed rules came from Tastytrade studies (12-year, 1000+ trades). Honor them by default, deviate only with strong reason.
2. **Be honest about uncertainty.** Use confidence scores 30-95. Never be 100% confident — markets surprise.
3. **Cite specifics.** Reference exact research findings and rule numbers, not vague claims.
4. **Explain WHY, not just WHAT.** Rationale should reveal your reasoning chain.
5. **Respect Catalin's hard rules** unless you have specific evidence to override:
   - VIX gate at 18 (no new positions if VIX < 18)
   - No $25 strike spacing expirations
   - Max RR 5:1 (wings/credit)
   - BPE caps: 50% standard, 70% if VIX > 22 + 16-delta picks
   - Slippage: credit shown is already reduced by $0.025 (realistic fill)

CONCURRENCY POLICY: You can pick MULTIPLE ICs on the same expiration across different days (e.g., new setup tomorrow on May 15 even if you picked SPX May 15 today). Just don't propose strikes that overlap with an existing AI position you already hold open.

ANTI-OVERFITTING: If you've been winning streak (5+ in a row), don't get greedy. Markets shift. Keep confidence calibrated. Don't abandon proven rules just because you got lucky.

VETO SIGNAL: Catalin can mark your picks as "I'd never take this" — these are 3x stronger negative training signals than losses. If you see "vetoed" in your rule adjustments history, that pattern was strongly disliked — avoid it harder than a normal loser.

When you deviate from rules, set deviatesFromRules=true and explain in deviationReason. Catalin will manually approve or reject — your reputation depends on whether your deviations win.

Output format: STRICT JSON only. No markdown, no preamble, no explanation outside JSON.`;

export function buildPickUserPrompt(input: PickPromptInput): string {
    const { ticker, expirationDate, dte, marketContext, aiState, candidates, weeklyMemo, catalinSubmission } = input;

    const research = selectRelevantResearch({
        vix: marketContext.vix,
        ivRank: marketContext.ivRank,
        dte,
        wings: candidates[0]?.wings ?? 10,
    });

    const candidatesStr = candidates.slice(0, 5).map((c, i) => `${i + 1}. IC ${c.putBuy}/${c.putSell}p ${c.callSell}/${c.callBuy}c | wings $${c.wings} | qty ${c.quantity} | credit $${c.credit.toFixed(2)} | POP ${c.pop.toFixed(1)}% | RR ${c.rr.toFixed(2)}:1 | EV $${c.ev.toFixed(2)} | score ${c.score.toFixed(2)} | δSP ${c.deltaShortPut.toFixed(3)} δSC ${c.deltaShortCall.toFixed(3)}`).join('\n');

    const ruleAdjStr = aiState.ruleAdjustments.length > 0
        ? aiState.ruleAdjustments.slice(0, 5).map((r) => `- ${r.id}: effect=${r.effect.toFixed(2)}, samples=${r.samplesSeen}, winRate=${(r.winRate * 100).toFixed(0)}%`).join('\n')
        : '(no learned adjustments yet — first runs)';

    const memoStr = weeklyMemo ?? '(no memo yet — first week of competition)';

    const catalinStr = catalinSubmission
        ? `Catalin already submitted: ${catalinSubmission.strategy}, POP ${catalinSubmission.pop}%, credit $${catalinSubmission.credit.toFixed(2)}, wings $${catalinSubmission.wings}.`
        : `Catalin has NOT submitted yet for this expiration (or this is a ghost round — you play solo).`;

    const bpeStr = input.bpePercentage !== undefined
        ? `\n- Account BPE used: ${input.bpePercentage.toFixed(1)}% of net liquidity (cap: 50% standard, 70% if VIX>22 + 16-delta picks)`
        : '';

    const tech = marketContext.technicals;
    const techStr = tech
        ? `
# Technical Context (daily close yesterday)
- RSI(14): ${tech.rsi.toFixed(1)} — ${tech.rsiVerdict.replace(/_/g, ' ')}
- BB position: ${tech.bbDistance >= 0 ? '+' : ''}${tech.bbDistance.toFixed(2)}σ from 20-day mid (${tech.bbVerdict.replace(/_/g, ' ')})
- ATR(14): ${tech.atr.toFixed(2)} — ${tech.atrVerdict}

Interpret these as RISK signals, NOT mechanical triggers.
- Elevated RSI (>70) + near upper band = reversal risk on CALL side → consider pulling calls slightly tighter
- Oversold RSI (<30) + near lower band = bounce risk on PUT side → consider pulling puts slightly tighter
- Elevated ATR = realized volatility high → consider wider wings (e.g. $15 instead of $10 on SPX)
Do NOT override structural rules (symmetric delta, credit-to-wing, min POP) unless a signal
is extreme (RSI >75 or <25, or |distanceσ| >2).`
        : `\n# Technical Context\n(no daily indicators available for this ticker — rely on structural rules)`;

    return `# Today's Round
- Date: ${new Date().toISOString().split('T')[0]}
- Ticker: ${ticker}
- Expiration: ${expirationDate} (${dte} DTE)
- Underlying price: $${marketContext.underlyingPrice.toFixed(2)}
- VIX: ${marketContext.vix.toFixed(2)}
- IV Rank: ${marketContext.ivRank.toFixed(0)}${bpeStr}${techStr}

# Catalin's Move
${catalinStr}

# Your Strategy State (round ${aiState.totalRounds + 1})
- Record so far: ${aiState.wins}W-${aiState.losses}L-${aiState.draws}D (${aiState.ghostRounds} ghost)
- Exploration rate: ${aiState.explorationRate.toFixed(3)}
- Top rule adjustments learned:
${ruleAdjStr}

# Last Week's Strategy Memo
${memoStr}

# Research Excerpts (TastyTrade studies, Options With Davis)
${research}

# Top 5 Candidates (rule-based picker)
${candidatesStr}

# Your Task
Select ONE candidate (by index 1-5) OR propose a custom variant.

Output STRICT JSON:
{
  "selection": 1 | 2 | 3 | 4 | 5 | "custom",
  "customStrategy": null OR { "putBuy": N, "putSell": N, "callSell": N, "callBuy": N, "wings": N, "quantity": N, "credit": N },
  "rationale": "3-5 sentences. Cite research and conditions. Explain WHY this candidate over the others.",
  "confidenceScore": 30-95 integer,
  "rulesApplied": ["seed_vix_gate_18", "research_wings_10_optimal", "exploration_top_2", ...],
  "deviatesFromRules": true | false,
  "deviationReason": null OR "string explaining the deviation and why it's worth Catalin's approval"
}`;
}

// ─── Weekly Reflect Prompts ──────────────────────────────────────────────────

export const REFLECT_SYSTEM_PROMPT = `You are Guvidul, reflecting on the past week of competition with Catalin.

Your job: produce a strategy memo that will be used as context for next week's IC picks. Be honest, specific, and actionable. No platitudes. Cite individual rounds by ID.

Format: plain markdown, ~500 words. Five sections:
1. **What worked** — patterns in winning picks
2. **What didn't** — common features in losses
3. **Adjustments for next week** — concrete changes (rule weight tweaks, conditions to avoid/seek)
4. **Open experiments** — things you want to test
5. **Catalin feedback integration** — how his ratings/comments change your approach`;

export function buildReflectUserPrompt(
    weekStart: string,
    weekEnd: string,
    rounds: ICompetitionRoundV2[],
    aiState: IAiState,
): string {
    const wins = rounds.filter((r) => r.winner === 'AI').length;
    const losses = rounds.filter((r) => r.winner === 'User').length;
    const draws = rounds.filter((r) => r.winner === 'Draw').length;
    const ghosts = rounds.filter((r) => r.ghost).length;

    const sumAiScore = rounds.reduce((s, r) => s + (r.aiScore ?? 0), 0);
    const sumUserScore = rounds.reduce((s, r) => s + (r.userScore ?? 0), 0);

    const roundSummaries = rounds.map((r) => {
        const ai = r.aiTrade;
        const userPart = r.userTrade
            ? `Catalin: ${r.userTrade.strategy} cr$${r.userTrade.credit.toFixed(2)} POP${r.userTrade.pop.toFixed(0)} → ${r.userTrade.exitPl !== null ? `$${r.userTrade.exitPl.toFixed(0)}` : 'open'}`
            : '(ghost — Catalin did not play)';
        const aiPart = `AI: ${ai.strategy} cr$${ai.credit.toFixed(2)} POP${ai.pop.toFixed(0)} wings$${ai.wings} VIX${r.marketContext.vix.toFixed(0)} → ${ai.exitPl !== null ? `$${ai.exitPl.toFixed(0)} (${ai.closedBy})` : 'open'}`;
        const feedback = (r as ICompetitionRoundV2 & { userFeedback?: { pickRating: number; rationaleRating: number; comment: string } }).userFeedback;
        const fbStr = feedback ? `Feedback: pick ${feedback.pickRating}/5, rationale ${feedback.rationaleRating}/5${feedback.comment ? ` — "${feedback.comment}"` : ''}` : '';
        return `[${r.id}] ${r.ticker} ${r.expirationDate} → winner: ${r.winner}\n  ${userPart}\n  ${aiPart}\n  AI rationale: ${ai.rationale.substring(0, 200)}${fbStr ? '\n  ' + fbStr : ''}`;
    }).join('\n\n');

    const ruleAdjStr = aiState.ruleAdjustments.length > 0
        ? aiState.ruleAdjustments.map((r) => `- ${r.id}: effect=${r.effect.toFixed(2)}, samples=${r.samplesSeen}, winRate=${(r.winRate * 100).toFixed(0)}%`).join('\n')
        : '(none yet)';

    return `# Reflection Period: ${weekStart} to ${weekEnd}

## Summary
- Rounds played: ${rounds.length}
- AI wins: ${wins} (cumulative score: ${sumAiScore.toFixed(3)})
- AI losses (Catalin wins): ${losses} (Catalin's score: ${sumUserScore.toFixed(3)})
- Draws: ${draws}
- Ghost rounds: ${ghosts}

## Round Details
${roundSummaries.length > 0 ? roundSummaries : '(no rounds this week)'}

## Current Rule Adjustments
${ruleAdjStr}

## Your task
Write the memo. Format markdown. Maximum 600 words. Be specific and cite rounds by [round_id].`;
}

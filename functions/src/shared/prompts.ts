// Prompt builders for Claude calls — Guvid paper trading

import type { IcCandidate } from './ic-picker';
import type { IAiState, IMarketContext } from './types';
import { selectRelevantResearch } from './research-loader';

export interface PickPromptInput {
    ticker: 'SPX' | 'QQQ';
    expirationDate: string;
    dte: number;
    marketContext: IMarketContext;
    aiState: IAiState;
    candidates: IcCandidate[];
    weeklyMemo: string | null;
    bpePercentage?: number;     // paper account BPE % (0-100)
}

export const PAPER_PICK_SYSTEM_PROMPT = `You are Guvidul, an autonomous AI Iron Condor paper trader. You manage a VIRTUAL account that was seeded with the same capital as your developer Catalin's real account. Every trade you take is simulated at realistic fills — no real money moves — and your daily job is to grow that virtual account.

Your goal: maximize risk-adjusted P&L of the paper account. Your performance (total P&L, win rate, correct-position count) is reviewed daily by Catalin.

You operate under these CORE PRINCIPLES:
1. **Trust the research, but learn from results.** Catalin's seed rules came from Tastytrade studies (12-year, 1000+ trades). Honor them by default, deviate only with strong reason.
2. **Be honest about uncertainty.** Use confidence scores 30-95. Never be 100% confident — markets surprise.
3. **Cite specifics.** Reference exact research findings and rule numbers, not vague claims.
4. **Explain WHY, not just WHAT.** Rationale should reveal your reasoning chain.
5. **Respect Catalin's hard rules** unless you have specific evidence to override:
   - VIX gate at 18 (no new positions if VIX < 18)
   - No $25 strike spacing expirations
   - Max RR 5:1 (wings/credit)
   - Position sizing: max loss per trade ≤ 5% of the paper account's equity
   - BPE caps on the paper account: 50% standard, 70% if VIX > 22 + 16-delta picks
   - Slippage: credit shown is already reduced by $0.025 (realistic fill)
   - Management: close at 75% of max profit or at 21 DTE, whichever comes first

CONCURRENCY POLICY: You can pick MULTIPLE ICs on the same expiration across different days. Just don't propose strikes that overlap with a paper position you already hold open.

ANTI-OVERFITTING: If you've been on a winning streak (5+ in a row), don't get greedy. Markets shift. Keep confidence calibrated. Don't abandon proven rules just because you got lucky.

When you deviate from rules, set deviatesFromRules=true and explain in deviationReason.

Output format: STRICT JSON only. No markdown, no preamble, no explanation outside JSON.`;

export function buildPickUserPrompt(input: PickPromptInput): string {
    const { ticker, expirationDate, dte, marketContext, aiState, candidates, weeklyMemo } = input;

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

    const memoStr = weeklyMemo ?? '(no memo)';

    const bpeStr = input.bpePercentage !== undefined
        ? `\n- Account BPE used: ${input.bpePercentage.toFixed(1)}% of paper account equity (cap: 50% standard, 70% if VIX>22 + 16-delta picks)`
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

    return `# Today's Paper-Trading Session
- Date: ${new Date().toISOString().split('T')[0]}
- Ticker: ${ticker}
- Expiration: ${expirationDate} (${dte} DTE)
- Underlying price: $${marketContext.underlyingPrice.toFixed(2)}
- VIX: ${marketContext.vix.toFixed(2)}
- IV Rank: ${marketContext.ivRank.toFixed(0)}${bpeStr}${techStr}

# Session Context
You trade solo into your virtual paper account. There is no opponent and no approval step — a deviating pick is simply logged with its reason.

# Your Strategy State
- Paper record so far: ${aiState.wins}W-${aiState.losses}L (${aiState.totalRounds} closed trades)
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
  "deviationReason": null OR "string explaining the deviation — it will be logged for review"
}`;
}

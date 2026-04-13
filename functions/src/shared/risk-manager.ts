// Risk Manager agent (Sonnet) — reviews Picker's choice
// Sequential: Picker → Risk → Final
// Outputs: APPROVE | MODIFY | REJECT with reason

import { callClaude, extractJson, BudgetExceededError } from './llm-client';
import type { IAiCompetitionTrade, IMarketContext, IAiState } from './types';
import type { IcCandidate } from './ic-picker';

const RISK_SYSTEM_PROMPT = `You are the Risk Manager for Guvidul, an AI Iron Condor trader. Your job is to review the Picker agent's selection BEFORE it goes live.

Your role is the SECOND OPINION. You're skeptical by default. You catch:
- Setups that violate Catalin's hard rules (VIX gate, BPE caps, slippage assumptions)
- Picks that look good in isolation but are risky in current conditions
- Over-confidence (Picker claims 90% certainty but evidence is thin)
- Position sizing errors (too many contracts for current BPE)
- Concurrency issues (overlapping with existing positions in danger zones)

You can:
- **APPROVE**: Picker's choice stands. Default if no concerns.
- **MODIFY**: Suggest a smaller size or different strikes. Picker uses a fallback if you reject.
- **REJECT**: Strong veto. Round becomes a skip (Picker's choice rolls back to ghost or no-action).

Output STRICT JSON only:
{
  "verdict": "APPROVE" | "MODIFY" | "REJECT",
  "reason": "1-3 sentences explaining your assessment",
  "concerns": ["concern1", "concern2"],
  "confidence": 30-95,
  "modifySuggestion": null OR { "quantity": N, "alternativeIndex": 1-5 }
}

Be conservative but not paranoid. Most Picker choices should be APPROVE. Reject only when there's a clear violation or material risk.`;

interface RiskResponse {
    verdict: 'APPROVE' | 'MODIFY' | 'REJECT';
    reason: string;
    concerns: string[];
    confidence: number;
    modifySuggestion: { quantity?: number; alternativeIndex?: number } | null;
}

export interface RiskReviewResult {
    verdict: 'APPROVE' | 'MODIFY' | 'REJECT';
    reason: string;
    concerns: string[];
    confidence: number;
    modifySuggestion: { quantity?: number; alternativeIndex?: number } | null;
    auditLogId?: string;
    fallback: 'none' | 'budget' | 'parse_error' | 'api_error';
}

export async function reviewPick(
    uid: string,
    pickerTrade: IAiCompetitionTrade,
    marketContext: IMarketContext,
    aiState: IAiState,
    bpePercentage: number | undefined,
    candidates: IcCandidate[],
): Promise<RiskReviewResult> {
    const candidatesStr = candidates.slice(0, 5).map((c, i) =>
        `${i + 1}. ${c.putBuy}/${c.putSell}p ${c.callSell}/${c.callBuy}c | wings $${c.wings} | qty ${c.quantity} | credit $${c.credit.toFixed(2)} | POP ${c.pop.toFixed(1)}% | RR ${c.rr.toFixed(2)}:1`
    ).join('\n');

    const userPrompt = `# Picker's Selection
Strategy: ${pickerTrade.strategy}
Wings: $${pickerTrade.wings}
Credit: $${pickerTrade.credit}
Quantity: ${pickerTrade.quantity}
POP: ${pickerTrade.pop}%
RR: ${pickerTrade.rr}:1
Picker's confidence: ${pickerTrade.confidenceScore}%
Picker's rationale: "${pickerTrade.rationale}"
Deviates from rules: ${pickerTrade.deviatesFromRules ? `YES — ${pickerTrade.deviationReason}` : 'no'}

# Market Conditions
- Underlying: $${marketContext.underlyingPrice.toFixed(2)}
- VIX: ${marketContext.vix.toFixed(2)}
- IV Rank: ${marketContext.ivRank.toFixed(0)}
${bpePercentage !== undefined ? `- Account BPE used: ${bpePercentage.toFixed(1)}% of net liq` : ''}

# Catalin's Hard Rules
- VIX gate: VIX must be ≥ 18 (currently ${marketContext.vix.toFixed(1)})
- BPE caps: 50% standard, 70% if VIX > 22 + 16-delta picks, 80% absolute
- Max RR: 5:1 (wings/credit)
- Min POP: 70% default, 60% if VIX-crunch + $5 wings
- No $25 strike spacing weeklies

# AI's Recent Performance (for context)
- Total rounds: ${aiState.totalRounds}
- Win/Loss/Draw: ${aiState.wins}-${aiState.losses}-${aiState.draws}
- Recent rule adjustments: ${aiState.ruleAdjustments.slice(0, 3).map((r) => `${r.id}(${r.effect.toFixed(2)})`).join(', ') || 'none'}

# Other Top Candidates (you can suggest one as MODIFY)
${candidatesStr}

# Your Task
Review Picker's choice. Output JSON verdict.`;

    try {
        const result = await callClaude(RISK_SYSTEM_PROMPT, userPrompt, {
            uid,
            function: 'aiDailySubmit',
            purpose: 'risk_review',
            agent: 'risk',
            metadata: { pickerStrategy: pickerTrade.strategy, pickerConfidence: pickerTrade.confidenceScore },
        }, {
            model: 'claude-sonnet-4-6',
            maxTokens: 800,
            temperature: 0.2,
        });

        const parsed = extractJson<RiskResponse>(result.text);
        if (!parsed || !parsed.verdict) {
            console.warn('[risk-manager] Could not parse response, defaulting to APPROVE');
            return {
                verdict: 'APPROVE',
                reason: 'Risk review unparseable — defaulted to approve.',
                concerns: [],
                confidence: 50,
                modifySuggestion: null,
                auditLogId: result.auditLogId,
                fallback: 'parse_error',
            };
        }

        return {
            verdict: parsed.verdict,
            reason: parsed.reason || '(no reason given)',
            concerns: parsed.concerns || [],
            confidence: Math.max(30, Math.min(95, Math.round(parsed.confidence ?? 50))),
            modifySuggestion: parsed.modifySuggestion ?? null,
            auditLogId: result.auditLogId,
            fallback: 'none',
        };
    } catch (e) {
        if (e instanceof BudgetExceededError) {
            console.warn('[risk-manager] Budget exceeded, defaulting to APPROVE');
            return {
                verdict: 'APPROVE', reason: 'Budget exceeded — risk review skipped.',
                concerns: [], confidence: 50, modifySuggestion: null, fallback: 'budget',
            };
        }
        console.error('[risk-manager] API error, defaulting to APPROVE:', e);
        return {
            verdict: 'APPROVE', reason: `Risk review failed (${e instanceof Error ? e.message : 'unknown'}) — defaulted to approve.`,
            concerns: [], confidence: 50, modifySuggestion: null, fallback: 'api_error',
        };
    }
}

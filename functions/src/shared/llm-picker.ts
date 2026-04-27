// Bridge between rule-based ic-picker and Claude Opus
// Takes top candidates → asks Claude to select → returns final IAiCompetitionTrade

import { callClaude, extractJson, BudgetExceededError } from './llm-client';
import { PICK_SYSTEM_PROMPT, buildPickUserPrompt, type PickPromptInput } from './prompts';
import { candidateToTrade, type IcCandidate, type CandidatesResult } from './ic-picker';
import { reviewPick, type RiskReviewResult } from './risk-manager';
import { buildProvestBlock, probTouch } from './metrics';
import type { IAiCompetitionTrade, IAiState, IAlternativeCandidate, ICompetitionTradeV2, IMarketContext } from './types';

/** Pull the top alternatives (excluding the chosen one) for counterfactual tracking. */
function buildAlternatives(allTopN: IcCandidate[], chosen: IcCandidate, max = 3): IAlternativeCandidate[] {
    return allTopN
        .filter((c) => c !== chosen && (c.putSell !== chosen.putSell || c.callSell !== chosen.callSell))
        .slice(0, max)
        .map((c) => ({
            strikes: { putBuy: c.putBuy, putSell: c.putSell, callSell: c.callSell, callBuy: c.callBuy },
            wings: c.wings,
            quantity: c.quantity,
            credit: Math.round(c.credit * 100) / 100,
            pop: Math.round(c.pop * 10) / 10,
            ev: Math.round(c.ev * 100) / 100,
            rr: Math.round(c.rr * 100) / 100,
            deltaShortPut: Math.round(c.deltaShortPut * 100) / 100,
            deltaShortCall: Math.round(c.deltaShortCall * 100) / 100,
            score: Math.round(c.score * 100) / 100,
        }));
}

/** Build PROVEST prelude from a selected IcCandidate + market context. Skip for custom (deltas unknown). */
function provestFor(
    chosen: IcCandidate,
    ticker: 'SPX' | 'QQQ',
    marketContext: IMarketContext,
    dte: number,
): string | null {
    if (chosen.deltaShortPut === 0 && chosen.deltaShortCall === 0) return null;
    return buildProvestBlock({
        pop: chosen.pop,
        probTouch: probTouch(chosen.deltaShortPut, chosen.deltaShortCall),
        compositeScore: chosen.score,
        profileName: 'Neutral',
        wings: chosen.wings,
        minDelta: 16,      // Picker default range for symmetric delta
        maxDelta: 20,
        shortPutDelta: chosen.deltaShortPut,
        shortCallDelta: chosen.deltaShortCall,
        vix: marketContext.vix,
        ticker,
        ivRank: marketContext.ivRank,
        dte,
        dteManagement: 14,
    });
}

interface ClaudePickResponse {
    selection: number | 'custom';
    customStrategy?: {
        putBuy: number;
        putSell: number;
        callSell: number;
        callBuy: number;
        wings: number;
        quantity: number;
        credit: number;
    } | null;
    rationale: string;
    confidenceScore: number;
    rulesApplied: string[];
    deviatesFromRules: boolean;
    deviationReason: string | null;
}

export interface LlmPickResult {
    trade: IAiCompetitionTrade | null;
    reason: string;
    fallback: 'none' | 'rule_based' | 'budget_exceeded' | 'no_candidates' | 'risk_rejected';
    auditLogId?: string;
    riskReview?: RiskReviewResult;
}

/**
 * Use Claude Opus to select among candidates. Falls back to rule-based pick if LLM fails.
 */
export async function pickWithLlm(
    uid: string,
    ticker: 'SPX' | 'QQQ',
    expirationDate: string,
    dte: number,
    marketContext: IMarketContext,
    aiState: IAiState,
    candidatesResult: CandidatesResult,
    weeklyMemo: string | null,
    catalinSubmission: ICompetitionTradeV2 | null,
    bpePercentage?: number,
): Promise<LlmPickResult> {
    if (candidatesResult.topN.length === 0) {
        return { trade: null, reason: candidatesResult.reason, fallback: 'no_candidates' };
    }

    // Build prompt
    const pickInput: PickPromptInput = {
        ticker,
        expirationDate,
        dte,
        marketContext,
        aiState,
        candidates: candidatesResult.topN,
        weeklyMemo,
        catalinSubmission: catalinSubmission ? {
            strategy: catalinSubmission.strategy,
            pop: catalinSubmission.pop,
            credit: catalinSubmission.credit,
            wings: catalinSubmission.wings,
        } : null,
        bpePercentage,
    };
    const userPrompt = buildPickUserPrompt(pickInput);

    let claudeResponse: { text: string; auditLogId: string };
    try {
        const result = await callClaude(PICK_SYSTEM_PROMPT, userPrompt, {
            uid,
            function: 'aiDailySubmit',
            purpose: 'round_pick',
            agent: 'picker',
            metadata: { ticker, expirationDate, dte },
        }, {
            model: 'claude-opus-4-6',
            maxTokens: 2500,
            temperature: 0.3,
            enableWebSearch: true,
            webSearchMaxUses: 2,
        });
        claudeResponse = { text: result.text, auditLogId: result.auditLogId };
    } catch (e) {
        if (e instanceof BudgetExceededError) {
            console.warn('[llm-picker] Budget exceeded — falling back to rule-based pick');
            return { trade: ruleBasedFallback(candidatesResult, ticker, expirationDate, marketContext), reason: 'Budget exceeded — used rule-based pick', fallback: 'budget_exceeded' };
        }
        console.error('[llm-picker] Claude call failed:', e);
        return { trade: ruleBasedFallback(candidatesResult, ticker, expirationDate, marketContext), reason: `LLM failed: ${e instanceof Error ? e.message : 'unknown'}`, fallback: 'rule_based' };
    }

    const parsed = extractJson<ClaudePickResponse>(claudeResponse.text);
    if (!parsed || (typeof parsed.selection !== 'number' && parsed.selection !== 'custom')) {
        console.error('[llm-picker] Could not parse Claude response. Falling back. Raw:', claudeResponse.text.substring(0, 500));
        return { trade: ruleBasedFallback(candidatesResult, ticker, expirationDate, marketContext), reason: 'LLM response unparseable — used rule-based pick', fallback: 'rule_based', auditLogId: claudeResponse.auditLogId };
    }

    // Build trade from Claude's selection
    let chosen: IcCandidate | null = null;
    let isCustom = false;

    if (parsed.selection === 'custom' && parsed.customStrategy) {
        const cs = parsed.customStrategy;
        const wingWidth = cs.wings;
        const maxProfit = cs.credit * 100 * cs.quantity;
        const maxLoss = (wingWidth - cs.credit) * 100 * cs.quantity;
        chosen = {
            wings: wingWidth,
            putBuy: cs.putBuy, putSell: cs.putSell,
            callSell: cs.callSell, callBuy: cs.callBuy,
            credit: cs.credit, quantity: cs.quantity,
            maxProfit, maxLoss,
            pop: 0,        // unknown for custom — Claude should fill via rationale
            ev: 0, alpha: 0,
            rr: wingWidth / cs.credit,
            deltaShortPut: 0, deltaShortCall: 0, thetaTotal: 0,
            symmetric: true, score: 0,
        };
        isCustom = true;
    } else if (typeof parsed.selection === 'number') {
        const idx = parsed.selection - 1;
        if (idx >= 0 && idx < candidatesResult.topN.length) {
            chosen = candidatesResult.topN[idx];
        }
    }

    if (!chosen) {
        console.error('[llm-picker] Invalid selection index from Claude. Falling back.');
        return { trade: ruleBasedFallback(candidatesResult, ticker, expirationDate, marketContext), reason: 'LLM invalid selection — used rule-based pick', fallback: 'rule_based', auditLogId: claudeResponse.auditLogId };
    }

    const baseTrade = candidateToTrade(chosen, ticker, expirationDate);
    const provest = provestFor(chosen, ticker, marketContext, dte);
    const claudeRationale = parsed.rationale || `Claude selected option ${parsed.selection}`;
    const alternatives = isCustom ? [] : buildAlternatives(candidatesResult.topN, chosen, 3);
    let trade: IAiCompetitionTrade = {
        ...baseTrade,
        rationale: provest ? `${provest}\n\n${claudeRationale}` : claudeRationale,
        confidenceScore: Math.max(30, Math.min(95, Math.round(parsed.confidenceScore))),
        rulesApplied: parsed.rulesApplied || [],
        experimentVariant: null,
        alternativesConsidered: alternatives,
        llmModel: 'claude-opus-4-6',
        llmAuditLogId: claudeResponse.auditLogId,
        deviatesFromRules: parsed.deviatesFromRules ?? false,
        deviationReason: parsed.deviationReason ?? null,
        requiresApproval: parsed.deviatesFromRules && parsed.confidenceScore >= 70,
        approvalStatus: parsed.deviatesFromRules && parsed.confidenceScore >= 70 ? 'pending' : undefined,
        approvedAt: null,
        customStrategy: isCustom,
    };

    // ─── Phase 2: Risk Manager review ───────────────────────────
    const riskReview = await reviewPick(uid, trade, marketContext, aiState, bpePercentage, candidatesResult.topN);

    // Append risk verdict to trade rationale + rules + structured fields
    trade = {
        ...trade,
        rationale: `${trade.rationale}\n\n[Risk Manager — ${riskReview.verdict}]: ${riskReview.reason}`,
        rulesApplied: [...trade.rulesApplied, `risk_verdict_${riskReview.verdict.toLowerCase()}`],
        riskVerdict: riskReview.verdict,
        riskReason: riskReview.reason,
        riskConcerns: riskReview.concerns,
        riskConfidence: riskReview.confidence,
        riskAuditLogId: riskReview.auditLogId,
    };

    if (riskReview.verdict === 'REJECT') {
        // Risk vetoed — fall back to rule-based top candidate (still log Claude's choice for audit)
        console.warn(`[llm-picker] Risk REJECTED Picker's choice. Reason: ${riskReview.reason}`);
        return {
            trade: null,
            reason: `Risk Manager rejected: ${riskReview.reason}`,
            fallback: 'risk_rejected',
            auditLogId: claudeResponse.auditLogId,
            riskReview,
        };
    }

    if (riskReview.verdict === 'MODIFY' && riskReview.modifySuggestion) {
        // Apply modification: lower quantity or swap to alternative candidate
        const mod = riskReview.modifySuggestion;
        if (mod.alternativeIndex && mod.alternativeIndex >= 1 && mod.alternativeIndex <= candidatesResult.topN.length) {
            const altCand = candidatesResult.topN[mod.alternativeIndex - 1];
            const altBase = candidateToTrade(altCand, ticker, expirationDate);
            trade = {
                ...trade,
                ...altBase,
                rationale: trade.rationale + ` Risk swapped to candidate #${mod.alternativeIndex}.`,
            };
        }
        if (mod.quantity && mod.quantity > 0 && mod.quantity < trade.quantity) {
            const oldQty = trade.quantity;
            const ratio = mod.quantity / oldQty;
            trade = {
                ...trade,
                quantity: mod.quantity,
                maxProfit: Math.round(trade.maxProfit * ratio * 100) / 100,
                maxLoss: Math.round(trade.maxLoss * ratio * 100) / 100,
                rationale: trade.rationale + ` Risk reduced qty ${oldQty}→${mod.quantity}.`,
            };
        }
    }

    return {
        trade,
        reason: `Picker→Risk: ${isCustom ? 'custom' : `option ${parsed.selection}`} ${riskReview.verdict} (Picker conf ${trade.confidenceScore}, Risk conf ${riskReview.confidence})`,
        fallback: 'none',
        auditLogId: claudeResponse.auditLogId,
        riskReview,
    };
}

function ruleBasedFallback(
    cr: CandidatesResult,
    ticker: 'SPX' | 'QQQ',
    expirationDate: string,
    marketCtx: IMarketContext,
): IAiCompetitionTrade | null {
    if (cr.topN.length === 0) return null;
    const best = cr.topN[0];
    const base = candidateToTrade(best, ticker, expirationDate);
    const dte = Math.max(0, Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 86400000));
    const provest = provestFor(best, ticker, marketCtx, dte);
    const alternatives = buildAlternatives(cr.topN, best, 3);
    const fallbackReason = 'LLM unavailable — rule-based fallback selected highest-scoring candidate.';
    return {
        ...base,
        rationale: provest ? `${provest}\n\n${fallbackReason}` : fallbackReason,
        confidenceScore: 50,
        rulesApplied: ['rule_based_fallback'],
        experimentVariant: null,
        llmModel: 'rule-based-fallback',
        deviatesFromRules: false,
        deviationReason: null,
        requiresApproval: false,
        customStrategy: false,
        alternativesConsidered: alternatives,
    };
}

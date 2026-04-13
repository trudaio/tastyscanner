// Bridge between rule-based ic-picker and Claude Opus
// Takes top candidates → asks Claude to select → returns final IAiCompetitionTrade

import { callClaude, extractJson, BudgetExceededError } from './llm-client';
import { PICK_SYSTEM_PROMPT, buildPickUserPrompt, type PickPromptInput } from './prompts';
import { candidateToTrade, type IcCandidate, type CandidatesResult } from './ic-picker';
import type { IAiCompetitionTrade, IAiState, ICompetitionTradeV2, IMarketContext } from './types';

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
    fallback: 'none' | 'rule_based' | 'budget_exceeded' | 'no_candidates';
    auditLogId?: string;
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
            metadata: { ticker, expirationDate, dte },
        }, { maxTokens: 1500, temperature: 0.3 });
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
    const trade: IAiCompetitionTrade = {
        ...baseTrade,
        rationale: parsed.rationale || `Claude selected option ${parsed.selection}`,
        confidenceScore: Math.max(30, Math.min(95, Math.round(parsed.confidenceScore))),
        rulesApplied: parsed.rulesApplied || [],
        experimentVariant: null,
        llmModel: 'claude-opus-4-6',
        llmAuditLogId: claudeResponse.auditLogId,
        deviatesFromRules: parsed.deviatesFromRules ?? false,
        deviationReason: parsed.deviationReason ?? null,
        requiresApproval: parsed.deviatesFromRules && parsed.confidenceScore >= 70,
        approvalStatus: parsed.deviatesFromRules && parsed.confidenceScore >= 70 ? 'pending' : undefined,
        approvedAt: null,
        customStrategy: isCustom,
    };

    return {
        trade,
        reason: `Claude picked ${isCustom ? 'custom' : `option ${parsed.selection}`} with confidence ${trade.confidenceScore}`,
        fallback: 'none',
        auditLogId: claudeResponse.auditLogId,
    };
}

function ruleBasedFallback(
    cr: CandidatesResult,
    ticker: 'SPX' | 'QQQ',
    expirationDate: string,
    _marketCtx: IMarketContext,
): IAiCompetitionTrade | null {
    if (cr.topN.length === 0) return null;
    const best = cr.topN[0];
    const base = candidateToTrade(best, ticker, expirationDate);
    return {
        ...base,
        rationale: 'LLM unavailable — rule-based fallback selected highest-scoring candidate.',
        confidenceScore: 50,
        rulesApplied: ['rule_based_fallback'],
        experimentVariant: null,
        llmModel: 'rule-based-fallback',
        deviatesFromRules: false,
        deviationReason: null,
        requiresApproval: false,
        customStrategy: false,
    };
}

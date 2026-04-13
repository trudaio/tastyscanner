// Anthropic Claude Opus client for Guvid agent
// - Retries with exponential backoff
// - Daily budget cap enforcement (default $5)
// - Audit log to Firestore for every call

import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

export type ModelName = 'claude-opus-4-6' | 'claude-sonnet-4-6';
export type AgentRole = 'picker' | 'risk' | 'learner' | 'manual';

// Pricing per model (Apr 2026): per 1M tokens
const MODEL_PRICING: Record<ModelName, { input: number; output: number }> = {
    'claude-opus-4-6': { input: 15, output: 75 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
};

const DEFAULT_DAILY_BUDGET_USD = 10.0;

export interface LlmCallContext {
    uid: string;
    function: 'aiDailySubmit' | 'weeklyReflect' | 'manual';
    purpose: 'round_pick' | 'risk_review' | 'weekly_memo' | 'test';
    agent: AgentRole;
    metadata?: Record<string, unknown>;
}

export interface LlmCallResult {
    text: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    auditLogId: string;
}

export class BudgetExceededError extends Error {
    constructor(currentSpend: number, cap: number) {
        super(`Daily budget exceeded: spent $${currentSpend.toFixed(4)} >= cap $${cap.toFixed(2)}`);
        this.name = 'BudgetExceededError';
    }
}

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

/** Get total Claude spend today for a user */
async function getTodaySpendUsd(uid: string): Promise<number> {
    const today = todayStr();
    const snap = await admin.firestore()
        .collection('users').doc(uid)
        .collection('aiAuditLog')
        .where('date', '==', today)
        .get();
    let total = 0;
    for (const d of snap.docs) {
        total += (d.data().costUsd as number) || 0;
    }
    return total;
}

/** Get configured daily budget for a user (or default) */
async function getDailyBudget(uid: string): Promise<number> {
    const doc = await admin.firestore()
        .collection('users').doc(uid)
        .collection('aiState').doc('current').get();
    if (doc.exists) {
        const cap = (doc.data() as { dailyBudgetUsd?: number }).dailyBudgetUsd;
        if (typeof cap === 'number' && cap > 0) return cap;
    }
    return DEFAULT_DAILY_BUDGET_USD;
}

/**
 * Call Claude with retries + budget enforcement + audit log.
 * Supports per-call model selection and optional web search tool use.
 * @throws BudgetExceededError if daily cap reached
 */
export async function callClaude(
    systemPrompt: string,
    userPrompt: string,
    ctx: LlmCallContext,
    opts: {
        model?: ModelName;
        maxTokens?: number;
        temperature?: number;
        enableWebSearch?: boolean;
        webSearchMaxUses?: number;
    } = {},
): Promise<LlmCallResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set in environment');
    }

    const model: ModelName = opts.model ?? 'claude-opus-4-6';
    const pricing = MODEL_PRICING[model];

    // Budget check
    const [spent, budget] = await Promise.all([
        getTodaySpendUsd(ctx.uid),
        getDailyBudget(ctx.uid),
    ]);
    if (spent >= budget) {
        throw new BudgetExceededError(spent, budget);
    }

    const client = new Anthropic({ apiKey });

    // Build request — add web_search tool if enabled
    const tools: Array<{ type: string; name: string; max_uses?: number }> = [];
    if (opts.enableWebSearch) {
        tools.push({
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: opts.webSearchMaxUses ?? 3,
        });
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await client.messages.create({
                model,
                max_tokens: opts.maxTokens ?? 4000,
                temperature: opts.temperature ?? 0.3,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                ...(tools.length > 0 ? { tools: tools as Anthropic.Messages.Tool[] } : {}),
            });

            // Extract text from all text blocks (web_search results may insert tool_use blocks between)
            const textParts: string[] = [];
            for (const block of response.content) {
                if (block.type === 'text') textParts.push(block.text);
            }
            const text = textParts.join('\n');

            const inputTokens = response.usage.input_tokens;
            const outputTokens = response.usage.output_tokens;
            // Web search: $10 per 1k searches = $0.01 per search
            const webSearchCalls = response.content.filter((b) => b.type === 'server_tool_use').length;
            const webSearchCost = webSearchCalls * 0.01;
            const costUsd = inputTokens * (pricing.input / 1_000_000) + outputTokens * (pricing.output / 1_000_000) + webSearchCost;

            // Write audit log
            const auditEntry = {
                date: todayStr(),
                timestamp: new Date().toISOString(),
                function: ctx.function,
                purpose: ctx.purpose,
                agent: ctx.agent,
                model,
                inputTokens,
                outputTokens,
                webSearchCalls,
                costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
                rawSystemPrompt: systemPrompt.substring(0, 8000),
                rawUserPrompt: userPrompt.substring(0, 8000),
                rawResponse: text.substring(0, 8000),
                metadata: ctx.metadata ?? {},
            };
            const auditRef = await admin.firestore()
                .collection('users').doc(ctx.uid)
                .collection('aiAuditLog')
                .add(auditEntry);

            return {
                text,
                inputTokens,
                outputTokens,
                costUsd,
                auditLogId: auditRef.id,
            };
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            const msg = lastError.message;
            if (msg.includes('429') || msg.includes('overloaded') || msg.includes('timeout')) {
                const wait = Math.pow(2, attempt) * 1000;
                console.warn(`[llm-client] Attempt ${attempt + 1} failed (${msg}), retrying in ${wait}ms`);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            throw lastError;
        }
    }
    throw lastError ?? new Error('All Claude retry attempts failed');
}

/** Parse JSON from Claude's response, tolerant of code fences and surrounding text */
export function extractJson<T>(text: string): T | null {
    // Try direct parse
    try { return JSON.parse(text) as T; } catch { /* fall through */ }

    // Try fenced block ```json ... ```
    const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]) as T; } catch { /* fall through */ }
    }

    // Try to extract balanced braces starting from first `{`
    // (avoids greedy regex matching across multiple objects or noise)
    const firstBrace = text.indexOf('{');
    if (firstBrace >= 0) {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = firstBrace; i < text.length; i++) {
            const ch = text[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"' && !escape) { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const candidate = text.substring(firstBrace, i + 1);
                    try { return JSON.parse(candidate) as T; } catch { return null; }
                }
            }
        }
    }

    return null;
}

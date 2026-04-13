// Anthropic Claude Opus client for Guvid agent
// - Retries with exponential backoff
// - Daily budget cap enforcement (default $5)
// - Audit log to Firestore for every call

import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-6';

// Anthropic Opus pricing (Apr 2026): $15 per 1M input tokens, $75 per 1M output tokens
const COST_INPUT_PER_TOKEN = 15 / 1_000_000;
const COST_OUTPUT_PER_TOKEN = 75 / 1_000_000;
const DEFAULT_DAILY_BUDGET_USD = 5.0;

export interface LlmCallContext {
    uid: string;
    function: 'aiDailySubmit' | 'weeklyReflect' | 'manual';
    purpose: 'round_pick' | 'weekly_memo' | 'test';
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
 * @throws BudgetExceededError if daily cap reached
 */
export async function callClaude(
    systemPrompt: string,
    userPrompt: string,
    ctx: LlmCallContext,
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<LlmCallResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set in environment');
    }

    // Budget check
    const [spent, budget] = await Promise.all([
        getTodaySpendUsd(ctx.uid),
        getDailyBudget(ctx.uid),
    ]);
    if (spent >= budget) {
        throw new BudgetExceededError(spent, budget);
    }

    const client = new Anthropic({ apiKey });

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: opts.maxTokens ?? 4000,
                temperature: opts.temperature ?? 0.3,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            });

            const textBlock = response.content.find((b) => b.type === 'text');
            const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

            const inputTokens = response.usage.input_tokens;
            const outputTokens = response.usage.output_tokens;
            const costUsd = inputTokens * COST_INPUT_PER_TOKEN + outputTokens * COST_OUTPUT_PER_TOKEN;

            // Write audit log
            const auditEntry = {
                date: todayStr(),
                timestamp: new Date().toISOString(),
                function: ctx.function,
                purpose: ctx.purpose,
                model: MODEL,
                inputTokens,
                outputTokens,
                costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
                rawSystemPrompt: systemPrompt.substring(0, 8000), // truncate huge prompts
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
            // Retry on transient errors only
            if (msg.includes('429') || msg.includes('overloaded') || msg.includes('timeout')) {
                const wait = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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

    // Try first {...} block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
        try { return JSON.parse(braceMatch[0]) as T; } catch { /* fall through */ }
    }

    return null;
}

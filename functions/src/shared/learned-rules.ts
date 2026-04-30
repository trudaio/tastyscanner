// Helpers for managing IAiState.learnedRules — the LLM-suggested rules
// surfaced from post-mortems (per-loss) and adversarial reviews (weekly).

import type { ILearnedRule } from './types';

/**
 * Upsert a learned rule into the existing list.
 * - If ruleId exists: bump reinforceCount + reinforcedAt + extend evidence sets.
 * - If new: append, then prune to 30 most-recent by reinforcedAt.
 *
 * Evidence:
 *  - 'round' → tracks roundId in sampleRoundIds (last 5)
 *  - 'week'  → tracks weekId in weekIds (last 8)
 */
export function upsertLearnedRule(
    existing: ILearnedRule[] | undefined,
    incoming: Omit<ILearnedRule, 'reinforcedAt' | 'reinforceCount' | 'addedAt'> & { addedAt?: string },
    evidenceId: string,
    evidenceType: 'round' | 'week',
): ILearnedRule[] {
    const list = [...(existing ?? [])];
    const now = new Date().toISOString();
    const idx = list.findIndex((r) => r.ruleId === incoming.ruleId);
    if (idx >= 0) {
        const r = list[idx];
        const sampleSet = new Set(r.sampleRoundIds ?? []);
        const weekSet = new Set(r.weekIds ?? []);
        if (evidenceType === 'round') sampleSet.add(evidenceId);
        else weekSet.add(evidenceId);
        list[idx] = {
            ...r,
            severity: incoming.severity,
            rule: incoming.rule,
            source: incoming.source,
            reinforcedAt: now,
            reinforceCount: r.reinforceCount + 1,
            sampleRoundIds: Array.from(sampleSet).slice(-5),
            weekIds: Array.from(weekSet).slice(-8),
        };
    } else {
        list.push({
            ...incoming,
            addedAt: incoming.addedAt ?? now,
            reinforcedAt: now,
            reinforceCount: 1,
            sampleRoundIds: evidenceType === 'round' ? [evidenceId] : [],
            weekIds: evidenceType === 'week' ? [evidenceId] : [],
        });
    }
    list.sort((a, b) => b.reinforcedAt.localeCompare(a.reinforcedAt));
    return list.slice(0, 30);
}

/**
 * Format learned rules for the picker prompt.
 * Returns a string ready to paste into the LLM context, or empty string if none.
 */
export function formatLearnedRulesForPrompt(rules: ILearnedRule[] | undefined): string {
    if (!rules || rules.length === 0) return '';
    // Sort: high severity first, then by reinforce count desc
    const sorted = [...rules].sort((a, b) => {
        const sevOrder = { high: 0, medium: 1, low: 2 };
        if (sevOrder[a.severity] !== sevOrder[b.severity]) {
            return sevOrder[a.severity] - sevOrder[b.severity];
        }
        return b.reinforceCount - a.reinforceCount;
    });
    const lines = sorted.slice(0, 12).map((r) => {
        const tag = r.source === 'adversarial' ? '🔴' : '⚠️';
        return `- ${tag} [${r.severity}, x${r.reinforceCount}] ${r.rule}  (id=${r.ruleId})`;
    });
    return lines.join('\n');
}

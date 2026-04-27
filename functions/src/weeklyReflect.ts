// weeklyReflect — Cloud Scheduler Sunday 8:00 PM ET (Mon 01:00 UTC)
// Reads past 7 days rounds + feedback + learningLog, asks Claude to write a
// strategy memo + a second adversarial-critic Claude call to find mistakes.

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { findActiveTastyUser } from './shared/credentials';
import { callClaude, BudgetExceededError } from './shared/llm-client';
import { REFLECT_SYSTEM_PROMPT, buildReflectUserPrompt } from './shared/prompts';
import type { ICompetitionRoundV2, IAiState, IWeeklyMemo, IAdversarialFinding } from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');
const CATALIN_UID = process.env.CATALIN_UID ?? '';

const ADVERSARIAL_SYSTEM = `You are an adversarial options-trading critic reviewing Guvidul AI's iron-condor picks for the past week. Your job is to find SPECIFIC mistakes — not platitudes.

Use the data:
- Each round has the chosen IC + market context at entry + 3 alternatives that were considered
- Closed rounds have actual P&L + counterfactuals (what each alt would have closed at)
- Look for patterns: same delta range losing, same VIX bucket losing, same DTE losing, same ticker losing
- Look at counterfactual regret: did Guvidul consistently pick worse alternatives when better ones were on the table?

Output STRICT JSON (no markdown, no preamble):
{
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "finding": "1-2 sentences. Specific: 'Picked POP-78 over POP-85 alternative on 3 rounds, all 3 lost'",
      "suggestedRule": "1 sentence rule that would prevent it",
      "suggestedRuleId": "snake_case_id",
      "affectedRoundIds": ["roundId1", "roundId2", ...]
    }
  ]
}

Only emit findings backed by 2+ rounds of evidence. If a week has too little data, return {"findings":[]}.
Maximum 5 findings.`;

interface AdversarialResponse { findings?: IAdversarialFinding[] }

async function runAdversarialReview(
    uid: string,
    weekId: string,
    rounds: ICompetitionRoundV2[],
): Promise<{ findings: IAdversarialFinding[]; auditLogId: string }> {
    const summary = rounds.map((r) => {
        const ai = r.aiTrade;
        const counterfactualPart = ai.alternativesConsidered?.length
            ? `\n  alts: ${ai.alternativesConsidered.map((a) => `[${a.strikes.putBuy}/${a.strikes.putSell}p ${a.strikes.callSell}/${a.strikes.callBuy}c POP${a.pop}cr$${a.credit}${a.counterfactual ? ` cf$${a.counterfactual.hypotheticalExitPl}(regret$${a.counterfactual.regretVsActual})` : ''}]`).join(' ')}`
            : '';
        return `[${r.id}] ${r.ticker} ${r.expirationDate} VIX${r.marketContext.vix.toFixed(0)} IVR${r.marketContext.ivRank}\n  pick: ${ai.strategy} POP${ai.pop} cr$${ai.credit} → ${ai.exitPl !== null ? `$${ai.exitPl} via ${ai.closedBy}` : 'open'}${counterfactualPart}`;
    }).join('\n\n');

    const userPrompt = `# Week ${weekId} — Adversarial Review\n\n## Picks (${rounds.length} rounds)\n${summary}\n\n## Your task\nFind specific patterns where Guvidul lost or made worse choices than alternatives. Output JSON only.`;

    try {
        const result = await callClaude(ADVERSARIAL_SYSTEM, userPrompt, {
            uid,
            function: 'weeklyReflect',
            purpose: 'adversarial_review',
            agent: 'learner',
            metadata: { weekId, roundsAnalyzed: rounds.length },
        }, { model: 'claude-opus-4-6', maxTokens: 1500, temperature: 0.5 });
        const match = result.text.match(/\{[\s\S]*\}/);
        if (!match) return { findings: [], auditLogId: result.auditLogId };
        const parsed = JSON.parse(match[0]) as AdversarialResponse;
        const findings: IAdversarialFinding[] = (parsed.findings ?? []).map((f) => ({
            severity: f.severity,
            finding: f.finding,
            suggestedRule: f.suggestedRule,
            suggestedRuleId: f.suggestedRuleId,
            affectedRoundIds: Array.isArray(f.affectedRoundIds) ? f.affectedRoundIds : [],
        }));
        return { findings, auditLogId: result.auditLogId };
    } catch (e) {
        if (e instanceof BudgetExceededError) {
            console.warn('[weeklyReflect] Adversarial review skipped — budget exceeded');
        } else {
            console.warn('[weeklyReflect] Adversarial review failed:', e);
        }
        return { findings: [], auditLogId: '' };
    }
}

function weekIdFor(date: Date): string {
    const yr = date.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(yr, 0, 1));
    const week = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
    return `${yr}-W${week.toString().padStart(2, '0')}`;
}

export const weeklyReflect = onSchedule(
    {
        schedule: '0 1 * * 1', // Mon 01:00 UTC = Sun 8:00 PM ET (EST) / 9:00 PM (EDT)
        timeZone: 'UTC',
        region: 'us-east1',
        secrets: [anthropicKey],
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const uid = CATALIN_UID || await findActiveTastyUser();
        if (!uid) { console.error('[weeklyReflect] No active TastyTrade user'); return; }

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekStart = sevenDaysAgo.toISOString().split('T')[0];
        const weekEnd = now.toISOString().split('T')[0];
        const weekId = weekIdFor(now);

        // Fetch rounds in last 7 days
        const snap = await admin.firestore()
            .collection('users').doc(uid)
            .collection('competitionV2')
            .where('date', '>=', weekStart)
            .get();
        const rounds: ICompetitionRoundV2[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ICompetitionRoundV2));

        if (rounds.length === 0) {
            console.log(`[weeklyReflect] No rounds in ${weekStart}..${weekEnd} — skipping memo`);
            return;
        }

        // Fetch AI state
        const stateDoc = await admin.firestore()
            .collection('users').doc(uid)
            .collection('aiState').doc('current').get();
        const aiState: IAiState = stateDoc.exists ? (stateDoc.data() as IAiState) : { ...DEFAULT_AI_STATE };

        // Build prompt + call Claude
        const userPrompt = buildReflectUserPrompt(weekStart, weekEnd, rounds, aiState);

        let memoText: string;
        let auditLogId = '';
        try {
            const result = await callClaude(REFLECT_SYSTEM_PROMPT, userPrompt, {
                uid,
                function: 'weeklyReflect',
                purpose: 'weekly_memo',
                agent: 'learner',
                metadata: { weekId, roundsAnalyzed: rounds.length },
            }, { model: 'claude-opus-4-6', maxTokens: 1500, temperature: 0.4 });
            memoText = result.text;
            auditLogId = result.auditLogId;
        } catch (e) {
            if (e instanceof BudgetExceededError) {
                console.warn('[weeklyReflect] Budget exceeded — skipping memo this week');
                return;
            }
            console.error('[weeklyReflect] Claude failed:', e);
            return;
        }

        // Aggregate stats for the memo doc
        // Count wins/losses by aiTrade.exitPl for ghost rounds (autonomous mode);
        // fall back to winner field for legacy vs-user rounds.
        let aiWins = 0;
        let aiLosses = 0;
        for (const r of rounds) {
            if (r.ghost || r.winner === 'GhostOnly') {
                const pl = r.aiTrade.exitPl ?? null;
                if (pl !== null) {
                    if (pl > 5) aiWins++;
                    else if (pl < -5) aiLosses++;
                }
            } else {
                if (r.winner === 'AI') aiWins++;
                else if (r.winner === 'User') aiLosses++;
            }
        }
        const aiCumulativeScore = rounds.reduce((s, r) => s + (r.aiScore ?? 0), 0);

        // Adversarial second pass — find mistakes the memo glosses over
        const adversarial = await runAdversarialReview(uid, weekId, rounds);
        if (adversarial.findings.length > 0) {
            console.log(`[weeklyReflect] Adversarial review: ${adversarial.findings.length} findings`);
        }

        const memo: IWeeklyMemo = {
            weekId,
            weekStart,
            weekEnd,
            memoText,
            roundsAnalyzed: rounds.length,
            aiWins,
            aiLosses,
            aiCumulativeScore: Math.round(aiCumulativeScore * 1000) / 1000,
            auditLogId,
            createdAt: new Date().toISOString(),
            adversarialFindings: adversarial.findings,
            adversarialAuditLogId: adversarial.auditLogId,
        };

        await admin.firestore()
            .collection('users').doc(uid)
            .collection('aiState').doc('current')
            .collection('weeklyMemos').doc(weekId)
            .set(memo);

        console.log(`[weeklyReflect] Memo written for ${weekId} (${rounds.length} rounds, ${aiWins}W-${aiLosses}L)`);
    },
);

// weeklyReflect — Cloud Scheduler Sunday 8:00 PM ET (Mon 01:00 UTC)
// Reads past 7 days rounds + feedback + learningLog, asks Claude to write a strategy memo

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { findActiveTastyUser } from './shared/credentials';
import { callClaude, BudgetExceededError } from './shared/llm-client';
import { REFLECT_SYSTEM_PROMPT, buildReflectUserPrompt } from './shared/prompts';
import type { ICompetitionRoundV2, IAiState, IWeeklyMemo } from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

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
        const uid = await findActiveTastyUser();
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
                metadata: { weekId, roundsAnalyzed: rounds.length },
            }, { maxTokens: 1500, temperature: 0.4 });
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
        const aiWins = rounds.filter((r) => r.winner === 'AI').length;
        const aiLosses = rounds.filter((r) => r.winner === 'User').length;
        const aiCumulativeScore = rounds.reduce((s, r) => s + (r.aiScore ?? 0), 0);

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
        };

        await admin.firestore()
            .collection('users').doc(uid)
            .collection('aiState').doc('current')
            .collection('weeklyMemos').doc(weekId)
            .set(memo);

        console.log(`[weeklyReflect] Memo written for ${weekId} (${rounds.length} rounds, ${aiWins}W-${aiLosses}L)`);
    },
);

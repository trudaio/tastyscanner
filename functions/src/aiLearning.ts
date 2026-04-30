// aiLearning — Firestore trigger fires when a round outcome resolves
// Triggers on:
//   1. winner Pending → User/AI/Draw (vs-user mode, legacy)
//   2. ghost round aiTrade.status open → closed (autonomous mode)
//   3. userVeto added (strong negative signal)
// Extracts feature vector, generates LLM post-mortem on losses, updates
// rule adjustments + weights.

import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import type { ICompetitionRoundV2, IAiState, IFeatureVector, ILearningLogEntry, IRuleAdjustment } from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';
import { callClaude, BudgetExceededError } from './shared/llm-client';
import { upsertLearnedRule } from './shared/learned-rules';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

function extractFeatures(round: ICompetitionRoundV2): IFeatureVector {
    const ai = round.aiTrade;
    const psLeg = ai.legs.find((l) => l.type === 'STO' && l.optionType === 'P');
    const scLeg = ai.legs.find((l) => l.type === 'STO' && l.optionType === 'C');

    const dteEntry = (() => {
        const exp = new Date(ai.expiration + 'T16:00:00-05:00');
        const created = new Date(round.createdAt);
        return Math.ceil((exp.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    })();

    const daysHeld = ai.exitDate ? (() => {
        const created = new Date(round.createdAt);
        const exit = new Date(ai.exitDate!);
        return Math.ceil((exit.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    })() : 0;

    return {
        ticker: round.ticker,
        wings: ai.wings,
        dte_at_entry: dteEntry,
        delta_short_put: psLeg ? ai.delta : 0, // simplified
        delta_short_call: scLeg ? Math.abs(ai.delta) : 0, // simplified
        pop: ai.pop,
        credit_ratio: ai.credit / Math.max(1, ai.wings),
        ev_dollars: ai.ev,
        vix_at_entry: round.marketContext.vix,
        ivrank_at_entry: round.marketContext.ivRank,
        days_held: daysHeld,
        closed_by: ai.closedBy ?? 'unknown',
        symmetric: true,
        experiment_variant: ai.experimentVariant,
    };
}

function updateRuleAdjustments(
    adjustments: IRuleAdjustment[],
    fv: IFeatureVector,
    outcome: 'win' | 'loss' | 'draw' | 'vetoed',
): IRuleAdjustment[] {
    const updated = [...adjustments];

    // Define feature-based condition fingerprints
    const fingerprints: Array<{ id: string; condition: string; matches: boolean }> = [
        { id: 'pop_lt_70', condition: 'POP<70', matches: fv.pop < 70 },
        { id: 'pop_gte_80', condition: 'POP>79', matches: fv.pop >= 80 },
        { id: 'wings_5', condition: 'wings==5', matches: fv.wings === 5 },
        { id: 'wings_20', condition: 'wings==20', matches: fv.wings === 20 },
        { id: 'vix_high', condition: 'VIX>25', matches: fv.vix_at_entry > 25 },
        { id: 'vix_low', condition: 'VIX<20', matches: fv.vix_at_entry < 20 },
        { id: 'dte_short', condition: 'DTE<20', matches: fv.dte_at_entry < 20 },
        { id: 'dte_long', condition: 'DTE>35', matches: fv.dte_at_entry > 35 },
    ];

    for (const fp of fingerprints) {
        if (!fp.matches) continue;

        let existing = updated.find((a) => a.id === fp.id);
        if (!existing) {
            existing = {
                id: fp.id,
                condition: fp.condition,
                effect: 0,
                samplesSeen: 0,
                winRate: 0.5,
            };
            updated.push(existing);
        }

        existing.samplesSeen += 1;

        if (outcome === 'win') {
            existing.winRate = (existing.winRate * (existing.samplesSeen - 1) + 1) / existing.samplesSeen;
            existing.effect = Math.min(1, existing.effect + 0.05);
        } else if (outcome === 'loss') {
            existing.winRate = (existing.winRate * (existing.samplesSeen - 1)) / existing.samplesSeen;
            existing.effect = Math.max(-1, existing.effect - 0.1);
        } else if (outcome === 'vetoed') {
            // Veto from Catalin = 3x stronger negative signal than a loss
            existing.winRate = (existing.winRate * (existing.samplesSeen - 1)) / existing.samplesSeen;
            existing.effect = Math.max(-1, existing.effect - 0.3);
        }
        // draws don't change the weight materially
    }

    // Cleanup: disable adjustments with ≥20 samples and <40% win rate
    return updated.filter((a) => !(a.samplesSeen >= 20 && a.winRate < 0.4 && a.effect > -0.8));
}

function generateTemplatePostMortem(round: ICompetitionRoundV2, outcome: 'win' | 'loss' | 'draw' | 'vetoed'): string {
    const ai = round.aiTrade;
    if (outcome === 'vetoed') {
        const reason = round.userVeto?.reason || 'no reason given';
        return `AI pick VETOED by Catalin. ${ai.strategy} at ${ai.expiration}. ` +
            `Entry: POP ${ai.pop}%, credit $${ai.credit}, wings $${ai.wings}, VIX=${round.marketContext.vix.toFixed(1)}. ` +
            `Reason: "${reason}". Strong negative training signal — features penalized 3x normal.`;
    }
    const sign = (ai.exitPl ?? 0) >= 0 ? '+' : '';
    const pctOfMax = ai.maxProfit > 0 ? ((ai.exitPl ?? 0) / ai.maxProfit) * 100 : 0;
    const outcomeStr = outcome === 'win' ? 'WON' : outcome === 'loss' ? 'LOST' : 'DRAW';

    return `AI ${outcomeStr} round. ${ai.strategy} at ${ai.expiration}. ` +
        `Entry: POP ${ai.pop}%, credit $${ai.credit}, wings $${ai.wings}, VIX=${round.marketContext.vix.toFixed(1)}. ` +
        `Exit: ${sign}$${(ai.exitPl ?? 0).toFixed(2)} (${pctOfMax.toFixed(0)}% of max), closed by ${ai.closedBy}.`;
}

const POST_MORTEM_SYSTEM = `You are Guvidul's post-mortem analyst — a brutally honest options trader reviewing a losing iron condor.
Your job: identify in <120 words what specifically went wrong and what rule (if any) would have prevented this loss.
Be specific. Cite numbers. Don't be diplomatic. The pick lost real (paper) money — Catalin needs to know what to change.

Output JSON:
{
  "rootCause": "1-2 sentences pinpointing the entry mistake (delta too high? VIX too low? skew ignored? DTE wrong?)",
  "preventiveRule": "specific rule that would have rejected this pick (or 'no rule — bad luck' if mispricing was minimal)",
  "ruleId": "snake_case identifier for the rule, e.g. 'reject_pop_lt_75_when_vix_lt_18'",
  "confidenceInRule": 0-100
}`;

async function generateLlmPostMortem(uid: string, round: ICompetitionRoundV2, roundId: string): Promise<{
    rootCause: string;
    preventiveRule: string;
    ruleId: string;
    confidenceInRule: number;
} | null> {
    const ai = round.aiTrade;
    const sign = (ai.exitPl ?? 0) >= 0 ? '+' : '';
    const pctOfMax = ai.maxProfit > 0 ? ((ai.exitPl ?? 0) / ai.maxProfit) * 100 : 0;
    const userPrompt = `# Losing Pick — Post-Mortem

## Pick
- Strategy: ${ai.strategy}
- Wings: $${ai.wings}
- Credit: $${ai.credit}
- POP at entry: ${ai.pop}%
- R/R: ${ai.rr}:1
- Short Δ (display): ${ai.delta}
- DTE at entry: (calculate from expiration vs round.createdAt)
- Exit: ${sign}$${(ai.exitPl ?? 0).toFixed(2)} (${pctOfMax.toFixed(0)}% of max profit)
- Closed by: ${ai.closedBy ?? 'unknown'}

## Market Context at Entry
- Underlying: $${round.marketContext.underlyingPrice.toFixed(2)}
- VIX: ${round.marketContext.vix.toFixed(1)}
- IV Rank: ${round.marketContext.ivRank}
- Technicals: ${round.marketContext.technicals ? `RSI=${round.marketContext.technicals.rsi.toFixed(1)}, BB=${round.marketContext.technicals.bbDistance.toFixed(2)}σ, ATR=${round.marketContext.technicals.atr.toFixed(2)}` : 'unavailable'}

## Original Rationale
${ai.rationale.substring(0, 800)}

## Your Task
Analyze this loss. JSON only.`;

    try {
        const result = await callClaude(POST_MORTEM_SYSTEM, userPrompt, {
            uid,
            function: 'aiLearning',
            purpose: 'post_mortem',
            agent: 'learner',
            metadata: { roundId },
        }, {
            model: 'claude-sonnet-4-6',  // cheaper for post-mortems
            maxTokens: 600,
            temperature: 0.4,
        });
        // Parse JSON from response
        const match = result.text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]);
        return {
            rootCause: String(parsed.rootCause || ''),
            preventiveRule: String(parsed.preventiveRule || ''),
            ruleId: String(parsed.ruleId || ''),
            confidenceInRule: Number(parsed.confidenceInRule || 0),
        };
    } catch (e) {
        if (e instanceof BudgetExceededError) {
            console.warn('[aiLearning] LLM post-mortem skipped — budget exceeded');
        } else {
            console.warn('[aiLearning] LLM post-mortem failed:', e);
        }
        return null;
    }
}

export const aiLearning = onDocumentUpdated(
    {
        document: 'users/{uid}/competitionV2/{roundId}',
        region: 'us-east1',
        secrets: [anthropicKey],
    },
    async (event) => {
        const before = event.data?.before.data() as ICompetitionRoundV2 | undefined;
        const after = event.data?.after.data() as ICompetitionRoundV2 | undefined;
        if (!before || !after) return;

        // Trigger on:
        //   (1) winner transition Pending → decided (vs-user mode)
        //   (2) new userVeto added (strong negative signal)
        //   (3) ghost round AI trade closed (autonomous mode) — status open → closed
        const becameVetoed = !before.userVeto && !!after.userVeto;
        const winnerChanged = before.winner !== after.winner && after.winner !== 'Pending' && after.winner !== 'GhostOnly';
        const ghostClosed = after.ghost && before.aiTrade.status === 'open' && after.aiTrade.status === 'closed';
        if (!winnerChanged && !becameVetoed && !ghostClosed) return;

        const uid = event.params.uid;
        const roundId = event.params.roundId;

        console.log(`[aiLearning] Round ${roundId} resolved (winner=${after.winner}, ghostClosed=${ghostClosed}, vetoed=${becameVetoed})`);

        // Load current state (or initialize)
        const stateRef = admin.firestore().collection('users').doc(uid).collection('aiState').doc('current');
        const stateDoc = await stateRef.get();
        let state: IAiState = stateDoc.exists ? stateDoc.data() as IAiState : { ...DEFAULT_AI_STATE };

        // Determine AI outcome
        let outcome: 'win' | 'loss' | 'draw' | 'vetoed';
        if (becameVetoed) {
            outcome = 'vetoed';
        } else if (ghostClosed) {
            // Ghost-mode outcome from exitPl
            const pl = after.aiTrade.exitPl ?? 0;
            if (pl > 5) outcome = 'win';
            else if (pl < -5) outcome = 'loss';
            else outcome = 'draw';
        } else if (after.winner === 'AI') {
            outcome = 'win';
        } else if (after.winner === 'User') {
            outcome = 'loss';
        } else {
            outcome = 'draw';
        }

        // Extract features
        const featureVector = extractFeatures(after);

        // Update rule adjustments
        const newAdjustments = updateRuleAdjustments(state.ruleAdjustments, featureVector, outcome);

        // Decay exploration rate
        const newExplorationRate = Math.max(0.05, state.explorationRate * 0.95);

        // Build post-mortem — LLM-driven for losses, template otherwise
        const templatePost = generateTemplatePostMortem(after, outcome);
        let postMortem = templatePost;
        let llmAnalysis: Awaited<ReturnType<typeof generateLlmPostMortem>> = null;
        if (outcome === 'loss') {
            llmAnalysis = await generateLlmPostMortem(uid, after, roundId);
            if (llmAnalysis) {
                postMortem = `${templatePost}\n\n[ROOT CAUSE] ${llmAnalysis.rootCause}\n[RULE] ${llmAnalysis.preventiveRule} (id=${llmAnalysis.ruleId}, confidence=${llmAnalysis.confidenceInRule})`;
            }
        }

        // Update counters + learned rules
        let learnedRules = state.learnedRules;
        if (llmAnalysis && llmAnalysis.confidenceInRule >= 60 && llmAnalysis.ruleId) {
            const severity: 'high' | 'medium' | 'low' = llmAnalysis.confidenceInRule >= 80 ? 'high' : 'medium';
            learnedRules = upsertLearnedRule(learnedRules, {
                ruleId: llmAnalysis.ruleId,
                rule: llmAnalysis.preventiveRule,
                severity,
                source: 'postmortem',
            }, roundId, 'round');
            console.log(`[aiLearning] Learned rule "${llmAnalysis.ruleId}" (severity=${severity}, conf=${llmAnalysis.confidenceInRule})`);
        }

        const newState: IAiState = {
            ...state,
            lastUpdated: new Date().toISOString(),
            ruleAdjustments: newAdjustments,
            explorationRate: newExplorationRate,
            totalRounds: state.totalRounds + 1,
            wins: state.wins + (outcome === 'win' ? 1 : 0),
            losses: state.losses + (outcome === 'loss' ? 1 : 0),
            draws: state.draws + (outcome === 'draw' ? 1 : 0),
            ghostRounds: state.ghostRounds + (after.ghost ? 1 : 0),
            learnedRules,
        };
        void state;

        await stateRef.set(newState);

        // Append to learning log
        const logEntry: ILearningLogEntry & { llmRuleSuggestion?: { ruleId: string; rule: string; confidence: number } } = {
            roundId,
            timestamp: new Date().toISOString(),
            featureVector,
            outcome,
            userScore: after.userScore ?? 0,
            aiScore: after.aiScore ?? 0,
            adjustmentsApplied: newAdjustments.filter((a) => Math.abs(a.effect) > 0).map((a) => a.id),
            postMortem,
        };
        if (llmAnalysis && llmAnalysis.confidenceInRule >= 60) {
            logEntry.llmRuleSuggestion = {
                ruleId: llmAnalysis.ruleId,
                rule: llmAnalysis.preventiveRule,
                confidence: llmAnalysis.confidenceInRule,
            };
        }
        await admin.firestore()
            .collection('users').doc(uid)
            .collection('learningLog')
            .add(logEntry);

        console.log(`[aiLearning] Updated state: ${newState.wins}W-${newState.losses}L-${newState.draws}D, exploration=${newExplorationRate.toFixed(3)}`);
    },
);

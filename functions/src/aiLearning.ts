// aiLearning — Firestore trigger fires when a round moves from Pending → User/AI/Draw
// Extracts feature vector, updates rule adjustments + weights

import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { ICompetitionRoundV2, IAiState, IFeatureVector, ILearningLogEntry, IRuleAdjustment } from './shared/types';
import { DEFAULT_AI_STATE } from './shared/types';

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

function generatePostMortem(round: ICompetitionRoundV2, outcome: 'win' | 'loss' | 'draw' | 'vetoed'): string {
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

export const aiLearning = onDocumentUpdated(
    {
        document: 'users/{uid}/competitionV2/{roundId}',
        region: 'us-east1',
    },
    async (event) => {
        const before = event.data?.before.data() as ICompetitionRoundV2 | undefined;
        const after = event.data?.after.data() as ICompetitionRoundV2 | undefined;
        if (!before || !after) return;

        // Trigger on (1) winner transition Pending → decided OR (2) new userVeto added
        const becameVetoed = !before.userVeto && !!after.userVeto;
        const winnerChanged = before.winner !== after.winner && after.winner !== 'Pending' && after.winner !== 'GhostOnly';
        if (!winnerChanged && !becameVetoed) return;

        const uid = event.params.uid;
        const roundId = event.params.roundId;

        console.log(`[aiLearning] Round ${roundId} decided: ${after.winner}`);

        // Load current state (or initialize)
        const stateRef = admin.firestore().collection('users').doc(uid).collection('aiState').doc('current');
        const stateDoc = await stateRef.get();
        let state: IAiState = stateDoc.exists ? stateDoc.data() as IAiState : { ...DEFAULT_AI_STATE };

        // Determine AI outcome
        let outcome: 'win' | 'loss' | 'draw' | 'vetoed';
        if (becameVetoed) outcome = 'vetoed';
        else if (after.winner === 'AI') outcome = 'win';
        else if (after.winner === 'User') outcome = 'loss';
        else outcome = 'draw';

        // Extract features
        const featureVector = extractFeatures(after);

        // Update rule adjustments
        const newAdjustments = updateRuleAdjustments(state.ruleAdjustments, featureVector, outcome);

        // Decay exploration rate
        const newExplorationRate = Math.max(0.05, state.explorationRate * 0.95);

        // Update counters
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
        };
        void state;

        await stateRef.set(newState);

        // Append to learning log
        const postMortem = generatePostMortem(after, outcome);
        const logEntry: ILearningLogEntry = {
            roundId,
            timestamp: new Date().toISOString(),
            featureVector,
            outcome,
            userScore: after.userScore ?? 0,
            aiScore: after.aiScore ?? 0,
            adjustmentsApplied: newAdjustments.filter((a) => Math.abs(a.effect) > 0).map((a) => a.id),
            postMortem,
        };
        await admin.firestore()
            .collection('users').doc(uid)
            .collection('learningLog')
            .add(logEntry);

        console.log(`[aiLearning] Updated state: ${newState.wins}W-${newState.losses}L-${newState.draws}D, exploration=${newExplorationRate.toFixed(3)}`);
    },
);

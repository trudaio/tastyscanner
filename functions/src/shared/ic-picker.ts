// AI Iron Condor picker — seeded with Catalin's rules, extensible via AiState

import type { IAiState, IAiCompetitionTrade, IMarketContext } from './types';
import type { IOptionQuote } from './tasty-rest-client';

export interface ChainInput {
    ticker: 'SPX' | 'QQQ';
    underlyingPrice: number;
    expirationDate: string;
    dte: number;
    strikes: Array<{
        strike: number;
        callSymbol: string;
        callStreamerSymbol: string;
        putSymbol: string;
        putStreamerSymbol: string;
    }>;
    quotes: Map<string, IOptionQuote>;    // keyed by streamer symbol
}

export interface IcCandidate {
    wings: number;
    putBuy: number; putSell: number;
    callSell: number; callBuy: number;
    credit: number;         // per-share
    quantity: number;
    maxProfit: number; maxLoss: number;
    pop: number; ev: number; alpha: number; rr: number;
    deltaShortPut: number; deltaShortCall: number;
    thetaTotal: number;
    symmetric: boolean;
    score: number;
}

export interface PickResult {
    pick: IAiCompetitionTrade | null;
    reason: string;
    candidatesEvaluated: number;
}

export interface CandidatesResult {
    candidates: IcCandidate[];
    topN: IcCandidate[];        // top 5 sorted by score
    reason: string;
    rules: {
        minPOP: number;
        maxRRRatio: number;
        minCredit: number;
        wingWidths: number[];
    };
}

// Slippage: realistic fill is 2-3 cents below mid (Catalin's documented practice)
// Apply to credit before scoring so all metrics reflect realistic fill
const SLIPPAGE_PER_IC = 0.025; // $0.025 below mid = 2.5 cents

function applySlippage(rawCredit: number): number {
    return Math.max(0, rawCredit - SLIPPAGE_PER_IC);
}

// Strike spacing detection — skip if weekly with $25 gaps
function detectStrikeSpacing(strikes: number[]): number {
    if (strikes.length < 3) return 0;
    const sorted = [...strikes].sort((a, b) => a - b);
    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) diffs.push(sorted[i] - sorted[i - 1]);
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)];
}

// Find strike closest to target delta (absolute)
function findByDelta(
    strikes: ChainInput['strikes'],
    quotes: Map<string, IOptionQuote>,
    side: 'P' | 'C',
    targetAbsDelta: number,
): { strike: number; delta: number } | null {
    let best: { strike: number; delta: number; distance: number } | null = null;
    for (const s of strikes) {
        const streamerSym = side === 'P' ? s.putStreamerSymbol : s.callStreamerSymbol;
        const q = quotes.get(streamerSym);
        if (!q || q.delta === null) continue;
        const absDelta = Math.abs(q.delta);
        const distance = Math.abs(absDelta - targetAbsDelta / 100);
        if (!best || distance < best.distance) {
            best = { strike: s.strike, delta: q.delta, distance };
        }
    }
    return best ? { strike: best.strike, delta: best.delta } : null;
}

function calcCredit(
    strikes: ChainInput['strikes'],
    quotes: Map<string, IOptionQuote>,
    putSell: number, putBuy: number, callSell: number, callBuy: number,
): { credit: number; valid: boolean; deltas: { sp: number; sc: number }; theta: number } {
    const find = (strike: number, side: 'P' | 'C') => {
        const s = strikes.find((x) => x.strike === strike);
        if (!s) return null;
        return quotes.get(side === 'P' ? s.putStreamerSymbol : s.callStreamerSymbol) ?? null;
    };

    const psq = find(putSell, 'P');
    const pbq = find(putBuy, 'P');
    const scq = find(callSell, 'C');
    const cbq = find(callBuy, 'C');

    if (!psq || !pbq || !scq || !cbq) {
        return { credit: 0, valid: false, deltas: { sp: 0, sc: 0 }, theta: 0 };
    }

    // Credit = short mids - long mids (per share)
    const credit = psq.mid + scq.mid - pbq.mid - cbq.mid;
    const theta = (pbq.theta ?? 0) + (cbq.theta ?? 0) - (psq.theta ?? 0) - (scq.theta ?? 0);

    return {
        credit,
        valid: credit > 0,
        deltas: { sp: psq.delta ?? 0, sc: scq.delta ?? 0 },
        theta,
    };
}

function calcPOP(deltaShortPut: number, deltaShortCall: number): number {
    // POP = 100 - max(|short put delta|, |short call delta|) * 100
    const putBe = Math.abs(deltaShortPut) * 100;
    const callBe = Math.abs(deltaShortCall) * 100;
    return Math.max(0, 100 - Math.max(putBe, callBe));
}

function calcEV(credit: number, wings: number, pop: number): number {
    const winProb = pop / 100;
    const lossProb = 1 - winProb;
    return winProb * credit * 100 - lossProb * (wings - credit) * 100;
}

export function buildCandidates(
    input: ChainInput,
    rules: {
        wingWidths: number[];
        targetDeltaSymmetric: [number, number]; // e.g. [16, 20]
        maxRRRatio: number;                      // e.g. 5 (wings:credit)
        minCredit: number;                       // e.g. 1.0 per share for $5 wings
        minPOP: number;                          // default POP threshold (e.g. 70)
        minPOPForWings5?: number;                // POP exception ONLY for $5 wings (VIX-crunch scenario)
    },
): IcCandidate[] {
    const candidates: IcCandidate[] = [];
    const allStrikes = input.strikes.map((s) => s.strike);
    const spacing = detectStrikeSpacing(allStrikes);

    // Skip expirations with $25 strike gaps (user rule)
    if (spacing >= 25) return [];

    for (const wings of rules.wingWidths) {
        // Find short strikes near target deltas
        for (let targetDelta = rules.targetDeltaSymmetric[0]; targetDelta <= rules.targetDeltaSymmetric[1]; targetDelta += 2) {
            const sp = findByDelta(input.strikes, input.quotes, 'P', targetDelta);
            const sc = findByDelta(input.strikes, input.quotes, 'C', targetDelta);
            if (!sp || !sc) continue;

            const pbStrike = sp.strike - wings;
            const cbStrike = sc.strike + wings;
            const pbExists = allStrikes.includes(pbStrike);
            const cbExists = allStrikes.includes(cbStrike);
            if (!pbExists || !cbExists) continue;

            const { credit: rawCredit, valid, deltas, theta } = calcCredit(
                input.strikes, input.quotes, sp.strike, pbStrike, sc.strike, cbStrike,
            );
            if (!valid) continue;

            // Apply slippage: realistic fill is 2-3 cents below mid
            const credit = applySlippage(rawCredit);
            if (credit <= 0) continue;

            const pop = calcPOP(deltas.sp, deltas.sc);
            // POP threshold: default minPOP for most wings; relaxed threshold only for $5 wings (Catalin's VIX-crunch exception)
            const popThreshold = wings === 5 && rules.minPOPForWings5 !== undefined ? rules.minPOPForWings5 : rules.minPOP;
            if (pop < popThreshold) continue;

            const rr = wings / credit;
            if (rr > rules.maxRRRatio) continue;
            if (credit < rules.minCredit) continue;

            const ev = calcEV(credit, wings, pop);

            const qty = wings <= 15 ? 2 : 1;
            const maxProfit = credit * 100 * qty;
            const maxLoss = (wings - credit) * 100 * qty;
            const alpha = (ev / maxLoss) * 100;

            candidates.push({
                wings,
                putBuy: pbStrike, putSell: sp.strike,
                callSell: sc.strike, callBuy: cbStrike,
                credit, quantity: qty,
                maxProfit, maxLoss, pop, ev, alpha, rr,
                deltaShortPut: deltas.sp, deltaShortCall: deltas.sc,
                thetaTotal: theta,
                symmetric: true,
                score: 0,
            });
        }
    }
    return candidates;
}

export function scoreCandidate(c: IcCandidate, state: IAiState): number {
    const { popWeight, evWeight, alphaWeight } = state.weights;
    // Normalize: pop 0-100, ev clamped to -10..10 per contract, alpha clamped
    const popNorm = c.pop;
    const evNorm = Math.max(-10, Math.min(10, c.ev / c.quantity / 10));
    const alphaNorm = Math.max(-10, Math.min(10, c.alpha));

    let score = popWeight * popNorm + evWeight * evNorm * 10 + alphaWeight * alphaNorm * 10;

    // Apply rule adjustments — simple string matching (v1)
    for (const adj of state.ruleAdjustments) {
        if (matchesCondition(c, adj.condition)) {
            score += adj.effect * 10; // scale effect
        }
    }
    return score;
}

function matchesCondition(c: IcCandidate, condition: string): boolean {
    // v1: simplistic parser — supports "POP<N", "wings==N", "POP<N AND wings==N"
    const parts = condition.split(' AND ').map((s) => s.trim());
    for (const p of parts) {
        const mLess = p.match(/^(\w+)<(\d+)$/);
        const mEq = p.match(/^(\w+)==(\d+)$/);
        const mGreater = p.match(/^(\w+)>(\d+)$/);
        let field: string, val: number, op: 'lt' | 'eq' | 'gt';
        if (mLess) { [, field, ] = mLess; val = parseFloat(mLess[2]); op = 'lt'; }
        else if (mEq) { [, field, ] = mEq; val = parseFloat(mEq[2]); op = 'eq'; }
        else if (mGreater) { [, field, ] = mGreater; val = parseFloat(mGreater[2]); op = 'gt'; }
        else return false;

        const cv = (c as unknown as Record<string, number>)[field.toLowerCase()] ?? 0;
        if (op === 'lt' && !(cv < val)) return false;
        if (op === 'eq' && !(cv === val)) return false;
        if (op === 'gt' && !(cv > val)) return false;
    }
    return true;
}

/** Convert an IcCandidate into an IAiCompetitionTrade (without LLM rationale). */
export function candidateToTrade(
    c: IcCandidate,
    ticker: 'SPX' | 'QQQ',
    expirationDate: string,
): Omit<IAiCompetitionTrade, 'rationale' | 'confidenceScore' | 'rulesApplied' | 'experimentVariant'> {
    return {
        ticker,
        strategy: `IC ${c.putBuy}/${c.putSell}p ${c.callSell}/${c.callBuy}c`,
        expiration: expirationDate,
        legs: [
            { type: 'BTO', optionType: 'P', strike: c.putBuy },
            { type: 'STO', optionType: 'P', strike: c.putSell },
            { type: 'STO', optionType: 'C', strike: c.callSell },
            { type: 'BTO', optionType: 'C', strike: c.callBuy },
        ],
        credit: Math.round(c.credit * 100) / 100,
        quantity: c.quantity,
        wings: c.wings,
        maxProfit: Math.round(c.maxProfit * 100) / 100,
        maxLoss: Math.round(c.maxLoss * 100) / 100,
        pop: Math.round(c.pop * 10) / 10,
        ev: Math.round(c.ev * 100) / 100,
        alpha: Math.round(c.alpha * 100) / 100,
        rr: Math.round(c.rr * 100) / 100,
        delta: Math.round(c.deltaShortPut * 100) / 100,
        theta: Math.round(c.thetaTotal * 100) / 100,
        exitPl: null, exitDate: null, closedBy: null, status: 'open',
    };
}

/** Generate top N candidates with scoring, without selection. Used by LLM pipeline. */
export function getTopCandidates(
    input: ChainInput,
    state: IAiState,
    marketCtx: IMarketContext,
    n: number = 5,
): CandidatesResult {
    if (marketCtx.vix < 18) {
        return {
            candidates: [], topN: [],
            reason: `VIX ${marketCtx.vix} < 18 — gate closed`,
            rules: { minPOP: 70, maxRRRatio: 5, minCredit: 1.0, wingWidths: [5, 10, 15, 20] },
        };
    }

    // POP rules: default 70% for all wings; VIX-crunch exception (VIX 18-22) allows 60% ONLY for $5 wings
    const rules = {
        wingWidths: [5, 10, 15, 20],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 1.0,
        minPOP: 70,
        minPOPForWings5: marketCtx.vix < 22 ? 60 : 70, // only relaxes for $5 wings during VIX crunch
    };

    const candidates = buildCandidates(input, rules);
    if (candidates.length === 0) {
        return { candidates: [], topN: [], reason: 'No candidates passed filters', rules };
    }

    for (const c of candidates) c.score = scoreCandidate(c, state);
    candidates.sort((a, b) => b.score - a.score);

    return {
        candidates,
        topN: candidates.slice(0, n),
        reason: `Found ${candidates.length} candidates`,
        rules,
    };
}

export function pickBestIC(
    input: ChainInput,
    state: IAiState,
    marketCtx: IMarketContext,
): PickResult {
    // VIX gate — AI inherits from Catalin seed (adjustable via learning)
    if (marketCtx.vix < 18) {
        return { pick: null, reason: `VIX ${marketCtx.vix} < 18 — skip (seed rule)`, candidatesEvaluated: 0 };
    }

    // Seed rules (copy of Catalin's as starting point)
    // POP exception: VIX-crunch (18-22) allows 60% POP ONLY on $5 wings
    const rules = {
        wingWidths: [5, 10, 15, 20],
        targetDeltaSymmetric: [16, 20] as [number, number],
        maxRRRatio: 5,
        minCredit: 1.0,
        minPOP: 70,
        minPOPForWings5: marketCtx.vix < 22 ? 60 : 70,
    };

    const candidates = buildCandidates(input, rules);
    if (candidates.length === 0) {
        return { pick: null, reason: 'No candidates passed filters (spacing, credit, POP, RR)', candidatesEvaluated: 0 };
    }

    // Score all
    for (const c of candidates) c.score = scoreCandidate(c, state);

    // Epsilon-greedy: with probability explorationRate, pick randomly from top 3
    let chosen: IcCandidate;
    let experimentVariant: string | null = null;
    if (Math.random() < state.explorationRate) {
        candidates.sort((a, b) => b.score - a.score);
        const top = candidates.slice(0, Math.min(3, candidates.length));
        chosen = top[Math.floor(Math.random() * top.length)];
        experimentVariant = `explore_top_${candidates.indexOf(chosen) + 1}`;
    } else {
        chosen = candidates.reduce((best, c) => c.score > best.score ? c : best, candidates[0]);
    }

    // Confidence: based on score margin over 2nd best, capped 0-100
    candidates.sort((a, b) => b.score - a.score);
    const margin = candidates.length > 1 ? candidates[0].score - candidates[1].score : 20;
    const confidence = Math.max(30, Math.min(95, 50 + margin * 2));

    // Build rationale
    const reasons: string[] = [];
    reasons.push(`Picked ${chosen.wings}-wing IC at ${chosen.putSell}/${chosen.callSell} shorts`);
    reasons.push(`POP ${chosen.pop.toFixed(1)}%, credit $${chosen.credit.toFixed(2)}, RR ${chosen.rr.toFixed(2)}:1`);
    reasons.push(`Market: VIX=${marketCtx.vix.toFixed(1)}, IVR=${marketCtx.ivRank.toFixed(0)}`);
    if (experimentVariant) reasons.push(`(experiment: ${experimentVariant})`);

    const strategyStr = `IC ${chosen.putBuy}/${chosen.putSell}p ${chosen.callSell}/${chosen.callBuy}c`;

    const aiTrade: IAiCompetitionTrade = {
        ticker: input.ticker,
        strategy: strategyStr,
        expiration: input.expirationDate,
        legs: [
            { type: 'BTO', optionType: 'P', strike: chosen.putBuy },
            { type: 'STO', optionType: 'P', strike: chosen.putSell },
            { type: 'STO', optionType: 'C', strike: chosen.callSell },
            { type: 'BTO', optionType: 'C', strike: chosen.callBuy },
        ],
        credit: Math.round(chosen.credit * 100) / 100,
        quantity: chosen.quantity,
        wings: chosen.wings,
        maxProfit: Math.round(chosen.maxProfit * 100) / 100,
        maxLoss: Math.round(chosen.maxLoss * 100) / 100,
        pop: Math.round(chosen.pop * 10) / 10,
        ev: Math.round(chosen.ev * 100) / 100,
        alpha: Math.round(chosen.alpha * 100) / 100,
        rr: Math.round(chosen.rr * 100) / 100,
        delta: Math.round(chosen.deltaShortPut * 100) / 100, // just short put delta for display
        theta: Math.round(chosen.thetaTotal * 100) / 100,
        exitPl: null,
        exitDate: null,
        closedBy: null,
        status: 'open',
        rationale: reasons.join(' | '),
        confidenceScore: Math.round(confidence),
        rulesApplied: [
            `seed_vix_gate_18`,
            `seed_symmetric_delta_16_20`,
            `seed_max_rr_${rules.maxRRRatio}to1`,
            `seed_min_pop_${rules.minPOP}`,
        ],
        experimentVariant,
    };

    return { pick: aiTrade, reason: reasons.join(' | '), candidatesEvaluated: candidates.length };
}

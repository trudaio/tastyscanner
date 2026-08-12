// Guvidelul ladder — pure rule logic, ported verbatim from the Guvidul-Skew
// Discord bot (guvidel_book.py / trade_engine.py / skew_engine.py, commit
// f591a59, spec 03-TASTYSCANNER-IC-RULES.md). Constants keep the bot's names
// so the two codebases stay greppable against each other.

import type { IOptionQuote } from './tasty-rest-client';

// ── Entry gates ──────────────────────────────────────────────
export const GUVIDEL_MIN_IVR = 30;            // IV Rank floor per ticker
export const GUVIDEL_VOL_LOOKBACK = 60;       // sessions for σ_daily estimate
export const GUVIDEL_BOOK_DTE_MIN = 21;       // ladder entry window
export const GUVIDEL_BOOK_DTE_MAX = 45;
export const GUVIDEL_BOOK_QTY = 1;            // contracts per rung
export const GUVIDEL_BOOK_BP_CAP = 0.80;      // Σ rung BP ≤ 80% of NAV
export const GUVIDEL_MAX_RUNGS_PER_DAY = 20;  // runaway breaker

// ── Rung construction ────────────────────────────────────────
export const IC_SHORT_PUT_DELTA = 0.18;
export const IC_SHORT_CALL_DELTA = 0.16;
export const GUVIDEL_WING_TARGET = 10;        // longs ~$10 further out
export const GUVIDEL_WING_TOLERANCE = 0.5;    // actual width within ±50% of target
export const SLIPPAGE_PER_IC = 0.025;         // haircut from mid toward natural
export const MIN_SCREENING_CREDIT = 0.05;     // credit ≤ $0.05 → discard

// ── Skew structure decision (#scanner-skew) ──────────────────
export const IC_SCAN_SYM_THRESHOLD = 30;      // relative 25Δ skew %, ± band
export const IC_SCAN_TILT_WING_MULT = 2.0;    // expensive side wing ×2

// ── Management (exit priority: STOP → target → DTE) ──────────
export const GUVIDEL_BOOK_STOP_MULT = 2.0;    // buy-back debit ≥ 2× credit
export const GUVIDEL_BOOK_TARGET_PCT = 50;    // profit ≥ 50% of credit
export const GUVIDEL_BOOK_EXIT_DTE = 14;      // ladder exits at 14, not 21

// ── Portfolio stress rules ───────────────────────────────────
export const GUVIDEL_STRESS_PAUSE_PCT = -0.10;   // unrealized ≤ −10% NAV → no new rungs
export const GUVIDEL_STRESS_TESTED_PCT = -0.20;  // ≤ −20% NAV → close TESTED rungs
export const GUVIDEL_BOOK_KILL_DD = 0.20;        // 20% drawdown → close everything

export type SkewClassification = 'STEEP' | 'NORMAL' | 'FLAT' | 'INVERTED';
export type IcStructure = 'SYMMETRIC' | 'PUT-TILTED' | 'CALL-TILTED';

export interface ISkew25 {
    putIv: number;
    callIv: number;
    skewPts: number;      // (putIV − callIV) × 100, vol points
    skewPct: number;      // (putIV − callIV) / callIV × 100
    classification: SkewClassification;
}

/** One strike row. Symbols are TASTYTRADE format (e.g. "QQQ   260925C00725000")
 *  because the REST /market-data/by-type snapshot is keyed by them — dxFeed
 *  streamer symbols return nothing there. */
export interface IChainStrike {
    strike: number;
    callSymbol: string;
    putSymbol: string;
}

/** A quote is usable for pricing only when LIVE and two-sided (house mandate). */
export function isTwoSided(q: IOptionQuote | undefined): q is IOptionQuote {
    return !!q && q.bid > 0 && q.ask > 0;
}

export function classifySkew(skewPts: number): SkewClassification {
    if (skewPts >= 5) return 'STEEP';
    if (skewPts >= 0.5) return 'NORMAL';
    if (skewPts > -0.5) return 'FLAT';
    return 'INVERTED';
}

/** σ of daily close-to-close simple returns over the lookback window. */
export function computeDailySigma(closes: number[]): number | null {
    const window = closes.slice(-(GUVIDEL_VOL_LOOKBACK + 1));
    if (window.length < 20) return null; // not enough history to trust
    const returns: number[] = [];
    for (let i = 1; i < window.length; i++) {
        if (window[i - 1] > 0) returns.push(window[i] / window[i - 1] - 1);
    }
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
}

/** 2σ move gate: skip the ticker if yesterday's close-to-close move OR today's
 *  move so far exceeds 2 × σ_daily. */
export function twoSigmaGate(closes: number[], spotNow: number): { blocked: boolean; reason: string } {
    const sigma = computeDailySigma(closes);
    if (sigma === null) return { blocked: false, reason: 'insufficient history — gate skipped' };
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const yesterdayMove = prev > 0 ? Math.abs(last / prev - 1) : 0;
    const todayMove = last > 0 && spotNow > 0 ? Math.abs(spotNow / last - 1) : 0;
    const limit = 2 * sigma;
    if (yesterdayMove > limit) {
        return { blocked: true, reason: `yesterday moved ${(yesterdayMove * 100).toFixed(2)}% > 2σ (${(limit * 100).toFixed(2)}%)` };
    }
    if (todayMove > limit) {
        return { blocked: true, reason: `today moved ${(todayMove * 100).toFixed(2)}% so far > 2σ (${(limit * 100).toFixed(2)}%)` };
    }
    return { blocked: false, reason: `calm: yday ${(yesterdayMove * 100).toFixed(2)}%, today ${(todayMove * 100).toFixed(2)}%, 2σ=${(limit * 100).toFixed(2)}%` };
}

/** Find the option (per side) nearest a target |delta|, requiring a two-sided
 *  quote. Returns null when no strike has usable delta data. */
function findByDelta(
    strikes: IChainStrike[],
    quotes: Map<string, IOptionQuote>,
    side: 'P' | 'C',
    targetAbsDelta: number,
): { strike: number; quote: IOptionQuote } | null {
    let best: { strike: number; quote: IOptionQuote; distance: number } | null = null;
    for (const s of strikes) {
        const q = quotes.get(side === 'P' ? s.putSymbol : s.callSymbol);
        if (!isTwoSided(q) || q.delta === null) continue;
        const distance = Math.abs(Math.abs(q.delta) - targetAbsDelta);
        if (!best || distance < best.distance) best = { strike: s.strike, quote: q, distance };
    }
    return best ? { strike: best.strike, quote: best.quote } : null;
}

/** 25Δ skew for one expiration (Part 1 of the spec). Null when either side
 *  lacks a usable ~25Δ option with IV. */
export function measureSkew25(strikes: IChainStrike[], quotes: Map<string, IOptionQuote>): ISkew25 | null {
    const put = findByDelta(strikes, quotes, 'P', 0.25);
    const call = findByDelta(strikes, quotes, 'C', 0.25);
    if (!put || !call || put.quote.iv === null || call.quote.iv === null) return null;
    if (call.quote.iv <= 0) return null;
    const skewPts = (put.quote.iv - call.quote.iv) * 100;
    const skewPct = ((put.quote.iv - call.quote.iv) / call.quote.iv) * 100;
    return {
        putIv: put.quote.iv,
        callIv: call.quote.iv,
        skewPts: Math.round(skewPts * 100) / 100,
        skewPct: Math.round(skewPct * 100) / 100,
        classification: classifySkew(skewPts),
    };
}

/** Structure decision from relative 25Δ skew % (IC_SCAN_SYM_THRESHOLD). */
export function decideStructure(skewPct: number | null): IcStructure {
    if (skewPct === null) return 'SYMMETRIC';
    if (skewPct > IC_SCAN_SYM_THRESHOLD) return 'PUT-TILTED';
    if (skewPct < -IC_SCAN_SYM_THRESHOLD) return 'CALL-TILTED';
    return 'SYMMETRIC';
}

const SQRT_2 = Math.sqrt(2);
function normCdf(x: number): number {
    // Abramowitz-Stegun erf approximation — plenty for a display POP
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / SQRT_2);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
    return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** P(S_T < K) under a zero-drift lognormal with the given IV. */
function probBelow(spot: number, k: number, iv: number, dte: number): number {
    if (spot <= 0 || k <= 0 || iv <= 0 || dte <= 0) return 0.5;
    const t = dte / 365;
    const denom = iv * Math.sqrt(t);
    const d = (Math.log(k / spot) + (iv * iv * t) / 2) / denom;
    return normCdf(d);
}

export interface IRungResult {
    shortPut: number;
    longPut: number;
    shortCall: number;
    longCall: number;
    putWing: number;         // actual strike distance
    callWing: number;
    width: number;           // max(putWing, callWing) — defines max risk
    credit: number;          // per share, after slippage haircut
    pop: number;             // P(profit > 0), lognormal on breakevens
    pf: number;              // P(full profit), lognormal on short strikes
    ev: number;              // managed EV per contract, $ (loss leg = stop fill)
    deltaShortPut: number;
    deltaShortCall: number;
    thetaTotal: number;
    structure: IcStructure;
}

/**
 * Build one Guvidelul rung (Part 6.4 + Part 7 pricing integrity):
 * shorts nearest 0.18Δ put / 0.16Δ call, longs nearest ±$10 (tilted side ×2),
 * actual width within ±50% of target, two-sided quotes on all 4 legs,
 * slippage haircut, credit plausibility invariant.
 */
export function buildRung(
    strikes: IChainStrike[],
    quotes: Map<string, IOptionQuote>,
    spot: number,
    dte: number,
    structure: IcStructure,
): { rung: IRungResult | null; reason: string } {
    const sp = findByDelta(strikes, quotes, 'P', IC_SHORT_PUT_DELTA);
    const sc = findByDelta(strikes, quotes, 'C', IC_SHORT_CALL_DELTA);
    if (!sp || !sc) return { rung: null, reason: 'no short strike with two-sided quote near target delta' };
    if (sp.strike >= sc.strike) return { rung: null, reason: `short put ${sp.strike} >= short call ${sc.strike} — chain too tight` };

    const putWingTarget = structure === 'PUT-TILTED' ? GUVIDEL_WING_TARGET * IC_SCAN_TILT_WING_MULT : GUVIDEL_WING_TARGET;
    const callWingTarget = structure === 'CALL-TILTED' ? GUVIDEL_WING_TARGET * IC_SCAN_TILT_WING_MULT : GUVIDEL_WING_TARGET;

    // Long strikes: nearest listed strike to short ± wing, strictly BEYOND the
    // short (a sparse grid would otherwise "find" the short strike itself → wing 0)
    const nearestStrike = (target: number, accept: (k: number) => boolean): IChainStrike | null => {
        let best: IChainStrike | null = null;
        let bestDist = Infinity;
        for (const s of strikes) {
            if (!accept(s.strike)) continue;
            const d = Math.abs(s.strike - target);
            if (d < bestDist) { best = s; bestDist = d; }
        }
        return best;
    };

    const lp = nearestStrike(sp.strike - putWingTarget, (k) => k < sp.strike);
    const lc = nearestStrike(sc.strike + callWingTarget, (k) => k > sc.strike);
    if (!lp || !lc) return { rung: null, reason: 'no long strikes listed' };

    const putWing = sp.strike - lp.strike;
    const callWing = lc.strike - sc.strike;
    const wingOk = (actual: number, target: number) =>
        actual > 0 && Math.abs(actual - target) <= GUVIDEL_WING_TOLERANCE * target;
    if (!wingOk(putWing, putWingTarget)) {
        return { rung: null, reason: `put wing ${putWing} outside ±50% of $${putWingTarget}` };
    }
    if (!wingOk(callWing, callWingTarget)) {
        return { rung: null, reason: `call wing ${callWing} outside ±50% of $${callWingTarget}` };
    }

    const lpq = quotes.get(lp.putSymbol);
    const lcq = quotes.get(lc.callSymbol);
    if (!isTwoSided(lpq) || !isTwoSided(lcq)) {
        return { rung: null, reason: 'long leg missing two-sided quote' };
    }

    // Screening credit: short mids − long mids − slippage haircut
    const rawCredit = sp.quote.mid + sc.quote.mid - lpq.mid - lcq.mid;
    const credit = rawCredit - SLIPPAGE_PER_IC;
    if (credit <= MIN_SCREENING_CREDIT) {
        return { rung: null, reason: `credit $${credit.toFixed(2)} <= $${MIN_SCREENING_CREDIT} after slippage` };
    }

    const width = Math.max(putWing, callWing);

    // Credit plausibility invariant (quote_integrity.implausible):
    // a defined-risk credit can never exceed width, and far above
    // width × Σ|Δshort| is a broken quote, not free money.
    const sumShortDeltas = Math.abs(sp.quote.delta ?? 0) + Math.abs(sc.quote.delta ?? 0);
    if (credit >= width) {
        return { rung: null, reason: `implausible: credit $${credit.toFixed(2)} >= width $${width}` };
    }
    if (sumShortDeltas > 0 && credit > width * sumShortDeltas * 2) {
        return { rung: null, reason: `implausible: credit $${credit.toFixed(2)} >> width × Σ|Δshort| ($${(width * sumShortDeltas).toFixed(2)})` };
    }

    // POP model (Part 3): zero-drift lognormal tails, each side on its own short-strike IV
    const putIv = sp.quote.iv ?? 0;
    const callIv = sc.quote.iv ?? 0;
    let pop: number;
    let pf: number;
    if (putIv > 0 && callIv > 0 && spot > 0 && dte > 0) {
        const putBe = sp.strike - credit;
        const callBe = sc.strike + credit;
        pop = Math.max(0, (probBelow(spot, callBe, callIv, dte) - probBelow(spot, putBe, putIv, dte)) * 100);
        pf = Math.max(0, (probBelow(spot, sc.strike, callIv, dte) - probBelow(spot, sp.strike, putIv, dte)) * 100);
    } else {
        // Fallback: delta proxy, flagged by identical pop/pf
        pop = Math.max(0, 100 - sumShortDeltas * 100);
        pf = pop;
    }

    // Managed EV: the loss leg assumes the advertised stop fills, not max loss
    const stopLoss = Math.min(width - credit, (GUVIDEL_BOOK_STOP_MULT - 1) * credit);
    const ev = ((pf / 100) * credit - (1 - pf / 100) * stopLoss) * 100;

    const theta = (lpq.theta ?? 0) + (lcq.theta ?? 0) - (sp.quote.theta ?? 0) - (sc.quote.theta ?? 0);

    return {
        rung: {
            shortPut: sp.strike,
            longPut: lp.strike,
            shortCall: sc.strike,
            longCall: lc.strike,
            putWing,
            callWing,
            width,
            credit: Math.round(credit * 100) / 100,
            pop: Math.round(pop * 10) / 10,
            pf: Math.round(pf * 10) / 10,
            ev: Math.round(ev * 100) / 100,
            deltaShortPut: sp.quote.delta ?? 0,
            deltaShortCall: sc.quote.delta ?? 0,
            thetaTotal: Math.round(theta * 100) / 100,
            structure,
        },
        reason: 'ok',
    };
}

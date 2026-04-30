// Observational metrics for Guvidul — spec 2026-04-21-guvidul-observational-metrics-design.md
// Pure functions, no service imports. Used by ic-picker (PROVEST block) and closeCheck (touch alert).

export type TouchAlertLevel = 'normal' | 'yellow' | 'orange' | 'red';

/**
 * Probability of ever touching a short strike before expiration.
 * Approximation: 2 × max(|delta|), clamped [0, 100].
 * Deltas are decimals in [-1, 1] per codebase convention.
 */
export function probTouch(shortPutDelta: number, shortCallDelta: number): number {
    const m = Math.max(Math.abs(shortPutDelta), Math.abs(shortCallDelta));
    return Math.min(100, Math.round(2 * 100 * m));
}

/**
 * Heads-up alert level for open positions based on current short-leg deltas.
 * Aligns with existing roll trigger at |delta| > 0.40 (orange = roll candidate).
 */
export function touchAlertLevel(shortPutDelta: number, shortCallDelta: number): TouchAlertLevel {
    const m = Math.max(Math.abs(shortPutDelta), Math.abs(shortCallDelta));
    if (m >= 0.50) return 'red';
    if (m >= 0.40) return 'orange';
    if (m >= 0.30) return 'yellow';
    return 'normal';
}

export function touchAlertPrefix(level: TouchAlertLevel): string {
    switch (level) {
        case 'red': return '[🔴 ADJUST]';
        case 'orange': return '[🟠 WARN]';
        case 'yellow': return '[🟡 WATCH]';
        case 'normal': return '';
    }
}

export function ivrVerdict(ivRank: number): 'low' | 'preferred' | 'ideal' {
    if (ivRank >= 50) return 'ideal';
    if (ivRank >= 30) return 'preferred';
    return 'low';
}

export interface ProvestInputs {
    pop: number;                  // 0-100
    probTouch: number;            // 0-100
    compositeScore: number;       // model score
    profileName: string;          // e.g. "Neutral"
    wings: number;                // dollars
    minDelta: number;             // e.g. 11
    maxDelta: number;             // e.g. 24
    shortPutDelta: number;        // decimal, e.g. -0.16
    shortCallDelta: number;       // decimal, e.g. 0.16
    vix: number;
    ticker: string;               // "SPX" | "QQQ"
    ivRank: number;               // 0-100
    dte: number;
    dteManagement: number;        // e.g. 14
    putIv?: number | null;        // decimal, e.g. 0.185
    callIv?: number | null;       // decimal
    timingNote?: string;          // e.g. "market-hours scan, no FOMC in 5d window"
}

/**
 * Build the 7-line PROVEST prelude for LLM/agent rationale.
 * Exact order P-R-O-V-E-S-T is contractual — do not reorder.
 */
export function buildProvestBlock(input: ProvestInputs): string {
    const absPut = Math.round(Math.abs(input.shortPutDelta) * 100);
    const absCall = Math.round(Math.abs(input.shortCallDelta) * 100);
    const diff = absPut - absCall;
    const symmetryNote = diff === 0 ? 'symmetric' : `asymmetric (tilt ${diff > 0 ? '+' : ''}${diff})`;

    let skewNote: string;
    if (input.putIv != null && input.callIv != null) {
        const skewPts = Math.round((input.putIv - input.callIv) * 1000) / 10; // decimal → vol pts with 1dp
        if (Math.abs(skewPts) < 0.5) skewNote = 'balanced';
        else if (skewPts > 0) skewNote = `put skew +${skewPts} vol pts vs call — richer put side`;
        else skewNote = `call skew +${Math.abs(skewPts)} vol pts vs put — richer call side`;
    } else {
        skewNote = 'skew unavailable';
    }

    const timing = input.timingNote ?? 'market-hours scan';

    return [
        `P — POP ${input.pop.toFixed(1)}% | ProbTouch ${input.probTouch}%`,
        `R — Score ${input.compositeScore.toFixed(2)} | fits ${input.profileName} (wings $${input.wings}, Δ ${input.minDelta}-${input.maxDelta})`,
        `O — short ${absPut}Δ put / ${absCall}Δ call, ${symmetryNote}`,
        `V — VIX ${input.vix.toFixed(1)} | ${input.ticker} IVR ${Math.round(input.ivRank)} (${ivrVerdict(input.ivRank)})`,
        `E — ${input.dte} DTE | management at ${input.dteManagement}`,
        `S — ${skewNote}`,
        `T — ${timing}`,
    ].join('\n');
}

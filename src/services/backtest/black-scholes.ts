/**
 * Black-Scholes option pricing and Greeks calculator.
 * Pure math module — no dependencies on services, MobX, or DOM.
 *
 * Used in the backtest engine to:
 * 1. Calculate implied volatility from real market prices (Newton-Raphson)
 * 2. Derive Greeks (delta, gamma, theta, vega) from IV + market params
 * 3. Validate theoretical prices against observed market data
 */

// ─── Standard Normal Distribution ────────────────────────────────────────────

/**
 * Cumulative distribution function for the standard normal distribution.
 * Uses the rational approximation from Abramowitz & Stegun (1964), §26.2.17.
 * Accuracy: |error| < 7.5 × 10⁻⁸
 */
export function normalCDF(x: number): number {
    if (x === 0) return 0.5;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;

    const y = 1.0 - ((a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-absX * absX / 2));

    return 0.5 * (1.0 + sign * y);
}

/**
 * Probability density function for the standard normal distribution.
 */
export function normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ─── Black-Scholes Core ──────────────────────────────────────────────────────

export type OptionType = 'call' | 'put';

/**
 * Compute d1 and d2 terms used throughout Black-Scholes formulas.
 *
 * @param S  Spot price of the underlying
 * @param K  Strike price
 * @param T  Time to expiration in years (DTE / 365)
 * @param r  Risk-free interest rate (annual, e.g., 0.05 for 5%)
 * @param sigma  Implied volatility (annual, e.g., 0.25 for 25%)
 */
function d1d2(S: number, K: number, T: number, r: number, sigma: number): { d1: number; d2: number } {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    return { d1, d2 };
}

/**
 * Black-Scholes theoretical option price.
 *
 * Call = S·N(d1) - K·e^(-rT)·N(d2)
 * Put  = K·e^(-rT)·N(-d2) - S·N(-d1)
 */
export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number {
    if (T <= 0) {
        // At or past expiration: intrinsic value only
        return type === 'call'
            ? Math.max(0, S - K)
            : Math.max(0, K - S);
    }
    if (sigma <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);

    const { d1, d2 } = d1d2(S, K, T, r, sigma);
    const discount = Math.exp(-r * T);

    if (type === 'call') {
        return S * normalCDF(d1) - K * discount * normalCDF(d2);
    } else {
        return K * discount * normalCDF(-d2) - S * normalCDF(-d1);
    }
}

// ─── Greeks ──────────────────────────────────────────────────────────────────

/**
 * Delta: rate of change of option price with respect to underlying price.
 * Call delta: N(d1)          → range [0, 1]
 * Put delta:  N(d1) - 1      → range [-1, 0]
 */
export function bsDelta(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number {
    if (T <= 0 || sigma <= 0) {
        if (type === 'call') return S > K ? 1 : (S === K ? 0.5 : 0);
        return S < K ? -1 : (S === K ? -0.5 : 0);
    }
    const { d1 } = d1d2(S, K, T, r, sigma);
    return type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
}

/**
 * Gamma: rate of change of delta with respect to underlying price.
 * Same for both calls and puts: N'(d1) / (S · σ · √T)
 */
export function bsGamma(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0 || sigma <= 0) return 0;
    const { d1 } = d1d2(S, K, T, r, sigma);
    return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

/**
 * Theta: rate of time decay (per calendar day).
 * Returns negative values (options lose value over time).
 *
 * Call: -(S·N'(d1)·σ) / (2·√T) - r·K·e^(-rT)·N(d2)
 * Put:  -(S·N'(d1)·σ) / (2·√T) + r·K·e^(-rT)·N(-d2)
 *
 * Divided by 365 to get per-calendar-day theta.
 */
export function bsTheta(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number {
    if (T <= 0 || sigma <= 0) return 0;
    const { d1, d2 } = d1d2(S, K, T, r, sigma);
    const sqrtT = Math.sqrt(T);
    const discount = Math.exp(-r * T);
    const commonTerm = -(S * normalPDF(d1) * sigma) / (2 * sqrtT);

    let thetaAnnual: number;
    if (type === 'call') {
        thetaAnnual = commonTerm - r * K * discount * normalCDF(d2);
    } else {
        thetaAnnual = commonTerm + r * K * discount * normalCDF(-d2);
    }

    return thetaAnnual / 365; // per calendar day
}

/**
 * Vega: sensitivity of option price to 1% change in volatility.
 * Same for calls and puts: S · N'(d1) · √T / 100
 * Divided by 100 so it represents price change per 1 percentage point of vol.
 */
export function bsVega(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0 || sigma <= 0) return 0;
    const { d1 } = d1d2(S, K, T, r, sigma);
    return S * normalPDF(d1) * Math.sqrt(T) / 100;
}

// ─── Implied Volatility Solver ───────────────────────────────────────────────

const IV_MAX_ITERATIONS = 100;
const IV_PRECISION = 1e-6;
const IV_MIN = 0.001;    // 0.1%
const IV_MAX = 5.0;      // 500%

/**
 * Solve for implied volatility using Newton-Raphson method.
 * Given a real market price, finds the σ that makes BS price match.
 *
 * @param marketPrice  Observed option price from the market
 * @param S  Spot price of the underlying
 * @param K  Strike price
 * @param T  Time to expiration in years
 * @param r  Risk-free rate (annual)
 * @param type  'call' or 'put'
 * @returns Implied volatility (annual), or NaN if solver fails
 */
export function bsImpliedVol(
    marketPrice: number,
    S: number,
    K: number,
    T: number,
    r: number,
    type: OptionType
): number {
    if (T <= 0 || marketPrice <= 0) return NaN;

    // Intrinsic value check
    const intrinsic = type === 'call' ? Math.max(0, S - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S);
    if (marketPrice < intrinsic * 0.99) return NaN; // Price below intrinsic → no valid IV

    // Initial guess: use Brenner-Subrahmanyam approximation
    let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
    sigma = Math.max(IV_MIN, Math.min(IV_MAX, sigma));

    for (let i = 0; i < IV_MAX_ITERATIONS; i++) {
        const price = bsPrice(S, K, T, r, sigma, type);
        const diff = price - marketPrice;

        if (Math.abs(diff) < IV_PRECISION) {
            return sigma;
        }

        // Vega for Newton step (raw, not divided by 100)
        const { d1 } = d1d2(S, K, T, r, sigma);
        const vegaRaw = S * normalPDF(d1) * Math.sqrt(T);

        if (vegaRaw < 1e-12) {
            // Vega too small — bisection fallback
            break;
        }

        sigma -= diff / vegaRaw;
        sigma = Math.max(IV_MIN, Math.min(IV_MAX, sigma));
    }

    // Fallback: bisection method
    let lo = IV_MIN;
    let hi = IV_MAX;

    for (let i = 0; i < IV_MAX_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        const price = bsPrice(S, K, T, r, mid, type);
        const diff = price - marketPrice;

        if (Math.abs(diff) < IV_PRECISION) return mid;
        if (diff > 0) {
            hi = mid;
        } else {
            lo = mid;
        }

        if (hi - lo < IV_PRECISION) return mid;
    }

    return (lo + hi) / 2; // Best approximation
}

// ─── Convenience: All Greeks at Once ─────────────────────────────────────────

export interface IBlackScholesGreeks {
    price: number;
    delta: number;
    gamma: number;
    theta: number;     // per calendar day
    vega: number;      // per 1% vol change
    impliedVolatility: number;
}

/**
 * Compute all Greeks at once from a market price.
 * First solves for IV, then computes all Greeks using that IV.
 *
 * @param marketPrice  Observed option close price
 * @param S  Spot price
 * @param K  Strike price
 * @param T  Time to expiration in years (DTE / 365)
 * @param r  Risk-free rate (annual)
 * @param type  'call' or 'put'
 */
export function computeGreeksFromMarketPrice(
    marketPrice: number,
    S: number,
    K: number,
    T: number,
    r: number,
    type: OptionType
): IBlackScholesGreeks | null {
    const iv = bsImpliedVol(marketPrice, S, K, T, r, type);
    if (isNaN(iv)) return null;

    return {
        price: bsPrice(S, K, T, r, iv, type),
        delta: bsDelta(S, K, T, r, iv, type),
        gamma: bsGamma(S, K, T, r, iv),
        theta: bsTheta(S, K, T, r, iv, type),
        vega: bsVega(S, K, T, r, iv),
        impliedVolatility: iv,
    };
}

/**
 * Compute all Greeks from a known IV (skip IV solver).
 */
export function computeGreeksFromIV(
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    type: OptionType
): IBlackScholesGreeks {
    return {
        price: bsPrice(S, K, T, r, sigma, type),
        delta: bsDelta(S, K, T, r, sigma, type),
        gamma: bsGamma(S, K, T, r, sigma),
        theta: bsTheta(S, K, T, r, sigma, type),
        vega: bsVega(S, K, T, r, sigma),
        impliedVolatility: sigma,
    };
}

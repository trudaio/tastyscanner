// getTechnicalsOnDemand — callable Function for arbitrary ticker (non-SPX/QQQ)
// Auth required. Rate-limited to 10 calls/min per user.

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
    computeRSI, computeBB, computeATR,
    rsiVerdict, bbVerdict, atrVerdict,
} from './shared/technicals';
import { fetchDailyBarsWithRetry } from './shared/polygon-client';

const polygonApiKey = defineSecret('POLYGON_API_KEY');

const BARS_REQUESTED = 120;
const BARS_STORED = 90;
const RATE_LIMIT_MAX = 10;       // calls per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

async function checkRateLimit(uid: string): Promise<void> {
    const db = admin.firestore();
    const ref = db.collection('users').doc(uid).collection('rateLimits').doc('technicals');
    const now = Date.now();
    const snap = await ref.get();
    const existing = snap.data() as { timestamps?: number[] } | undefined;
    const recent = (existing?.timestamps ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
        throw new HttpsError('resource-exhausted', `Rate limit: ${RATE_LIMIT_MAX}/min. Try again shortly.`);
    }
    recent.push(now);
    await ref.set({ timestamps: recent }, { merge: false });
}

export const getTechnicalsOnDemand = onCall(
    {
        region: 'us-east1',
        secrets: [polygonApiKey],
        timeoutSeconds: 60,
        memory: '256MiB',
        cors: true,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Authentication required');
        }
        const ticker = (request.data?.ticker as string | undefined)?.trim().toUpperCase();
        if (!ticker || !/^[A-Z.$]{1,10}$/.test(ticker)) {
            throw new HttpsError('invalid-argument', 'Invalid ticker');
        }

        await checkRateLimit(request.auth.uid);

        const apiKey = polygonApiKey.value();
        if (!apiKey) {
            throw new HttpsError('failed-precondition', 'Server misconfigured: POLYGON_API_KEY missing');
        }

        try {
            const fullBars = await fetchDailyBarsWithRetry(apiKey, ticker, BARS_REQUESTED, 3);
            if (fullBars.length < 30) {
                throw new HttpsError('not-found', `Only ${fullBars.length} bars for ${ticker}`);
            }

            const closes = fullBars.map((b) => b.close);
            const rsiVal = computeRSI(closes, 14);
            const bb = computeBB(closes, 20, 2);
            const atrVal = computeATR(fullBars, 14);
            const storedBars = fullBars.slice(-BARS_STORED);

            return {
                ticker,
                computedAt: new Date().toISOString(),
                stale: false,
                bars: storedBars,
                rsi: {
                    value: Math.round(rsiVal * 100) / 100,
                    verdict: rsiVerdict(rsiVal),
                },
                bb: {
                    upper: Math.round(bb.upper * 100) / 100,
                    mid: Math.round(bb.mid * 100) / 100,
                    lower: Math.round(bb.lower * 100) / 100,
                    stdDev: Math.round(bb.stdDev * 100) / 100,
                    percentB: Math.round(bb.percentB * 1000) / 1000,
                    distanceSigma: Math.round(bb.distanceSigma * 100) / 100,
                    verdict: bbVerdict(bb.distanceSigma),
                },
                atr: {
                    value: Math.round(atrVal * 100) / 100,
                    verdict: atrVerdict(ticker, atrVal),
                },
            };
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[getTechnicalsOnDemand] ${ticker} failed:`, msg);
            throw new HttpsError('unavailable', `Unable to compute technicals for ${ticker}: ${msg}`);
        }
    }
);

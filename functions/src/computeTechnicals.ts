// computeTechnicals — Cloud Scheduler daily 4:15 PM ET (Mon-Fri)
// For SPX + QQQ: fetch 120 daily bars from Polygon → compute RSI/BB/ATR on trailing 90 → write Firestore.
// On fetch failure: keep previous Firestore doc, set stale:true.

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import {
    computeRSI, computeBB, computeATR,
    rsiVerdict, bbVerdict, atrVerdict,
    type OHLC,
} from './shared/technicals';
import { fetchDailyBarsWithRetry } from './shared/polygon-client';

const polygonApiKey = defineSecret('POLYGON_API_KEY');

const TICKERS = ['SPX', 'QQQ'] as const;
const BARS_REQUESTED = 120;  // 90 for output + 30 buffer for RSI/ATR warmup
const BARS_STORED = 90;

async function computeAndStore(
    db: admin.firestore.Firestore,
    ticker: string,
    apiKey: string,
): Promise<void> {
    const ref = db.collection('marketTechnicals').doc(ticker);
    try {
        const fullBars = await fetchDailyBarsWithRetry(apiKey, ticker, BARS_REQUESTED, 3);
        if (fullBars.length < 30) {
            throw new Error(`Only ${fullBars.length} bars returned for ${ticker}`);
        }

        // Indicators need warmup, so compute on the full array
        const closes = fullBars.map((b) => b.close);
        const rsiVal = computeRSI(closes, 14);
        const bb = computeBB(closes, 20, 2);
        const atrVal = computeATR(fullBars, 14);

        // Only store the last 90 bars in Firestore (keeps doc compact)
        const storedBars: OHLC[] = fullBars.slice(-BARS_STORED);

        await ref.set({
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
        });
        console.log(`[computeTechnicals] ${ticker} ok: RSI ${rsiVal.toFixed(2)}, BB ${bb.distanceSigma.toFixed(2)}σ, ATR ${atrVal.toFixed(2)}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[computeTechnicals] ${ticker} FAILED: ${msg}`);
        // Mark existing doc stale (don't overwrite bars/indicators)
        try {
            await ref.set({ stale: true, staleReason: msg, staleAt: new Date().toISOString() }, { merge: true });
        } catch (e) {
            console.error(`[computeTechnicals] Failed to mark ${ticker} stale:`, e);
        }
    }
}

export const computeTechnicals = onSchedule(
    {
        schedule: '15 16 * * 1-5', // 4:15 PM ET Mon-Fri
        timeZone: 'America/New_York',
        region: 'us-east1',
        secrets: [polygonApiKey],
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const db = admin.firestore();
        const apiKey = polygonApiKey.value();
        if (!apiKey) {
            console.error('[computeTechnicals] POLYGON_API_KEY not configured');
            return;
        }
        for (const ticker of TICKERS) {
            await computeAndStore(db, ticker, apiKey);
        }
    }
);

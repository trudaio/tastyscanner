#!/usr/bin/env node
// morning-scan.mjs — Guvid Agent morning scan
// Run at 10:30 AM ET (1h after market open)
// Scans SPX + QQQ with conservative / neutral / aggressive IC profiles
// Saves results to Firestore guvid-agent collection

import * as https from 'https';

process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/firebase-sa.json';

import admin from 'firebase-admin';

const app = admin.initializeApp();
const db = admin.firestore();

// ─── TastyTrade REST client ───────────────────────────────────────────────────

const BASE_URL = 'api.tastyworks.com';

function request(method, path, token, body) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: BASE_URL,
            path,
            method,
            headers: {
                'User-Agent': 'tastyscanner-guvid/1.0',
                Accept: 'application/json',
                ...(token ? { Authorization: token } : {}),
                ...(body ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
            },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) {
                    reject(new Error(`TastyTrade ${method} ${path} → ${res.statusCode}: ${data.substring(0, 300)}`));
                    return;
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`Bad JSON from ${path}: ${data.substring(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

async function getAccessToken(creds) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_secret: creds.clientSecret,
    }).toString();
    const resp = await request('POST', '/oauth/token', null, body);
    return `Bearer ${resp.access_token}`;
}

async function getAccounts(token) {
    const resp = await request('GET', '/customers/me/accounts', token);
    return resp.data.items.map((i) => i.account);
}

async function getAccountBalances(token, accountNumber) {
    const resp = await request('GET', `/accounts/${accountNumber}/balances`, token);
    const d = resp.data;
    return {
        netLiquidatingValue: parseFloat(d['net-liquidating-value'] || '0'),
        derivativeBuyingPower: parseFloat(d['derivative-buying-power'] || '0'),
        cashBalance: parseFloat(d['cash-balance'] || '0'),
    };
}

async function getUnderlyingPrice(token, symbol) {
    try {
        const params = new URLSearchParams();
        if (symbol === 'SPX' || symbol === 'VIX' || symbol.startsWith('$')) {
            params.append('index', symbol);
        } else {
            params.append('equity', symbol);
        }
        const resp = await request('GET', `/market-data/by-type?${params.toString()}`, token);
        const item = resp.data.items[0];
        if (!item) return null;
        // Indices return "mark" or "last"; equities return "last-trade-price"
        for (const field of ['last-trade-price', 'mark', 'last']) {
            const val = item[field] ? parseFloat(item[field]) : 0;
            if (val > 0) return val;
        }
        const bid = parseFloat(item.bid ?? '0');
        const ask = parseFloat(item.ask ?? '0');
        return (bid + ask) / 2 || null;
    } catch (e) {
        console.error(`  [price] ${symbol}: ${e.message}`);
        return null;
    }
}

async function getIVR(token, symbol) {
    try {
        const params = new URLSearchParams();
        params.append('symbols[]', symbol);
        const resp = await request('GET', `/market-metrics?${params.toString()}`, token);
        const item = resp.data?.items?.[0];
        if (!item) return 0;
        const ivr = item['implied-volatility-index-rank'];
        return ivr ? Math.round(parseFloat(ivr) * 100) : 0;
    } catch (_) {
        return 0;
    }
}

async function getOptionsChain(token, underlying) {
    const encoded = encodeURIComponent(underlying);
    return request('GET', `/option-chains/${encoded}/nested`, token);
}

async function getMarketDataSnapshot(token, symbols) {
    const result = new Map();
    const batches = [];
    for (let i = 0; i < symbols.length; i += 100) batches.push(symbols.slice(i, i + 100));

    for (const batch of batches) {
        const params = new URLSearchParams();
        for (const s of batch) params.append('equity-option', s);
        try {
            const resp = await request('GET', `/market-data/by-type?${params.toString()}`, token);
            for (const item of resp.data.items) {
                const bid = parseFloat(item.bid ?? '0');
                const ask = parseFloat(item.ask ?? '0');
                const mid = item.mid ? parseFloat(item.mid) : (bid + ask) / 2;
                result.set(item.symbol, {
                    symbol: item.symbol,
                    bid, ask, mid,
                    delta: item.delta ? parseFloat(item.delta) : null,
                    theta: item.theta ? parseFloat(item.theta) : null,
                    iv: item['implied-volatility-index'] ? parseFloat(item['implied-volatility-index']) : null,
                });
            }
        } catch (e) {
            console.error('  [snapshot] batch failed:', e.message);
        }
    }
    return result;
}

// ─── IC profiles ─────────────────────────────────────────────────────────────

const PROFILES = {
    conservative: {
        name: 'conservative',
        deltaMin: 0.11, deltaMax: 0.16,
        dteMin: 30,     dteMax: 47,
        wings: 10,
        minPOP: 80,
        maxRR: 4,
        minCredit: 1.0,
        weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
    },
    neutral: {
        name: 'neutral',
        deltaMin: 0.11, deltaMax: 0.24,
        dteMin: 19,     dteMax: 47,
        wings: 10,
        minPOP: 60,
        maxRR: 4,
        minCredit: 1.0,
        weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
    },
    aggressive: {
        name: 'aggressive',
        deltaMin: 0.15, deltaMax: 0.24,
        dteMin: 19,     dteMax: 35,
        wings: 5,
        minPOP: 60,
        maxRR: 4,
        minCredit: 1.0,
        weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
    },
};

// ─── IC building ─────────────────────────────────────────────────────────────

const SLIPPAGE = 0.025;

function calcPOP(deltaShortPut, deltaShortCall) {
    return Math.max(0, 100 - Math.max(Math.abs(deltaShortPut), Math.abs(deltaShortCall)) * 100);
}

function calcEV(credit, wings, pop) {
    const win = pop / 100;
    return win * credit * 100 - (1 - win) * (wings - credit) * 100;
}

function scoreIC(pop, ev, alpha, weights) {
    const evNorm = Math.max(-10, Math.min(10, ev / 10));
    const alphaNorm = Math.max(-10, Math.min(10, alpha));
    return weights.pop * pop + weights.ev * evNorm * 10 + weights.alpha * alphaNorm * 10;
}

/**
 * Symmetric delta pairing: collect short-put and short-call candidates in the
 * delta range, sort both by |delta| descending, pair by index.
 */
function buildIcCandidates(strikes, quotes, underlyingPrice, profile) {
    const OTM_LIMIT = 0.08;
    const puts = [];
    const calls = [];

    for (const s of strikes) {
        const pctOTM = Math.abs(s.strike - underlyingPrice) / underlyingPrice;
        if (pctOTM > OTM_LIMIT) continue;

        // Look up by regular symbol (market-data/by-type uses regular symbols)
        const pq = quotes.get(s.putSymbol);
        const cq = quotes.get(s.callSymbol);

        if (pq && pq.delta !== null) {
            const d = Math.abs(pq.delta);
            if (d >= profile.deltaMin && d <= profile.deltaMax) {
                puts.push({ strike: s.strike, delta: pq.delta, mid: pq.mid, theta: pq.theta ?? 0 });
            }
        }
        if (cq && cq.delta !== null) {
            const d = Math.abs(cq.delta);
            if (d >= profile.deltaMin && d <= profile.deltaMax) {
                calls.push({ strike: s.strike, delta: cq.delta, mid: cq.mid, theta: cq.theta ?? 0 });
            }
        }
    }

    // Sort by |delta| descending (highest delta = closest to money first)
    puts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    calls.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const allStrikeSet = new Set(strikes.map((s) => s.strike));
    const candidates = [];
    const pairCount = Math.min(puts.length, calls.length);

    for (let i = 0; i < pairCount; i++) {
        const sp = puts[i];
        const sc = calls[i];

        const pbStrike = sp.strike - profile.wings;
        const cbStrike = sc.strike + profile.wings;
        if (!allStrikeSet.has(pbStrike) || !allStrikeSet.has(cbStrike)) continue;

        const pbEntry = strikes.find((s) => s.strike === pbStrike);
        const cbEntry = strikes.find((s) => s.strike === cbStrike);
        if (!pbEntry || !cbEntry) continue;

        const pbq = quotes.get(pbEntry.putSymbol);
        const cbq = quotes.get(cbEntry.callSymbol);
        if (!pbq || !cbq) continue;

        const rawCredit = sp.mid + sc.mid - pbq.mid - cbq.mid;
        const credit = rawCredit - SLIPPAGE;
        if (credit < profile.minCredit) continue;

        const rr = (profile.wings - credit) / credit;
        if (rr > profile.maxRR) continue;

        const pop = calcPOP(sp.delta, sc.delta);
        if (pop < profile.minPOP) continue;

        const ev = calcEV(credit, profile.wings, pop);
        const maxLoss = (profile.wings - credit) * 100;
        const alpha = maxLoss > 0 ? (ev / maxLoss) * 100 : 0;
        const score = scoreIC(pop, ev, alpha, profile.weights);

        candidates.push({
            putBuy: pbStrike,
            putSell: sp.strike,
            callSell: sc.strike,
            callBuy: cbStrike,
            credit: Math.round(credit * 100) / 100,
            wings: profile.wings,
            pop: Math.round(pop * 10) / 10,
            ev: Math.round(ev * 100) / 100,
            alpha: Math.round(alpha * 100) / 100,
            rr: Math.round(rr * 100) / 100,
            deltaShortPut: Math.round(sp.delta * 100) / 100,
            deltaShortCall: Math.round(sc.delta * 100) / 100,
            score,
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const CATALIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2';
const TICKERS = ['SPX', 'QQQ'];

const nowUtc = new Date();
const DATE = nowUtc.toISOString().split('T')[0];

async function main() {
    console.log(`\n=== Guvid Agent — morning scan — ${DATE} ===\n`);

    // ── Step 3: read credentials ──────────────────────────────────────────────
    console.log('[1/6] Reading TastyTrade credentials from Firestore...');
    const brokerSnap = await db
        .collection('users').doc(CATALIN_UID)
        .collection('brokerAccounts')
        .where('isActive', '==', true)
        .get();

    let creds = null;
    for (const doc of brokerSnap.docs) {
        const d = doc.data();
        if (d.brokerType?.toLowerCase() === 'tastytrade' && d.credentials?.clientSecret && d.credentials?.refreshToken) {
            creds = { clientSecret: d.credentials.clientSecret, refreshToken: d.credentials.refreshToken };
            break;
        }
    }

    // Fallback: legacy user doc
    if (!creds) {
        const userDoc = await db.collection('users').doc(CATALIN_UID).get();
        if (userDoc.exists) {
            const d = userDoc.data();
            if (d.clientSecret && d.refreshToken) creds = { clientSecret: d.clientSecret, refreshToken: d.refreshToken };
        }
    }

    if (!creds) throw new Error('No active TastyTrade credentials found in Firestore');

    const token = await getAccessToken(creds);
    const accounts = await getAccounts(token);
    if (!accounts.length) throw new Error('No TastyTrade accounts found');
    const accountNumber = accounts[0]['account-number'];
    console.log(`  Account: ${accountNumber}`);

    // ── Step 4: morning snapshots ─────────────────────────────────────────────
    console.log('[2/6] Capturing morning snapshots...');
    const balances = await getAccountBalances(token, accountNumber);
    const morningNetLiq = balances.netLiquidatingValue;

    const vixRaw = await getUnderlyingPrice(token, 'VIX');
    const morningVix = vixRaw ?? 0;

    console.log(`  Net Liq : $${morningNetLiq.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  VIX     : ${morningVix.toFixed(2)}`);

    const snapshotDoc = {
        morningNetLiq,
        morningVix,
        timestamp: nowUtc.toISOString(),
        date: DATE,
    };

    await db.doc(`guvid-agent/daily-${DATE}`).set(snapshotDoc);
    console.log(`  Snapshot saved → guvid-agent/daily-${DATE}`);

    // ── Step 5: scan ──────────────────────────────────────────────────────────
    console.log('[3/6] Scanning options chains...');

    const scanResults = {};
    const positionsToSave = [];

    for (const ticker of TICKERS) {
        console.log(`\n  ── ${ticker} ──`);
        scanResults[ticker] = {};

        const underlyingPrice = await getUnderlyingPrice(token, ticker);
        if (!underlyingPrice) { console.warn(`  ! No price for ${ticker} — skipping`); continue; }
        console.log(`  Price: $${underlyingPrice}`);

        const ivRank = await getIVR(token, ticker);
        console.log(`  IVR  : ${ivRank}`);

        let chainResp;
        try {
            chainResp = await getOptionsChain(token, ticker);
        } catch (e) {
            console.warn(`  ! Chain fetch failed for ${ticker}: ${e.message}`);
            continue;
        }

        const chain = chainResp.data?.items?.[0];
        if (!chain) { console.warn(`  ! No chain data for ${ticker}`); continue; }

        const OTM_BAND = 0.08;
        const lo = underlyingPrice * (1 - OTM_BAND);
        const hi = underlyingPrice * (1 + OTM_BAND);

        for (const [profileName, profile] of Object.entries(PROFILES)) {
            const targetExps = chain.expirations.filter((e) => {
                const dte = e['days-to-expiration'];
                return dte >= profile.dteMin && dte <= profile.dteMax;
            });

            console.log(`\n  Profile ${profileName}: ${targetExps.length} exps (DTE ${profile.dteMin}-${profile.dteMax})`);
            scanResults[ticker][profileName] = [];

            for (const exp of targetExps) {
                const expDate = exp['expiration-date'];
                const dte = exp['days-to-expiration'];

                // Collect symbols for strikes within ±8% of spot
                // Use regular TastyTrade symbols for market-data/by-type (streamer symbols rejected by that endpoint)
                const regularSymbols = [];
                const filteredStrikes = [];

                for (const s of exp.strikes) {
                    const k = parseFloat(s['strike-price']);
                    if (k < lo || k > hi) continue;
                    regularSymbols.push(s.call, s.put);
                    filteredStrikes.push({
                        strike: k,
                        callSymbol: s.call,
                        putSymbol: s.put,
                        callStreamerSymbol: s['call-streamer-symbol'],
                        putStreamerSymbol: s['put-streamer-symbol'],
                    });
                }

                if (regularSymbols.length === 0) continue;

                let quoteMap;
                try {
                    quoteMap = await getMarketDataSnapshot(token, regularSymbols);
                } catch (e) {
                    console.warn(`    ! Quotes failed for ${ticker} ${expDate}: ${e.message}`);
                    continue;
                }

                if (quoteMap.size === 0) {
                    console.warn(`    ! No quotes returned for ${ticker} ${expDate}`);
                    continue;
                }

                const candidates = buildIcCandidates(filteredStrikes, quoteMap, underlyingPrice, profile);
                if (candidates.length === 0) {
                    console.log(`    ${expDate} (DTE ${dte}): no candidates`);
                    continue;
                }

                const best = candidates[0];
                console.log(`    ${expDate} (DTE ${dte}): ${best.putBuy}/${best.putSell}p ${best.callSell}/${best.callBuy}c | cr $${best.credit} | POP ${best.pop}% | RR ${best.rr} | score ${best.score.toFixed(1)}`);

                const result = { expiration: expDate, dte, ...best };
                scanResults[ticker][profileName].push(result);

                positionsToSave.push({
                    ticker,
                    profile: profileName,
                    ic: {
                        putBuy: best.putBuy,
                        putSell: best.putSell,
                        callSell: best.callSell,
                        callBuy: best.callBuy,
                    },
                    openDate: DATE,
                    expiration: expDate,
                    credit: best.credit,
                    pop: best.pop,
                    ev: best.ev,
                    alpha: best.alpha,
                    rr: best.rr,
                    wings: profile.wings,
                    status: 'open',
                    dailyChecks: [],
                    marketContext: {
                        underlyingPrice,
                        vix: morningVix,
                        ivRank,
                    },
                    savedAt: nowUtc.toISOString(),
                });
            }
        }
    }

    // ── Step 6a: save scan ────────────────────────────────────────────────────
    console.log('\n[4/6] Saving scan to Firestore...');
    await db.doc(`guvid-agent/scan-${DATE}`).set({
        date: DATE,
        timestamp: nowUtc.toISOString(),
        type: 'morning',
        SPX: scanResults.SPX ?? {},
        QQQ: scanResults.QQQ ?? {},
    });
    console.log(`  Scan saved → guvid-agent/scan-${DATE}`);

    // ── Step 6b: save positions ───────────────────────────────────────────────
    console.log(`[5/6] Saving ${positionsToSave.length} positions to Firestore...`);
    const posRef = db.collection('guvid-agent-positions');
    for (const pos of positionsToSave) {
        await posRef.add(pos);
    }
    console.log(`  ${positionsToSave.length} positions saved → guvid-agent-positions`);

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n[6/6] Summary:');
    console.log(`  Date      : ${DATE}`);
    console.log(`  Net Liq   : $${morningNetLiq.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  VIX       : ${morningVix.toFixed(2)}`);

    for (const ticker of TICKERS) {
        for (const [profileName, results] of Object.entries(scanResults[ticker] ?? {})) {
            console.log(`  ${ticker} ${profileName}: ${results.length} ICs`);
            for (const r of results) {
                console.log(`    ${r.expiration} DTE${r.dte}: ${r.putBuy}/${r.putSell}p ${r.callSell}/${r.callBuy}c  cr $${r.credit}  POP ${r.pop}%`);
            }
        }
    }

    console.log('\n=== Morning scan complete ===\n');
    process.exit(0);
}

main().catch((e) => {
    console.error('\nFATAL:', e.message || e);
    process.exit(1);
});

#!/usr/bin/env node
// morning-scan.mjs — Guvid Agent morning scan
// Runs at 10:30 AM ET (1h after market open)

import { createRequire } from 'module';
import * as https from 'https';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const TODAY = new Date().toISOString().split('T')[0];
const CATALIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2';
const BASE_URL = 'api.tastyworks.com';

// ─── Firebase Admin ──────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Root path for all guvid-agent data: guvid-agent/v1/...
const GUVID = db.collection('guvid-agent').doc('v1');

// ─── REST helpers ─────────────────────────────────────────────────────────────

function request(method, path, token, body) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: BASE_URL,
            path,
            method,
            headers: {
                'User-Agent': 'guvid-agent/1.0',
                'Accept': 'application/json',
                ...(token ? { Authorization: token } : {}),
                ...(body ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
            },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) {
                    reject(new Error(`TastyTrade ${method} ${path} → ${res.statusCode}: ${data.substring(0, 400)}`));
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
    };
}

async function getUnderlyingPrice(token, symbol) {
    const params = new URLSearchParams();
    if (symbol === 'SPX' || symbol.startsWith('$')) {
        params.append('index', symbol);
    } else {
        params.append('equity', symbol);
    }
    try {
        const resp = await request('GET', `/market-data/by-type?${params.toString()}`, token);
        const item = resp.data?.items?.[0];
        if (!item) return null;
        // last-trade-price for equities; mark/last for indices like VIX
        const last = parseFloat(item['last-trade-price'] || item['mark'] || item['last'] || '0');
        if (last > 0) return last;
        const bid = parseFloat(item.bid || '0');
        const ask = parseFloat(item.ask || '0');
        return (bid + ask) / 2 || null;
    } catch (e) {
        console.warn(`[price] ${symbol} failed: ${e.message}`);
        return null;
    }
}

async function getMarketMetrics(token, symbols) {
    try {
        const resp = await request('GET', `/market-metrics?symbols=${symbols.join(',')}`, token);
        const result = {};
        for (const item of (resp.data?.items || [])) {
            result[item.symbol] = {
                ivRank: item['implied-volatility-index-rank'] != null
                    ? parseFloat(item['implied-volatility-index-rank']) * 100  // normalize 0-1 → 0-100
                    : null,
            };
        }
        return result;
    } catch (e) {
        console.warn('[metrics] failed:', e.message);
        return {};
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
        // API requires TastyTrade option symbols (e.g. "QQQ   260618C00700000"), not dxFeed streamer symbols
        for (const s of batch) params.append('equity-option', s);
        try {
            const resp = await request('GET', `/market-data/by-type?${params.toString()}`, token);
            for (const item of (resp.data?.items || [])) {
                const bid = parseFloat(item.bid || '0');
                const ask = parseFloat(item.ask || '0');
                const mid = item.mid ? parseFloat(item.mid) : (bid + ask) / 2;
                result.set(item.symbol, {
                    symbol: item.symbol,
                    bid, ask, mid,
                    delta: item.delta != null ? parseFloat(item.delta) : null,
                    theta: item.theta != null ? parseFloat(item.theta) : null,
                    gamma: item.gamma != null ? parseFloat(item.gamma) : null,
                    vega: item.vega != null ? parseFloat(item.vega) : null,
                    iv: item['implied-volatility-index'] != null ? parseFloat(item['implied-volatility-index']) : null,
                });
            }
        } catch (e) {
            console.error('[snapshot] batch failed:', e.message);
        }
    }
    return result;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

const PROFILES = {
    conservative: {
        deltaMin: 11, deltaMax: 16,
        dteMin: 30, dteMax: 47,
        wings: 10,
        minPOP: 80,
        minCredit: 1.0,
        maxRR: 4,
        weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
    },
    neutral: {
        deltaMin: 11, deltaMax: 24,
        dteMin: 19, dteMax: 47,
        wings: 10,
        minPOP: 60,
        minCredit: 1.0,
        maxRR: 4,
        weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
    },
    aggressive: {
        deltaMin: 15, deltaMax: 24,
        dteMin: 19, dteMax: 35,
        wings: 5,
        minPOP: 60,
        minCredit: 1.0,
        maxRR: 4,
        weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
    },
};

// ─── IC Math ──────────────────────────────────────────────────────────────────

function calcPOP(deltaShortPut, deltaShortCall) {
    const putBe = Math.abs(deltaShortPut) * 100;
    const callBe = Math.abs(deltaShortCall) * 100;
    return Math.max(0, 100 - Math.max(putBe, callBe));
}

function calcEV(credit, wings, pop) {
    const win = pop / 100;
    return win * credit * 100 - (1 - win) * (wings - credit) * 100;
}

function scoreIC(pop, ev, alpha, wings, weights) {
    // Normalize to comparable scales for weighted sum
    const popNorm = pop;                                          // 0–100
    const evNorm = Math.max(-10, Math.min(10, ev / (wings * 10))); // normalized to ±10
    const alphaNorm = Math.max(-10, Math.min(10, alpha / 10));    // normalized to ±10
    return weights.pop * popNorm + weights.ev * evNorm * 10 + weights.alpha * alphaNorm * 10;
}

// ─── Scan expiration ──────────────────────────────────────────────────────────

function scanExpiration(exp, quotes, profile) {
    const { deltaMin, deltaMax, wings, minPOP, minCredit, maxRR, weights } = profile;
    const strikesData = exp.strikes;
    const allStrikeSet = new Set(strikesData.map((s) => parseFloat(s['strike-price'])));

    // Collect puts and calls within delta range, grouped by rounded abs delta
    const putsByDelta = new Map();  // roundedDelta → best strike entry
    const callsByDelta = new Map();

    for (const s of strikesData) {
        const strike = parseFloat(s['strike-price']);
        // Use TastyTrade symbols (s.call / s.put) — these are the keys in the quotes Map
        const putSym = s.put;
        const callSym = s.call;
        const putQ = quotes.get(putSym);
        const callQ = quotes.get(callSym);

        if (putQ?.delta != null) {
            const absDelta = Math.abs(putQ.delta) * 100;
            if (absDelta >= deltaMin && absDelta <= deltaMax) {
                const key = Math.round(absDelta);
                const existing = putsByDelta.get(key);
                const dist = Math.abs(absDelta - key);
                if (!existing || dist < Math.abs(Math.abs(existing.q.delta) * 100 - key)) {
                    putsByDelta.set(key, { strike, q: putQ, sym: putSym, strikeEntry: s });
                }
            }
        }

        if (callQ?.delta != null) {
            const absDelta = Math.abs(callQ.delta) * 100;
            if (absDelta >= deltaMin && absDelta <= deltaMax) {
                const key = Math.round(absDelta);
                const existing = callsByDelta.get(key);
                const dist = Math.abs(absDelta - key);
                if (!existing || dist < Math.abs(Math.abs(existing.q.delta) * 100 - key)) {
                    callsByDelta.set(key, { strike, q: callQ, sym: callSym, strikeEntry: s });
                }
            }
        }
    }

    if (putsByDelta.size === 0 || callsByDelta.size === 0) return [];

    // Symmetric delta pairing: common delta groups, sort desc, pair by index
    const commonDeltas = [...putsByDelta.keys()]
        .filter((k) => callsByDelta.has(k))
        .sort((a, b) => b - a);

    const candidates = [];

    for (const deltaGroup of commonDeltas) {
        const shortPut = putsByDelta.get(deltaGroup);
        const shortCall = callsByDelta.get(deltaGroup);

        const longPutStrike = shortPut.strike - wings;
        const longCallStrike = shortCall.strike + wings;

        if (!allStrikeSet.has(longPutStrike) || !allStrikeSet.has(longCallStrike)) continue;

        const longPutEntry = strikesData.find((s) => parseFloat(s['strike-price']) === longPutStrike);
        const longCallEntry = strikesData.find((s) => parseFloat(s['strike-price']) === longCallStrike);
        if (!longPutEntry || !longCallEntry) continue;

        const longPutQ = quotes.get(longPutEntry.put);
        const longCallQ = quotes.get(longCallEntry.call);
        if (!longPutQ || !longCallQ) continue;

        // Spread 8%/leg liquidity filter
        const legs = [shortPut.q, longPutQ, shortCall.q, longCallQ];
        const illiquid = legs.some((q) => q.mid > 0 && (q.ask - q.bid) / q.mid > 0.08);
        if (illiquid) continue;

        // credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid
        const credit = shortPut.q.mid + shortCall.q.mid - longPutQ.mid - longCallQ.mid;
        if (credit < minCredit) continue;

        const rr = (wings - credit) / credit;
        if (rr > maxRR) continue;

        const pop = calcPOP(shortPut.q.delta, shortCall.q.delta);
        if (pop < minPOP) continue;

        const ev = calcEV(credit, wings, pop);
        const maxLoss = (wings - credit) * 100;
        const alpha = maxLoss > 0 ? (ev / maxLoss) * 100 : 0;
        const score = scoreIC(pop, ev, alpha, wings, weights);

        candidates.push({
            putBuy: longPutStrike,
            putSell: shortPut.strike,
            callSell: shortCall.strike,
            callBuy: longCallStrike,
            credit: Math.round(credit * 100) / 100,
            wings,
            rr: Math.round(rr * 100) / 100,
            pop: Math.round(pop * 10) / 10,
            ev: Math.round(ev * 100) / 100,
            alpha: Math.round(alpha * 100) / 100,
            deltaShortPut: Math.round(shortPut.q.delta * 100) / 100,
            deltaShortCall: Math.round(shortCall.q.delta * 100) / 100,
            maxProfit: Math.round(credit * 100 * 100) / 100,
            maxLoss: Math.round(maxLoss * 100) / 100,
            score: Math.round(score * 100) / 100,
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

// ─── Scan one ticker with one profile ─────────────────────────────────────────

async function scanTicker(token, ticker, profile, profileName) {
    console.log(`  [${ticker}/${profileName}] fetching chain...`);
    const chainResp = await getOptionsChain(token, ticker);
    // Chain response wraps data: { data: { items: [...] } }
    const expirations = chainResp.data?.items?.[0]?.expirations ?? [];

    const validExps = expirations.filter((e) => {
        const dte = e['days-to-expiration'];
        return dte >= profile.dteMin && dte <= profile.dteMax;
    });
    console.log(`  [${ticker}/${profileName}] ${validExps.length} expirations in DTE [${profile.dteMin}–${profile.dteMax}]`);
    if (validExps.length === 0) return [];

    // Collect TastyTrade option symbols (call/put) for market data API (NOT dxFeed streamer symbols)
    const allSymbols = new Set();
    for (const exp of validExps) {
        for (const s of exp.strikes) {
            allSymbols.add(s.call);
            allSymbols.add(s.put);
        }
    }
    console.log(`  [${ticker}/${profileName}] fetching quotes (${allSymbols.size} symbols)...`);
    const quotes = await getMarketDataSnapshot(token, [...allSymbols]);
    console.log(`  [${ticker}/${profileName}] ${quotes.size} quotes received`);

    const results = [];
    for (const exp of validExps) {
        const candidates = scanExpiration(exp, quotes, profile);
        if (candidates.length === 0) continue;
        results.push({
            expiration: exp['expiration-date'],
            dte: exp['days-to-expiration'],
            ic: candidates[0],
            candidatesFound: candidates.length,
        });
    }

    console.log(`  [${ticker}/${profileName}] ${results.length} expirations with valid ICs`);
    return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n=== Guvid Morning Scan — ${TODAY} ===\n`);

    // Step 3: Read TastyTrade credentials from Firestore
    console.log('[1/6] Reading TastyTrade credentials from Firestore...');
    const brokerSnap = await db
        .collection('users').doc(CATALIN_UID)
        .collection('brokerAccounts')
        .where('isActive', '==', true)
        .get();

    let creds = null;
    for (const doc of brokerSnap.docs) {
        const data = doc.data();
        if (data.brokerType?.toLowerCase() === 'tastytrade'
            && data.credentials?.clientSecret
            && data.credentials?.refreshToken) {
            creds = { clientSecret: data.credentials.clientSecret, refreshToken: data.credentials.refreshToken };
            break;
        }
    }
    if (!creds) throw new Error('No active TastyTrade credentials found in Firestore');
    console.log('[1/6] Credentials found ✓');

    // Authenticate
    console.log('[2/6] Authenticating with TastyTrade...');
    const token = await getAccessToken(creds);
    const accounts = await getAccounts(token);
    if (accounts.length === 0) throw new Error('No TastyTrade accounts found');
    const accountNumber = accounts[0]['account-number'];
    console.log(`[2/6] Authenticated — account ${accountNumber} ✓`);

    // Step 4: Capture morning snapshots
    console.log('[3/6] Capturing morning snapshots (net liq, VIX, prices, IV ranks)...');
    const [balances, vixPrice, spxPrice, qqqPrice, metricsRaw] = await Promise.all([
        getAccountBalances(token, accountNumber),
        getUnderlyingPrice(token, 'VIX'),   // VIX is an Index; mark/last fields used
        getUnderlyingPrice(token, 'SPX'),
        getUnderlyingPrice(token, 'QQQ'),
        getMarketMetrics(token, ['SPX', 'QQQ']),
    ]);

    const morningNetLiq = balances.netLiquidatingValue;
    const morningVix = vixPrice ?? 0;
    const spxIvRank = metricsRaw['SPX']?.ivRank ?? 0;
    const qqqIvRank = metricsRaw['QQQ']?.ivRank ?? 0;

    console.log(`  Net Liq:  $${morningNetLiq.toLocaleString()}`);
    console.log(`  VIX:      ${morningVix.toFixed(2)}`);
    console.log(`  SPX:      ${spxPrice?.toFixed(2) ?? 'N/A'}  IVR: ${spxIvRank.toFixed(1)}`);
    console.log(`  QQQ:      ${qqqPrice?.toFixed(2) ?? 'N/A'}  IVR: ${qqqIvRank.toFixed(1)}`);

    const dailyDoc = {
        morningNetLiq,
        morningVix,
        spxPrice: spxPrice ?? 0,
        qqqPrice: qqqPrice ?? 0,
        spxIvRank,
        qqqIvRank,
        timestamp: new Date().toISOString(),
        date: TODAY,
    };
    await GUVID.collection('daily').doc(TODAY).set(dailyDoc, { merge: true });
    console.log(`[3/6] Snapshot saved → guvid-agent/v1/daily/${TODAY} ✓`);

    // Step 5: Scan SPX + QQQ with 3 profiles
    console.log('\n[4/6] Scanning SPX + QQQ with 3 profiles...\n');
    const scanResults = { SPX: {}, QQQ: {} };

    for (const ticker of ['SPX', 'QQQ']) {
        console.log(`\n── ${ticker} ──`);
        for (const [profileName, profile] of Object.entries(PROFILES)) {
            try {
                scanResults[ticker][profileName] = await scanTicker(token, ticker, profile, profileName);
            } catch (e) {
                console.error(`  [${ticker}/${profileName}] ERROR: ${e.message}`);
                scanResults[ticker][profileName] = [];
            }
        }
    }

    // Step 6: Save scan to Firestore
    console.log('\n[5/6] Saving scan results to Firestore...');
    const scanDoc = {
        date: TODAY,
        timestamp: new Date().toISOString(),
        type: 'morning',
        SPX: {
            conservative: scanResults.SPX.conservative,
            neutral: scanResults.SPX.neutral,
            aggressive: scanResults.SPX.aggressive,
        },
        QQQ: {
            conservative: scanResults.QQQ.conservative,
            neutral: scanResults.QQQ.neutral,
            aggressive: scanResults.QQQ.aggressive,
        },
    };
    await GUVID.collection('scans').doc(TODAY).set(scanDoc);
    console.log(`[5/6] Scan saved → guvid-agent/v1/scans/${TODAY} ✓`);

    // Save best IC per (ticker, profile, expiration) as positions
    console.log('[6/6] Saving position records...');
    const positionsBatch = db.batch();
    const savedPositions = [];

    for (const ticker of ['SPX', 'QQQ']) {
        const underlyingPrice = ticker === 'SPX' ? (spxPrice ?? 0) : (qqqPrice ?? 0);
        const ivRank = ticker === 'SPX' ? spxIvRank : qqqIvRank;

        for (const [profileName, results] of Object.entries(scanResults[ticker])) {
            for (const result of results) {
                if (!result.ic) continue;
                const posRef = GUVID.collection('positions').doc();
                const posDoc = {
                    ticker,
                    profile: profileName,
                    ic: result.ic,
                    openDate: TODAY,
                    expiration: result.expiration,
                    dte: result.dte,
                    credit: result.ic.credit,
                    pop: result.ic.pop,
                    ev: result.ic.ev,
                    alpha: result.ic.alpha,
                    rr: result.ic.rr,
                    wings: result.ic.wings,
                    status: 'open',
                    dailyChecks: [],
                    marketContext: {
                        underlyingPrice,
                        vix: morningVix,
                        ivRank,
                    },
                };
                positionsBatch.set(posRef, posDoc);
                savedPositions.push({ id: posRef.id, ticker, profile: profileName, expiration: result.expiration });
            }
        }
    }

    await positionsBatch.commit();
    console.log(`[6/6] ${savedPositions.length} positions saved → guvid-agent/v1/positions/ ✓`);

    // ─── Summary ────────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log(`  GUVID MORNING SCAN — ${TODAY}`);
    console.log('════════════════════════════════════════');
    console.log(`  Net Liq:  $${morningNetLiq.toLocaleString()}`);
    console.log(`  VIX:      ${morningVix.toFixed(2)}`);
    console.log(`  SPX:      ${spxPrice?.toFixed(2) ?? 'N/A'}   IVR: ${spxIvRank.toFixed(1)}%`);
    console.log(`  QQQ:      ${qqqPrice?.toFixed(2) ?? 'N/A'}   IVR: ${qqqIvRank.toFixed(1)}%`);
    console.log('');

    for (const ticker of ['SPX', 'QQQ']) {
        console.log(`  ${ticker}:`);
        for (const [profileName, results] of Object.entries(scanResults[ticker])) {
            if (!results || results.length === 0) {
                console.log(`    ${profileName.padEnd(12)}: no ICs found`);
                continue;
            }
            console.log(`    ${profileName.padEnd(12)}: ${results.length} expiration(s)`);
            for (const r of results.slice(0, 3)) {
                const ic = r.ic;
                console.log(`      ${r.expiration} (${r.dte}d) | ${ic.putBuy}/${ic.putSell}p–${ic.callSell}/${ic.callBuy}c | credit=$${ic.credit} POP=${ic.pop}% EV=$${ic.ev} RR=${ic.rr} score=${ic.score}`);
            }
        }
        console.log('');
    }

    console.log(`  Positions saved: ${savedPositions.length}`);
    console.log('════════════════════════════════════════\n');
}

main()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((e) => { console.error('\nFATAL:', e.message || e); process.exit(1); });

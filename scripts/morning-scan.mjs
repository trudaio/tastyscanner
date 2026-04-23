/**
 * Guvid Agent — Morning Scan (10:30 AM ET)
 * Reads TastyTrade creds from Firestore, scans SPX+QQQ for iron condors,
 * saves snapshots and best ICs to Firestore.
 * Falls back to Black-Scholes when WebSocket data is unavailable.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import TastyTradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
if (!getApps().length) initializeApp({ credential: cert(SA_PATH) });
const db = getFirestore();

const TASTY_BASE = 'https://api.tastyworks.com';
function today() { return new Date().toISOString().slice(0, 10); }
const wait = ms => new Promise(r => setTimeout(r, ms));

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47, wings: 10, minPOP: 80,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47, wings: 10, minPOP: 60,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35, wings: 5, minPOP: 60,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};
const MAX_RR = 4;
const MIN_CREDIT = 1.0;
const SPREAD_PCT = 0.08;

// ─── Black-Scholes ────────────────────────────────────────────────────────────
function normcdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function bsmDelta(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0 || S <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return type === 'call' ? normcdf(d1) : normcdf(d1) - 1;
}

function bsmPrice(S, K, T, r, sigma, type) {
  if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);
  if (sigma <= 0 || S <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'call') return S * normcdf(d1) - K * Math.exp(-r * T) * normcdf(d2);
  return K * Math.exp(-r * T) * normcdf(-d2) - S * normcdf(-d1);
}

// Estimate underlying price using strike density.
// ATM region has the tightest/smallest strike spacing, so find that region.
function estimateUnderlyingPrice(strikes) {
  if (!strikes || strikes.length === 0) return 0;
  const sorted = strikes.map(s => s.strikePrice).filter(p => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return sorted[0] || 0;

  // Compute consecutive spacings
  const spacings = [];
  for (let i = 1; i < sorted.length; i++) spacings.push(sorted[i] - sorted[i - 1]);
  const minSpacing = Math.min(...spacings);
  if (minSpacing <= 0) return sorted[Math.floor(sorted.length / 2)];

  // Collect strikes in the highest-density region (spacing ≤ 3x minimum)
  const threshold = minSpacing * 3;
  const denseStrikes = [];
  for (let i = 0; i < spacings.length; i++) {
    if (spacings[i] <= threshold) denseStrikes.push(sorted[i], sorted[i + 1]);
  }
  const unique = [...new Set(denseStrikes)].sort((a, b) => a - b);
  if (unique.length === 0) return sorted[Math.floor(sorted.length / 2)];
  return unique[Math.floor(unique.length / 2)];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mid(quote) {
  if (!quote) return null;
  const b = quote.bidPrice ?? 0, a = quote.askPrice ?? 0;
  if (b <= 0 && a <= 0) return null;
  if (b <= 0) return a;
  if (a <= 0) return b;
  return (b + a) / 2;
}

// ─── Credentials ─────────────────────────────────────────────────────────────
// Finds the PRIMARY user's active TastyTrade credentials.
// Strategy: iterate users sorted by ID (primary user = first alphabetically),
// check brokerAccounts subcollection first (new format), then legacy user doc.
// Returns first valid, active credentials found.
async function loadCredentials() {
  console.log('[Firestore] Loading credentials...');
  const usersSnap = await db.collection('users').orderBy('__name__').limit(50).get();

  for (const userDoc of usersSnap.docs) {
    // New format: brokerAccounts subcollection
    const snap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const baDoc of snap.docs) {
      const data = baDoc.data();
      if (data.isActive && data.brokerType === 'tastytrade' && data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`[Firestore] Found active TastyTrade creds for user ${userDoc.id}`);
        return { clientSecret: data.credentials.clientSecret, refreshToken: data.credentials.refreshToken, userId: userDoc.id };
      }
    }
  }

  throw new Error('No active TastyTrade credentials found in brokerAccounts');
}

// ─── OAuth (native fetch, bypasses axios DNS issues) ─────────────────────────
async function getAccessToken(clientSecret, refreshToken) {
  console.log('[OAuth] Fetching access token...');
  for (let attempt = 1; attempt <= 6; attempt++) {
    const resp = await fetch(`${TASTY_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'User-Agent': 'tastytrade-sdk-js' },
      body: JSON.stringify({ refresh_token: refreshToken, client_secret: clientSecret, scope: 'read trade', grant_type: 'refresh_token' }),
    });
    const text = await resp.text();
    if (resp.status === 503 && text.includes('DNS cache')) {
      const delay = attempt * 3000;
      console.warn(`  [OAuth retry ${attempt}/6] DNS cache overflow, waiting ${delay}ms...`);
      await wait(delay);
      continue;
    }
    let data;
    try { data = JSON.parse(text); } catch (_) {
      throw new Error(`OAuth failed ${resp.status}: ${text.slice(0, 200)}`);
    }
    if (!resp.ok) throw new Error(`OAuth failed ${resp.status}: ${JSON.stringify(data)}`);
    console.log(`[OAuth] Token obtained (expires_in=${data.expires_in}s)`);
    return { accessToken: data.access_token, expiresIn: data.expires_in || 900 };
  }
  throw new Error('OAuth failed after 6 retries (DNS cache overflow)');
}

// ─── Patch SDK httpClient to use native fetch ─────────────────────────────────
function patchHttpClient(client, accessToken, expiresIn) {
  client.httpClient.accessToken.token = accessToken;
  client.httpClient.accessToken.expiresIn = expiresIn;
  client.httpClient.generateAccessToken = async () => client.httpClient.accessToken;
  client.httpClient.executeRequest = async (method, url, data = {}, headers = {}, params = {}) => {
    let fullUrl = TASTY_BASE + url;
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length > 0) {
      fullUrl += '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    const mergedHeaders = { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'tastytrade-sdk-js', ...headers };
    const opts = { method: method.toUpperCase(), headers: mergedHeaders };
    if (data && Object.keys(data).length > 0 && method.toLowerCase() !== 'get') opts.body = JSON.stringify(data);

    // Retry up to 8 times with backoff (handles transient DNS cache overflow)
    for (let attempt = 1; attempt <= 8; attempt++) {
      const resp = await fetch(fullUrl, opts);
      const text = await resp.text();
      if (resp.status === 503 && text.includes('DNS cache')) {
        const delay = Math.min(attempt * 3000, 20000);
        console.warn(`  [retry ${attempt}/8] DNS cache overflow on ${url}, waiting ${delay}ms...`);
        await wait(delay);
        continue;
      }
      let json;
      try { json = JSON.parse(text); } catch (_) {
        throw new Error(`HTTP ${resp.status} non-JSON: ${text.slice(0, 150)}`);
      }
      return { data: json, status: resp.status };
    }
    throw new Error(`${method.toUpperCase()} ${url} failed after 8 retries (DNS cache overflow)`);
  };
}

// ─── Build iron condors from live OR theoretical data ────────────────────────
function buildIronCondors(strikes, quotes, greeks, underlyingPrice, profile, iv, dte, forceBSM = false) {
  const { deltaMin, deltaMax, wings } = profile;
  const T = dte / 365;
  const r = 0.045;
  const useBSM = forceBSM || (Object.keys(greeks).length === 0 && iv > 0 && underlyingPrice > 0);
  if (useBSM) console.log(`    [BSM fallback] S=${underlyingPrice.toFixed(1)} IV=${(iv * 100).toFixed(1)}% T=${T.toFixed(3)}`);

  const legs = [];
  for (const strike of strikes) {
    // Put leg
    const K = strike.strikePrice;
    let putDelta, putMid, callDelta, callMid;

    if (useBSM) {
      putDelta = Math.abs(bsmDelta(underlyingPrice, K, T, r, iv, 'put'));
      putMid = bsmPrice(underlyingPrice, K, T, r, iv, 'put');
      callDelta = Math.abs(bsmDelta(underlyingPrice, K, T, r, iv, 'call'));
      callMid = bsmPrice(underlyingPrice, K, T, r, iv, 'call');
    } else {
      const putQ = quotes[strike.putStreamerSymbol];
      const putG = greeks[strike.putStreamerSymbol];
      const callQ = quotes[strike.callStreamerSymbol];
      const callG = greeks[strike.callStreamerSymbol];
      putMid = mid(putQ);
      callMid = mid(callQ);
      putDelta = putG ? Math.abs(putG.delta) : null;
      callDelta = callG ? Math.abs(callG.delta) : null;
    }

    if (putMid !== null && putMid !== undefined && putDelta !== null && putDelta !== undefined) {
      legs.push({ type: 'put', strike: K, symbol: strike.putStreamerSymbol || `PUT_${K}`, mid: putMid, delta: putDelta });
    }
    if (callMid !== null && callMid !== undefined && callDelta !== null && callDelta !== undefined) {
      legs.push({ type: 'call', strike: K, symbol: strike.callStreamerSymbol || `CALL_${K}`, mid: callMid, delta: callDelta });
    }
  }

  // Group by abs(round(delta*100)), sort desc, pair by index
  const putBuckets = {}, callBuckets = {};
  for (const leg of legs) {
    const bucket = Math.round(leg.delta * 100);
    if (leg.type === 'put') { if (!putBuckets[bucket]) putBuckets[bucket] = []; putBuckets[bucket].push(leg); }
    else { if (!callBuckets[bucket]) callBuckets[bucket] = []; callBuckets[bucket].push(leg); }
  }

  const putKeys = Object.keys(putBuckets).map(Number).sort((a, b) => b - a);
  const callKeys = Object.keys(callBuckets).map(Number).sort((a, b) => b - a);
  const ics = [];

  for (let i = 0; i < Math.min(putKeys.length, callKeys.length); i++) {
    const pB = putKeys[i], cB = callKeys[i];
    if (pB < deltaMin || pB > deltaMax) continue;
    if (cB < deltaMin || cB > deltaMax) continue;

    for (const stoP of putBuckets[pB]) {
      const btoP = legs.find(l => l.type === 'put' && Math.abs(l.strike - (stoP.strike - wings)) < 0.6);
      if (!btoP) continue;
      if ((stoP.strike - btoP.strike) > SPREAD_PCT * underlyingPrice) continue;

      for (const stoC of callBuckets[cB]) {
        if (stoC.strike <= stoP.strike) continue;
        const btoC = legs.find(l => l.type === 'call' && Math.abs(l.strike - (stoC.strike + wings)) < 0.6);
        if (!btoC) continue;
        if ((btoC.strike - stoC.strike) > SPREAD_PCT * underlyingPrice) continue;

        const credit = stoP.mid + stoC.mid - btoP.mid - btoC.mid;
        if (credit < MIN_CREDIT) continue;
        const rr = (wings - credit) / credit;
        if (rr > MAX_RR) continue;

        const pop = 100 - Math.max(stoP.delta * 100, stoC.delta * 100);
        if (pop < profile.minPOP) continue;

        const ev = credit * (pop / 100) - (wings - credit) * (1 - pop / 100);
        const alpha = ev / wings;
        const score = profile.score(pop, ev, alpha);

        ics.push({
          stoP: { strike: stoP.strike, symbol: stoP.symbol, mid: +stoP.mid.toFixed(2), delta: +stoP.delta.toFixed(4) },
          btoP: { strike: btoP.strike, symbol: btoP.symbol, mid: +btoP.mid.toFixed(2), delta: +btoP.delta.toFixed(4) },
          stoC: { strike: stoC.strike, symbol: stoC.symbol, mid: +stoC.mid.toFixed(2), delta: +stoC.delta.toFixed(4) },
          btoC: { strike: btoC.strike, symbol: btoC.symbol, mid: +btoC.mid.toFixed(2), delta: +btoC.delta.toFixed(4) },
          credit: +credit.toFixed(2), rr: +rr.toFixed(2), pop: +pop.toFixed(2),
          ev: +ev.toFixed(2), alpha: +alpha.toFixed(3), score: +score.toFixed(3), wings,
          usingBSM: useBSM,
        });
      }
    }
  }

  ics.sort((a, b) => b.score - a.score);
  return ics;
}

// ─── Scan one ticker for one profile ─────────────────────────────────────────
async function scanTicker(ticker, client, profileName, profile, iv) {
  console.log(`\n[Scan] ${ticker} / ${profileName}`);
  const chainRaw = await client.instrumentsService.getNestedOptionChain(ticker);

  const validExpirations = [];
  for (const chain of chainRaw) {
    for (const exp of chain.expirations) {
      const dte = exp['days-to-expiration'];
      if (dte >= profile.dteMin && dte <= profile.dteMax) validExpirations.push(exp);
    }
  }
  console.log(`  Found ${validExpirations.length} expirations in DTE ${profile.dteMin}-${profile.dteMax}`);
  if (validExpirations.length === 0) return [];

  // Collect streamer symbols
  const allSymbols = new Set();
  for (const exp of validExpirations) {
    for (const s of (exp.strikes || [])) {
      if (s['call-streamer-symbol']) allSymbols.add(s['call-streamer-symbol']);
      if (s['put-streamer-symbol']) allSymbols.add(s['put-streamer-symbol']);
    }
  }
  const underlyingSymbol = ticker === 'SPX' ? '$SPX.X' : ticker;
  allSymbols.add(underlyingSymbol);

  console.log(`  Subscribing to ${allSymbols.size} symbols, waiting 12s...`);
  const quotes = {}, greeks = {}, trades = {};
  const handler = records => {
    for (const r of records) {
      if (r.eventType === 'Quote') quotes[r.eventSymbol] = r;
      else if (r.eventType === 'Greeks') greeks[r.eventSymbol] = r;
      else if (r.eventType === 'Trade') trades[r.eventSymbol] = r;
    }
  };
  try {
    client.quoteStreamer.addEventListener(handler);
    client.quoteStreamer.subscribe([...allSymbols], [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
      MarketDataSubscriptionType.Trade,
    ]);
  } catch (e) {
    console.warn(`  Streamer subscribe warning: ${e.message}`);
  }
  await wait(12000);
  try { client.quoteStreamer.removeEventListener(handler); } catch (_) {}

  // Underlying price: use streamer if available, else estimate from chain
  let underlyingPrice = 0;
  const uT = trades[underlyingSymbol], uQ = quotes[underlyingSymbol];
  if (uT?.price) underlyingPrice = parseFloat(uT.price);
  else if (uQ) underlyingPrice = mid(uQ) || 0;

  // Check if OPTION data (not just the underlying equity quote) arrived
  const optionQuoteCount = Object.keys(greeks).length + Object.keys(quotes).filter(k => k !== underlyingSymbol).length;
  const hasLiveOptionData = optionQuoteCount > 10;

  if (!hasLiveOptionData && iv > 0) {
    // Fall back to BSM — use live underlying price if available, else estimate from chain
    if (underlyingPrice <= 0) {
      const nearExp = validExpirations.reduce((a, b) => Math.abs(a['days-to-expiration'] - 30) < Math.abs(b['days-to-expiration'] - 30) ? a : b);
      const strikePrices = (nearExp.strikes || []).map(s => parseFloat(s['strike-price'])).filter(v => v > 0);
      underlyingPrice = estimateUnderlyingPrice(strikePrices.map(p => ({ strikePrice: p })));
    }
    console.log(`  No option data — BSM mode. ${ticker} price: ${underlyingPrice.toFixed(2)}`);
  } else {
    console.log(`  ${ticker} price: ${underlyingPrice.toFixed(2)} (${hasLiveOptionData ? 'live' : 'no data'})`);
  }

  if (underlyingPrice <= 0) {
    console.log(`  Cannot proceed without underlying price.`);
    return [];
  }

  // Rebuild BSM flag for buildIronCondors based on actual option data availability
  const useBSMFallback = !hasLiveOptionData && iv > 0;

  const results = [];
  for (const exp of validExpirations) {
    const strikes = (exp.strikes || []).map(s => ({
      strikePrice: parseFloat(s['strike-price']),
      callStreamerSymbol: s['call-streamer-symbol'],
      putStreamerSymbol: s['put-streamer-symbol'],
    }));
    const dte = exp['days-to-expiration'];
    const ics = buildIronCondors(strikes, quotes, greeks, underlyingPrice, profile, iv, dte, useBSMFallback);
    if (ics.length === 0) continue;
    const best = ics[0];
    results.push({ expiration: exp['expiration-date'], dte, underlyingPrice, ...best });
    console.log(
      `  [${exp['expiration-date']} DTE=${dte}] credit=$${best.credit} POP=${best.pop}% RR=${best.rr} score=${best.score}${best.usingBSM ? ' (BSM)' : ''}`
    );
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dateStr = today();
  console.log(`\n========================================`);
  console.log(`  Guvid Agent — Morning Scan ${dateStr}`);
  console.log(`========================================\n`);

  const { clientSecret, refreshToken } = await loadCredentials();
  const { accessToken, expiresIn } = await getAccessToken(clientSecret, refreshToken);

  console.log('[TastyTrade] Connecting...');
  const client = new TastyTradeClient({ ...TastyTradeClient.ProdConfig, clientSecret, refreshToken, oauthScopes: ['read', 'trade'] });
  patchHttpClient(client, accessToken, expiresIn);

  try { await client.quoteStreamer.connect(); console.log('[TastyTrade] Streamer connected.'); }
  catch (e) { console.warn(`[TastyTrade] Streamer connection warning: ${e.message}. Continuing with REST only.`); }

  // Accounts — pick highest net liq
  const accountsRaw = await client.accountsAndCustomersService.getCustomerAccounts();
  const allAccounts = (accountsRaw || [])
    .map(a => a?.account?.['account-number'] || a?.['account-number'])
    .filter(Boolean);
  console.log(`[TastyTrade] Accounts: ${allAccounts.join(', ')}`);

  let accountNumber = allAccounts[0];
  let maxNetLiq = 0;
  for (const acct of allAccounts) {
    try {
      const bal = await client.balancesAndPositionsService.getAccountBalanceValues(acct);
      const liq = parseFloat(bal?.['net-liquidating-value'] || '0');
      if (liq > maxNetLiq) { maxNetLiq = liq; accountNumber = acct; }
    } catch (_) {}
  }
  console.log(`[TastyTrade] Using account ${accountNumber} (net liq: $${maxNetLiq.toFixed(2)})`);

  // ─── Step 4: Morning snapshot ──────────────────────────────────────────────
  console.log('\n[Snapshot] Capturing morning snapshot...');

  const morningNetLiq = maxNetLiq;

  // VIX via streamer
  let morningVix = 0;
  const vixSymbol = '$VIX.X';
  const vixData = {};
  const vixHandler = records => {
    for (const r of records) {
      if (r.eventType === 'Quote') vixData[r.eventSymbol] = r;
      else if (r.eventType === 'Trade') vixData['_t_' + r.eventSymbol] = r;
    }
  };
  try {
    client.quoteStreamer.addEventListener(vixHandler);
    client.quoteStreamer.subscribe([vixSymbol], [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Trade]);
    await wait(5000);
    client.quoteStreamer.removeEventListener(vixHandler);
    const vixT = vixData['_t_' + vixSymbol];
    const vixQ = vixData[vixSymbol];
    if (vixT?.price) morningVix = parseFloat(vixT.price);
    else if (vixQ) morningVix = mid(vixQ) || 0;
  } catch (_) {}
  console.log(`  Net Liq: $${morningNetLiq.toFixed(2)} | VIX: ${morningVix.toFixed(2)}`);

  await db.collection('guvid-agent').doc('daily').collection(dateStr).doc('snapshot').set({
    morningNetLiq, morningVix, timestamp: new Date().toISOString(), date: dateStr,
  });
  console.log('  Snapshot saved.');

  // ─── Step 5: Scan ──────────────────────────────────────────────────────────
  const scanResults = { SPX: {}, QQQ: {} };
  const tickers = ['SPX', 'QQQ'];

  for (const ticker of tickers) {
    let iv = 0;
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: ticker });
      if (Array.isArray(metrics) && metrics.length > 0) {
        const ivRaw = parseFloat(metrics[0]['implied-volatility-index'] || '0');
        iv = ivRaw > 1 ? ivRaw / 100 : ivRaw; // normalize to 0-1 if needed
        const ivr = parseFloat(metrics[0]['implied-volatility-index-rank'] || '0') * 100;
        console.log(`[IVR] ${ticker}: IV=${(iv * 100).toFixed(1)}% IVR=${ivr.toFixed(1)}%`);
        scanResults[ticker]._ivRank = ivr;
        scanResults[ticker]._iv = iv;
      }
    } catch (e) { console.warn(`[IVR] ${ticker}: ${e.message}`); }

    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const ics = await scanTicker(ticker, client, profileName, profile, iv);
      scanResults[ticker][profileName] = ics.map(ic => ({ ...ic, ivRank: scanResults[ticker]._ivRank || 0 }));
    }
  }

  // ─── Step 6: Save ──────────────────────────────────────────────────────────
  console.log('\n[Firestore] Saving...');

  await db.collection('guvid-agent').doc('scans').collection(dateStr).doc('morning').set({
    date: dateStr, timestamp: new Date().toISOString(), type: 'morning',
    SPX: { conservative: scanResults.SPX.conservative || [], neutral: scanResults.SPX.neutral || [], aggressive: scanResults.SPX.aggressive || [] },
    QQQ: { conservative: scanResults.QQQ.conservative || [], neutral: scanResults.QQQ.neutral || [], aggressive: scanResults.QQQ.aggressive || [] },
  });

  let posCount = 0;
  const posRef = db.collection('guvid-agent').doc('positions').collection('open');
  for (const ticker of tickers) {
    const ivRank = scanResults[ticker]._ivRank || 0;
    const underlyingPrice = scanResults[ticker]?.neutral?.[0]?.underlyingPrice || 0;
    for (const profileName of ['conservative', 'neutral', 'aggressive']) {
      const ics = scanResults[ticker][profileName] || [];
      if (ics.length === 0) continue;
      const best = ics[0];
      await posRef.doc().set({
        ticker, profile: profileName,
        ic: { stoP: best.stoP, btoP: best.btoP, stoC: best.stoC, btoC: best.btoC },
        openDate: dateStr, expiration: best.expiration, dte: best.dte,
        credit: best.credit, pop: best.pop, ev: best.ev, alpha: best.alpha,
        rr: best.rr, wings: best.wings, score: best.score,
        status: 'open', dailyChecks: [],
        usingBSM: best.usingBSM || false,
        marketContext: { underlyingPrice, vix: morningVix, ivRank },
      });
      posCount++;
    }
  }
  console.log(`  Scan saved. ${posCount} position candidates written.`);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n========== MORNING SCAN SUMMARY ==========');
  console.log(`Date:        ${dateStr}`);
  console.log(`Account:     ${accountNumber}`);
  console.log(`Net Liq:     $${morningNetLiq.toFixed(2)}`);
  console.log(`VIX:         ${morningVix.toFixed(2)}`);
  console.log('');
  for (const ticker of tickers) {
    const ivPct = ((scanResults[ticker]._iv || 0) * 100).toFixed(1);
    const ivr = (scanResults[ticker]._ivRank || 0).toFixed(1);
    console.log(`── ${ticker}  IV=${ivPct}%  IVR=${ivr}% ──`);
    for (const pn of ['conservative', 'neutral', 'aggressive']) {
      const ics = scanResults[ticker][pn] || [];
      if (ics.length === 0) { console.log(`  ${pn.padEnd(13)}: no candidates`); continue; }
      const b = ics[0];
      console.log(
        `  ${pn.padEnd(13)}: ${ics.length} candidate(s)  ` +
        `best → ${b.expiration} DTE=${b.dte}  ` +
        `credit=$${b.credit}  POP=${b.pop}%  RR=${b.rr}  score=${b.score}${b.usingBSM ? ' (BSM)' : ''}`
      );
    }
    console.log('');
  }
  console.log('==========================================');
  console.log('Morning scan complete.');

  try { client.quoteStreamer.disconnect(); } catch (_) {}
  process.exit(0);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });

/**
 * GUVID AGENT — Morning Scan
 * Uses curl for all REST calls (avoids axios proxy redirect issues in this environment).
 * Uses @dxfeed/dxlink-api + Node 22 built-in WebSocket for streaming.
 */

import { spawnSync } from 'child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DXLinkWebSocketClient, DXLinkFeed, FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api';
import WebSocketLib from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── Proxy-aware WebSocket for dxlink-api ─────────────────────────────────────
// dxlink-api uses `new WebSocket(url)` referencing the global, which doesn't
// support the HTTPS proxy in this environment. Override with ws + HttpsProxyAgent.
const HTTPS_PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || '';
if (HTTPS_PROXY) {
  const _proxyAgent = new HttpsProxyAgent(HTTPS_PROXY);
  class ProxiedWebSocket extends WebSocketLib {
    constructor(url, protocols, opts) {
      super(url, protocols, { ...opts, agent: _proxyAgent });
    }
  }
  globalThis.WebSocket = ProxiedWebSocket;
  console.log(`[WS] Proxy agent: ${HTTPS_PROXY.split('@').pop()}`);
}

// ─── Firebase ─────────────────────────────────────────────────────────────────
const firebaseApp = initializeApp({ credential: cert('/tmp/firebase-sa.json') });
const db = getFirestore(firebaseApp);
const TODAY = new Date().toISOString().slice(0, 10);

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: { deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47, wings: 10, minPOP: 80, w: { pop: 0.70, ev: 0.20, alpha: 0.10 } },
  neutral:      { deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47, wings: 10, minPOP: 60, w: { pop: 0.60, ev: 0.25, alpha: 0.15 } },
  aggressive:   { deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35, wings:  5, minPOP: 60, w: { pop: 0.40, ev: 0.35, alpha: 0.25 } },
};

const MAX_RR = 4;
const MIN_CREDIT = 1.0;
const MAX_SPREAD_PCT = 0.08;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── curl helpers ─────────────────────────────────────────────────────────────
function curlGet(url, token) {
  const args = ['-s', '--max-redirs', '5', url,
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: application/json'];
  const r = spawnSync('curl', args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }); // 20MB buffer
  if (r.status !== 0) throw new Error(`curl GET ${url} failed: ${r.stderr?.toString()}`);
  try { return JSON.parse(r.stdout.toString()); }
  catch { throw new Error(`curl GET ${url} invalid JSON: ${r.stdout.toString().slice(0, 200)}`); }
}

function curlPost(url, body) {
  const args = ['-s', '--max-redirs', '5', '-X', 'POST', url,
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: application/json',
    '-d', JSON.stringify(body)];
  const r = spawnSync('curl', args, { timeout: 30000 });
  if (r.status !== 0) throw new Error(`curl POST ${url} failed: ${r.stderr?.toString()}`);
  try { return JSON.parse(r.stdout.toString()); }
  catch { throw new Error(`curl POST ${url} invalid JSON: ${r.stdout.toString().slice(0, 200)}`); }
}

const BASE = 'https://api.tastytrade.com';

// ─── Step 1: Credentials from Firestore ──────────────────────────────────────
async function readCredentials() {
  console.log('[1/6] Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').limit(5).get();
  if (usersSnap.empty) throw new Error('No users in Firestore');

  for (const userDoc of usersSnap.docs) {
    const baSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const baDoc of baSnap.docs) {
      const c = baDoc.data()?.credentials ?? baDoc.data();
      if (c?.clientSecret && c?.refreshToken) {
        console.log(`    User ${userDoc.id} / broker ${baDoc.id} — credentials OK`);
        return { clientSecret: c.clientSecret, refreshToken: c.refreshToken };
      }
    }
    const u = userDoc.data();
    if (u?.clientSecret && u?.refreshToken) {
      console.log(`    User ${userDoc.id} (user doc) — credentials OK`);
      return { clientSecret: u.clientSecret, refreshToken: u.refreshToken };
    }
  }
  throw new Error('No valid credentials found');
}

// ─── Step 2: OAuth access token ───────────────────────────────────────────────
function getAccessToken(clientSecret, refreshToken) {
  console.log('[2/6] Getting OAuth access token...');
  const resp = curlPost(`${BASE}/oauth/token`, {
    grant_type: 'refresh_token', scope: 'read',
    client_secret: clientSecret, refresh_token: refreshToken,
  });
  if (!resp.access_token) throw new Error(`OAuth failed: ${JSON.stringify(resp)}`);
  console.log(`    Token obtained (expires_in: ${resp.expires_in}s)`);
  return resp.access_token;
}

// ─── Get account number ───────────────────────────────────────────────────────
function getAccountNumber(token) {
  const resp = curlGet(`${BASE}/customers/me/accounts`, token);
  const items = resp?.data?.items ?? [];
  if (!items.length) throw new Error('No accounts found');
  return items[0]?.account?.['account-number'] ?? '';
}

// ─── Step 4: Connect DxLink streamer ─────────────────────────────────────────
async function connectStreamer(token) {
  console.log('[4/6] Connecting DxLink streamer...');
  const resp = curlGet(`${BASE}/api-quote-tokens`, token);
  const dx = resp?.data ?? resp;
  const dxUrl = dx['dxlink-url'];
  const dxToken = dx['token'];
  if (!dxUrl || !dxToken) throw new Error(`No dxlink URL/token: ${JSON.stringify(dx)}`);
  console.log(`    DxLink: ${dxUrl} (level: ${dx['level'] ?? '?'})`);

  const quotesMap = {};
  const greeksMap = {};

  const client = new DXLinkWebSocketClient();
  client.connect(dxUrl);
  client.setAuthToken(dxToken);

  const feed = new DXLinkFeed(client, FeedContract.AUTO);
  feed.configure({ acceptAggregationPeriod: 10, acceptDataFormat: FeedDataFormat.COMPACT });

  feed.addEventListener((events) => {
    for (const ev of events) {
      if (ev.eventType === 'Quote') quotesMap[ev.eventSymbol] = ev;
      else if (ev.eventType === 'Greeks') greeksMap[ev.eventSymbol] = ev;
    }
  });

  return { feed, quotesMap, greeksMap };
}

// ─── Step 3: Morning snapshot ─────────────────────────────────────────────────
async function captureMorningSnapshot(token, accountNumber, quotesMap) {
  console.log('[3/6] Capturing morning snapshot...');

  let morningNetLiq = null;
  if (accountNumber) {
    try {
      const b = curlGet(`${BASE}/accounts/${accountNumber}/balances`, token)?.data ?? {};
      morningNetLiq = parseFloat(b['net-liquidating-value'] ?? b.netLiquidatingValue ?? 0);
    } catch (e) { console.warn(`    Net liq: ${e.message}`); }
  }

  let morningVix = null;
  const vq = quotesMap['$VIX.X'];
  if (vq) morningVix = (parseFloat(vq.bidPrice ?? 0) + parseFloat(vq.askPrice ?? 0)) / 2;

  console.log(`    Net liq: $${morningNetLiq?.toFixed(2) ?? 'N/A'}   VIX: ${morningVix?.toFixed(2) ?? 'N/A'}`);
  const snapshot = { morningNetLiq, morningVix, timestamp: new Date().toISOString(), date: TODAY };
  // guvid-agent (doc) / data (doc in subcollection "data") — use even-segment path
  await db.collection('guvid-agent').doc('daily-' + TODAY).set(snapshot, { merge: true });
  return snapshot;
}

// ─── IC building ──────────────────────────────────────────────────────────────
function calcMid(q) {
  if (!q) return null;
  const b = parseFloat(q.bidPrice ?? 0), a = parseFloat(q.askPrice ?? 0);
  if (b === 0 && a === 0) return null;
  return (b + a) / 2;
}
function spreadOK(q) {
  if (!q) return false;
  const b = parseFloat(q.bidPrice ?? 0), a = parseFloat(q.askPrice ?? 0);
  const m = (b + a) / 2;
  return m > 0 && (a - b) / m <= MAX_SPREAD_PCT * 2;
}

function buildICsForExpiration(exp, profile, quotesMap, greeksMap) {
  const puts = [], calls = [];

  for (const s of exp.strikes) {
    const strike = parseFloat(s['strike-price'] ?? 0);
    if (!strike) continue;

    const pSym = s['put-streamer-symbol'];
    if (pSym && greeksMap[pSym]) {
      const delta = Math.abs(parseFloat(greeksMap[pSym].delta ?? 0)) * 100;
      const mid = calcMid(quotesMap[pSym]);
      if (mid !== null && spreadOK(quotesMap[pSym]))
        puts.push({ symbol: pSym, ttSymbol: s['put'] ?? '', strike, delta, mid });
    }

    const cSym = s['call-streamer-symbol'];
    if (cSym && greeksMap[cSym]) {
      const delta = Math.abs(parseFloat(greeksMap[cSym].delta ?? 0)) * 100;
      const mid = calcMid(quotesMap[cSym]);
      if (mid !== null && spreadOK(quotesMap[cSym]))
        calls.push({ symbol: cSym, ttSymbol: s['call'] ?? '', strike, delta, mid });
    }
  }

  const shortPuts  = puts.filter(o => o.delta >= profile.deltaMin && o.delta <= profile.deltaMax).sort((a, b) => b.delta - a.delta);
  const shortCalls = calls.filter(o => o.delta >= profile.deltaMin && o.delta <= profile.deltaMax).sort((a, b) => b.delta - a.delta);

  const candidates = [];
  for (let i = 0; i < Math.min(shortPuts.length, shortCalls.length); i++) {
    const sp = shortPuts[i], sc = shortCalls[i];
    if (sc.strike <= sp.strike) continue;

    const findClosest = (arr, target) => arr
      .filter(o => Math.abs(o.strike - target) <= profile.wings * 0.6)
      .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target))[0];

    const lp = findClosest(puts,  sp.strike - profile.wings);
    const lc = findClosest(calls, sc.strike + profile.wings);
    if (!lp || !lc) continue;

    const credit = sp.mid + sc.mid - lp.mid - lc.mid;
    if (credit < MIN_CREDIT) continue;

    const rr = (profile.wings - credit) / credit;
    if (rr > MAX_RR || rr < 0) continue;

    const pop = 100 - Math.max(sp.delta, sc.delta);
    if (pop < profile.minPOP) continue;

    const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
    const alpha = credit / profile.wings;
    const { w } = profile;
    const score = w.pop * (pop / 100) + w.ev * Math.max(ev / credit, 0) + w.alpha * alpha;

    candidates.push({
      expiration: exp.expirationDate, dte: exp.daysToExpiration,
      stoPut:  { symbol: sp.symbol, ttSymbol: sp.ttSymbol, strike: sp.strike, delta: parseFloat(sp.delta.toFixed(2)),  mid: parseFloat(sp.mid.toFixed(2)) },
      btoPut:  { symbol: lp.symbol, ttSymbol: lp.ttSymbol, strike: lp.strike,                                         mid: parseFloat(lp.mid.toFixed(2)) },
      stoCall: { symbol: sc.symbol, ttSymbol: sc.ttSymbol, strike: sc.strike, delta: parseFloat(sc.delta.toFixed(2)), mid: parseFloat(sc.mid.toFixed(2)) },
      btoCall: { symbol: lc.symbol, ttSymbol: lc.ttSymbol, strike: lc.strike,                                         mid: parseFloat(lc.mid.toFixed(2)) },
      credit: parseFloat(credit.toFixed(2)), rr: parseFloat(rr.toFixed(2)),
      pop: parseFloat(pop.toFixed(2)),       ev: parseFloat(ev.toFixed(2)),
      alpha: parseFloat(alpha.toFixed(4)),   score: parseFloat(score.toFixed(4)),
      wings: profile.wings,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

// ─── Fetch nested chain via curl ──────────────────────────────────────────────
function fetchChain(token, ticker) {
  const resp = curlGet(`${BASE}/option-chains/${ticker}/nested`, token);
  const data = resp?.data ?? resp;
  const items = data?.items ?? [data];
  const exps = [];
  for (const item of items) {
    for (const e of (item?.expirations ?? [])) {
      exps.push({
        expirationDate: e['expiration-date'] ?? '',
        daysToExpiration: parseInt(e['days-to-expiration'] ?? 0),
        strikes: e['strikes'] ?? [],
      });
    }
  }
  return exps;
}

function extractSymbols(exps, dteMin, dteMax) {
  const syms = new Set();
  for (const e of exps) {
    if (e.daysToExpiration < dteMin || e.daysToExpiration > dteMax) continue;
    for (const s of e.strikes) {
      if (s['put-streamer-symbol'])  syms.add(s['put-streamer-symbol']);
      if (s['call-streamer-symbol']) syms.add(s['call-streamer-symbol']);
    }
  }
  return [...syms];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  GUVID AGENT — Morning Scan');
  console.log(`  ${TODAY}  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');

  const { clientSecret, refreshToken } = await readCredentials();
  const token = getAccessToken(clientSecret, refreshToken);

  let accountNumber = '';
  try { accountNumber = getAccountNumber(token); console.log(`    Account: ${accountNumber}`); }
  catch (e) { console.warn(`    Account: ${e.message}`); }

  // Streamer
  const { feed, quotesMap, greeksMap } = await connectStreamer(token);
  feed.addSubscriptions({ type: 'Quote', symbol: '$VIX.X' });

  // Fetch chains
  console.log('[5/6] Fetching option chains...');
  const TICKERS = ['SPX', 'QQQ'];
  const allExps = {};

  for (const ticker of TICKERS) {
    try {
      const exps = fetchChain(token, ticker);
      allExps[ticker] = exps;
      const rel = exps.filter(e => e.daysToExpiration >= 19 && e.daysToExpiration <= 47);
      console.log(`    ${ticker}: ${exps.length} expirations, ${rel.length} in 19-47 DTE`);

      for (const sym of extractSymbols(exps, 19, 47)) {
        feed.addSubscriptions({ type: 'Quote', symbol: sym });
        feed.addSubscriptions({ type: 'Greeks', symbol: sym });
      }
    } catch (e) {
      console.error(`    ${ticker}: ${e.message}`);
      allExps[ticker] = null;
    }
  }

  console.log(`    Waiting 12s for streamer data...`);
  await sleep(12000);
  console.log(`    Quotes: ${Object.keys(quotesMap).length}, Greeks: ${Object.keys(greeksMap).length}`);

  const snapshot = await captureMorningSnapshot(token, accountNumber, quotesMap);

  // IV ranks
  const ivRanks = {};
  for (const ticker of TICKERS) {
    try {
      const resp = curlGet(`${BASE}/market-metrics?symbols=${ticker}`, token);
      const items = resp?.data?.items ?? [];
      if (items.length) ivRanks[ticker] = parseFloat(items[0]['implied-volatility-index-rank'] ?? 0);
    } catch (e) { console.warn(`    IV ${ticker}: ${e.message}`); }
  }

  // Scan
  console.log('\n[5b/6] Scanning...');
  const scanData = {};
  const positions = [];

  for (const ticker of TICKERS) {
    const exps = allExps[ticker];
    if (!exps) { scanData[ticker] = { error: 'chain failed' }; continue; }

    console.log(`\n  ${ticker} (IV-Rank: ${ivRanks[ticker] != null ? (ivRanks[ticker]*100).toFixed(1)+'%' : 'N/A'}):`);
    const result = {};

    for (const [pName, profile] of Object.entries(PROFILES)) {
      const candidates = exps
        .filter(e => e.daysToExpiration >= profile.dteMin && e.daysToExpiration <= profile.dteMax)
        .map(e => buildICsForExpiration(e, profile, quotesMap, greeksMap))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      result[pName] = candidates.slice(0, 3);

      if (candidates.length) {
        const t = candidates[0];
        console.log(`    ${pName.padEnd(13)}: ${t.expiration} DTE=${t.dte} | Credit=$${t.credit} POP=${t.pop}% R/R=${t.rr} Score=${t.score}`);
      } else {
        console.log(`    ${pName.padEnd(13)}: no candidates`);
      }
    }

    scanData[ticker] = result;

    for (const [pName, cands] of Object.entries(result)) {
      if (!cands.length) continue;
      const top = cands[0];
      positions.push({
        ticker, profile: pName, ic: top,
        openDate: TODAY, expiration: top.expiration,
        credit: top.credit, pop: top.pop, ev: top.ev,
        alpha: top.alpha, rr: top.rr, wings: top.wings,
        status: 'open', dailyChecks: [],
        marketContext: {
          underlyingPrice: null,
          vix: snapshot.morningVix ?? null,
          ivRank: ivRanks[ticker] ?? null,
        },
      });
    }
  }

  // Save to Firestore
  console.log('\n[6/6] Saving to Firestore...');

  await db.collection('guvid-agent').doc('scans-' + TODAY).set({
    date: TODAY, timestamp: new Date().toISOString(), type: 'morning', ...scanData,
  }, { merge: true });

  if (positions.length) {
    const batch = db.batch();
    for (const pos of positions) {
      const ref = db.collection('guvid-agent').doc();
      batch.set(ref, { ...pos, docType: 'position', createdAt: new Date().toISOString() });
    }
    await batch.commit();
  }

  console.log(`    Scan saved → guvid-agent/scans-${TODAY}`);
  console.log(`    ${positions.length} positions saved`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Date:     ${TODAY}`);
  console.log(`  Net Liq:  $${snapshot.morningNetLiq?.toFixed(2) ?? 'N/A'}`);
  console.log(`  VIX:      ${snapshot.morningVix?.toFixed(2) ?? 'N/A'}`);
  console.log('');
  for (const ticker of TICKERS) {
    const r = scanData[ticker];
    if (!r || r.error) { console.log(`  ${ticker}: error`); continue; }
    console.log(`  ${ticker} (IV-Rank: ${ivRanks[ticker] != null ? (ivRanks[ticker]*100).toFixed(1)+'%' : 'N/A'}):`);
    for (const [pName, cands] of Object.entries(r)) {
      if (!cands.length) { console.log(`    ${pName.padEnd(13)}: —`); continue; }
      const t = cands[0];
      console.log(`    ${pName.padEnd(13)}: ${t.expiration} DTE=${t.dte} Credit=$${t.credit} POP=${t.pop}% R/R=${t.rr}`);
    }
  }
  console.log(`\n  Positions saved: ${positions.length}`);
  console.log('═══════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('\nFATAL:', err.message ?? err);
  process.exit(1);
});

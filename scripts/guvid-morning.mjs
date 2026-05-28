/**
 * Guvid Agent — Morning Scan (10:30 AM ET)
 * Captures morning snapshot (net liq, VIX) then scans SPX+QQQ with 3 profiles.
 */

import { createRequire } from 'module';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);

// ── Proxy setup (optional — transparent proxy in prod) ────────────────────────
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
if (proxyUrl) console.log(`Using proxy: ${proxyUrl}`);
else console.log('No HTTPS_PROXY set — using direct connections.');

// Monkey-patch global WebSocket → ws + optional proxy agent (DxLink uses new WebSocket() internally)
const WsLib = require('ws');
class ProxiedWebSocket {
  constructor(url, protocols) {
    const opts = httpsAgent ? { agent: httpsAgent } : {};
    this._ws = protocols ? new WsLib(url, protocols, opts) : new WsLib(url, opts);
    this.readyState = 0;
    this._listeners = {};
    this._ws.on('open',    () => { this.readyState = 1; this._dispatch('open', {}); });
    this._ws.on('close',   (code, reason) => { this.readyState = 3; this._dispatch('close', { code, reason: reason?.toString() }); });
    this._ws.on('error',   (err) => { this._dispatch('error', { message: err.message }); });
    this._ws.on('message', (data) => { this._dispatch('message', { data: data.toString() }); });
  }
  _dispatch(type, detail) { for (const fn of (this._listeners[type] || [])) fn(detail); }
  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }
  removeEventListener(type, listener) {
    if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter(l => l !== listener);
  }
  send(data) { if (this._ws.readyState === WsLib.OPEN) this._ws.send(data); }
  close() { this._ws.close(); }
}
ProxiedWebSocket.CONNECTING = 0;
ProxiedWebSocket.OPEN       = 1;
ProxiedWebSocket.CLOSING    = 2;
ProxiedWebSocket.CLOSED     = 3;
global.WebSocket = ProxiedWebSocket;

// ── DxLink ────────────────────────────────────────────────────────────────────
const { DXLinkWebSocketClient } = require('@dxfeed/dxlink-websocket-client');
const { DXLinkFeed, FeedContract, FeedDataFormat } = require('@dxfeed/dxlink-feed');

// ── Firebase ──────────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── Config ────────────────────────────────────────────────────────────────────
const axios = require('axios');
const axiosCfg = { ...(httpsAgent ? { httpsAgent, proxy: false } : {}), maxRedirects: 5 };
const TASTY_BASE = 'https://api.tastyworks.com';
// HARD RULE: Only use Catalin's TastyTrade credentials. Never fall back to any other user.
const CATALIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2'; // macovei17@gmail.com
const TICKERS = ['SPX', 'QQQ'];

const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16,
    dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, spread: 0.08, minCredit: 1.0,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24,
    dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, spread: 0.08, minCredit: 1.0,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24,
    dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, spread: 0.08, minCredit: 1.0,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function mid(bid, ask) {
  const b = (bid == null || isNaN(bid)) ? null : bid;
  const a = (ask == null || isNaN(ask)) ? null : ask;
  if (b == null && a == null) return null;
  if (b == null || b <= 0) return a > 0 ? a : null;
  if (a == null || a <= 0) return b > 0 ? b : null;
  return (b + a) / 2;
}
function round2(n) { return Math.round(n * 100) / 100; }
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── TastyTrade API ────────────────────────────────────────────────────────────
async function fetchCredentials() {
  const snap = await db
    .collection('users').doc(CATALIN_UID)
    .collection('brokerAccounts')
    .where('isActive', '==', true)
    .get();
  const creds = [];
  for (const brokerDoc of snap.docs) {
    const data = brokerDoc.data();
    const broker = (data?.brokerType || data?.credentials?.brokerType || '').toLowerCase();
    if (broker !== 'tastytrade') continue;
    const cs = data?.credentials?.clientSecret || data?.clientSecret || null;
    const rt = data?.credentials?.refreshToken || data?.refreshToken || null;
    const upd = brokerDoc.updateTime?.seconds || 0;
    if (cs && rt) creds.push({ cs, rt, upd });
  }
  creds.sort((a, b) => b.upd - a.upd);
  if (!creds.length) {
    throw new Error(`No active TastyTrade brokerAccount under users/${CATALIN_UID}/brokerAccounts. Re-link broker in app.`);
  }
  return creds;
}

async function getAccessToken(credsList) {
  for (const { cs, rt } of credsList) {
    try {
      const res = await axios.post(`${TASTY_BASE}/oauth/token`, {
        refresh_token: rt, client_secret: cs, scope: 'read', grant_type: 'refresh_token',
      }, axiosCfg);
      return `Bearer ${res.data['access_token'] || res.data['access-token']}`;
    } catch (_) {}
  }
  throw new Error('All TastyTrade refresh tokens failed. Re-authenticate in the app and re-run.');
}

async function getApiQuoteToken(accessToken) {
  const res = await axios.get(`${TASTY_BASE}/api-quote-tokens`, {
    ...axiosCfg, headers: { Authorization: accessToken },
  });
  return res.data?.data ?? res.data;
}

async function getAccounts(accessToken) {
  const res = await axios.get(`${TASTY_BASE}/customers/me/accounts`, {
    ...axiosCfg, headers: { Authorization: accessToken },
  });
  return res.data?.data?.items ?? [];
}

async function getAccountBalances(accessToken, accountNumber) {
  const res = await axios.get(`${TASTY_BASE}/accounts/${accountNumber}/balances`, {
    ...axiosCfg, headers: { Authorization: accessToken },
  });
  const b = res.data?.data ?? res.data;
  return parseFloat(b['net-liquidating-value'] || b['net-liquidity'] || '0');
}

async function getMarketMetrics(accessToken, symbols) {
  try {
    const res = await axios.get(`${TASTY_BASE}/market-metrics?symbols=${symbols.join(',')}`, {
      ...axiosCfg, headers: { Authorization: accessToken },
    });
    const items = res.data?.data?.items ?? [];
    const result = {};
    for (const item of items) {
      result[item.symbol] = {
        ivRank: round2(parseFloat(item['implied-volatility-index-rank'] || item['iv-rank'] || '0') * 100),
        ivPercentile: round2(parseFloat(item['implied-volatility-percentile'] || '0') * 100),
      };
    }
    return result;
  } catch (e) {
    console.warn('  Market metrics fetch failed:', e?.message ?? e);
    return {};
  }
}

async function getUnderlyingSpot(accessToken, symbol) {
  try {
    const params = new URLSearchParams();
    if (symbol === 'SPX' || symbol.startsWith('$')) params.append('index', symbol);
    else params.append('equity', symbol);
    const res = await axios.get(`${TASTY_BASE}/market-data/by-type?${params.toString()}`, {
      ...axiosCfg, headers: { Authorization: accessToken },
    });
    const item = res.data?.data?.items?.[0];
    if (!item) return null;
    const last = parseFloat(item['last-trade-price'] ?? '0');
    if (last > 0) return last;
    const b = parseFloat(item.bid ?? '0');
    const a = parseFloat(item.ask ?? '0');
    const m = (b + a) / 2;
    return m > 0 ? m : null;
  } catch (e) {
    console.warn(`  Spot fetch failed for ${symbol}: ${e?.message ?? e}`);
    return null;
  }
}

async function getNestedOptionChain(accessToken, symbol) {
  const res = await axios.get(`${TASTY_BASE}/option-chains/${encodeURIComponent(symbol)}/nested`, {
    ...axiosCfg, headers: { Authorization: accessToken },
  });
  return res.data?.data?.items ?? res.data?.data ?? res.data;
}

// Keep subscriptions bounded — far-OTM strikes don't qualify (delta < deltaMin)
const STRIKE_BAND_PCT = 0.10;
function filterStrikesToBand(strikes, spot) {
  if (!spot || spot <= 0) return strikes;
  const lo = spot * (1 - STRIKE_BAND_PCT);
  const hi = spot * (1 + STRIKE_BAND_PCT);
  return strikes.filter(s => s.strikePrice >= lo && s.strikePrice <= hi);
}

// ── IC Builder ────────────────────────────────────────────────────────────────
function buildICs(expiration, profileName, profile, quotesMap, greeksMap) {
  const { expirationDate, daysToExpiration, strikes } = expiration;
  const { deltaMin, deltaMax, wings, minPOP, maxRR, spread, minCredit, weights } = profile;

  const putCandidates = [];
  const callCandidates = [];

  for (const strike of strikes) {
    const putSym  = strike.putStreamerSymbol;
    const callSym = strike.callStreamerSymbol;
    const pg = greeksMap[putSym],  pq = quotesMap[putSym];
    const cg = greeksMap[callSym], cq = quotesMap[callSym];

    if (pg && pq) {
      const absDelta = Math.abs(pg.delta);
      const midPrice = mid(pq.bidPrice, pq.askPrice);
      if (absDelta >= deltaMin && absDelta <= deltaMax && midPrice > 0) {
        putCandidates.push({ ...strike, absDelta, delta: pg.delta, midPrice,
          bid: pq.bidPrice, ask: pq.askPrice, theta: pg.theta ?? 0, iv: pg.volatility ?? 0, sym: putSym });
      }
    }
    if (cg && cq) {
      const absDelta = Math.abs(cg.delta);
      const midPrice = mid(cq.bidPrice, cq.askPrice);
      if (absDelta >= deltaMin && absDelta <= deltaMax && midPrice > 0) {
        callCandidates.push({ ...strike, absDelta, delta: cg.delta, midPrice,
          bid: cq.bidPrice, ask: cq.askPrice, theta: cg.theta ?? 0, iv: cg.volatility ?? 0, sym: callSym });
      }
    }
  }

  if (!putCandidates.length || !callCandidates.length) return [];

  // Symmetric delta pairing: sort desc by absDelta, pair by index
  putCandidates.sort((a, b)  => b.absDelta - a.absDelta);
  callCandidates.sort((a, b) => b.absDelta - a.absDelta);

  const strikeByPrice = {};
  for (const s of strikes) strikeByPrice[s.strikePrice] = s;

  const ics = [];
  for (let i = 0; i < Math.min(putCandidates.length, callCandidates.length); i++) {
    const sp = putCandidates[i];
    const sc = callCandidates[i];

    const lpData = strikeByPrice[sp.strikePrice - wings];
    const lcData = strikeByPrice[sc.strikePrice + wings];
    if (!lpData || !lcData) continue;

    const lpQ = quotesMap[lpData.putStreamerSymbol];
    const lcQ = quotesMap[lcData.callStreamerSymbol];
    if (!lpQ || !lcQ) continue;

    const lpMid = mid(lpQ.bidPrice, lpQ.askPrice);
    const lcMid = mid(lcQ.bidPrice, lcQ.askPrice);
    if (!lpMid || !lcMid) continue;

    const credit = round2(sp.midPrice + sc.midPrice - lpMid - lcMid);
    if (credit < minCredit) continue;

    const rr = round2(wings / credit);
    if (rr > maxRR) continue;

    const putSprdPct  = sp.midPrice > 0 ? (sp.ask - sp.bid) / sp.midPrice : 1;
    const callSprdPct = sc.midPrice > 0 ? (sc.ask - sc.bid) / sc.midPrice : 1;
    if (putSprdPct > spread || callSprdPct > spread) continue;

    const pop = round2(100 - Math.max(sp.absDelta * 100, sc.absDelta * 100));
    if (pop < minPOP) continue;

    const maxLoss = wings - credit;
    const ev      = round2(((pop / 100) * credit * 100 - (1 - pop / 100) * maxLoss * 100) / (wings * 100) * 100);
    const alpha   = round2((credit / wings) * 100);
    const score   = round2(pop * weights.pop + ev * weights.ev + alpha * weights.alpha);
    const theta   = round2((sp.theta + sc.theta) * 100);
    const avgIV   = round2((sp.iv + sc.iv) / 2 * 100);

    ics.push({
      expiration: expirationDate, dte: daysToExpiration, profile: profileName,
      shortPut:  { strike: sp.strikePrice,          delta: round2(sp.delta),  mid: sp.midPrice,  sym: sp.sym },
      longPut:   { strike: sp.strikePrice  - wings, mid: round2(lpMid),       sym: lpData.putStreamerSymbol },
      shortCall: { strike: sc.strikePrice,          delta: round2(sc.delta),  mid: sc.midPrice,  sym: sc.sym },
      longCall:  { strike: sc.strikePrice  + wings, mid: round2(lcMid),       sym: lcData.callStreamerSymbol },
      credit, rr, pop, ev, alpha, score, wings, theta, iv: avgIV,
    });
  }

  ics.sort((a, b) => b.score - a.score);
  return ics.slice(0, 1); // best per expiration
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const NOW = new Date().toISOString();
  const TODAY = todayStr();
  console.log('=== Guvid Agent — Morning Scan ===');
  console.log('Timestamp:', NOW);

  // Step 3: Credentials
  console.log('\n[1] Reading TastyTrade credentials from Firestore...');
  const credsList = await fetchCredentials();
  console.log(`  Found ${credsList.length} credential set(s) for Catalin.`);

  console.log('\n[2] Getting TastyTrade access token...');
  const accessToken = await getAccessToken(credsList);
  console.log('  Access token obtained.');

  console.log('\n[3] Getting DxLink quote token...');
  const qtData      = await getApiQuoteToken(accessToken);
  const dxLinkUrl   = qtData['dxlink-url'];
  const dxAuthToken = qtData['token'];
  if (!dxAuthToken) throw new Error('No DxLink auth token received');
  console.log(`  DxLink URL: ${dxLinkUrl}`);

  // Step 4 (part 1): Account balances for morningNetLiq
  console.log('\n[4] Fetching account balances...');
  const accounts = await getAccounts(accessToken);
  if (!accounts.length) throw new Error('No accounts found');
  const accountNumber = accounts[0].account?.['account-number'] || accounts[0]['account-number'];
  console.log(`  Account: ${accountNumber}`);
  const morningNetLiq = round2(await getAccountBalances(accessToken, accountNumber));
  console.log(`  Morning Net Liq: $${morningNetLiq}`);

  // Options chains + market metrics
  console.log('\n[5] Fetching options chains and market metrics...');
  const spotMap = {};
  const chains = {};
  const minDTE = 19, maxDTE = 47;

  for (const ticker of TICKERS) {
    const spot = await getUnderlyingSpot(accessToken, ticker);
    spotMap[ticker] = spot;
    console.log(`  ${ticker}: spot=${spot ?? 'unknown'}`);
    const raw = await getNestedOptionChain(accessToken, ticker);
    const expirations = raw.flatMap(c => c.expirations ?? [c]).map(exp => ({
      expirationDate:   exp['expiration-date'],
      daysToExpiration: parseInt(exp['days-to-expiration']),
      strikes: (exp['strikes'] ?? []).map(s => ({
        strikePrice:       parseFloat(s['strike-price']),
        putStreamerSymbol:  s['put-streamer-symbol'],
        callStreamerSymbol: s['call-streamer-symbol'],
      })),
    }));
    const filtered = expirations
      .filter(e => e.daysToExpiration >= minDTE && e.daysToExpiration <= maxDTE)
      .map(e => ({ ...e, strikes: filterStrikesToBand(e.strikes, spot) }))
      .filter(e => e.strikes.length > 0);
    chains[ticker] = filtered;
    const band = spot ? `±${(STRIKE_BAND_PCT * 100).toFixed(0)}% of ${spot}` : 'no band (spot unknown)';
    console.log(`  ${ticker}: ${filtered.length} expirations (DTE ${minDTE}-${maxDTE}, strikes ${band})`);
    filtered.forEach(e => console.log(`    DTE ${e.daysToExpiration} (${e.expirationDate}): ${e.strikes.length} strikes`));
  }

  const metrics = await getMarketMetrics(accessToken, TICKERS);
  for (const ticker of TICKERS) {
    const m = metrics[ticker];
    if (m) console.log(`  ${ticker}: IV Rank=${m.ivRank}% IV Percentile=${m.ivPercentile}%`);
  }

  // Collect all symbols: $VIX.X + all option strikes
  const allSymbols = new Set(['$VIX.X']);
  for (const exps of Object.values(chains)) {
    for (const exp of exps) {
      for (const s of exp.strikes) {
        if (s.putStreamerSymbol)  allSymbols.add(s.putStreamerSymbol);
        if (s.callStreamerSymbol) allSymbols.add(s.callStreamerSymbol);
      }
    }
  }
  const symArray = [...allSymbols];
  console.log(`\n[6] Subscribing ${symArray.length} symbols via DxLink WebSocket...`);

  const quotesMap = {};
  const greeksMap = {};
  let wsClient = null;
  let feed = null;
  const allSubs = [];

  try {
    wsClient = new DXLinkWebSocketClient();
    wsClient.connect(dxLinkUrl);
    wsClient.setAuthToken(dxAuthToken);

    feed = new DXLinkFeed(wsClient, FeedContract.AUTO);
    feed.configure({ acceptAggregationPeriod: 10, acceptDataFormat: FeedDataFormat.COMPACT });
    feed.addEventListener((records) => {
      for (const rec of records) {
        const sym = rec.eventSymbol;
        if (rec.eventType === 'Quote') {
          quotesMap[sym] = { bidPrice: rec.bidPrice, askPrice: rec.askPrice };
        } else if (rec.eventType === 'Greeks') {
          greeksMap[sym] = { delta: rec.delta, theta: rec.theta, gamma: rec.gamma,
            vega: rec.vega, volatility: rec.volatility };
        }
      }
    });

    const BATCH = 200;
    for (let i = 0; i < symArray.length; i += BATCH) {
      const batch = symArray.slice(i, i + BATCH);
      const subs = [
        ...batch.map(s => ({ type: 'Quote',  symbol: s })),
        ...batch.map(s => ({ type: 'Greeks', symbol: s })),
      ];
      feed.addSubscriptions(subs);
      allSubs.push(...subs);
    }

    console.log('  Waiting 12s for streaming data...');
    await new Promise(r => setTimeout(r, 12000));

    const qCount = Object.keys(quotesMap).length;
    const gCount = Object.keys(greeksMap).length;
    console.log(`  Received: ${qCount} quotes, ${gCount} greek records`);

    // Step 4 (part 2): Extract VIX from streamed data
    const vixQuote = quotesMap['$VIX.X'];
    let morningVix = null;
    if (vixQuote) {
      const v = mid(vixQuote.bidPrice, vixQuote.askPrice);
      if (v != null && !isNaN(v) && v > 0) morningVix = round2(v);
      else if (vixQuote.askPrice > 0 && !isNaN(vixQuote.askPrice)) morningVix = round2(vixQuote.askPrice);
      else if (vixQuote.bidPrice > 0 && !isNaN(vixQuote.bidPrice)) morningVix = round2(vixQuote.bidPrice);
    }
    console.log(`  VIX: ${morningVix ?? 'N/A'}`);

    // Step 4: Save morning snapshot to guvid-agent/daily/dates/{YYYY-MM-DD}
    // (afternoon script reads morningNetLiq from this same path)
    console.log('\n[7] Saving morning snapshot...');
    const dailyDocRef = db.collection('guvid-agent').doc('daily').collection('dates').doc(TODAY);
    await dailyDocRef.set({
      morningNetLiq,
      morningVix: morningVix ?? null,
      timestamp: NOW,
      date: TODAY,
    }, { merge: true });
    console.log(`  Saved → guvid-agent/daily/dates/${TODAY}`);

    // Step 5: Build Iron Condors
    console.log('\n[8] Building Iron Condors...');
    const results = {};
    for (const ticker of TICKERS) {
      results[ticker] = { conservative: [], neutral: [], aggressive: [] };
      for (const [pName, profile] of Object.entries(PROFILES)) {
        const exps = chains[ticker].filter(e =>
          e.daysToExpiration >= profile.dteMin && e.daysToExpiration <= profile.dteMax
        );
        const best = [];
        for (const exp of exps) {
          const ics = buildICs(exp, pName, profile, quotesMap, greeksMap);
          if (ics.length) best.push(ics[0]);
        }
        results[ticker][pName] = best;
        if (best.length) {
          console.log(`  ${ticker} / ${pName}: ${best.length} IC(s)`);
          best.forEach(ic => console.log(
            `    DTE${ic.dte} ${ic.expiration}: credit=$${ic.credit} RR=${ic.rr} POP=${ic.pop}% EV=${ic.ev} alpha=${ic.alpha} score=${ic.score}`
          ));
        } else {
          console.log(`  ${ticker} / ${pName}: — no qualifying ICs`);
        }
      }
    }

    // Step 6: Save to Firestore
    console.log('\n[9] Saving to Firestore...');

    // Scan doc (consistent path with afternoon: guvid-agent/scans/dates/{TODAY}, merging morning key)
    const scanDocRef = db.collection('guvid-agent').doc('scans').collection('dates').doc(TODAY);
    await scanDocRef.set({
      morning: {
        date: TODAY,
        timestamp: NOW,
        type: 'morning',
        SPX: results['SPX'],
        QQQ: results['QQQ'],
      },
    }, { merge: true });
    console.log(`  Scan saved → guvid-agent/scans/dates/${TODAY}`);

    // Positions with marketContext
    const batch = db.batch();
    let posCount = 0;
    for (const ticker of TICKERS) {
      const underlyingPrice = spotMap[ticker] ?? null;
      const ivRank = metrics[ticker]?.ivRank ?? null;
      for (const [pName, ics] of Object.entries(results[ticker])) {
        for (const ic of ics) {
          const ref = db.collection('guvid-agent').doc('positions').collection('items').doc();
          batch.set(ref, {
            ticker, profile: pName, ic,
            openDate: TODAY, expiration: ic.expiration,
            credit: ic.credit, pop: ic.pop, ev: ic.ev, alpha: ic.alpha,
            rr: ic.rr, wings: ic.wings, status: 'open', dailyChecks: [],
            marketContext: {
              underlyingPrice,
              vix: morningVix ?? null,
              ivRank,
            },
          });
          posCount++;
        }
      }
    }
    await batch.commit();
    console.log(`  ${posCount} position(s) saved → guvid-agent/positions/items/{auto-id}`);

    console.log('\n=== MORNING SUMMARY ===');
    console.log(`Date: ${TODAY}  |  Net Liq: $${morningNetLiq}  |  VIX: ${morningVix ?? 'N/A'}`);
    console.log(`Data: ${qCount} quotes, ${gCount} greeks`);
    for (const ticker of TICKERS) {
      for (const pName of Object.keys(PROFILES)) {
        const ics = results[ticker][pName];
        if (!ics.length) {
          console.log(`${ticker} ${pName.padEnd(12)}: — no qualifying ICs`);
        } else {
          ics.forEach(ic => console.log(
            `${ticker} ${pName.padEnd(12)}: DTE${ic.dte} ${ic.expiration}  credit=$${ic.credit}  RR=${ic.rr}  POP=${ic.pop}%  EV=${ic.ev}  score=${ic.score}`
          ));
        }
      }
    }
  } finally {
    // Always clean up DxLink — ghost subs count against account quota across runs
    console.log('\n[10] Cleaning up DxLink subscriptions...');
    try {
      if (feed && typeof feed.removeSubscriptions === 'function' && allSubs.length) {
        feed.removeSubscriptions(allSubs);
      } else if (feed && typeof feed.clearSubscriptions === 'function') {
        feed.clearSubscriptions();
      }
      if (feed && typeof feed.close === 'function') feed.close();
      if (wsClient && typeof wsClient.disconnect === 'function') wsClient.disconnect();
      else if (wsClient && typeof wsClient.close === 'function') wsClient.close();
      if (wsClient) await new Promise(r => setTimeout(r, 1500));
      console.log('  Cleanup done.');
    } catch (e) {
      console.error('  Cleanup error (non-fatal):', e?.message ?? e);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Guvid Agent — Iron Condor Scanner
 * - Uses axios + HttpsProxyAgent for REST (bypasses GLOBAL_AGENT redirect loop)
 * - Monkey-patches global WebSocket → ws + HttpsProxyAgent (DxLink streaming)
 */

import { createRequire } from 'module';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);

// ── Proxy setup ───────────────────────────────────────────────────────────────
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
if (!proxyUrl) throw new Error('No HTTPS_PROXY env var found');
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// Monkey-patch global WebSocket to use ws + proxy agent
// (DxLink WebSocket client uses `new WebSocket(url)` internally)
const WsLib = require('ws');
const OriginalWebSocket = WsLib;

class ProxiedWebSocket {
  constructor(url, protocols) {
    const opts = { agent: httpsAgent };
    this._ws = protocols
      ? new WsLib(url, protocols, opts)
      : new WsLib(url, opts);
    // Mirror the EventTarget/EventEmitter interface expected by DxLink
    this.readyState = 0; // CONNECTING
    this._listeners = {};
    this._ws.on('open',    () => { this.readyState = 1; this._dispatch('open', {}); });
    this._ws.on('close',   (code, reason) => { this.readyState = 3; this._dispatch('close', { code, reason: reason?.toString() }); });
    this._ws.on('error',   (err) => { this._dispatch('error', { message: err.message }); });
    this._ws.on('message', (data) => { this._dispatch('message', { data: data.toString() }); });
  }

  _dispatch(type, detail) {
    const handlers = this._listeners[type] || [];
    for (const fn of handlers) fn(detail);
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(l => l !== listener);
  }

  send(data) {
    if (this._ws.readyState === WsLib.OPEN) this._ws.send(data);
  }

  close() {
    this._ws.close();
  }
}

// DxLink checks these static constants
ProxiedWebSocket.CONNECTING = 0;
ProxiedWebSocket.OPEN       = 1;
ProxiedWebSocket.CLOSING    = 2;
ProxiedWebSocket.CLOSED     = 3;

global.WebSocket = ProxiedWebSocket;

// ── DxLink modules ────────────────────────────────────────────────────────────
const { DXLinkWebSocketClient } = require('@dxfeed/dxlink-websocket-client');
const { DXLinkFeed, FeedContract, FeedDataFormat } = require('@dxfeed/dxlink-feed');

// ── Firebase ──────────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── TastyTrade credentials ────────────────────────────────────────────────────
const CLIENT_SECRET = '1f2391186fc378a6e01147167b5436d58d945e61';
const REFRESH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6InJ0K2p3dCIsImtpZCI6IlVWRThTM3BBTWZUbkVtaUhsUHJnMU5oWWZqMzFNeHFhd08teGpubnhKX2ciLCJqa3UiOiJodHRwczovL2FwaS50YXN0eXRyYWRlLmNvbS9vYXV0aC9qd2tzIn0.eyJpc3MiOiJodHRwczovL2FwaS50YXN0eXRyYWRlLmNvbSIsInN1YiI6IlVjZjkyYzUwZi05ZmQyLTQ0N2EtODg3Ni0wOWIzMWI1NjljY2YiLCJpYXQiOjE3NzU3MTgzNTgsImF1ZCI6ImQ4NDAzMWQ2LTlmOTAtNDJjNi1iZDM3LTYwMWQyMjZkMGZkMCIsImdyYW50X2lkIjoiRzA4YThhZjZiLWE2OWEtNDkyYy05NTQ0LTk4M2NhYmFhNjNkYiIsInNjb3BlIjoicmVhZCJ9.U7yOTbXMczm55_FBt1YNoUVfTM-Gn5masb0DyAtZp7IAo68xzN-q6ipKfFtQQZrFGB5PR-He151iwp59OmhIDA';
const TASTY_BASE = 'https://api.tastyworks.com';
const axios = require('axios');

// ── Profile definitions ───────────────────────────────────────────────────────
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
    deltaMin: 0.18, deltaMax: 0.24,
    dteMin: 19, dteMax: 30,
    wings: 5, minPOP: 60, maxRR: 4, spread: 0.08, minCredit: 1.0,
    weights: { pop: 0.25, ev: 0.40, alpha: 0.35 },
  },
};

function mid(bid, ask) {
  if (bid == null || ask == null) return null;
  if (bid <= 0 && ask <= 0) return null;
  if (bid <= 0) return ask;
  if (ask <= 0) return bid;
  return (bid + ask) / 2;
}
function round2(n) { return Math.round(n * 100) / 100; }

// ── TastyTrade REST via axios + HttpsProxyAgent ───────────────────────────────
const axiosCfg = { httpsAgent, proxy: false, maxRedirects: 5 };

async function getAccessToken() {
  const res = await axios.post(`${TASTY_BASE}/oauth/token`, {
    refresh_token: REFRESH_TOKEN,
    client_secret: CLIENT_SECRET,
    scope: 'read',
    grant_type: 'refresh_token',
  }, axiosCfg);
  // TastyTrade returns 'access_token' (underscore); always prefix with Bearer
  const raw = res.data['access_token'] || res.data['access-token'];
  return `Bearer ${raw}`;
}

async function getApiQuoteToken(accessToken) {
  const res = await axios.get(`${TASTY_BASE}/api-quote-tokens`, {
    ...axiosCfg,
    headers: { Authorization: accessToken },
  });
  return res.data?.data ?? res.data;
}

async function getNestedOptionChain(accessToken, symbol) {
  const res = await axios.get(`${TASTY_BASE}/option-chains/${encodeURIComponent(symbol)}/nested`, {
    ...axiosCfg,
    headers: { Authorization: accessToken },
  });
  return res.data?.data?.items ?? res.data?.data ?? res.data;
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
  return ics.slice(0, 1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Guvid Agent — IC Scanner ===');
  console.log('Date:', new Date().toISOString());

  console.log('\n[1] Getting TastyTrade access token...');
  const accessToken = await getAccessToken();
  console.log('  Access token obtained.');

  console.log('\n[2] Getting DxLink quote token...');
  const qtData      = await getApiQuoteToken(accessToken);
  const dxLinkUrl   = qtData['dxlink-url'];
  const dxAuthToken = qtData['token'];
  console.log(`  DxLink URL: ${dxLinkUrl}`);
  if (!dxAuthToken) throw new Error('No DxLink auth token received');

  const minDTE = 19, maxDTE = 47;
  const tickers = ['SPX', 'QQQ'];
  const chains = {};

  console.log('\n[3] Fetching options chains...');
  for (const ticker of tickers) {
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
    const filtered = expirations.filter(e => e.daysToExpiration >= minDTE && e.daysToExpiration <= maxDTE);
    chains[ticker] = filtered;
    console.log(`  ${ticker}: ${filtered.length} expirations (DTE ${minDTE}-${maxDTE})`);
    filtered.forEach(e => console.log(`    DTE ${e.daysToExpiration} (${e.expirationDate}): ${e.strikes.length} strikes`));
  }

  const allSymbols = new Set();
  for (const exps of Object.values(chains)) {
    for (const exp of exps) {
      for (const s of exp.strikes) {
        if (s.putStreamerSymbol)  allSymbols.add(s.putStreamerSymbol);
        if (s.callStreamerSymbol) allSymbols.add(s.callStreamerSymbol);
      }
    }
  }
  const symArray = [...allSymbols];
  console.log(`\n[4] Subscribing ${symArray.length} symbols via DxLink WebSocket...`);

  const quotesMap = {};
  const greeksMap = {};

  const wsClient = new DXLinkWebSocketClient();
  wsClient.connect(dxLinkUrl);
  wsClient.setAuthToken(dxAuthToken);

  const feed = new DXLinkFeed(wsClient, FeedContract.AUTO);
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
    feed.addSubscriptions([
      ...batch.map(s => ({ type: 'Quote',  symbol: s })),
      ...batch.map(s => ({ type: 'Greeks', symbol: s })),
    ]);
  }

  console.log('  Waiting 12s for streaming data...');
  await new Promise(r => setTimeout(r, 12000));

  const qCount = Object.keys(quotesMap).length;
  const gCount = Object.keys(greeksMap).length;
  console.log(`  Received: ${qCount} quotes, ${gCount} greek records`);

  console.log('\n[5] Building Iron Condors...');
  const results = {};

  for (const ticker of tickers) {
    results[ticker] = { conservative: [], neutral: [], aggressive: [] };
    for (const [pName, profile] of Object.entries(PROFILES)) {
      const exps = chains[ticker].filter(e => e.daysToExpiration >= profile.dteMin && e.daysToExpiration <= profile.dteMax);
      const best = [];
      for (const exp of exps) {
        const ics = buildICs(exp, pName, profile, quotesMap, greeksMap);
        if (ics.length) best.push(ics[0]);
      }
      results[ticker][pName] = best;
      if (best.length) {
        console.log(`  ${ticker} / ${pName}: ${best.length} IC(s)`);
        best.forEach(ic => console.log(`    DTE${ic.dte} ${ic.expiration}: credit=$${ic.credit} RR=${ic.rr} POP=${ic.pop}% EV=${ic.ev} alpha=${ic.alpha} score=${ic.score}`));
      } else {
        console.log(`  ${ticker} / ${pName}: — no qualifying ICs`);
      }
    }
  }

  console.log('\n[6] Saving to Firestore...');
  const today = new Date().toISOString().split('T')[0];

  await db.collection('guvid-agent').doc('scans').collection(today).doc('morning').set({
    date: today,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: 'morning',
    SPX: results['SPX'],
    QQQ: results['QQQ'],
  });
  console.log(`  Scan saved → guvid-agent/scans/${today}/morning`);

  const batch = db.batch();
  let posCount = 0;
  for (const ticker of tickers) {
    for (const [pName, ics] of Object.entries(results[ticker])) {
      for (const ic of ics) {
        const ref = db.collection('guvid-agent').doc('positions').collection('items').doc();
        batch.set(ref, {
          ticker, profile: pName, ic,
          openDate: today, expiration: ic.expiration,
          credit: ic.credit, pop: ic.pop, ev: ic.ev, alpha: ic.alpha,
          rr: ic.rr, wings: ic.wings, status: 'open', dailyChecks: [],
        });
        posCount++;
      }
    }
  }
  await batch.commit();
  console.log(`  ${posCount} position(s) saved → guvid-agent/positions/items/{auto-id}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Date: ${today}  |  Data: ${qCount} quotes, ${gCount} greeks`);
  for (const ticker of tickers) {
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

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

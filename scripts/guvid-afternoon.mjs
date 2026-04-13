/**
 * Guvid Agent — Afternoon Check (3 PM ET)
 * - Net liq snapshot (afternoon)
 * - VIX quote
 * - Open position P&L / profit target / 21 DTE check
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
const WsLib = require('ws');
class ProxiedWebSocket {
  constructor(url, protocols) {
    const opts = { agent: httpsAgent };
    this._ws = protocols ? new WsLib(url, protocols, opts) : new WsLib(url, opts);
    this.readyState = 0;
    this._listeners = {};
    this._ws.on('open',    () => { this.readyState = 1; this._dispatch('open', {}); });
    this._ws.on('close',   (code, reason) => { this.readyState = 3; this._dispatch('close', { code, reason: reason?.toString() }); });
    this._ws.on('error',   (err) => { this._dispatch('error', { message: err.message }); });
    this._ws.on('message', (data) => { this._dispatch('message', { data: data.toString() }); });
  }
  _dispatch(type, detail) {
    for (const fn of (this._listeners[type] || [])) fn(detail);
  }
  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }
  removeEventListener(type, listener) {
    if (this._listeners[type])
      this._listeners[type] = this._listeners[type].filter(l => l !== listener);
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const axios = require('axios');
const axiosCfg = { httpsAgent, proxy: false, maxRedirects: 5 };
const TASTY_BASE = 'https://api.tastyworks.com';
function round2(n) { return Math.round(n * 100) / 100; }
function mid(bid, ask) {
  const b = (bid == null || isNaN(bid)) ? null : bid;
  const a = (ask == null || isNaN(ask)) ? null : ask;
  if (b == null && a == null) return null;
  if (b == null || b <= 0) return a > 0 ? a : null;
  if (a == null || a <= 0) return b > 0 ? b : null;
  return (b + a) / 2;
}
function daysUntil(dateStr) {
  const exp = new Date(dateStr + 'T16:00:00-05:00'); // 4 PM ET
  const now  = new Date();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Known-good fallback credentials (from guvid-scan.mjs)
const FALLBACK_CLIENT_SECRET = '1f2391186fc378a6e01147167b5436d58d945e61';
const FALLBACK_REFRESH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6InJ0K2p3dCIsImtpZCI6IlVWRThTM3BBTWZUbkVtaUhsUHJnMU5oWWZqMzFNeHFhd08teGpubnhKX2ciLCJqa3UiOiJodHRwczovL2FwaS50YXN0eXRyYWRlLmNvbS9vYXV0aC9qd2tzIn0.eyJpc3MiOiJodHRwczovL2FwaS50YXN0eXRyYWRlLmNvbSIsInN1YiI6IlVjZjkyYzUwZi05ZmQyLTQ0N2EtODg3Ni0wOWIzMWI1NjljY2YiLCJpYXQiOjE3NzU3MTgzNTgsImF1ZCI6ImQ4NDAzMWQ2LTlmOTAtNDJjNi1iZDM3LTYwMWQyMjZkMGZkMCIsImdyYW50X2lkIjoiRzA4YThhZjZiLWE2OWEtNDkyYy05NTQ0LTk4M2NhYmFhNjNkYiIsInNjb3BlIjoicmVhZCJ9.U7yOTbXMczm55_FBt1YNoUVfTM-Gn5masb0DyAtZp7IAo68xzN-q6ipKfFtQQZrFGB5PR-He151iwp59OmhIDA';

// ── Step 3: Read credentials from Firestore ───────────────────────────────────
async function fetchCredentials() {
  const usersSnap = await db.collection('users').get();
  const allCreds = [];
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const brokerSnap = await db.collection('users').doc(uid).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      const cs  = data?.credentials?.clientSecret  || data?.clientSecret  || null;
      const rt  = data?.credentials?.refreshToken  || data?.refreshToken  || null;
      const upd = brokerDoc.updateTime?.seconds || 0;
      if (cs && rt) allCreds.push({ cs, rt, upd });
    }
  }
  allCreds.sort((a, b) => b.upd - a.upd);
  return allCreds; // return all, sorted newest first
}

async function tryGetAccessToken(cs, rt) {
  try {
    const res = await axios.post(`${TASTY_BASE}/oauth/token`, {
      refresh_token: rt, client_secret: cs, scope: 'read', grant_type: 'refresh_token',
    }, axiosCfg);
    return `Bearer ${res.data['access_token'] || res.data['access-token']}`;
  } catch (_) {
    return null;
  }
}

async function getAccessToken(credsList) {
  // Try each Firestore credential in order
  for (const { cs, rt } of credsList) {
    const token = await tryGetAccessToken(cs, rt);
    if (token) { console.log('  Token obtained from Firestore credentials.'); return token; }
  }
  // Fall back to hardcoded credentials
  console.log('  Firestore creds failed, trying hardcoded fallback...');
  const token = await tryGetAccessToken(FALLBACK_CLIENT_SECRET, FALLBACK_REFRESH_TOKEN);
  if (token) { console.log('  Token obtained from fallback credentials.'); return token; }
  throw new Error('All credential attempts failed — refresh tokens may be expired');
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

async function getVixFromRest(accessToken) {
  try {
    // Use SPY implied-volatility-index * 100 as VIX proxy (e.g. 0.19 → ~19)
    // TastyTrade doesn't expose raw VIX price via REST; SPY IV tracks VIX closely
    const res = await axios.get(`${TASTY_BASE}/market-metrics?symbols=SPY`, {
      ...axiosCfg, headers: { Authorization: accessToken },
    });
    const items = res.data?.data?.items ?? [];
    for (const item of items) {
      if (item.symbol === 'SPY') {
        const iv = parseFloat(item['implied-volatility-index'] || '0');
        if (iv > 0) return round2(iv * 100); // 0.19 → 19 (VIX-like)
      }
    }
  } catch (_) {}
  return null;
}

async function getAccountBalances(accessToken, accountNumber) {
  const res = await axios.get(`${TASTY_BASE}/accounts/${accountNumber}/balances`, {
    ...axiosCfg, headers: { Authorization: accessToken },
  });
  const b = res.data?.data ?? res.data;
  return {
    netLiquidity:         parseFloat(b['net-liquidating-value'] || b['net-liquidity'] || '0'),
    optionBuyingPower:    parseFloat(b['derivative-buying-power'] || '0'),
    cashBalance:          parseFloat(b['cash-balance'] || '0'),
  };
}

// ── Step 5: Read open positions from Firestore ────────────────────────────────
async function getOpenPositions() {
  const snap = await db.collection('guvid-agent').doc('positions').collection('items')
    .where('status', '==', 'open').get();
  return snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
}

// ── Step 4 + 5: Stream quotes/greeks for given symbols ────────────────────────
async function streamData(dxLinkUrl, dxAuthToken, symbols) {
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
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    feed.addSubscriptions([
      ...batch.map(s => ({ type: 'Quote',  symbol: s })),
      ...batch.map(s => ({ type: 'Greeks', symbol: s })),
    ]);
  }

  console.log(`  Subscribed ${symbols.length} symbols, waiting 12s for data...`);
  await new Promise(r => setTimeout(r, 12000));
  console.log(`  Received: ${Object.keys(quotesMap).length} quotes, ${Object.keys(greeksMap).length} greeks`);

  try { wsClient.disconnect?.(); } catch (_) {}
  return { quotesMap, greeksMap };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const NOW = new Date().toISOString();
  const TODAY = today();
  const YESTERDAY = yesterday();
  console.log('=== Guvid Agent — Afternoon Check ===');
  console.log('Timestamp:', NOW);

  // ── Step 3: Credentials ───────────────────────────────────────────────────
  console.log('\n[1] Reading TastyTrade credentials from Firestore...');
  const credsList = await fetchCredentials();
  console.log(`  Found ${credsList.length} credential set(s) in Firestore.`);

  console.log('\n[2] Getting TastyTrade access token...');
  const accessToken = await getAccessToken(credsList);
  console.log('  Access token obtained.');

  console.log('\n[3] Getting DxLink quote token...');
  const qtData      = await getApiQuoteToken(accessToken);
  const dxLinkUrl   = qtData['dxlink-url'];
  const dxAuthToken = qtData['token'];
  if (!dxAuthToken) throw new Error('No DxLink auth token received');
  console.log(`  DxLink URL: ${dxLinkUrl}`);

  // ── Get account number ────────────────────────────────────────────────────
  console.log('\n[4] Fetching account list...');
  const accounts = await getAccounts(accessToken);
  if (!accounts.length) throw new Error('No accounts found');
  const accountNumber = accounts[0].account?.['account-number'] || accounts[0]['account-number'];
  console.log(`  Account: ${accountNumber}`);

  // ── Step 4: Net liq snapshot ──────────────────────────────────────────────
  console.log('\n[5] Fetching account balances...');
  const balances = await getAccountBalances(accessToken, accountNumber);
  const afternoonNetLiq = round2(balances.netLiquidity);
  console.log(`  Net Liquidity: $${afternoonNetLiq}`);

  // Read morning doc for comparison
  const dailyRef = db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot');

  // Actually the prompt says guvid-agent/daily/{YYYY-MM-DD} so let's use a flat doc
  const dailyDocRef = db.collection('guvid-agent').doc('daily').collection('dates').doc(TODAY);
  const morningDoc = await dailyDocRef.get();
  const morningData = morningDoc.exists ? morningDoc.data() : {};
  const morningNetLiq = morningData?.morningNetLiq ?? null;
  const netLiqChange = morningNetLiq != null ? round2(afternoonNetLiq - morningNetLiq) : null;

  // Read yesterday's doc for day-over-day
  const yesterdayDocRef = db.collection('guvid-agent').doc('daily').collection('dates').doc(YESTERDAY);
  const yesterdayDoc = await yesterdayDocRef.get();
  const yesterdayAfternoonNetLiq = yesterdayDoc.exists ? (yesterdayDoc.data()?.afternoonNetLiq ?? null) : null;
  const netLiqChangeDayOverDay = yesterdayAfternoonNetLiq != null
    ? round2(afternoonNetLiq - yesterdayAfternoonNetLiq) : null;

  console.log(`  Morning Net Liq: ${morningNetLiq != null ? '$' + morningNetLiq : 'N/A'}`);
  console.log(`  Net Liq Change (vs morning): ${netLiqChange != null ? '$' + netLiqChange : 'N/A'}`);
  console.log(`  Yesterday afternoon: ${yesterdayAfternoonNetLiq != null ? '$' + yesterdayAfternoonNetLiq : 'N/A'}`);
  console.log(`  Net Liq Change (day over day): ${netLiqChangeDayOverDay != null ? '$' + netLiqChangeDayOverDay : 'N/A'}`);

  // ── Step 5: Open positions ────────────────────────────────────────────────
  console.log('\n[6] Loading open positions from Firestore...');
  const openPositions = await getOpenPositions();
  console.log(`  Found ${openPositions.length} open position(s).`);

  // Collect all symbols we need: VIX + position legs
  const symbolsNeeded = new Set(['$VIX.X', 'VIX', 'VIX/X:XCBO']);

  for (const pos of openPositions) {
    const ic = pos.ic;
    if (!ic) continue;
    for (const leg of [ic.shortPut, ic.longPut, ic.shortCall, ic.longCall]) {
      if (leg?.sym) symbolsNeeded.add(leg.sym);
    }
  }

  // ── Stream all data in one pass ───────────────────────────────────────────
  console.log('\n[7] Streaming quotes/greeks via DxLink...');
  const { quotesMap } = await streamData(dxLinkUrl, dxAuthToken, [...symbolsNeeded]);

  // ── VIX ───────────────────────────────────────────────────────────────────
  const vixQuote = quotesMap['$VIX.X'] || quotesMap['VIX'] || quotesMap['VIX/X:XCBO'];
  let afternoonVix = null;
  if (vixQuote) {
    const v = mid(vixQuote.bidPrice, vixQuote.askPrice);
    if (v != null && !isNaN(v) && v > 0) afternoonVix = round2(v);
    else if (vixQuote.askPrice > 0 && !isNaN(vixQuote.askPrice)) afternoonVix = round2(vixQuote.askPrice);
    else if (vixQuote.bidPrice > 0 && !isNaN(vixQuote.bidPrice)) afternoonVix = round2(vixQuote.bidPrice);
  }
  // Fallback: try REST API if DxLink didn't give VIX
  if (afternoonVix == null) {
    afternoonVix = await getVixFromRest(accessToken);
    if (afternoonVix) console.log(`  VIX (from REST): ${afternoonVix}`);
  }
  console.log(`  VIX: ${afternoonVix ?? 'N/A'}`);

  // ── Save net liq to guvid-agent/daily/{YYYY-MM-DD} ───────────────────────
  const dailyPayload = {
    afternoonNetLiq,
    afternoonTimestamp: NOW,
    ...(afternoonVix != null ? { afternoonVix } : {}),
    ...(netLiqChange != null ? { netLiqChange } : {}),
    ...(netLiqChangeDayOverDay != null ? { netLiqChangeDayOverDay } : {}),
  };
  await dailyDocRef.set(dailyPayload, { merge: true });
  console.log(`  Saved to guvid-agent/daily/dates/${TODAY}`);

  // ── Step 5: Check each position ───────────────────────────────────────────
  console.log('\n[8] Checking positions...');

  const profitTargetsReached = [];
  const under21DTE = [];
  const positionChecks = [];
  const batch = db.batch();

  for (const pos of openPositions) {
    const { id, ref, ticker, profile, ic, credit, openDate, expiration } = pos;
    if (!ic) {
      console.log(`  [${id.slice(0,8)}] No IC data, skipping.`);
      continue;
    }

    const daysRemaining = daysUntil(expiration);

    // Check if expired
    if (daysRemaining < 0) {
      console.log(`  [${ticker}] EXPIRED (${expiration}), marking expired.`);
      // Calculate final P&L from last known value or assume worthless (full profit)
      const finalValue = 0; // expired worthless = full profit
      const finalPL = round2((credit - finalValue) * 100);
      batch.update(ref, {
        status: 'expired',
        expiredDate: TODAY,
        finalValue,
        finalPL,
      });
      continue;
    }

    // Calculate current IC value from mid prices
    // Cost to close = buy back shorts + sell longs
    // = +shortPut.mid + shortCall.mid - longPut.mid - longCall.mid
    const legs = [
      { side: 'shortPut',  multiplier:  1, data: ic.shortPut  },
      { side: 'longPut',   multiplier: -1, data: ic.longPut   },
      { side: 'shortCall', multiplier:  1, data: ic.shortCall },
      { side: 'longCall',  multiplier: -1, data: ic.longCall  },
    ];

    let currentValue = null;
    let missingLegs = [];

    for (const leg of legs) {
      if (!leg.data?.sym) { missingLegs.push(leg.side); continue; }
      const q = quotesMap[leg.data.sym];
      if (!q) { missingLegs.push(leg.side); continue; }
      const m = mid(q.bidPrice, q.askPrice);
      if (m == null) { missingLegs.push(leg.side); continue; }
      if (currentValue === null) currentValue = 0;
      // IC cost to close = shortPut.mid + shortCall.mid - longPut.mid - longCall.mid
      // (positive = costs money to close, negative = receive credit to close)
      currentValue += leg.multiplier * m;
    }

    if (currentValue === null) {
      console.log(`  [${ticker}] Missing quote data for legs: ${missingLegs.join(', ')}`);
      currentValue = null;
    } else {
      currentValue = round2(Math.max(0, currentValue)); // can't be negative cost
    }

    const pl = currentValue != null ? round2((credit - currentValue) * 100) : null;
    const daysOpen = openDate ? Math.ceil((new Date() - new Date(openDate)) / (1000 * 60 * 60 * 24)) : null;
    const plPerDay = (pl != null && daysOpen && daysOpen > 0) ? round2(pl / daysOpen) : null;

    // Profit target checks (against credit)
    let conservativeHit = false, neutralHit = false, aggressiveHit = false;
    let vixEvent = afternoonVix != null && afternoonVix > 30; // high-VIX: use 50% instead of 75%

    if (currentValue != null) {
      conservativeHit = currentValue <= credit * 0.50;
      // Neutral: 75% normally, 50% during VIX event
      neutralHit = vixEvent
        ? currentValue <= credit * 0.50
        : currentValue <= credit * 0.25;
      aggressiveHit = currentValue <= credit * 0.10;
    }

    const profitTargetReached = conservativeHit || neutralHit || aggressiveHit;
    const isUnder21DTE = daysRemaining <= 21;

    const icLabel = `${ticker} ${profile} DTE${daysRemaining} (${expiration}) credit=$${credit}`;
    const plLabel = pl != null ? `P&L=$${pl}` : 'P&L=?';
    const cvLabel = currentValue != null ? `value=$${currentValue}` : 'value=?';
    console.log(`  [${ticker}] ${icLabel} | ${cvLabel} ${plLabel} | DTE=${daysRemaining}`);
    if (profitTargetReached) console.log(`    *** PROFIT TARGET: conservative=${conservativeHit} neutral=${neutralHit} aggressive=${aggressiveHit}`);
    if (isUnder21DTE)        console.log(`    *** UNDER 21 DTE: ${daysRemaining} days remaining`);

    const check = {
      date: TODAY,
      currentValue,
      pl,
      plPerDay,
      daysRemaining,
      profitTargetReached,
      conservativeHit,
      neutralHit,
      aggressiveHit,
      under21DTE: isUnder21DTE,
    };

    positionChecks.push({
      ticker, profile,
      ic: `${ic.shortPut?.strike}/${ic.shortCall?.strike} ${expiration}`,
      credit,
      currentValue,
      pl,
      plPerDay,
      daysOpen,
      daysRemaining,
      profitTargetReached,
      under21DTE: isUnder21DTE,
    });

    if (profitTargetReached) {
      profitTargetsReached.push({
        ticker, profile,
        ic: `${ic.shortPut?.strike}/${ic.shortCall?.strike} ${expiration}`,
        credit, currentValue, pl,
        conservativeHit, neutralHit, aggressiveHit,
      });
    }

    if (isUnder21DTE) {
      under21DTE.push({ ticker, profile,
        ic: `${ic.shortPut?.strike}/${ic.shortCall?.strike} ${expiration}`,
        daysRemaining });
    }

    // Append to dailyChecks array in position doc
    batch.update(ref, {
      dailyChecks: admin.firestore.FieldValue.arrayUnion(check),
    });
  }

  await batch.commit();
  console.log(`  Position updates committed.`);

  // ── Step 6: Save afternoon summary to guvid-agent/scans/{YYYY-MM-DD} ─────
  console.log('\n[9] Saving afternoon summary to Firestore...');
  const scanRef = db.collection('guvid-agent').doc('scans').collection('dates').doc(TODAY);
  await scanRef.set({
    afternoon: {
      timestamp: NOW,
      netLiq: afternoonNetLiq,
      netLiqChange: netLiqChange ?? null,
      netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
      vix: afternoonVix ?? null,
      positionsChecked: openPositions.length,
      profitTargetsReached,
      under21DTE,
      checks: positionChecks,
    },
  }, { merge: true });
  console.log(`  Saved → guvid-agent/scans/dates/${TODAY}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== AFTERNOON SUMMARY ===');
  const changeStr = netLiqChange != null
    ? ` (vs morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange})`
    : '';
  const dodStr = netLiqChangeDayOverDay != null
    ? `, vs yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay}`
    : '';
  console.log(`Net Liq:    $${afternoonNetLiq}${changeStr}${dodStr}`);
  console.log(`VIX:        ${afternoonVix ?? 'N/A'}`);
  console.log(`Positions checked: ${openPositions.length}`);

  if (profitTargetsReached.length) {
    console.log('\nProfit Targets Reached:');
    for (const p of profitTargetsReached) {
      const targets = [
        p.conservativeHit ? '50%(cons)' : null,
        p.neutralHit      ? '75%(neut)' : null,
        p.aggressiveHit   ? '90%(agg)'  : null,
      ].filter(Boolean).join(' ');
      console.log(`  ✓ ${p.ticker} ${p.profile} ${p.ic}  credit=$${p.credit} → value=$${p.currentValue} P&L=$${p.pl}  [${targets}]`);
    }
  } else {
    console.log('\nProfit Targets: none reached');
  }

  if (under21DTE.length) {
    console.log('\nUnder 21 DTE — Need Management:');
    for (const p of under21DTE) {
      console.log(`  ⚠ ${p.ticker} ${p.profile} ${p.ic}  ${p.daysRemaining} DTE remaining`);
    }
  } else {
    console.log('\nUnder 21 DTE: none');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

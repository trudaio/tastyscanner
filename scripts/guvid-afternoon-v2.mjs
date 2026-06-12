/**
 * Guvid Agent — Afternoon Check (3 PM ET) v2
 * Fixed collection paths, IC symbol extraction, and credential loading.
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
else console.log('No HTTPS_PROXY — using direct connections.');

// ── WebSocket proxy patch ────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const axios = require('axios');
const axiosCfg = { ...(httpsAgent ? { httpsAgent, proxy: false } : {}), maxRedirects: 5 };
const TASTY_BASE = 'https://api.tastyworks.com';

function round2(n) { return Math.round(n * 100) / 100; }

function mid(bid, ask) {
  const b = (bid == null || isNaN(bid) || bid === 'NaN') ? null : Number(bid);
  const a = (ask == null || isNaN(ask) || ask === 'NaN') ? null : Number(ask);
  if (b == null && a == null) return null;
  if (b == null || b <= 0) return (a != null && a > 0) ? a : null;
  if (a == null || a <= 0) return b > 0 ? b : null;
  return (b + a) / 2;
}

function today()     { return new Date().toISOString().split('T')[0]; }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }

function daysUntil(dateStr) {
  if (!dateStr) return 999;
  const expStr = String(dateStr).split('T')[0];
  const exp = new Date(expStr + 'T16:00:00-05:00'); // 4 PM ET expiry
  return Math.ceil((exp - Date.now()) / 86400000);
}

// Determine option root: SPX → SPXW for weeklies, SPX for 3rd-Friday monthlies
function getRoot(ticker, expiration) {
  if (!ticker || ticker.toUpperCase() !== 'SPX') return (ticker || '').toUpperCase();
  const d = new Date(String(expiration).split('T')[0]);
  const dow = d.getDay(); // 5 = Friday
  const dom = d.getDate();
  // 3rd Friday of month: Friday (5) between 15–21
  if (dow === 5 && dom >= 15 && dom <= 21) return 'SPX';
  return 'SPXW';
}

function formatExpForSymbol(expiration) {
  const s = String(expiration).split('T')[0]; // YYYY-MM-DD
  const [y, m, d] = s.split('-');
  return y.slice(2) + m + d; // YYMMDD
}

// ── Extract streamer symbols from any IC data format ─────────────────────────
function extractSymbols(ic, ticker, expiration) {
  if (!ic) return null;

  // Format 1: direct flat symbol fields (e.g. shortPutSymbol)
  if (ic.shortPutSymbol && ic.longPutSymbol && ic.shortCallSymbol && ic.longCallSymbol) {
    return {
      shortPut:  ic.shortPutSymbol,
      longPut:   ic.longPutSymbol,
      shortCall: ic.shortCallSymbol,
      longCall:  ic.longCallSymbol,
    };
  }

  // Format 2: nested objects with .symbol property
  const sp = ic.shortPut?.symbol || ic.shortPut?.sym;
  const lp = ic.longPut?.symbol  || ic.longPut?.sym;
  const sc = ic.shortCall?.symbol || ic.shortCall?.sym;
  const lc = ic.longCall?.symbol  || ic.longCall?.sym;
  if (sp && lp && sc && lc) return { shortPut: sp, longPut: lp, shortCall: sc, longCall: lc };

  // Format 3: sto/bto style
  const stoPutSym  = ic.stoPut?.symbol  || ic.stoPut?.sym;
  const btoPutSym  = ic.btoPut?.symbol  || ic.btoPut?.sym;
  const stoCallSym = ic.stoCall?.symbol || ic.stoCall?.sym;
  const btoCallSym = ic.btoCall?.symbol || ic.btoCall?.sym;
  if (stoPutSym && btoPutSym && stoCallSym && btoCallSym) {
    return { shortPut: stoPutSym, longPut: btoPutSym, shortCall: stoCallSym, longCall: btoCallSym };
  }

  // Format 4: raw strikes only — construct symbols
  const hasPutSell  = ic.putSell  != null || ic.shortPutStrike  != null;
  const hasPutBuy   = ic.putBuy   != null || ic.longPutStrike   != null;
  const hasCallSell = ic.callSell != null || ic.shortCallStrike != null;
  const hasCallBuy  = ic.callBuy  != null || ic.longCallStrike  != null;

  if (hasPutSell && hasPutBuy && hasCallSell && hasCallBuy) {
    const exp = expiration || ic.expirationDate || ic.expiration;
    const root = getRoot(ticker, exp);
    const ds   = formatExpForSymbol(exp);
    const putSell  = ic.putSell  ?? ic.shortPutStrike;
    const putBuy   = ic.putBuy   ?? ic.longPutStrike;
    const callSell = ic.callSell ?? ic.shortCallStrike;
    const callBuy  = ic.callBuy  ?? ic.longCallStrike;
    return {
      shortPut:  `.${root}${ds}P${putSell}`,
      longPut:   `.${root}${ds}P${putBuy}`,
      shortCall: `.${root}${ds}C${callSell}`,
      longCall:  `.${root}${ds}C${callBuy}`,
    };
  }

  return null;
}

// ── TastyTrade auth ───────────────────────────────────────────────────────────
// HARD RULE: NEVER use another user's credentials. Only Catalin's.
const CATALIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2'; // macovei17@gmail.com

async function fetchCredentials() {
  const snap = await db
    .collection('users').doc(CATALIN_UID)
    .collection('brokerAccounts')
    .where('isActive', '==', true)
    .get();

  const creds = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const broker = (d?.brokerType || d?.credentials?.brokerType || '').toLowerCase();
    if (broker !== 'tastytrade') continue;
    const cs = d?.credentials?.clientSecret || d?.clientSecret;
    const rt = d?.credentials?.refreshToken  || d?.refreshToken;
    const upd = doc.updateTime?.seconds || 0;
    if (cs && rt) creds.push({ cs, rt, upd, id: doc.id });
  }
  creds.sort((a, b) => b.upd - a.upd);
  if (!creds.length) throw new Error(`No active TastyTrade brokerAccount under users/${CATALIN_UID}/brokerAccounts`);
  return creds;
}

async function getAccessToken(credsList) {
  for (const { cs, rt, id } of credsList) {
    try {
      const res = await axios.post(`${TASTY_BASE}/oauth/token`, {
        refresh_token: rt, client_secret: cs, scope: 'read', grant_type: 'refresh_token',
      }, axiosCfg);
      const tok = res.data?.access_token || res.data?.['access_token'];
      if (tok) { console.log(`  Token OK from broker account ${id}`); return `Bearer ${tok}`; }
    } catch (e) {
      console.log(`  Token failed for ${id}: ${e?.response?.status || e.message}`);
    }
  }
  throw new Error(`All TastyTrade refresh tokens failed for ${CATALIN_UID}.`);
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

async function getVixFromRest(accessToken) {
  try {
    const res = await axios.get(`${TASTY_BASE}/market-metrics?symbols=SPY`, {
      ...axiosCfg, headers: { Authorization: accessToken },
    });
    const items = res.data?.data?.items ?? [];
    for (const item of items) {
      if (item.symbol === 'SPY') {
        const iv = parseFloat(item['implied-volatility-index'] || '0');
        if (iv > 0) return round2(iv * 100);
      }
    }
  } catch (_) {}
  return null;
}

// ── Stream quotes/greeks via DxLink ───────────────────────────────────────────
async function streamData(dxLinkUrl, dxAuthToken, symbols) {
  const quotesMap  = {};
  const greeksMap  = {};

  const wsClient = new DXLinkWebSocketClient();
  wsClient.connect(dxLinkUrl);
  wsClient.setAuthToken(dxAuthToken);

  const feed = new DXLinkFeed(wsClient, FeedContract.AUTO);
  feed.configure({ acceptAggregationPeriod: 10, acceptDataFormat: FeedDataFormat.COMPACT });
  feed.addEventListener((records) => {
    for (const rec of records) {
      const sym = rec.eventSymbol;
      if (!sym) continue;
      if (rec.eventType === 'Quote') {
        quotesMap[sym] = { bid: rec.bidPrice, ask: rec.askPrice };
      } else if (rec.eventType === 'Greeks') {
        greeksMap[sym] = { delta: rec.delta, theta: rec.theta, price: rec.price };
      }
    }
  });

  const BATCH = 200;
  const allSubs = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const subs = [
      ...batch.map(s => ({ type: 'Quote',  symbol: s })),
      ...batch.map(s => ({ type: 'Greeks', symbol: s })),
    ];
    feed.addSubscriptions(subs);
    allSubs.push(...subs);
  }

  console.log(`  Subscribed ${symbols.length} symbols, waiting 12s...`);
  await new Promise(r => setTimeout(r, 12000));
  console.log(`  Got ${Object.keys(quotesMap).length} quotes, ${Object.keys(greeksMap).length} greeks`);

  try {
    if (typeof feed.removeSubscriptions === 'function' && allSubs.length) feed.removeSubscriptions(allSubs);
    else if (typeof feed.clearSubscriptions === 'function') feed.clearSubscriptions();
    if (typeof feed.close === 'function') feed.close();
    await new Promise(r => setTimeout(r, 1500));
  } catch (_) {}
  try { wsClient.disconnect?.(); } catch (_) {}

  return { quotesMap, greeksMap };
}

function getPriceMid(sym, quotesMap, greeksMap) {
  const q = quotesMap[sym];
  if (q) {
    const m = mid(q.bid, q.ask);
    if (m != null) return m;
  }
  const g = greeksMap[sym];
  if (g?.price != null && !isNaN(g.price) && g.price > 0) return g.price;
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const NOW     = new Date().toISOString();
  const TODAY   = today();
  const YEST    = yesterday();

  console.log('=== Guvid Agent — Afternoon Check v2 ===');
  console.log('Timestamp:', NOW);

  // Step 3: Credentials
  console.log('\n[1] Loading TastyTrade credentials...');
  const credsList = await fetchCredentials();
  console.log(`  Found ${credsList.length} credential set(s).`);

  console.log('\n[2] Getting access token...');
  const accessToken = await getAccessToken(credsList);

  console.log('\n[3] Getting DxLink quote token...');
  const qtData      = await getApiQuoteToken(accessToken);
  const dxLinkUrl   = qtData['dxlink-url'];
  const dxAuthToken = qtData['token'];
  if (!dxAuthToken) throw new Error('No DxLink auth token');
  console.log(`  DxLink URL: ${dxLinkUrl}`);

  console.log('\n[4] Fetching accounts...');
  const accounts = await getAccounts(accessToken);
  if (!accounts.length) throw new Error('No accounts found');
  const accountNumber = accounts[0].account?.['account-number'] || accounts[0]['account-number'];
  console.log(`  Account: ${accountNumber}`);

  // Step 4: Net liq snapshot
  console.log('\n[5] Fetching balances...');
  const afternoonNetLiq = round2(await getAccountBalances(accessToken, accountNumber));
  console.log(`  Afternoon Net Liq: $${afternoonNetLiq}`);

  // Read today's morning data for comparison (guvid-agent/daily-{TODAY})
  const dailyDocId  = `daily-${TODAY}`;
  const dailyDocRef = db.collection('guvid-agent').doc(dailyDocId);
  const dailySnap   = await dailyDocRef.get();
  const dailyData   = dailySnap.exists ? dailySnap.data() : {};
  const morningNetLiq = dailyData.morningNetLiq ?? null;
  const netLiqChange  = morningNetLiq != null ? round2(afternoonNetLiq - morningNetLiq) : null;

  // Read yesterday for day-over-day
  const yestSnap = await db.collection('guvid-agent').doc(`daily-${YEST}`).get();
  const yestNetLiq = yestSnap.exists ? (yestSnap.data()?.afternoonNetLiq ?? null) : null;
  const netLiqChangeDayOverDay = yestNetLiq != null ? round2(afternoonNetLiq - yestNetLiq) : null;

  console.log(`  Morning Net Liq: ${morningNetLiq != null ? '$' + morningNetLiq : 'N/A'}`);
  console.log(`  Net Liq Change (vs morning): ${netLiqChange != null ? '$' + netLiqChange : 'N/A'}`);
  console.log(`  Yesterday afternoon: ${yestNetLiq != null ? '$' + yestNetLiq : 'N/A'}`);
  console.log(`  Day-over-day: ${netLiqChangeDayOverDay != null ? '$' + netLiqChangeDayOverDay : 'N/A'}`);

  // Step 5: Load open positions
  console.log('\n[6] Loading open positions from guvid-agent-positions...');
  const posSnap = await db.collection('guvid-agent-positions')
    .where('status', '==', 'open').get();
  const openPositions = posSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  console.log(`  Found ${openPositions.length} open position(s).`);

  // Collect all symbols: VIX + all IC legs
  const symbolsNeeded = new Set(['$VIX.X']);
  const posSymbolMap = {};

  for (const pos of openPositions) {
    const ic = pos.ic;
    const ticker = pos.ticker;
    const expiration = pos.expiration || pos.expirationDate || (ic && (ic.expiration || ic.expirationDate));
    const syms = extractSymbols(ic, ticker, expiration);
    if (syms) {
      posSymbolMap[pos.id] = syms;
      for (const s of Object.values(syms)) if (s) symbolsNeeded.add(s);
    } else {
      console.log(`  [${pos.id.slice(0,8)}] ${ticker} — cannot extract symbols, skipping.`);
    }
  }

  console.log(`  Total symbols to stream: ${symbolsNeeded.size}`);

  // Stream all symbols in one pass
  console.log('\n[7] Streaming quotes/greeks via DxLink...');
  const { quotesMap, greeksMap } = await streamData(dxLinkUrl, dxAuthToken, [...symbolsNeeded]);

  // VIX
  let afternoonVix = null;
  const vixQ = quotesMap['$VIX.X'];
  if (vixQ) {
    const v = mid(vixQ.bid, vixQ.ask);
    if (v && v > 0) afternoonVix = round2(v);
    else if (vixQ.ask > 0) afternoonVix = round2(vixQ.ask);
    else if (vixQ.bid > 0) afternoonVix = round2(vixQ.bid);
  }
  if (!afternoonVix) {
    afternoonVix = await getVixFromRest(accessToken);
    if (afternoonVix) console.log(`  VIX (REST fallback): ${afternoonVix}`);
  }
  console.log(`  VIX: ${afternoonVix ?? 'N/A'}`);

  // Save afternoon net liq to guvid-agent/daily-{TODAY}
  await dailyDocRef.set({
    afternoonNetLiq,
    afternoonTimestamp: NOW,
    ...(afternoonVix    != null ? { afternoonVix }            : {}),
    ...(netLiqChange    != null ? { netLiqChange }            : {}),
    ...(netLiqChangeDayOverDay != null ? { netLiqChangeDayOverDay } : {}),
  }, { merge: true });
  console.log(`  Saved to guvid-agent/${dailyDocId}`);

  // Step 5/6: Check each position
  console.log('\n[8] Checking positions...');
  const profitTargetsReached = [];
  const under21DTE           = [];
  const positionChecks       = [];
  const fbBatch              = db.batch();

  for (const pos of openPositions) {
    const { id, ref, ticker, profile, credit: rawCredit, openDate, ic } = pos;
    const expiration = pos.expiration || pos.expirationDate
      || (ic && (ic.expiration || ic.expirationDate)) || null;
    const credit = parseFloat(rawCredit ?? ic?.credit ?? 0);
    const daysRemaining = daysUntil(expiration);

    // Mark expired
    if (daysRemaining < 0) {
      console.log(`  [${ticker}] EXPIRED (${expiration}), marking.`);
      const finalPL = round2(credit * 100); // expired worthless = full credit kept
      fbBatch.update(ref, { status: 'expired', expiredDate: TODAY, finalPL });
      continue;
    }

    const syms = posSymbolMap[id];
    if (!syms) continue;

    // Compute IC current value (cost to close = short mids - long mids)
    const spMid = getPriceMid(syms.shortPut,  quotesMap, greeksMap);
    const lpMid = getPriceMid(syms.longPut,   quotesMap, greeksMap);
    const scMid = getPriceMid(syms.shortCall, quotesMap, greeksMap);
    const lcMid = getPriceMid(syms.longCall,  quotesMap, greeksMap);

    let currentValue = null;
    if (spMid != null && lpMid != null && scMid != null && lcMid != null) {
      currentValue = round2(Math.max(0, (spMid + scMid) - (lpMid + lcMid)));
    } else {
      const missing = [
        spMid == null ? syms.shortPut  : null,
        lpMid == null ? syms.longPut   : null,
        scMid == null ? syms.shortCall : null,
        lcMid == null ? syms.longCall  : null,
      ].filter(Boolean);
      console.log(`  [${ticker}] Missing: ${missing.join(', ')}`);
    }

    const pl      = currentValue != null ? round2((credit - currentValue) * 100) : null;
    const daysOpen = openDate ? Math.ceil((Date.now() - new Date(openDate)) / 86400000) : null;
    const plPerDay = (pl != null && daysOpen && daysOpen > 0) ? round2(pl / daysOpen) : null;

    // Profit target checks
    const vixEvent = afternoonVix != null && afternoonVix > 30;
    let conservativeHit = false, neutralHit = false, aggressiveHit = false;
    if (currentValue != null) {
      conservativeHit = currentValue <= credit * 0.50;
      neutralHit      = vixEvent ? currentValue <= credit * 0.50 : currentValue <= credit * 0.25;
      aggressiveHit   = currentValue <= credit * 0.10;
    }
    const profitTargetReached = conservativeHit || neutralHit || aggressiveHit;
    const isUnder21DTE        = daysRemaining <= 21;

    const targets = [
      conservativeHit ? '50%(cons)' : null,
      neutralHit      ? '75%(neut)' : null,
      aggressiveHit   ? '90%(agg)'  : null,
    ].filter(Boolean).join(' ');

    const expStr = expiration ? String(expiration).split('T')[0] : '?';
    console.log(`  [${ticker}] ${profile||'?'} exp=${expStr} DTE=${daysRemaining} credit=$${credit} value=${currentValue != null ? '$' + currentValue : '?'} P&L=${pl != null ? '$' + pl : '?'}${profitTargetReached ? ` *** TARGET [${targets}]` : ''}${isUnder21DTE ? ` ⚠ <21DTE` : ''}`);

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

    const icLabel = `${ticker} ${profile || ''} ${expStr}`.trim();
    positionChecks.push({ ticker, profile: profile || '', ic: icLabel, credit, currentValue, pl, plPerDay, daysOpen, daysRemaining, profitTargetReached, under21DTE: isUnder21DTE });

    if (profitTargetReached) {
      profitTargetsReached.push({ ticker, profile: profile || '', ic: icLabel, credit, currentValue, pl, conservativeHit, neutralHit, aggressiveHit });
    }
    if (isUnder21DTE) {
      under21DTE.push({ ticker, profile: profile || '', ic: icLabel, daysRemaining });
    }

    fbBatch.update(ref, { dailyChecks: admin.firestore.FieldValue.arrayUnion(check) });
  }

  await fbBatch.commit();
  console.log(`  Position updates committed.`);

  // Step 6: Save afternoon summary
  console.log('\n[9] Saving afternoon summary...');
  const afternoonSummary = {
    timestamp: NOW,
    netLiq: afternoonNetLiq,
    netLiqChange: netLiqChange ?? null,
    netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
    vix: afternoonVix ?? null,
    positionsChecked: openPositions.length,
    profitTargetsReached,
    under21DTE,
    checks: positionChecks,
  };

  // Save to guvid-agent/scan-{TODAY} (merge with existing morning scan)
  await db.collection('guvid-agent').doc(`scan-${TODAY}`).set(
    { afternoon: afternoonSummary }, { merge: true }
  );
  // Also mirror to guvid-agent-scans/{TODAY} for compatibility
  await db.collection('guvid-agent-scans').doc(TODAY).set(
    { afternoon: afternoonSummary }, { merge: true }
  );
  console.log(`  Saved to guvid-agent/scan-${TODAY} and guvid-agent-scans/${TODAY}`);

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('AFTERNOON SUMMARY');
  console.log('═'.repeat(60));
  const chg  = netLiqChange    != null ? ` (vs morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange})`    : '';
  const dod  = netLiqChangeDayOverDay != null ? `, vs yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay}` : '';
  console.log(`Net Liq:    $${afternoonNetLiq}${chg}${dod}`);
  console.log(`VIX:        ${afternoonVix ?? 'N/A'}${afternoonVix > 30 ? ' ⚠ ELEVATED (VIX event)' : ''}`);
  console.log(`Positions:  ${openPositions.length} checked`);

  if (profitTargetsReached.length) {
    console.log(`\nProfit Targets Reached (${profitTargetsReached.length}):`);
    for (const p of profitTargetsReached) {
      const t = [p.conservativeHit ? '50%' : null, p.neutralHit ? '75%' : null, p.aggressiveHit ? '90%' : null].filter(Boolean).join('/');
      console.log(`  ✓ ${p.ticker} ${p.profile} ${p.ic}  credit=$${p.credit} value=$${p.currentValue} P&L=$${p.pl}  [${t}]`);
    }
  } else {
    console.log('\nProfit Targets: none');
  }

  if (under21DTE.length) {
    console.log(`\nUnder 21 DTE — Need Management (${under21DTE.length}):`);
    for (const p of under21DTE) {
      console.log(`  ⚠ ${p.ticker} ${p.profile} ${p.ic}  ${p.daysRemaining} DTE`);
    }
  } else {
    console.log('\nUnder 21 DTE: none');
  }

  console.log('═'.repeat(60));
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err?.message || err); process.exit(1); });

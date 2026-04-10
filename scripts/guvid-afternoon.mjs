/**
 * Guvid Agent — Afternoon Price Checker
 * Reads open positions from Firestore, fetches current option prices via TastyTrade DxLink,
 * calculates daily P&L, and writes results back to Firestore.
 */

import { createRequire } from 'module';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);

// ── Proxy setup ────────────────────────────────────────────────────────────
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
if (!proxyUrl) throw new Error('No HTTPS_PROXY env var — needed for TastyTrade');
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// Monkey-patch global WebSocket → ws + proxy (DxLink uses `new WebSocket(url)` internally)
const WsLib = require('ws');
class ProxiedWebSocket {
  constructor(url, protocols) {
    const opts = { agent: httpsAgent };
    this._ws = protocols ? new WsLib(url, protocols, opts) : new WsLib(url, opts);
    this.readyState = 0;
    this._listeners = {};
    this._ws.on('open',    ()           => { this.readyState = 1; this._dispatch('open',    {}); });
    this._ws.on('close',   (code, rsn)  => { this.readyState = 3; this._dispatch('close',   { code, reason: rsn?.toString() }); });
    this._ws.on('error',   (err)        => {                       this._dispatch('error',   { message: err.message }); });
    this._ws.on('message', (data)       => {                       this._dispatch('message', { data: data.toString() }); });
  }
  _dispatch(type, detail) { (this._listeners[type] || []).forEach(fn => fn(detail)); }
  addEventListener(type, fn)    { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter(l => l !== fn); }
  send(data) { if (this._ws.readyState === WsLib.OPEN) this._ws.send(data); }
  close()    { this._ws.close(); }
}
ProxiedWebSocket.CONNECTING = 0; ProxiedWebSocket.OPEN = 1;
ProxiedWebSocket.CLOSING    = 2; ProxiedWebSocket.CLOSED = 3;
global.WebSocket = ProxiedWebSocket;

// ── DxLink ─────────────────────────────────────────────────────────────────
const { DXLinkWebSocketClient } = require('@dxfeed/dxlink-websocket-client');
const { DXLinkFeed, FeedContract, FeedDataFormat } = require('@dxfeed/dxlink-feed');

// ── Firebase Init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const TODAY = new Date().toISOString().slice(0, 10);
const TASTY_BASE = 'https://api.tastyworks.com';

// ── Helpers ────────────────────────────────────────────────────────────────
const axios = require('axios');
const axiosCfg = { httpsAgent, proxy: false, maxRedirects: 5 };

function formatDate(d) {
  if (!d) return '';
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function daysBetween(a, b) {
  const da = new Date(a), db2 = new Date(b);
  return Math.max(1, Math.round(Math.abs(db2 - da) / 86400000));
}

// ── TastyTrade Auth ────────────────────────────────────────────────────────
async function getAccessToken(clientSecret, refreshToken) {
  const res = await axios.post(`${TASTY_BASE}/oauth/token`, {
    refresh_token: refreshToken,
    client_secret: clientSecret,
    scope: 'read',
    grant_type: 'refresh_token',
  }, axiosCfg);
  const raw = res.data['access_token'] || res.data['access-token'];
  if (!raw) throw new Error('No access_token in response');
  return `Bearer ${raw}`;
}

async function getApiQuoteToken(accessToken) {
  const res = await axios.get(`${TASTY_BASE}/api-quote-tokens`, {
    ...axiosCfg,
    headers: { Authorization: accessToken },
  });
  return res.data?.data ?? res.data;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Guvid Agent — Afternoon Check [${TODAY}] ===\n`);

  // ── Step 3: Credentials from Firestore ────────────────────────────────
  console.log('Reading TastyTrade credentials from Firestore...');
  let accessToken = null;

  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();

    for (const brokerDoc of brokerSnap.docs) {
      const d = brokerDoc.data();
      const cs = d.credentials?.clientSecret;
      const rt = d.credentials?.refreshToken;
      if (!cs || !rt) continue;

      console.log(`  Trying user ${userDoc.id}...`);
      try {
        accessToken = await getAccessToken(cs, rt);
        console.log(`  ✓ Auth succeeded for ${userDoc.id}`);
        break;
      } catch (e) {
        console.warn(`    failed: ${e.message.slice(0, 80)}`);
      }
    }
    if (accessToken) break;
  }

  if (!accessToken) throw new Error('No valid TastyTrade credentials found');

  // ── DxLink token ───────────────────────────────────────────────────────
  console.log('Getting DxLink quote token...');
  const qtData      = await getApiQuoteToken(accessToken);
  const dxLinkUrl   = qtData['dxlink-url'];
  const dxAuthToken = qtData['token'];
  if (!dxAuthToken) throw new Error('No DxLink auth token');
  console.log(`  DxLink URL: ${dxLinkUrl}`);

  // ── Step 4: Load open positions ────────────────────────────────────────
  console.log('\nLoading open positions from Firestore...');
  const snap = await db
    .collection('guvid-agent').doc('positions')
    .collection('items')
    .where('status', '==', 'open')
    .get();

  const positions = [];
  snap.forEach(doc => positions.push({ id: doc.id, ref: doc.ref, ...doc.data() }));

  if (positions.length === 0) {
    console.log('No open positions found.');
    process.exit(0);
  }

  console.log(`  Found ${positions.length} open position(s).`);
  positions.forEach(p => {
    const ic = p.ic;
    const icStr = `${ic?.shortPut?.strike}/${ic?.longPut?.strike}p ${ic?.shortCall?.strike}/${ic?.longCall?.strike}c`;
    console.log(`    • ${p.ticker} ${icStr}  exp:${formatDate(p.expiration)}  credit:$${p.credit}`);
  });

  // ── Step 5: Collect all symbols, connect once, stream all at once ──────
  console.log('\nCollecting streamer symbols...');
  const allSyms = new Set();
  for (const pos of positions) {
    const ic = pos.ic;
    if (!ic) continue;
    if (ic.shortPut?.sym)  allSyms.add(ic.shortPut.sym);
    if (ic.longPut?.sym)   allSyms.add(ic.longPut.sym);
    if (ic.shortCall?.sym) allSyms.add(ic.shortCall.sym);
    if (ic.longCall?.sym)  allSyms.add(ic.longCall.sym);
  }
  const symArray = [...allSyms];
  console.log(`  ${symArray.length} unique symbols across ${positions.length} positions`);

  // Connect DxLink
  console.log('\nConnecting to DxLink...');
  const quotesMap = {};

  const wsClient = new DXLinkWebSocketClient();
  wsClient.connect(dxLinkUrl);
  wsClient.setAuthToken(dxAuthToken);

  const feed = new DXLinkFeed(wsClient, FeedContract.AUTO);
  feed.configure({ acceptAggregationPeriod: 10, acceptDataFormat: FeedDataFormat.COMPACT });
  feed.addEventListener((records) => {
    for (const rec of records) {
      if (rec.eventType === 'Quote') {
        quotesMap[rec.eventSymbol] = {
          bid: rec.bidPrice,
          ask: rec.askPrice,
          mid: (rec.bidPrice + rec.askPrice) / 2,
        };
      }
    }
  });

  const BATCH = 200;
  for (let i = 0; i < symArray.length; i += BATCH) {
    feed.addSubscriptions(
      symArray.slice(i, i + BATCH).map(s => ({ type: 'Quote', symbol: s }))
    );
  }

  console.log('  Waiting 14s for streaming data...');
  await new Promise(r => setTimeout(r, 14000));

  const qCount = Object.keys(quotesMap).length;
  console.log(`  Received: ${qCount}/${symArray.length} quotes`);

  try { wsClient.disconnect?.(); } catch {}

  // ── Step 6: Compute P&L per position ──────────────────────────────────
  console.log('\nComputing P&L...');
  const checks = [];

  for (const pos of positions) {
    const ic = pos.ic;
    const icStr = `${ic?.shortPut?.strike}/${ic?.longPut?.strike}p ${ic?.shortCall?.strike}/${ic?.longCall?.strike}c`;

    try {
      if (!ic?.shortPut || !ic?.longPut || !ic?.shortCall || !ic?.longCall) {
        throw new Error('ic object missing leg data');
      }

      const spQ = quotesMap[ic.shortPut.sym]  || { mid: 0 };
      const lpQ = quotesMap[ic.longPut.sym]   || { mid: 0 };
      const scQ = quotesMap[ic.shortCall.sym] || { mid: 0 };
      const lcQ = quotesMap[ic.longCall.sym]  || { mid: 0 };

      const currentValue = parseFloat((spQ.mid + scQ.mid - lpQ.mid - lcQ.mid).toFixed(2));
      const creditDollars = parseFloat(pos.credit) || 0;
      const pl       = parseFloat(((creditDollars - currentValue) * 100).toFixed(2));
      const daysOpen = daysBetween(formatDate(pos.openDate), TODAY);
      const plPerDay = parseFloat((pl / daysOpen).toFixed(2));

      const expDate  = formatDate(pos.expiration);
      const isExpired = expDate && expDate < TODAY;

      console.log(
        `  ${pos.ticker} ${icStr}: ` +
        `LP=${lpQ.mid.toFixed(2)} SP=${spQ.mid.toFixed(2)} SC=${scQ.mid.toFixed(2)} LC=${lcQ.mid.toFixed(2)} ` +
        `→ cur=$${currentValue.toFixed(2)} P&L=${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`
      );

      const check = { date: TODAY, currentValue, pl, plPerDay, daysOpen };
      const update = { dailyChecks: FieldValue.arrayUnion(check) };
      if (isExpired) {
        update.status = 'expired';
        update.finalPL = pl;
        console.log(`    ⚠ EXPIRED — marking status=expired, finalPL=$${pl.toFixed(2)}`);
      }
      await pos.ref.update(update);

      checks.push({ ticker: pos.ticker, profile: pos.profile || '', ic: icStr,
        credit: creditDollars, currentValue, pl, plPerDay, daysOpen, expired: isExpired });

    } catch (e) {
      console.error(`  ERROR ${pos.ticker} ${icStr}: ${e.message}`);
      checks.push({ ticker: pos.ticker, profile: pos.profile || '', ic: icStr,
        credit: pos.credit, currentValue: null, pl: null, plPerDay: null, daysOpen: null, error: e.message });
    }
  }

  // ── Save afternoon summary ─────────────────────────────────────────────
  // Parallel path to morning: guvid-agent/scans/{today}/afternoon
  console.log('\nSaving summary to Firestore...');
  await db.collection('guvid-agent').doc('scans')
    .collection(TODAY).doc('afternoon')
    .set({ timestamp: new Date().toISOString(), checks }, { merge: true });
  console.log(`  Saved → guvid-agent/scans/${TODAY}/afternoon`);

  // ── Print ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('AFTERNOON SUMMARY  ' + TODAY);
  console.log('═'.repeat(72));
  for (const c of checks) {
    if (c.error) {
      console.log(`ERROR  ${c.ticker} ${c.ic} — ${c.error.slice(0, 60)}`);
    } else {
      const sign = c.pl >= 0 ? '+' : '';
      console.log(
        `${c.ticker.padEnd(5)} ${String(c.ic).padEnd(26)}` +
        ` cr=$${c.credit.toFixed(2)}` +
        ` cur=$${c.currentValue.toFixed(2)}` +
        ` P&L=${sign}$${c.pl.toFixed(2)}` +
        ` (${sign}$${c.plPerDay.toFixed(2)}/d, ${c.daysOpen}d)` +
        (c.expired ? ' [EXPIRED]' : '')
      );
    }
  }
  const total = checks.filter(c => c.pl != null).reduce((s, c) => s + c.pl, 0);
  console.log('─'.repeat(72));
  console.log(`TOTAL P&L: ${total >= 0 ? '+' : ''}$${total.toFixed(2)}`);
  console.log('═'.repeat(72) + '\n');

  process.exit(0);
}

main().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});

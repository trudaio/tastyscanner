import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import axios from 'axios';
import WebSocket from 'ws';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TASTY_BASE = 'https://api.tastyworks.com';

// ── TastyTrade ─────────────────────────────────────────────────────────────────
async function getTastyCredentials() {
  const usersSnap = await db.collection('users').limit(10).get();
  for (const userDoc of usersSnap.docs) {
    const bSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').where('isActive', '==', true).limit(1).get();
    if (bSnap.empty) continue;
    const d = bSnap.docs[0].data();
    if (d.credentials?.clientSecret && d.credentials?.refreshToken) {
      console.log(`Credentials: user=${userDoc.id} (${d.label})`);
      return { clientSecret: d.credentials.clientSecret, refreshToken: d.credentials.refreshToken };
    }
  }
  throw new Error('No active TastyTrade credentials found');
}

async function getOAuthToken({ clientSecret, refreshToken }) {
  const resp = await axios.post(`${TASTY_BASE}/oauth/token`, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_secret: clientSecret,
    scope: 'read trade',
  }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } });
  const token = resp.data.access_token;
  if (!token) throw new Error('No access_token in OAuth response');
  return token;
}

function hdrs(token) {
  return { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
}

async function getNetLiq(token) {
  const accts = (await axios.get(`${TASTY_BASE}/customers/me/accounts`, { headers: hdrs(token) })).data.data.items;
  if (!accts?.length) return { accountNumber: null, netLiq: 0 };
  const accountNumber = accts[0].account['account-number'];
  const bal = (await axios.get(`${TASTY_BASE}/accounts/${accountNumber}/balances`, { headers: hdrs(token) })).data.data;
  return { accountNumber, netLiq: parseFloat(bal['net-liquidating-value'] ?? 0) };
}

async function getDxLinkToken(token) {
  const d = (await axios.get(`${TASTY_BASE}/api-quote-tokens`, { headers: hdrs(token) })).data.data;
  return { dxToken: d.token, wsUrl: d['dxlink-url'] || 'wss://tasty-openapi-ws.dxfeed.com/realtime' };
}

// ── WebSocket streaming ────────────────────────────────────────────────────────
// DXLink protocol: client sends SETUP first on open, then AUTH immediately.
async function streamQuotes(dxToken, wsUrl, symbols, waitMs = 12000) {
  return new Promise((resolve) => {
    const data = {};
    symbols.forEach(s => { data[s] = {}; });
    const ws = new WebSocket(wsUrl);
    let channelReady = false;
    const ch = 1;
    const finish = () => { try { ws.close(); } catch (_) {} resolve(data); };
    const timer = setTimeout(finish, waitMs + 8000);

    ws.on('error', () => { clearTimeout(timer); resolve(data); });
    ws.on('close', () => { clearTimeout(timer); resolve(data); });

    ws.on('open', () => {
      // Client initiates the DXLink handshake
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1-DXF-JS/0.3.0', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
      ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxToken }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
        ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: ch, service: 'FEED', parameters: { contract: 'AUTO' } }));
      } else if (msg.type === 'CHANNEL_OPENED' && msg.channel === ch && !channelReady) {
        channelReady = true;
        ws.send(JSON.stringify({
          type: 'FEED_SETUP', channel: ch,
          acceptAggregationPeriod: 0, acceptDataFormat: 'FULL',
          acceptEventFields: {
            Quote: ['eventSymbol', 'bidPrice', 'askPrice'],
            Greeks: ['eventSymbol', 'delta', 'theta', 'gamma', 'vega'],
          },
        }));
        const subs = symbols.flatMap(s => [{ type: 'Quote', symbol: s }, { type: 'Greeks', symbol: s }]);
        ws.send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: ch, add: subs }));
        setTimeout(finish, waitMs);
      } else if (msg.type === 'FEED_DATA' && msg.channel === ch) {
        const events = msg.data;
        if (!Array.isArray(events)) return;
        // FULL format: flat array of event objects [{eventSymbol, bidPrice, askPrice, ...}, ...]
        for (const ev of events) {
          if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue;
          const sym = ev.eventSymbol;
          if (!sym || !data[sym]) continue;
          if (ev.bidPrice != null && ev.askPrice != null) {
            data[sym].bid = parseFloat(ev.bidPrice);
            data[sym].ask = parseFloat(ev.askPrice);
            data[sym].mid = (parseFloat(ev.bidPrice) + parseFloat(ev.askPrice)) / 2;
          }
          if (ev.delta != null) data[sym].delta = ev.delta;
          if (ev.theta != null) data[sym].theta = ev.theta;
          if (ev.gamma != null) data[sym].gamma = ev.gamma;
          if (ev.vega  != null) data[sym].vega  = ev.vega;
        }
      } else if (msg.type === 'KEEPALIVE') {
        ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: 0 }));
      }
    });
  });
}

function daysRemaining(expirationStr) {
  if (!expirationStr) return null;
  const exp = new Date(expirationStr + 'T21:00:00Z');
  return Math.ceil((exp - Date.now()) / 86400000);
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — Afternoon Check (${new Date().toISOString()}) ===\n`);

  const creds = await getTastyCredentials();
  const token = await getOAuthToken(creds);
  console.log('OAuth token acquired.');

  const { accountNumber, netLiq } = await getNetLiq(token);
  console.log(`Account: ${accountNumber}  Net Liq: $${netLiq.toFixed(2)}`);

  const { dxToken, wsUrl } = await getDxLinkToken(token);

  // VIX
  console.log('Fetching VIX (12s)...');
  const vixData = await streamQuotes(dxToken, wsUrl, ['$VIX.X', 'VIX'], 12000);
  const vix = vixData['$VIX.X']?.mid ?? vixData['VIX']?.mid ?? null;
  console.log(`VIX: ${vix != null ? vix.toFixed(2) : 'N/A'}`);

  // Morning comparison
  const dailyRef = db.doc(`guvid-agent/daily-${TODAY}`);
  const dailySnap = await dailyRef.get();
  const morningNetLiq = dailySnap.exists ? (dailySnap.data().morningNetLiq ?? null) : null;
  const netLiqChange = morningNetLiq != null ? netLiq - morningNetLiq : null;

  // Day-over-day
  const ydaySnap = await db.doc(`guvid-agent/daily-${YESTERDAY}`).get();
  const ydayNetLiq = ydaySnap.exists
    ? (ydaySnap.data().afternoonNetLiq ?? ydaySnap.data().morningNetLiq ?? null)
    : null;
  const netLiqChangeDayOverDay = ydayNetLiq != null ? netLiq - ydayNetLiq : null;

  const ts = new Date().toISOString();
  await dailyRef.set({
    afternoonNetLiq: netLiq,
    afternoonVix: vix,
    afternoonTimestamp: ts,
    ...(netLiqChange != null && { netLiqChange }),
    ...(netLiqChangeDayOverDay != null && { netLiqChangeDayOverDay }),
  }, { merge: true });
  console.log('Daily doc updated.');

  // Open positions
  const posSnap = await db.collection('guvid-agent').where('status', '==', 'open').get();
  const openPositions = posSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  console.log(`\nOpen positions found: ${openPositions.length}`);

  const profitTargetsReached = [];
  const under21DTEList = [];
  const checks = [];

  if (openPositions.length > 0) {
    // Collect all dxFeed symbols from ic object
    const allSymbols = [];
    for (const pos of openPositions) {
      const ic = pos.ic;
      if (!ic) continue;
      for (const sym of [ic.stoPut?.symbol, ic.btoPut?.symbol, ic.stoCall?.symbol, ic.btoCall?.symbol]) {
        if (sym && !allSymbols.includes(sym)) allSymbols.push(sym);
      }
    }
    // Also add VIX
    if (!allSymbols.includes('$VIX.X')) allSymbols.push('$VIX.X');

    console.log(`Streaming ${allSymbols.length - 1} option symbols (12s wait)...`);
    const { dxToken: dxToken2, wsUrl: wsUrl2 } = await getDxLinkToken(token);
    const streamed = await streamQuotes(dxToken2, wsUrl2, allSymbols, 12000);

    for (const pos of openPositions) {
      const ic = pos.ic;
      if (!ic) continue;

      const ticker = pos.ticker;
      const expiration = pos.expiration || ic.expiration;
      const credit = parseFloat(pos.credit ?? ic.credit ?? 0);
      const dte = daysRemaining(expiration);
      const openDate = pos.openDate ? new Date(pos.openDate) : null;
      const daysOpen = openDate ? Math.floor((Date.now() - openDate.getTime()) / 86400000) : null;

      const spMid = streamed[ic.stoPut?.symbol]?.mid;
      const lpMid = streamed[ic.btoPut?.symbol]?.mid;
      const scMid = streamed[ic.stoCall?.symbol]?.mid;
      const lcMid = streamed[ic.btoCall?.symbol]?.mid;
      const quotesAvailable = [spMid, lpMid, scMid, lcMid].every(v => v != null && !isNaN(v));

      let currentValue = null;
      if (quotesAvailable) {
        // Net debit to close: pay back shorts, sell longs
        currentValue = spMid + scMid - lpMid - lcMid;
      } else {
        console.warn(`  ${ticker} (${pos.id}): missing quotes sp=${spMid} lp=${lpMid} sc=${scMid} lc=${lcMid}`);
      }

      const pl = currentValue != null ? (credit - currentValue) * 100 : null;
      const plPerDay = pl != null && daysOpen && daysOpen > 0 ? pl / daysOpen : null;

      const isExpired = dte != null && dte < 0;
      let profitTargetReached = false;
      let targetLabel = null;

      if (pl != null && credit > 0 && !isExpired) {
        const pct = pl / (credit * 100);
        if (pct >= 0.90) { profitTargetReached = true; targetLabel = 'aggressive (90%)'; }
        else if (pct >= 0.75) { profitTargetReached = true; targetLabel = 'neutral (75%)'; }
        else if (pct >= 0.50) { profitTargetReached = true; targetLabel = 'conservative (50%)'; }
      }

      const isUnder21DTE = dte != null && dte <= 21 && !isExpired;

      if (profitTargetReached) profitTargetsReached.push({ id: pos.id, ticker, targetLabel, pl: pl.toFixed(2) });
      if (isUnder21DTE) under21DTEList.push({ id: pos.id, ticker, dte });

      const dailyCheck = {
        date: TODAY,
        session: 'afternoon',
        ticker,
        profile: pos.profile ?? null,
        credit,
        currentValue,
        pl,
        plPerDay,
        daysOpen,
        daysRemaining: dte,
        profitTargetReached,
        targetLabel,
        under21DTE: isUnder21DTE,
        quotesAvailable,
      };

      const updatePayload = { lastChecked: ts, lastCheckSession: 'afternoon' };
      if (isExpired) {
        updatePayload.status = 'expired';
        updatePayload.finalPL = pl;
        updatePayload.expiredAt = ts;
      }
      await pos.ref.update({
        ...updatePayload,
        dailyChecks: admin.firestore.FieldValue.arrayUnion(dailyCheck),
      }).catch(() => pos.ref.set({ ...updatePayload, dailyChecks: [dailyCheck] }, { merge: true }));

      checks.push({ id: pos.id, ticker, profile: pos.profile ?? null, expiration, credit, currentValue, pl, plPerDay, daysOpen, daysRemaining: dte, profitTargetReached, targetLabel, under21DTE: isUnder21DTE, expired: isExpired, quotesAvailable });

      const plStr = pl != null ? `$${pl.toFixed(2)}` : 'N/A';
      const dteStr = dte != null ? `${dte} DTE` : 'N/A';
      const flags = [profitTargetReached && `TARGET (${targetLabel})`, isUnder21DTE && 'UNDER 21 DTE', isExpired && 'EXPIRED'].filter(Boolean).join(' | ');
      console.log(`  ${ticker} (${pos.id.slice(0, 8)}) | credit=$${(credit * 100).toFixed(0)} | P&L=${plStr} | ${dteStr}${flags ? ' | ' + flags : ''}`);
    }
  }

  // Scan summary
  await db.doc(`guvid-agent/scans-${TODAY}`).set({
    afternoon: {
      timestamp: ts,
      netLiq,
      netLiqChange: netLiqChange ?? null,
      netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
      vix,
      positionsChecked: openPositions.length,
      profitTargetsReached,
      under21DTE: under21DTEList,
      checks,
    },
  }, { merge: true });
  console.log('\nScan summary saved to Firestore.');

  // Final print
  const fmt = v => v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
  console.log('\n════════════════════════════════════════');
  console.log('AFTERNOON CHECK SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Net Liq:    $${netLiq.toFixed(2)}`);
  console.log(`  vs morning:   ${netLiqChange != null ? fmt(netLiqChange) : 'N/A (no morning snapshot)'}`);
  console.log(`  vs yesterday: ${netLiqChangeDayOverDay != null ? fmt(netLiqChangeDayOverDay) : 'N/A'}`);
  console.log(`VIX:        ${vix != null ? vix.toFixed(2) : 'N/A'}`);
  console.log(`Positions checked: ${openPositions.length}`);

  if (profitTargetsReached.length > 0) {
    console.log('\nPROFIT TARGETS REACHED:');
    profitTargetsReached.forEach(p => console.log(`  - ${p.ticker} (${p.id}): ${p.targetLabel}, P&L=$${p.pl}`));
  } else {
    console.log('\nProfit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log('\nUNDER 21 DTE (need management):');
    under21DTEList.forEach(p => console.log(`  - ${p.ticker} (${p.id}): ${p.dte} days remaining`));
  } else {
    console.log('Under 21 DTE: none');
  }

  console.log('\nDone.');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('FATAL:', err.response?.data ?? err.message ?? err);
  process.exit(1);
});

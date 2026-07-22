import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import WebSocket from 'ws';

// ── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = (() => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

const BASE = 'https://api.tastyworks.com';

function fmt(n)      { return n != null ? `$${Number(n).toFixed(2)}` : 'n/a'; }
function fmtD(n)     { if (n == null) return 'n/a'; const s = Math.abs(n).toFixed(2); return n >= 0 ? `+$${s}` : `-$${s}`; }

// ── Firestore: read credentials ───────────────────────────────────────────────
async function readCredentials() {
  const usersSnap = await db.collection('users').limit(10).get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').limit(5).get();
    for (const broker of brokerSnap.docs) {
      const d = broker.data();
      const cs = d.credentials?.clientSecret;
      const rt = d.credentials?.refreshToken;
      if (cs && rt) {
        console.log(`[auth] Found creds for user ${userDoc.id} / broker ${broker.id}`);
        return {
          clientSecret: cs,
          refreshToken: rt,
          accountNumber: d.accountNumber ?? null,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ── TastyTrade auth (OAuth refresh_token) ─────────────────────────────────────
async function getAccessToken(creds) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      scope: 'read trade',
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OAuth /token ${res.status}: ${body}`);
  const j = JSON.parse(body);
  const token = j.access_token ?? j.data?.access_token;
  if (!token) throw new Error(`No access_token in response: ${body}`);
  return token;
}

// ── TastyTrade REST ───────────────────────────────────────────────────────────
async function ttGet(path, accessToken) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`TT GET ${path} → ${res.status}: ${body}`);
  return JSON.parse(body);
}

// ── DxLink WebSocket streamer ─────────────────────────────────────────────────
async function getDxLinkToken(accessToken) {
  const j = await ttGet('/api-quote-tokens', accessToken);
  return {
    token: j.data?.token ?? j.data?.['token'],
    streamerUrl: j.data?.['dxlink-url'] ?? j.data?.dxlinkUrl,
  };
}

function streamQuotes(symbols, dxToken, streamerUrl, waitMs = 12000) {
  return new Promise((resolve) => {
    const quotes = {};
    const ws = new WebSocket(streamerUrl);
    let channelOpened = false;
    let subscribed = false;

    const close = () => { try { ws.close(); } catch (_) {} resolve(quotes); };
    const timer = setTimeout(close, waitMs + 6000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'SETUP', channel: 0, version: '0.1-js/1.0.0',
        keepaliveTimeout: 60, acceptKeepaliveTimeout: 60,
      }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'SETUP') {
        ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxToken }));
        return;
      }
      if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED' && !channelOpened) {
        channelOpened = true;
        ws.send(JSON.stringify({
          type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED',
          parameters: { contract: 'AUTO' },
        }));
        return;
      }
      if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1 && !subscribed) {
        subscribed = true;
        ws.send(JSON.stringify({
          type: 'FEED_SETUP', channel: 1,
          acceptAggregationPeriod: 0,
          acceptDataFormat: 'COMPACT',
          acceptEventFields: {
            Quote:  ['eventType', 'eventSymbol', 'bidPrice', 'askPrice'],
            Greeks: ['eventType', 'eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'volatility', 'price'],
          },
        }));
        ws.send(JSON.stringify({
          type: 'FEED_SUBSCRIPTION', channel: 1, reset: true,
          add: [
            ...symbols.map(s => ({ type: 'Quote',  symbol: s })),
            ...symbols.map(s => ({ type: 'Greeks', symbol: s })),
          ],
        }));
        setTimeout(() => { clearTimeout(timer); close(); }, waitMs);
        return;
      }
      if (msg.type === 'FEED_DATA' && msg.channel === 1) {
        const data = msg.data;
        if (!Array.isArray(data)) return;
        for (const item of data) {
          if (!Array.isArray(item) || item.length < 2) continue;
          const [header, ...rows] = item;
          if (!Array.isArray(header)) continue;
          const symIdx = header.indexOf('eventSymbol');
          for (const row of rows) {
            if (!Array.isArray(row)) continue;
            const sym = row[symIdx];
            if (!sym) continue;
            if (!quotes[sym]) quotes[sym] = {};
            for (let i = 0; i < header.length; i++) {
              if (row[i] != null && row[i] !== 'NaN') quotes[sym][header[i]] = row[i];
            }
          }
        }
      }
      if (msg.type === 'KEEPALIVE') {
        ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel ?? 0 }));
      }
    });

    ws.on('error', (e) => console.warn('[ws error]', e.message));
    ws.on('close', () => { clearTimeout(timer); resolve(quotes); });
  });
}

// ── IC parsing  "SPY 235p/240p/260c/265c 2026-05-21" ─────────────────────────
function parseIC(ic) {
  if (!ic) return null;
  const m = ic.match(/^(\w+)\s+(\d+(?:\.\d+)?)p\/(\d+(?:\.\d+)?)p\/(\d+(?:\.\d+)?)c\/(\d+(?:\.\d+)?)c\s+(\d{4}-\d{2}-\d{2})$/i);
  if (!m) return null;
  return {
    ticker: m[1].toUpperCase(),
    longPut:   parseFloat(m[2]),
    shortPut:  parseFloat(m[3]),
    shortCall: parseFloat(m[4]),
    longCall:  parseFloat(m[5]),
    expiry:    m[6],
  };
}

// dxFeed symbol: .SPY260521P00240000
function dxSym(ticker, expiry, side, strike) {
  const exp = expiry.replace(/-/g, '').slice(2);  // 20260521 → 260521
  const pad = Math.round(strike * 1000).toString().padStart(8, '0');
  return `.${ticker}${exp}${side.toUpperCase()}${pad}`;
}

function calcDTE(expiryStr) {
  const exp = new Date(expiryStr + 'T21:00:00Z');  // ~4pm ET
  return Math.ceil((exp - Date.now()) / 86400000);
}

function getMid(quotes, sym) {
  const q = quotes[sym];
  if (!q) return null;
  const bid = parseFloat(q.bidPrice ?? q.bid ?? 'NaN');
  const ask = parseFloat(q.askPrice ?? q.ask ?? 'NaN');
  if (isNaN(bid) || isNaN(ask)) return null;
  return (bid + ask) / 2;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — AFTERNOON CHECK ${TODAY} ===\n`);

  const creds      = await readCredentials();
  const accessToken = await getAccessToken(creds);
  console.log('[auth] Access token obtained');

  // Get account number
  if (!creds.accountNumber) {
    const accs = await ttGet('/customers/me/accounts', accessToken);
    creds.accountNumber = accs.data?.items?.[0]?.account?.['account-number'];
  }
  console.log('[account] Account:', creds.accountNumber);

  // Get balances
  const balRes = await ttGet(`/accounts/${creds.accountNumber}/balances`, accessToken);
  const bal = balRes.data;
  const afternoonNetLiq = parseFloat(bal['net-liquidating-value'] ?? bal['net-liq'] ?? 0);
  console.log(`[account] Net Liq: ${fmt(afternoonNetLiq)}`);

  // Get DxLink credentials (used for VIX and later for options)
  let dxCreds = null;
  try {
    dxCreds = await getDxLinkToken(accessToken);
    console.log(`[stream] DxLink URL: ${dxCreds.streamerUrl}`);
  } catch (e) {
    console.warn('[stream] Could not get DxLink token:', e.message);
  }

  // VIX quote
  let afternoonVix = null;
  if (dxCreds) {
    try {
      const vixQ = await streamQuotes(['$VIX.X', 'VIX'], dxCreds.token, dxCreds.streamerUrl, 8000);
      const vixRaw = vixQ['$VIX.X'] ?? vixQ['VIX'];
      if (vixRaw) {
        const bid = parseFloat(vixRaw.bidPrice ?? 0);
        const ask = parseFloat(vixRaw.askPrice ?? 0);
        afternoonVix = ask > 0 ? (bid + ask) / 2 : null;
      }
    } catch (e) { console.warn('[vix] error:', e.message); }
  }
  console.log(`[vix] VIX: ${afternoonVix != null ? afternoonVix.toFixed(2) : 'n/a'}`);

  // Morning doc & yesterday
  const dailyRef   = db.doc(`guvid-agent/daily/${TODAY}`);
  const dailySnap  = await dailyRef.get();
  const dailyData  = dailySnap.exists ? dailySnap.data() : {};
  const morningNetLiq = dailyData.morningNetLiq ?? null;
  const netLiqChange  = morningNetLiq != null ? afternoonNetLiq - morningNetLiq : null;

  const ydaySnap      = await db.doc(`guvid-agent/daily/${YESTERDAY}`).get();
  const ydayNetLiq    = ydaySnap.exists ? (ydaySnap.data().afternoonNetLiq ?? ydaySnap.data().morningNetLiq ?? null) : null;
  const netLiqChangeDOD = ydayNetLiq != null ? afternoonNetLiq - ydayNetLiq : null;

  await dailyRef.set({
    afternoonNetLiq, afternoonVix, netLiqChange,
    netLiqChangeDayOverDay: netLiqChangeDOD,
    afternoonTimestamp: new Date().toISOString(),
  }, { merge: true });
  console.log('[firestore] Daily snapshot saved');

  // ── Open positions ─────────────────────────────────────────────────────────
  let posDocs = [];
  // Try multiple possible collection paths
  for (const path of [
    () => db.collection('guvid-agent/positions/positions').where('status', '==', 'open').get(),
    () => db.collectionGroup('positions').where('status', '==', 'open').get(),
    () => db.collection('positions').where('status', '==', 'open').get(),
  ]) {
    try {
      const snap = await path();
      if (snap.docs.length > 0) { posDocs = snap.docs; break; }
    } catch (_) {}
  }
  console.log(`[positions] Found ${posDocs.length} open positions`);

  // Build symbol list
  const allSymbols = [];
  const parsed = [];
  for (const docSnap of posDocs) {
    const pos = docSnap.data();
    const icStr = pos.ic ?? pos.icString ?? pos.position ?? '';
    const ic = parseIC(icStr);
    if (!ic) { console.warn(`[pos] Cannot parse: "${icStr}"`); parsed.push({ docSnap, pos, ic: null }); continue; }
    const dte = calcDTE(ic.expiry);
    if (dte < -1) {
      console.log(`[pos] ${icStr} EXPIRED (${dte} DTE)`);
      await docSnap.ref.set({ status: 'expired', expiredAt: new Date().toISOString() }, { merge: true });
      parsed.push({ docSnap, pos, ic, dte, expired: true });
      continue;
    }
    const syms = [
      dxSym(ic.ticker, ic.expiry, 'P', ic.longPut),
      dxSym(ic.ticker, ic.expiry, 'P', ic.shortPut),
      dxSym(ic.ticker, ic.expiry, 'C', ic.shortCall),
      dxSym(ic.ticker, ic.expiry, 'C', ic.longCall),
    ];
    allSymbols.push(...syms);
    parsed.push({ docSnap, pos, ic, dte, syms });
  }

  // Stream option quotes
  let streamedQ = {};
  if (allSymbols.length > 0 && dxCreds) {
    const unique = [...new Set(allSymbols)];
    console.log(`[stream] Subscribing ${unique.length} option symbols, waiting 12s…`);
    try {
      // Re-fetch fresh DxLink token for option stream
      const freshCreds = await getDxLinkToken(accessToken);
      streamedQ = await streamQuotes(unique, freshCreds.token, freshCreds.streamerUrl, 12000);
      console.log(`[stream] Received data for ${Object.keys(streamedQ).length} symbols`);
    } catch (e) { console.warn('[stream] option stream error:', e.message); }
  }

  const profitTargetsReached = [];
  const under21DTEList = [];
  const checks = [];
  const vixHigh = afternoonVix != null && afternoonVix > 25;

  for (const { docSnap, pos, ic, dte, syms, expired } of parsed) {
    if (!ic || expired) continue;

    const icStr   = pos.ic ?? pos.icString ?? pos.position;
    const credit  = parseFloat(pos.credit ?? pos.creditReceived ?? 0);
    const profile = pos.profile ?? 'neutral';
    const openDate = pos.openDate ?? pos.createdAt ?? null;
    const daysOpen = openDate ? Math.floor((Date.now() - new Date(openDate).getTime()) / 86400000) : null;

    const [lpMid, spMid, scMid, lcMid] = syms.map(s => getMid(streamedQ, s));
    console.log(`[pos] ${icStr} → lp=${lpMid?.toFixed(3) ?? '?'} sp=${spMid?.toFixed(3) ?? '?'} sc=${scMid?.toFixed(3) ?? '?'} lc=${lcMid?.toFixed(3) ?? '?'}`);

    let currentValue = null, pl = null, plPerDay = null;
    if (lpMid != null && spMid != null && scMid != null && lcMid != null) {
      currentValue = parseFloat(((spMid + scMid - lpMid - lcMid) * 100).toFixed(2));
      pl           = parseFloat((credit - currentValue).toFixed(2));
      if (daysOpen && daysOpen > 0) plPerDay = parseFloat((pl / daysOpen).toFixed(2));
    }

    // Profit target check
    const tgt50 = credit * 0.50, tgt75 = credit * 0.75, tgt90 = credit * 0.90;
    const neutralTarget = vixHigh ? tgt50 : tgt75;
    let profitTargetReached = false, targetType = null;
    if (pl != null) {
      if (profile === 'aggressive' && pl >= tgt90)          { profitTargetReached = true; targetType = 'aggressive (90%)'; }
      else if (profile === 'conservative' && pl >= tgt50)   { profitTargetReached = true; targetType = 'conservative (50%)'; }
      else if (pl >= neutralTarget)                          { profitTargetReached = true; targetType = vixHigh ? 'neutral-vix (50%)' : 'neutral (75%)'; }
    }

    const needsMgmt = dte <= 21;
    const entry = {
      date: new Date().toISOString(),
      ticker: ic.ticker, profile, ic: icStr, credit,
      currentValue, pl, plPerDay, daysOpen, dte,
      profitTargetReached, targetType: targetType ?? null,
      under21DTE: needsMgmt, daysRemaining: dte,
    };
    checks.push(entry);

    const prev = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
    await docSnap.ref.set({ dailyChecks: [...prev, entry], lastChecked: new Date().toISOString() }, { merge: true });

    if (profitTargetReached)   profitTargetsReached.push({ ticker: ic.ticker, ic: icStr, pl, targetType });
    if (needsMgmt)              under21DTEList.push({ ticker: ic.ticker, ic: icStr, dte });
  }

  // Save afternoon scan
  await db.doc(`guvid-agent/scans/${TODAY}`).set({
    afternoon: {
      timestamp: new Date().toISOString(),
      netLiq: afternoonNetLiq, netLiqChange, netLiqChangeDayOverDay: netLiqChangeDOD,
      vix: afternoonVix,
      positionsChecked: posDocs.length,
      profitTargetsReached, under21DTE: under21DTEList, checks,
    },
  }, { merge: true });
  console.log('[firestore] Afternoon scan saved');

  // ── Print summary ──────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  GUVID AGENT — AFTERNOON SUMMARY  (3:00 PM ET)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Net Liq:         ${fmt(afternoonNetLiq)}`);
  console.log(`  vs morning:      ${netLiqChange != null ? fmtD(netLiqChange) : '(no morning snapshot)'}`);
  console.log(`  vs yesterday:    ${netLiqChangeDOD != null ? fmtD(netLiqChangeDOD) : '(no prior day)'}`);
  console.log(`  VIX:             ${afternoonVix != null ? afternoonVix.toFixed(2) : 'n/a'}${vixHigh ? '  ⚠ HIGH VIX — 50% targets active' : ''}`);
  console.log(`  Positions checked: ${posDocs.length}`);
  console.log();

  if (profitTargetsReached.length === 0) {
    console.log('  Profit targets reached: none');
  } else {
    console.log('  Profit targets reached:');
    for (const p of profitTargetsReached)
      console.log(`    ✓ ${p.ticker.padEnd(6)} ${p.ic.padEnd(42)} P&L ${fmt(p.pl)}  [${p.targetType}]`);
  }

  if (under21DTEList.length === 0) {
    console.log('  Under 21 DTE (need management): none');
  } else {
    console.log('  Under 21 DTE (need management):');
    for (const u of under21DTEList)
      console.log(`    ⚠ ${u.ticker.padEnd(6)} ${u.ic.padEnd(42)} DTE: ${u.dte}`);
  }

  if (checks.length > 0) {
    console.log('\n  Position details:');
    console.log('  ' + '─'.repeat(80));
    for (const c of checks) {
      const plStr  = c.pl != null ? fmtD(c.pl) : 'n/a';
      const pctStr = c.credit > 0 && c.pl != null ? ` (${((c.pl / c.credit) * 100).toFixed(0)}%)` : '';
      const flags  = [c.profitTargetReached ? '✓TARGET' : '', c.under21DTE ? `⚠${c.dte}DTE` : ''].filter(Boolean).join(' ');
      console.log(`  ${c.ticker.padEnd(6)} ${c.ic.padEnd(42)} P&L: ${plStr.padEnd(12)}${pctStr.padEnd(8)} ${flags}`);
    }
  }
  console.log('══════════════════════════════════════════════════════\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });

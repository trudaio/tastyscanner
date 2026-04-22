import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import WS from './node_modules/ws/index.js';

// ── Firebase init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ── TastyTrade helpers ─────────────────────────────────────────────────────
const TT_BASE = 'https://api.tastyworks.com';

async function ttGet(path, token, params) {
  const url = new URL(`${TT_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`TT GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getAccessToken(clientSecret, refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_secret: clientSecret,
    scope: 'read',
  }).toString();
  const res = await fetch(`${TT_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`OAuth → ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `Bearer ${data.access_token || data['access-token']}`;
}

// ── DxLink WebSocket streamer ──────────────────────────────────────────────
async function getQuotesAndGreeks(wsUrl, token, symbols, waitMs) {
  waitMs = waitMs || 12000;
  return new Promise((resolve) => {
    const quotes = {};
    const greeks = {};

    const ws = new WS(wsUrl);
    const send = (obj) => { if (ws.readyState === WS.OPEN) ws.send(JSON.stringify(obj)); };

    ws.on('open', () => {
      send({ type: 'SETUP', channel: 0, version: '0.1-js/1.0.0', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 });
    });

    ws.on('message', (raw) => {
      let msgs;
      try { msgs = JSON.parse(raw.toString()); } catch { return; }
      if (!Array.isArray(msgs)) msgs = [msgs];

      for (const msg of msgs) {
        if (msg.type === 'SETUP') {
          send({ type: 'AUTH', channel: 0, token });
        } else if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
          send({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } });
        } else if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
          send({
            type: 'FEED_SUBSCRIPTION',
            channel: 1,
            add: [
              ...symbols.map(s => ({ type: 'Quote', symbol: s })),
              ...symbols.map(s => ({ type: 'Greeks', symbol: s })),
            ],
          });
        } else if (msg.type === 'FEED_DATA' && msg.channel === 1) {
          const data = msg.data;
          if (!Array.isArray(data) || data.length < 3) continue;
          const eventType = data[0];
          const fields = data[1];
          for (let i = 2; i < data.length; i++) {
            const vals = data[i];
            if (!Array.isArray(vals)) continue;
            const obj = {};
            fields.forEach((f, idx) => { obj[f] = vals[idx]; });
            const sym = obj.eventSymbol;
            if (!sym) continue;
            if (eventType === 'Quote') quotes[sym] = obj;
            else if (eventType === 'Greeks') greeks[sym] = obj;
          }
        } else if (msg.type === 'KEEPALIVE') {
          send({ type: 'KEEPALIVE', channel: msg.channel });
        }
      }
    });

    ws.on('error', (e) => console.error('WS error:', e.message));
    setTimeout(() => { try { ws.close(); } catch {} resolve({ quotes, greeks }); }, waitMs);
  });
}

// ── Date helpers ───────────────────────────────────────────────────────────
function todayET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
}
function yesterdayET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
}
function daysUntilExpiration(expDateStr) {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const exp = new Date(expDateStr + 'T16:00:00');
  return Math.ceil((exp - et) / (1000 * 60 * 60 * 24));
}

function parseIC(icStr) {
  if (!icStr) return null;
  const parts = icStr.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const ticker = parts[0];
  const expiration = parts[parts.length - 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
  const strikeStr = parts.slice(1, parts.length - 1).join('/');
  const strikes = strikeStr.split('/').map(s => parseFloat(s.trim())).filter(s => !isNaN(s));
  if (strikes.length !== 4) return null;
  return { ticker, longPut: strikes[0], shortPut: strikes[1], shortCall: strikes[2], longCall: strikes[3], expiration };
}

// dxFeed compact format: .SPY260516C565
function toDxSymbol(ticker, expiration, strike, optionType) {
  const [y, m, d] = expiration.split('-');
  return `.${ticker}${y.slice(2)}${m}${d}${optionType}${strike}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const todayStr = todayET();
  const yesterdayStr = yesterdayET();
  console.log(`\n=== Guvid Afternoon Agent — ${todayStr} ===\n`);

  // ── Read credentials and authenticate ────────────────────────────────────
  console.log('Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  let accessToken = null;
  let accountNumber = null;
  let streamToken = null;
  let dxLinkUrl = 'wss://tasty-openapi-ws.dxfeed.com/realtime';

  outer: for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      const clientSecret = data?.credentials?.clientSecret;
      const refreshToken = data?.credentials?.refreshToken;
      if (!clientSecret || !refreshToken) continue;

      try {
        accessToken = await getAccessToken(clientSecret, refreshToken);
        accountNumber = data?.accountNumber;

        if (!accountNumber) {
          const acctResp = await ttGet('/customers/me/accounts', accessToken);
          const accounts = acctResp?.data?.items || [];
          if (accounts.length > 0) accountNumber = accounts[0]?.account?.['account-number'];
        }

        const streamResp = await ttGet('/api-quote-tokens', accessToken);
        streamToken = streamResp?.data?.token;
        dxLinkUrl = streamResp?.data?.['dxlink-url'] || dxLinkUrl;

        console.log(`Authenticated user ${userDoc.id}. Account: ${accountNumber}`);
        console.log(`DxLink URL: ${dxLinkUrl}`);
        break outer;
      } catch (e) {
        console.log(`Auth failed for user ${userDoc.id}: ${e.message}`);
        accessToken = null;
      }
    }
  }

  if (!accessToken || !accountNumber) throw new Error('Could not authenticate with TastyTrade');

  // ── Net Liq snapshot ──────────────────────────────────────────────────────
  console.log('\nFetching account balances...');
  const balResp = await ttGet(`/accounts/${accountNumber}/balances`, accessToken);
  const balData = balResp?.data;
  const afternoonNetLiq = parseFloat(
    balData?.['net-liquidating-value'] ?? balData?.['net-liquidation-value'] ?? balData?.['net-liq'] ?? 0
  );
  console.log(`Afternoon Net Liq: $${afternoonNetLiq.toFixed(2)}`);

  // ── VIX ───────────────────────────────────────────────────────────────────
  console.log('Fetching VIX...');
  let vix = null;
  if (streamToken) {
    try {
      const { quotes: vixQ } = await getQuotesAndGreeks(dxLinkUrl, streamToken, ['$VIX.X'], 5000);
      const q = vixQ['$VIX.X'];
      if (q) {
        const bid = parseFloat(q.bidPrice ?? 0);
        const ask = parseFloat(q.askPrice ?? 0);
        vix = (bid > 0 && ask > 0) ? (bid + ask) / 2 : parseFloat(q.lastPrice ?? 0) || null;
      }
    } catch (e) { console.error('VIX error:', e.message); }
  }
  console.log(`VIX: ${vix ? vix.toFixed(2) : 'N/A'}`);

  // ── Morning doc & day-over-day ────────────────────────────────────────────
  const dailyRef = db.doc(`guvid-agent/daily/${todayStr}`);
  let morningNetLiq = null;
  try { const s = await dailyRef.get(); if (s.exists) morningNetLiq = s.data()?.morningNetLiq ?? null; } catch {}

  const netLiqChange = morningNetLiq !== null ? afternoonNetLiq - morningNetLiq : null;

  let yesterdayNetLiq = null;
  try { const s = await db.doc(`guvid-agent/daily/${yesterdayStr}`).get(); if (s.exists) yesterdayNetLiq = s.data()?.afternoonNetLiq ?? s.data()?.morningNetLiq ?? null; } catch {}

  const netLiqChangeDayOverDay = yesterdayNetLiq !== null ? afternoonNetLiq - yesterdayNetLiq : null;
  const afternoonTimestamp = new Date().toISOString();

  await dailyRef.set({ afternoonNetLiq, afternoonVix: vix, netLiqChange, netLiqChangeDayOverDay, afternoonTimestamp }, { merge: true });
  console.log('Saved daily snapshot.');

  // ── Read open positions ───────────────────────────────────────────────────
  console.log('\nReading open positions...');
  let openPositions = [];

  for (const getter of [
    () => db.collection('guvid-agent').doc('positions').collection('records').where('status', '==', 'open').get(),
    () => db.collection('positions').where('status', '==', 'open').get(),
    () => db.collection('guvid-agent').doc('positions').collection('records').get(),
  ]) {
    try {
      const snap = await getter();
      if (!snap.empty) {
        snap.docs.forEach(d => { const data = d.data(); if (!data.status || data.status === 'open') openPositions.push({ id: d.id, ref: d.ref, ...data }); });
        if (openPositions.length > 0) { console.log(`Found ${openPositions.length} open positions.`); break; }
      }
    } catch {}
  }

  console.log(`Positions to check: ${openPositions.length}`);

  const positionChecks = [];
  const profitTargetsReached = [];
  const under21DTEList = [];

  if (openPositions.length > 0) {
    const allSymbols = new Set();
    const parsedPositions = [];

    for (const pos of openPositions) {
      const icStr = pos.ic || pos.profile || pos.description || '';
      let parsed = parseIC(icStr);
      if (!parsed && pos.ticker && pos.expiration) {
        const strikes = [pos.longPut, pos.shortPut, pos.shortCall, pos.longCall].map(parseFloat).filter(s => !isNaN(s));
        if (strikes.length === 4) parsed = { ticker: pos.ticker, longPut: strikes[0], shortPut: strikes[1], shortCall: strikes[2], longCall: strikes[3], expiration: pos.expiration };
      }
      if (!parsed) { console.log(`  Skipping ${pos.id} — cannot parse: "${icStr}"`); continue; }
      parsedPositions.push({ pos, parsed });
      [
        toDxSymbol(parsed.ticker, parsed.expiration, parsed.longPut, 'P'),
        toDxSymbol(parsed.ticker, parsed.expiration, parsed.shortPut, 'P'),
        toDxSymbol(parsed.ticker, parsed.expiration, parsed.shortCall, 'C'),
        toDxSymbol(parsed.ticker, parsed.expiration, parsed.longCall, 'C'),
      ].forEach(s => allSymbols.add(s));
    }

    let quotes = {}, greeks = {};
    if (allSymbols.size > 0 && streamToken) {
      console.log(`\nStreaming ${allSymbols.size} option symbols (12s)...`);
      ({ quotes, greeks } = await getQuotesAndGreeks(dxLinkUrl, streamToken, [...allSymbols], 12000));
      console.log(`  Quotes: ${Object.keys(quotes).length} | Greeks: ${Object.keys(greeks).length}`);
    }

    const getMid = (sym) => {
      const q = quotes[sym];
      if (!q) return null;
      const bid = parseFloat(q.bidPrice ?? q.bid ?? 0);
      const ask = parseFloat(q.askPrice ?? q.ask ?? 0);
      return (bid <= 0 && ask <= 0) ? null : (bid + ask) / 2;
    };

    for (const { pos, parsed } of parsedPositions) {
      const { ticker, longPut, shortPut, shortCall, longCall, expiration } = parsed;
      const credit = parseFloat(pos.credit || pos.initialCredit || pos.maxProfit || 0);
      const daysOpen = pos.openedAt ? Math.ceil((Date.now() - new Date(pos.openedAt).getTime()) / 86400000) : null;
      const daysRemaining = daysUntilExpiration(expiration);

      if (daysRemaining <= 0) {
        console.log(`${ticker} IC EXPIRED`);
        const lpM = getMid(toDxSymbol(ticker, expiration, longPut, 'P'));
        const spM = getMid(toDxSymbol(ticker, expiration, shortPut, 'P'));
        const scM = getMid(toDxSymbol(ticker, expiration, shortCall, 'C'));
        const lcM = getMid(toDxSymbol(ticker, expiration, longCall, 'C'));
        const finalPL = (lpM !== null && spM !== null && scM !== null && lcM !== null) ? (credit - (spM + scM - lpM - lcM)) * 100 : null;
        await pos.ref.update({ status: 'expired', expiredAt: new Date().toISOString(), finalPL });
        continue;
      }

      const lpM = getMid(toDxSymbol(ticker, expiration, longPut, 'P'));
      const spM = getMid(toDxSymbol(ticker, expiration, shortPut, 'P'));
      const scM = getMid(toDxSymbol(ticker, expiration, shortCall, 'C'));
      const lcM = getMid(toDxSymbol(ticker, expiration, longCall, 'C'));

      let currentValue = null, pl = null, plPerDay = null;
      if (lpM !== null && spM !== null && scM !== null && lcM !== null) {
        currentValue = spM + scM - lpM - lcM;
        pl = (credit - currentValue) * 100;
        plPerDay = daysOpen ? pl / daysOpen : null;
      }

      const profitPct = (currentValue !== null && credit > 0) ? (credit - currentValue) / credit : null;
      const isVixEvent = vix && vix > 20;
      const profitTargetReached = profitPct !== null && profitPct >= 0.50;
      const neutralTargetReached = profitPct !== null && profitPct >= (isVixEvent ? 0.50 : 0.75);
      const aggressiveTargetReached = profitPct !== null && profitPct >= 0.90;
      const under21DTE = daysRemaining <= 21;

      const checkData = {
        date: new Date().toISOString(),
        ticker,
        profile: pos.profile || pos.description || pos.ic || '',
        ic: `${ticker} ${longPut}/${shortPut}/${shortCall}/${longCall} ${expiration}`,
        credit,
        currentValue: currentValue !== null ? parseFloat(currentValue.toFixed(4)) : null,
        pl: pl !== null ? parseFloat(pl.toFixed(2)) : null,
        plPerDay: plPerDay !== null ? parseFloat(plPerDay.toFixed(2)) : null,
        daysOpen,
        daysRemaining,
        profitTargetReached,
        neutralTargetReached,
        aggressiveTargetReached,
        under21DTE,
        profitPct: profitPct !== null ? parseFloat((profitPct * 100).toFixed(1)) : null,
        vixEvent: isVixEvent,
      };

      positionChecks.push(checkData);
      console.log(`${ticker} ${longPut}/${shortPut}/${shortCall}/${longCall} ${expiration} | DTE:${daysRemaining} | P&L:${pl !== null ? '$'+pl.toFixed(0) : 'N/A'} (${profitPct !== null ? (profitPct*100).toFixed(1)+'%' : '?'}) | Credit:$${credit}`);
      if (profitTargetReached) { profitTargetsReached.push(`${ticker} ${longPut}/${shortPut}/${shortCall}/${longCall} ${expiration} (${(profitPct*100).toFixed(1)}%)`); console.log(`  ✓ PROFIT TARGET >=50%`); }
      if (under21DTE) { under21DTEList.push({ ticker, daysRemaining, id: pos.id }); console.log(`  ⚠ ${daysRemaining} DTE`); }

      const existingChecks = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
      await pos.ref.update({ dailyChecks: [...existingChecks, checkData], lastChecked: new Date().toISOString() });
    }
  }

  // ── Save afternoon scan ───────────────────────────────────────────────────
  console.log('\nSaving afternoon scan summary...');
  await db.doc(`guvid-agent/scans/${todayStr}`).set({
    afternoon: {
      timestamp: afternoonTimestamp,
      netLiq: afternoonNetLiq,
      netLiqChange,
      vix,
      positionsChecked: positionChecks.length,
      profitTargetsReached,
      under21DTE: under21DTEList.map(p => `${p.ticker} (${p.daysRemaining} DTE)`),
      checks: positionChecks,
    }
  }, { merge: true });

  // ── Print Summary ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('GUVID AGENT — AFTERNOON SUMMARY');
  console.log('='.repeat(60));

  const fromMorning = netLiqChange !== null ? ` (from morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)})` : ' (no morning snapshot)';
  const fromYesterday = netLiqChangeDayOverDay !== null ? `, from yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}` : '';
  console.log(`Net Liq: $${afternoonNetLiq.toFixed(2)}${fromMorning}${fromYesterday}`);
  console.log(`VIX: ${vix ? vix.toFixed(2) : 'N/A'}${vix && vix > 20 ? '  *** VIX EVENT: use 50% profit target ***' : ''}`);
  console.log(`Positions checked: ${positionChecks.length}`);

  if (profitTargetsReached.length > 0) {
    console.log(`\nProfit targets reached (>=50%):`);
    profitTargetsReached.forEach(s => console.log(`  - ${s}`));
  } else {
    console.log('Profit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log(`\nUnder 21 DTE (need management):`);
    under21DTEList.forEach(p => console.log(`  - ${p.ticker} (${p.daysRemaining} DTE)`));
  } else {
    console.log('Under 21 DTE: none');
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });

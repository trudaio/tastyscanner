import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import WS from './node_modules/ws/index.js';
import TastyTradeClient from './node_modules/@tastytrade/api/dist/tastytrade-api.js';

// ── Firebase init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

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
            type: 'FEED_SUBSCRIPTION', channel: 1,
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
  return Math.ceil((new Date(expDateStr + 'T16:00:00') - et) / 86400000);
}

function parseIC(icStr) {
  if (!icStr) return null;
  const parts = icStr.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const ticker = parts[0];
  const expiration = parts[parts.length - 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
  const strikes = parts.slice(1, parts.length - 1).join('/').split('/').map(s => parseFloat(s.trim())).filter(s => !isNaN(s));
  if (strikes.length !== 4) return null;
  return { ticker, longPut: strikes[0], shortPut: strikes[1], shortCall: strikes[2], longCall: strikes[3], expiration };
}

// dxFeed compact symbol: .SPY260516C565
function toDxSymbol(ticker, expiration, strike, optionType) {
  const [y, m, d] = expiration.split('-');
  return `.${ticker}${y.slice(2)}${m}${d}${optionType}${strike}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const todayStr = todayET();
  const yesterdayStr = yesterdayET();
  console.log(`\n=== Guvid Afternoon Agent — ${todayStr} ===\n`);

  // ── Authenticate: try all users sorted by most recent token ───────────────
  console.log('Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  const credList = [];
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const b of brokerSnap.docs) {
      const data = b.data();
      const creds = data?.credentials || {};
      if (!creds.refreshToken || !creds.clientSecret) continue;
      try {
        const payload = JSON.parse(Buffer.from(creds.refreshToken.split('.')[1], 'base64url').toString());
        credList.push({ uid: userDoc.id, iat: payload.iat || 0, accountNumber: data.accountNumber, ...creds });
      } catch {}
    }
  }
  credList.sort((a, b) => b.iat - a.iat);
  // Only try top 5 most-recent tokens to avoid 40 × 5s timeouts
  const candidates = credList.slice(0, 5);
  console.log(`Trying top ${candidates.length} of ${credList.length} broker accounts.`);

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
  ]);

  let tastyClient = null;
  let accountNumber = null;
  let streamToken = null;
  let dxLinkUrl = 'wss://tasty-openapi-ws.dxfeed.com/realtime';

  for (const cred of candidates) {
    // Retry up to 3 times on transient 503s
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const client = new TastyTradeClient({
          ...TastyTradeClient.ProdConfig,
          clientSecret: cred.clientSecret,
          refreshToken: cred.refreshToken,
          oauthScopes: ['read'],
        });
        const accts = await withTimeout(client.accountsAndCustomersService.getCustomerAccounts(), 6000);
        accountNumber = cred.accountNumber || accts[0]?.account?.['account-number'];
        const qt = await withTimeout(client.accountsAndCustomersService.getApiQuoteToken(), 6000);
        streamToken = qt?.token;
        dxLinkUrl = qt?.['dxlink-url'] || dxLinkUrl;
        tastyClient = client;
        console.log(`Authenticated user ${cred.uid.slice(0,8)} (attempt ${attempt}). Account: ${accountNumber}`);
        break;
      } catch (e) {
        const is503 = e.response?.status === 503 || e.message?.includes('503') || e.message?.includes('timeout');
        console.log(`  uid ${cred.uid.slice(0,8)} attempt ${attempt}: ${e.message?.slice(0,60)}`);
        if (!is503 || attempt === 3) break; // don't retry on 401 or after 3 tries
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    if (tastyClient) break;
  }

  if (!tastyClient || !accountNumber) throw new Error('Could not authenticate with any TastyTrade account');

  // ── Net Liq snapshot ──────────────────────────────────────────────────────
  console.log('\nFetching account balances...');
  const balances = await tastyClient.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const afternoonNetLiq = parseFloat(
    balances?.['net-liquidating-value'] ?? balances?.['net-liquidation-value'] ?? balances?.['net-liq'] ?? 0
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
  // Firestore paths must have even segment count (collection/doc pairs)
  // guvid-agent/{daily|scans}/{DATE}/data  →  4 segments
  const dailyRef = db.doc(`guvid-agent/daily/${todayStr}/data`);
  let morningNetLiq = null;
  try { const s = await dailyRef.get(); if (s.exists) morningNetLiq = s.data()?.morningNetLiq ?? null; } catch {}
  const netLiqChange = morningNetLiq !== null ? afternoonNetLiq - morningNetLiq : null;

  let yesterdayNetLiq = null;
  try { const s = await db.doc(`guvid-agent/daily/${yesterdayStr}/data`).get(); if (s.exists) yesterdayNetLiq = s.data()?.afternoonNetLiq ?? s.data()?.morningNetLiq ?? null; } catch {}
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
        const [lpM, spM, scM, lcM] = [
          getMid(toDxSymbol(ticker, expiration, longPut, 'P')),
          getMid(toDxSymbol(ticker, expiration, shortPut, 'P')),
          getMid(toDxSymbol(ticker, expiration, shortCall, 'C')),
          getMid(toDxSymbol(ticker, expiration, longCall, 'C')),
        ];
        const finalPL = (lpM !== null && spM !== null && scM !== null && lcM !== null) ? (credit - (spM + scM - lpM - lcM)) * 100 : null;
        await pos.ref.update({ status: 'expired', expiredAt: new Date().toISOString(), finalPL });
        continue;
      }

      const [lpM, spM, scM, lcM] = [
        getMid(toDxSymbol(ticker, expiration, longPut, 'P')),
        getMid(toDxSymbol(ticker, expiration, shortPut, 'P')),
        getMid(toDxSymbol(ticker, expiration, shortCall, 'C')),
        getMid(toDxSymbol(ticker, expiration, longCall, 'C')),
      ];

      let currentValue = null, pl = null, plPerDay = null;
      if (lpM !== null && spM !== null && scM !== null && lcM !== null) {
        currentValue = spM + scM - lpM - lcM; // debit to close
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
      if (under21DTE) { under21DTEList.push({ ticker, daysRemaining }); console.log(`  ⚠ ${daysRemaining} DTE`); }

      const existingChecks = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
      await pos.ref.update({ dailyChecks: [...existingChecks, checkData], lastChecked: new Date().toISOString() });
    }
  }

  // ── Save afternoon scan ───────────────────────────────────────────────────
  console.log('\nSaving afternoon scan summary...');
  await db.doc(`guvid-agent/scans/${todayStr}/data`).set({
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

main().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });

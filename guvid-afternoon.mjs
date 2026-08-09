import admin from 'firebase-admin';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const axios = require('axios');

// ── Firebase init ─────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// ── Auth ──────────────────────────────────────────────────────────────────────
async function findBestCredentials() {
  const usersSnap = await db.collection('users').get();
  const candidates = [];
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').where('isActive', '==', true).get();
    for (const b of brokerSnap.docs) {
      const d = b.data();
      if (d.brokerType !== 'tastytrade') continue;
      const { clientSecret, refreshToken } = d.credentials || {};
      if (!clientSecret || !refreshToken) continue;
      let scope = 'read', iat = 0;
      try {
        const p = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString());
        scope = p.scope || 'read'; iat = p.iat || 0;
      } catch {}
      candidates.push({ uid: userDoc.id, label: d.label, clientSecret, refreshToken, scope, iat });
    }
  }
  candidates.sort((a, b) => {
    const at = a.scope.includes('trade') ? 1 : 0, bt = b.scope.includes('trade') ? 1 : 0;
    return bt !== at ? bt - at : b.iat - a.iat;
  });
  for (const c of candidates) {
    try {
      const res = await axios.post('https://api.tastyworks.com/oauth/token',
        { refresh_token: c.refreshToken, client_secret: c.clientSecret, scope: c.scope, grant_type: 'refresh_token' },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (res.status === 200 && res.data.access_token) {
        console.log(`Auth OK: ${c.label} (uid: ${c.uid.slice(0, 8)}...) scope="${c.scope}"`);
        return { ...c, accessToken: res.data.access_token };
      }
    } catch {}
  }
  throw new Error('No TastyTrade account authenticated');
}

const tastyGet = (url, tok) =>
  axios.get(`https://api.tastyworks.com${url}`, {
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
  }).then(r => r.data);

// ── DxLink streaming ──────────────────────────────────────────────────────────
function streamBatch(dxUrl, token, symbols, waitMs = 15000) {
  return new Promise((resolve) => {
    const quotes = {}, greeks = {};
    let channelOpened = false, settled = false;
    let eventFields = {};
    let hardTimer;

    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      try { ws.close(); } catch {}
      resolve({ quotes, greeks });
    };

    const ws = new WebSocket(dxUrl);
    hardTimer = setTimeout(done, waitMs + 8000);

    ws.on('open', () =>
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, keepaliveTimeout: 60, acceptKeepaliveTimeout: 60, version: '0.1' }))
    );

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'SETUP':
          ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
          break;
        case 'AUTH_STATE':
          if (msg.state === 'AUTHORIZED')
            ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
          break;
        case 'CHANNEL_OPENED':
          if (!channelOpened) {
            channelOpened = true;
            ws.send(JSON.stringify({
              type: 'FEED_SETUP', channel: 1, acceptDataFormat: 'COMPACT',
              acceptEventFields: {
                Quote: ['eventSymbol', 'bidPrice', 'askPrice'],
                Trade: ['eventSymbol', 'price'],
                Greeks: ['eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'price']
              }
            }));
            ws.send(JSON.stringify({
              type: 'FEED_SUBSCRIPTION', channel: 1,
              add: [
                ...symbols.map(s => ({ type: 'Quote', symbol: s })),
                ...symbols.map(s => ({ type: 'Trade', symbol: s })),
                ...symbols.map(s => ({ type: 'Greeks', symbol: s }))
              ]
            }));
            setTimeout(done, waitMs);
          }
          break;
        case 'FEED_CONFIG':
          if (msg.eventFields) eventFields = msg.eventFields;
          break;
        case 'FEED_DATA': {
          // Format: [eventType, row] where row = [sym, val1, val2, ...]
          const data = msg.data;
          if (!Array.isArray(data) || data.length < 2) break;
          const evType = data[0];
          const fields = eventFields[evType];
          if (!fields) break;
          const row = data[1];
          if (!Array.isArray(row)) break;

          const processRow = (r) => {
            if (!Array.isArray(r)) return;
            const obj = {};
            fields.forEach((f, i) => obj[f] = r[i]);
            const sym = obj.eventSymbol;
            if (!sym) return;
            if (evType === 'Quote') {
              const bid = parseFloat(obj.bidPrice) || 0, ask = parseFloat(obj.askPrice) || 0;
              if (bid > 0 || ask > 0) quotes[sym] = { bid, ask, mid: (bid + ask) / 2 };
            } else if (evType === 'Trade') {
              const price = parseFloat(obj.price) || 0;
              if (price > 0 && !quotes[sym]) quotes[sym] = { bid: price, ask: price, mid: price };
            } else if (evType === 'Greeks') {
              greeks[sym] = {
                delta: parseFloat(obj.delta) || 0, theta: parseFloat(obj.theta) || 0,
                gamma: parseFloat(obj.gamma) || 0, vega: parseFloat(obj.vega) || 0,
                price: parseFloat(obj.price) || 0
              };
            }
          };

          if (Array.isArray(row[0])) row.forEach(processRow);
          else processRow(row);
          break;
        }
        case 'KEEPALIVE':
          ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: 0 }));
          break;
      }
    });

    ws.on('error', err => { console.warn('WS error:', err.message); done(); });
  });
}

// ── Symbol helpers ────────────────────────────────────────────────────────────
// Format strike for dxFeed: preserve integer trailing zeros, only remove fractional trailing zeros
function fmtStrike(strike) {
  const s = parseFloat(strike);
  const str = s.toString();
  const decimalIdx = str.indexOf('.');
  if (decimalIdx < 0) return Math.round(s).toString(); // whole number → use as-is
  const decimalPlaces = str.length - decimalIdx - 1;
  const multiplier = Math.pow(10, decimalPlaces);
  return Math.round(s * multiplier).toString();
}

function expToDxDate(expStr) {
  return expStr.replace(/-/g, '').slice(2); // "2026-05-29" → "260529"
}

function dxSym(ticker, expStr, type, strike) {
  const underlying = ticker === 'SPX' ? 'SPXW' : ticker;
  return `.${underlying}${expToDxDate(expStr)}${type}${fmtStrike(strike)}`;
}

function getSymbols(pos) {
  const ic = pos.ic || {};
  const exp = pos.expiration || ic.expiration;
  const ticker = pos.ticker;

  if (ic.shortPut?.streamerSymbol && ic.longPut?.streamerSymbol && ic.shortCall?.streamerSymbol && ic.longCall?.streamerSymbol) {
    return {
      longPut: ic.longPut.streamerSymbol,
      shortPut: ic.shortPut.streamerSymbol,
      shortCall: ic.shortCall.streamerSymbol,
      longCall: ic.longCall.streamerSymbol,
    };
  }

  if (ic.stoPutStrike && ic.stoCallStrike && exp && ticker) {
    return {
      longPut: dxSym(ticker, exp, 'P', ic.btoPutStrike),
      shortPut: dxSym(ticker, exp, 'P', ic.stoPutStrike),
      shortCall: dxSym(ticker, exp, 'C', ic.stoCallStrike),
      longCall: dxSym(ticker, exp, 'C', ic.btoCallStrike),
    };
  }

  return null;
}

function daysUntilExpiry(expStr) {
  if (!expStr) return null;
  const d = expStr.includes('-')
    ? new Date(expStr + 'T00:00:00')
    : new Date(2000 + parseInt(expStr.slice(0,2)), parseInt(expStr.slice(2,4))-1, parseInt(expStr.slice(4,6)));
  return Math.ceil((d - Date.now()) / 86400000);
}

// ── Firestore ─────────────────────────────────────────────────────────────────
async function fetchOpenPositions() {
  const snap = await db.collection('guvid-agent-positions').where('status', '==', 'open').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updatePos(id, data) {
  await db.collection('guvid-agent-positions').doc(id).set(data, { merge: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — AFTERNOON CHECK (${TODAY} ~3:00 PM ET) ===\n`);

  const creds = await findBestCredentials();

  // Account & balances
  const accountsData = await tastyGet('/customers/me/accounts', creds.accessToken);
  const accountNumber = (accountsData.data?.items || [])
    .map(a => a.account?.['account-number'] || a['account-number'])
    .filter(Boolean)[0];
  if (!accountNumber) throw new Error('No account number found');
  console.log('Account:', accountNumber);

  const balData = await tastyGet(`/accounts/${accountNumber}/balances`, creds.accessToken);
  const bal = balData.data || balData;
  const afternoonNetLiq = parseFloat(bal['net-liquidating-value'] ?? bal['net-liquidation-value'] ?? 0);
  console.log(`Afternoon Net Liq: $${afternoonNetLiq.toFixed(2)}`);

  // Open positions & symbol collection
  const openPositions = await fetchOpenPositions();
  console.log(`Open positions: ${openPositions.length}`);

  const posSymbols = {};
  const allSymbols = new Set(['VIX', '$VIX.X']);
  for (const pos of openPositions) {
    const syms = getSymbols(pos);
    if (syms) {
      posSymbols[pos.id] = syms;
      Object.values(syms).forEach(s => allSymbols.add(s));
    }
  }

  // Get FRESH DxLink token immediately before streaming
  console.log('\nFetching fresh DxLink token...');
  const dxResp = await tastyGet('/api-quote-tokens', creds.accessToken);
  const dxData = dxResp.data || dxResp;
  const dxUrl = dxData['dxlink-url'] || dxData['websocket-url'];
  const dxToken = dxData.token;
  console.log('DxLink URL:', dxUrl);

  const allSymArr = [...allSymbols];
  console.log(`Streaming ${allSymArr.length} symbols (15s)...`);
  const { quotes, greeks } = await streamBatch(dxUrl, dxToken, allSymArr, 15000);
  console.log(`Quotes: ${Object.keys(quotes).length} | Greeks: ${Object.keys(greeks).length}`);

  const afternoonVix = quotes['VIX']?.mid || quotes['$VIX.X']?.mid || null;
  console.log(`VIX: ${afternoonVix != null ? afternoonVix.toFixed(2) : 'N/A'}`);

  // Morning/yesterday docs
  const todayRef = db.collection('guvid-agent-daily').doc(TODAY);
  const todaySnap = await todayRef.get();
  const todayData = todaySnap.exists ? todaySnap.data() : {};
  const morningNetLiq = todayData.morningNetLiq ?? null;
  const netLiqChange = morningNetLiq != null ? afternoonNetLiq - morningNetLiq : null;

  const ySnap = await db.collection('guvid-agent-daily').doc(YESTERDAY).get();
  const yData = ySnap.exists ? ySnap.data() : {};
  const yesterdayNetLiq = yData.afternoonNetLiq ?? yData.morningNetLiq ?? null;
  const netLiqChangeDayOverDay = yesterdayNetLiq != null ? afternoonNetLiq - yesterdayNetLiq : null;

  await todayRef.set({
    afternoonNetLiq, afternoonVix, netLiqChange, netLiqChangeDayOverDay,
    afternoonTimestamp: new Date().toISOString()
  }, { merge: true });
  console.log('Daily snapshot saved.');

  const profitTargetsReached = [], under21DTE = [], checks = [];
  const vixEvent = afternoonVix != null && afternoonVix > 25;

  for (const pos of openPositions) {
    const ticker = pos.ticker || '';
    const credit = parseFloat(pos.credit || pos.ic?.credit || 0);
    const expiration = pos.expiration || pos.ic?.expiration || null;
    const openDate = pos.openDate || pos.createdAt || null;
    const daysOpen = openDate ? Math.floor((Date.now() - new Date(openDate).getTime()) / 86400000) : 0;
    const profile = pos.profile || '';
    const daysRemaining = daysUntilExpiry(expiration);
    const isExpired = daysRemaining !== null && daysRemaining < 0;
    const isUnder21DTE = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 21;

    if (isExpired) {
      console.log(`\n${pos.id.slice(0,8)} ${ticker}: EXPIRED`);
      await updatePos(pos.id, { status: 'expired', finalPL: credit * 100, expiredAt: new Date().toISOString() });
      checks.push({ ticker, profile, expiration, credit, pl: credit * 100, daysOpen, status: 'expired' });
      continue;
    }

    let currentValue = null, pl = null, plPerDay = null, profitTargetReached = false;
    const syms = posSymbols[pos.id];

    if (syms) {
      const lp = quotes[syms.longPut]?.mid || 0;
      const sp = quotes[syms.shortPut]?.mid || 0;
      const sc = quotes[syms.shortCall]?.mid || 0;
      const lc = quotes[syms.longCall]?.mid || 0;

      if (sp > 0 || sc > 0) {
        currentValue = Math.max(0, sp + sc - lp - lc);
        pl = (credit - currentValue) * 100;
        plPerDay = daysOpen > 0 ? pl / daysOpen : 0;
        const pctClosed = credit > 0 ? (credit - currentValue) / credit : 0;
        const neutralTarget = vixEvent ? 0.50 : 0.75;
        const targetThreshold = profile === 'aggressive' ? 0.90 : profile === 'conservative' ? 0.50 : neutralTarget;
        profitTargetReached = pctClosed >= targetThreshold;

        console.log(`\n${pos.id.slice(0,8)} | ${ticker} ${profile} | DTE:${daysRemaining} | LP:${lp.toFixed(2)} SP:${sp.toFixed(2)} SC:${sc.toFixed(2)} LC:${lc.toFixed(2)}`);
        console.log(`  Credit:$${credit.toFixed(2)} | CurrVal:$${currentValue.toFixed(2)} | P&L:$${pl.toFixed(2)} | ${(pctClosed*100).toFixed(1)}% captured`);

        if (profitTargetReached) {
          profitTargetsReached.push({ id: pos.id, ticker, profile, expiration, pctClosed: (pctClosed*100).toFixed(1)+'%', pl: pl.toFixed(2) });
          console.log(`  ★ PROFIT TARGET REACHED`);
        }
      } else {
        console.log(`\n${pos.id.slice(0,8)} | ${ticker} ${profile} | DTE:${daysRemaining} | No data (${syms.shortPut})`);
      }
    }

    if (isUnder21DTE) {
      under21DTE.push({ id: pos.id, ticker, profile, expiration, daysRemaining });
      console.log(`  ⚠ UNDER 21 DTE: ${daysRemaining}d`);
    }

    const checkEntry = {
      date: new Date().toISOString(), session: 'afternoon',
      currentValue, pl, plPerDay, profitTargetReached,
      under21DTE: isUnder21DTE, daysRemaining, vix: afternoonVix
    };
    await updatePos(pos.id, { dailyChecks: admin.firestore.FieldValue.arrayUnion(checkEntry) });
    checks.push({ ticker, profile, expiration, credit, currentValue, pl, plPerDay, daysOpen, daysRemaining, profitTargetReached, under21DTE: isUnder21DTE });
  }

  await db.collection('guvid-agent-scans').doc(TODAY).set({
    afternoon: {
      timestamp: new Date().toISOString(), netLiq: afternoonNetLiq, netLiqChange, vix: afternoonVix,
      positionsChecked: openPositions.length, profitTargetsReached, under21DTE, checks
    }
  }, { merge: true });
  console.log('\nAfternoon scan saved to Firestore.');

  // ── Summary ───────────────────────────────────────────────────────────────
  const sep = '═'.repeat(60);
  console.log('\n' + sep + '\nAFTERNOON SUMMARY\n' + sep);
  const mornLine = netLiqChange != null
    ? ` (change from morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)})`
    : ' (no morning snapshot)';
  const dodLine = netLiqChangeDayOverDay != null
    ? `, change from yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}`
    : '';
  console.log(`Net Liq: $${afternoonNetLiq.toFixed(2)}${mornLine}${dodLine}`);
  console.log(`VIX: ${afternoonVix != null ? afternoonVix.toFixed(2) : 'N/A'}`);
  console.log(`Positions checked: ${openPositions.length}`);

  console.log(`\nProfit targets reached: ${profitTargetsReached.length > 0 ? '' : 'none'}`);
  profitTargetsReached.forEach(p =>
    console.log(`  • ${p.ticker} ${p.profile} exp:${p.expiration} | ${p.pctClosed} captured | P&L $${p.pl}`)
  );

  console.log(`\nUnder 21 DTE (need management): ${under21DTE.length > 0 ? '' : 'none'}`);
  under21DTE.forEach(p =>
    console.log(`  • ${p.ticker} ${p.profile} exp:${p.expiration} | ${p.daysRemaining} DTE remaining`)
  );
  console.log(sep);
}

main().then(() => process.exit(0)).catch(err => { console.error('\nFATAL:', err.message || err); process.exit(1); });

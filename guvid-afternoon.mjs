import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Firebase init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const YESTERDAY = (() => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

// ── TastyTrade API helpers ─────────────────────────────────────────────────
async function ttFetch(path, token, opts = {}) {
  const base = 'https://api.tastytrade.com';
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TT ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

async function login(clientId, refreshToken) {
  const res = await fetch('https://api.tastytrade.com/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'remember-token': refreshToken, 'client-id': clientId }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.data['session-token'];
}

// ── DxLink WebSocket streamer ──────────────────────────────────────────────
import { WebSocket } from 'ws';

function streamQuotes(symbols, dxToken, dxUrl, waitMs = 12000) {
  return new Promise((resolve) => {
    const quotes = {};
    const greeks = {};
    const ws = new WebSocket(dxUrl);
    let keepAliveTimer;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
    });

    ws.on('message', (raw) => {
      let msgs;
      try { msgs = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(msgs)) msgs = [msgs];

      for (const msg of msgs) {
        if (msg.type === 'AUTH_STATE' && msg.state === 'UNAUTHORIZED') {
          ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxToken }));
        }
        if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
          // open channel
          ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
        }
        if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
          ws.send(JSON.stringify({
            type: 'FEED_SUBSCRIPTION', channel: 1,
            add: [
              ...symbols.map(s => ({ type: 'Quote', symbol: s })),
              ...symbols.map(s => ({ type: 'Greeks', symbol: s })),
            ],
          }));
          keepAliveTimer = setInterval(() => {
            ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: 0 }));
          }, 15000);
        }
        if (msg.type === 'FEED_DATA' && msg.channel === 1) {
          const events = msg.data;
          if (!Array.isArray(events)) continue;
          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev === 'Quote') {
              const rec = events[i + 1];
              if (rec && rec.eventSymbol) {
                quotes[rec.eventSymbol] = rec;
              }
            }
            if (ev === 'Greeks') {
              const rec = events[i + 1];
              if (rec && rec.eventSymbol) {
                greeks[rec.eventSymbol] = rec;
              }
            }
          }
        }
        if (msg.type === 'KEEPALIVE') {
          ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: 0 }));
        }
      }
    });

    setTimeout(() => {
      clearInterval(keepAliveTimer);
      try { ws.close(); } catch {}
      resolve({ quotes, greeks });
    }, waitMs);

    ws.on('error', (e) => {
      console.error('WS error:', e.message);
      clearInterval(keepAliveTimer);
      resolve({ quotes, greeks });
    });
  });
}

// ── Parse IC string ─────────────────────────────────────────────────────────
// e.g. "SPY 260618P00510000/SPY 260618P00515000/SPY 260618C00580000/SPY 260618C00585000"
// TastyTrade format → dxFeed format: "SPY   260618P00510000" → ".SPY260618P510"
function ttToDxFeed(ttSymbol) {
  const m = ttSymbol.trim().match(/^([A-Z]+)\s+(\d{6})([CP])0*(\d+)000$/);
  if (!m) {
    // Try SPX-style with more zeros
    const m2 = ttSymbol.trim().match(/^([A-Z:]+)\s+(\d{6})([CP])0*(\d+)(\d{3})$/);
    if (m2) {
      const strike = (parseInt(m2[4]) + parseInt(m2[5]) / 1000).toString().replace(/\.?0+$/, '');
      return `.${m2[1]}${m2[2]}${m2[3]}${strike}`;
    }
    throw new Error(`Cannot parse TT symbol: "${ttSymbol}"`);
  }
  return `.${m[1]}${m[2]}${m[3]}${parseInt(m[4])}`;
}

function parseIcLegs(icStr) {
  return icStr.split('/').map(s => s.trim());
}

function daysUntilExpiry(ttSymbol) {
  const m = ttSymbol.trim().match(/\s(\d{6})[CP]/);
  if (!m) return null;
  const d = m[1];
  const expDate = new Date(`20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}T16:00:00-05:00`);
  const now = new Date();
  return Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
}

// mid price
function mid(q) {
  if (!q) return null;
  const bid = parseFloat(q.bidPrice ?? q.bid ?? 0);
  const ask = parseFloat(q.askPrice ?? q.ask ?? 0);
  if (bid <= 0 && ask <= 0) return null;
  if (bid <= 0) return ask;
  if (ask <= 0) return bid;
  return (bid + ask) / 2;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — Afternoon Check ${TODAY} ===\n`);

  // ── Step 3: Read credentials ──
  console.log('Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  let creds = null;
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const b of brokerSnap.docs) {
      const d = b.data();
      if (d.credentials?.refreshToken || d.credentials?.clientSecret) {
        creds = d.credentials;
        break;
      }
    }
    if (creds) break;
  }
  if (!creds) throw new Error('No broker credentials found');
  console.log('Credentials found. Logging in...');

  const token = await login(creds.clientId || creds.clientSecret, creds.refreshToken);
  console.log('Logged in to TastyTrade.\n');

  // ── Get accounts ──
  const acctData = await ttFetch('/customers/me/accounts', token);
  const accounts = acctData.data.items;
  if (!accounts.length) throw new Error('No accounts found');
  const accountNumber = accounts[0].account['account-number'];
  console.log(`Account: ${accountNumber}`);

  // ── Step 4: Net Liq ──
  console.log('Fetching account balances...');
  const balData = await ttFetch(`/accounts/${accountNumber}/balances`, token);
  const bal = balData.data;
  const afternoonNetLiq = parseFloat(bal['net-liquidating-value']);
  console.log(`Afternoon Net Liq: $${afternoonNetLiq.toFixed(2)}`);

  // ── VIX quote via DxLink ──
  console.log('Fetching streamer token for VIX...');
  const streamerData = await ttFetch('/api-quote-tokens', token);
  const dxToken = streamerData.data.token;
  const dxUrl = streamerData.data['dxlink-url'];
  console.log(`DxLink URL: ${dxUrl}`);

  // ── Read open positions from Firestore ──
  console.log('\nReading open positions from Firestore...');
  const posSnap = await db.collection('guvid-agent').doc('positions').collection('positions')
    .where('status', '==', 'open').get();
  const openPositions = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${openPositions.size ?? openPositions.length} open positions.`);

  // Collect all symbols to stream (VIX + all IC legs)
  const vixSymbol = '$VIX.X';
  const allDxSymbols = [vixSymbol];
  const posLegsMap = {};

  for (const pos of openPositions) {
    try {
      const legs = parseIcLegs(pos.ic || pos.icString || pos.symbol || '');
      const dxLegs = legs.map(ttToDxFeed);
      posLegsMap[pos.id] = { legs, dxLegs, pos };
      allDxSymbols.push(...dxLegs);
    } catch (e) {
      console.warn(`  Skipping position ${pos.id}: ${e.message}`);
    }
  }

  // ── Stream all at once ──
  const uniqueSymbols = [...new Set(allDxSymbols)];
  console.log(`\nStreaming ${uniqueSymbols.length} symbols (12s wait)...`);
  console.log('Symbols:', uniqueSymbols.join(', '));
  const { quotes, greeks } = await streamQuotes(uniqueSymbols, dxToken, dxUrl, 12000);
  console.log(`Received quotes for: ${Object.keys(quotes).join(', ') || 'none'}`);
  console.log(`Received greeks for: ${Object.keys(greeks).join(', ') || 'none'}`);

  // ── VIX ──
  const vixQuote = quotes[vixSymbol];
  const afternoonVix = vixQuote ? mid(vixQuote) : null;
  console.log(`\nVIX: ${afternoonVix != null ? afternoonVix.toFixed(2) : 'N/A'}`);

  // ── Read today's morning doc ──
  const dailyRef = db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot');
  // Try alternate path
  const dailyRef2 = db.doc(`guvid-agent/daily/${TODAY}`);
  let morningDoc = await dailyRef2.get();
  if (!morningDoc.exists) morningDoc = await dailyRef.get();

  const morningData = morningDoc.exists ? morningDoc.data() : {};
  const morningNetLiq = morningData.morningNetLiq ?? null;
  const netLiqChange = morningNetLiq != null ? afternoonNetLiq - morningNetLiq : null;

  // ── Read yesterday's afternoon doc ──
  const yesterdayRef = db.doc(`guvid-agent/daily/${YESTERDAY}`);
  const yesterdayDoc = await yesterdayRef.get();
  const yesterdayData = yesterdayDoc.exists ? yesterdayDoc.data() : {};
  const yesterdayNetLiq = yesterdayData.afternoonNetLiq ?? yesterdayData.morningNetLiq ?? null;
  const netLiqChangeDayOverDay = yesterdayNetLiq != null ? afternoonNetLiq - yesterdayNetLiq : null;

  // ── Save afternoon net liq to daily doc ──
  const afternoonTimestamp = new Date().toISOString();
  const dailyUpdate = {
    afternoonNetLiq,
    afternoonVix,
    afternoonTimestamp,
    ...(netLiqChange != null && { netLiqChange }),
    ...(netLiqChangeDayOverDay != null && { netLiqChangeDayOverDay }),
  };
  await dailyRef2.set(dailyUpdate, { merge: true });
  console.log('Saved afternoon net liq to Firestore daily doc.');

  // ── Step 5: Check positions ──
  console.log('\n── Position Checks ─────────────────────────────────────────');
  const checksResults = [];
  const profitTargetsReached = [];
  const under21DTEList = [];

  for (const [posId, { legs, dxLegs, pos }] of Object.entries(posLegsMap)) {
    const credit = parseFloat(pos.credit ?? pos.maxProfit ?? 0);
    const ticker = pos.ticker || pos.symbol || posId;
    const profile = pos.profile || 'neutral';
    const openDate = pos.openDate ? new Date(pos.openDate) : null;
    const daysOpen = openDate ? Math.floor((Date.now() - openDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Get IC current value: short legs - long legs
    // IC = long put + short put + short call + long call
    // Credit spread: short - long. IC credit = (short put - long put) + (short call - long call)
    // Current cost to close = reverse: (long put - short put) + (long call - short call)
    // For a 4-leg IC in order: longPut / shortPut / shortCall / longCall
    let currentValue = null;
    let missingData = false;

    if (dxLegs.length === 4) {
      const [lpSym, spSym, scSym, lcSym] = dxLegs;
      const lpMid = mid(quotes[lpSym]);
      const spMid = mid(quotes[spSym]);
      const scMid = mid(quotes[scSym]);
      const lcMid = mid(quotes[lcSym]);

      console.log(`\n  ${ticker} | IC: ${pos.ic || pos.icString}`);
      console.log(`    Long Put  ${lpSym}: ${lpMid != null ? lpMid.toFixed(2) : 'N/A'}`);
      console.log(`    Short Put ${spSym}: ${spMid != null ? spMid.toFixed(2) : 'N/A'}`);
      console.log(`    Short Call ${scSym}: ${scMid != null ? scMid.toFixed(2) : 'N/A'}`);
      console.log(`    Long Call  ${lcSym}: ${lcMid != null ? lcMid.toFixed(2) : 'N/A'}`);

      if ([lpMid, spMid, scMid, lcMid].some(v => v == null)) {
        missingData = true;
        console.log(`    WARNING: Missing quote data for some legs`);
      } else {
        // current cost to close the IC (debit)
        currentValue = (spMid - lpMid) + (scMid - lcMid);
        console.log(`    Current value (cost to close): $${currentValue.toFixed(2)}`);
      }
    } else if (dxLegs.length === 2) {
      // credit spread
      const [sSym, lSym] = dxLegs;
      const sMid = mid(quotes[sSym]);
      const lMid = mid(quotes[lSym]);
      if (sMid != null && lMid != null) {
        currentValue = sMid - lMid;
      } else {
        missingData = true;
      }
    }

    const pl = (credit > 0 && currentValue != null) ? (credit - currentValue) * 100 : null;
    const plPerDay = (pl != null && daysOpen != null && daysOpen > 0) ? pl / daysOpen : null;
    const pctOfCredit = (credit > 0 && currentValue != null) ? (1 - currentValue / credit) : null;

    // Days to expiry
    const daysRemaining = legs[1] ? daysUntilExpiry(legs[1]) : null;

    // Check if expired
    if (daysRemaining !== null && daysRemaining < 0) {
      console.log(`  ${ticker}: EXPIRED — updating status`);
      await db.collection('guvid-agent').doc('positions').collection('positions').doc(posId).update({
        status: 'expired',
        expiredDate: TODAY,
        finalPL: pl,
      });
      continue;
    }

    // Profit target thresholds
    const targets = { conservative: 0.50, neutral: 0.75, aggressive: 0.90 };
    const vixHigh = afternoonVix != null && afternoonVix > 25;
    const effectiveTarget = vixHigh ? 0.50 : (targets[profile] ?? 0.75);

    const profitTargetReached = pctOfCredit != null && pctOfCredit >= effectiveTarget;
    const isUnder21DTE = daysRemaining != null && daysRemaining <= 21;

    if (profitTargetReached) {
      console.log(`    *** PROFIT TARGET REACHED: ${(pctOfCredit * 100).toFixed(1)}% of credit captured ***`);
      profitTargetsReached.push({ ticker, profile, ic: pos.ic, credit, currentValue, pl, pctOfCredit });
    }
    if (isUnder21DTE) {
      console.log(`    *** UNDER 21 DTE: ${daysRemaining} days remaining — needs management ***`);
      under21DTEList.push({ ticker, profile, ic: pos.ic, daysRemaining, pl });
    }

    const check = {
      date: afternoonTimestamp,
      currentValue,
      pl,
      plPerDay,
      profitTargetReached,
      under21DTE: isUnder21DTE,
      daysRemaining,
      pctOfCredit,
    };

    checksResults.push({ ticker, profile, ic: pos.ic || pos.icString, credit, currentValue, pl, plPerDay, daysOpen, profitTargetReached, under21DTE: isUnder21DTE, daysRemaining });

    // Append to dailyChecks in position doc
    await db.collection('guvid-agent').doc('positions').collection('positions').doc(posId).update({
      dailyChecks: admin.firestore.FieldValue.arrayUnion(check),
    });
  }

  // ── Step 6: Save afternoon summary to scans ──
  const scanRef = db.doc(`guvid-agent/scans/${TODAY}`);
  await scanRef.set({
    afternoon: {
      timestamp: afternoonTimestamp,
      netLiq: afternoonNetLiq,
      netLiqChange: netLiqChange ?? null,
      vix: afternoonVix ?? null,
      positionsChecked: openPositions.length,
      profitTargetsReached,
      under21DTE: under21DTEList,
      checks: checksResults,
    }
  }, { merge: true });
  console.log('\nSaved afternoon summary to Firestore scans doc.');

  // ── Print summary ──
  console.log('\n════════════════════════════════════════════');
  console.log('AFTERNOON SUMMARY');
  console.log('════════════════════════════════════════════');
  const nlChange = netLiqChange != null ? `${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)}` : 'N/A (no morning snapshot)';
  const dod = netLiqChangeDayOverDay != null ? `${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}` : 'N/A';
  console.log(`Net Liq:              $${afternoonNetLiq.toFixed(2)}`);
  console.log(`  vs morning:         ${nlChange}`);
  console.log(`  vs yesterday:       ${dod}`);
  console.log(`VIX:                  ${afternoonVix != null ? afternoonVix.toFixed(2) : 'N/A'}`);
  console.log(`Positions checked:    ${openPositions.length}`);

  if (profitTargetsReached.length > 0) {
    console.log('\nProfit targets reached:');
    for (const p of profitTargetsReached) {
      console.log(`  ✓ ${p.ticker} (${p.profile}) — ${(p.pctOfCredit * 100).toFixed(1)}% captured, P&L: ${p.pl != null ? `$${p.pl.toFixed(2)}` : 'N/A'}`);
    }
  } else {
    console.log('\nProfit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log('\nUnder 21 DTE (needs management):');
    for (const p of under21DTEList) {
      console.log(`  ⚠ ${p.ticker} — ${p.daysRemaining} DTE, P&L: ${p.pl != null ? `$${p.pl.toFixed(2)}` : 'N/A'}`);
    }
  } else {
    console.log('\nUnder 21 DTE: none');
  }

  if (checksResults.length > 0) {
    console.log('\nPosition details:');
    for (const c of checksResults) {
      const plStr = c.pl != null ? `$${c.pl.toFixed(2)}` : 'N/A';
      const plPdStr = c.plPerDay != null ? `$${c.plPerDay.toFixed(2)}/day` : '';
      const pctStr = c.pctOfCredit != null ? `${(c.pctOfCredit * 100).toFixed(1)}%` : 'N/A';
      console.log(`  ${c.ticker} | DTE: ${c.daysRemaining ?? 'N/A'} | P&L: ${plStr} ${plPdStr} | ${pctStr} captured`);
    }
  }

  console.log('\n════════════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('FATAL:', e); process.exit(1); });

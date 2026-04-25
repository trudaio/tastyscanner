import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastyTradeClient from '@tastytrade/api';
import { default as WS } from 'ws';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const GUVID_USER_ID = '06cMi9ed4ZXtOuljtPSSAZnYCy52';
const GUVID_BROKER_ACCT_ID = 'IMxEvvcqcQduzJKhEhU8';

// ── Retry wrapper ──────────────────────────────────────────────────────────
async function retry(fn, maxAttempts = 3, delayMs = 4000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxAttempts) throw e;
      console.log(`    Attempt ${i} failed (${e.message.slice(0, 60)}), retrying in ${delayMs / 1000}s...`);
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
}

// ── DxLink streaming ───────────────────────────────────────────────────────
// Format: data = [EventType, [flat_values...]]
// e.g.: ["Quote", [".SPX260529P6560", 43.05, 43.25, ".SPX260529C7320", 23.55, 23.75]]
function streamQuotes(dxLinkUrl, authToken, symbols, timeoutMs = 14000) {
  return new Promise((resolve) => {
    const result = {};
    const ws = new WS(dxLinkUrl);
    const fieldLayouts = {
      Quote: ['eventSymbol', 'bidPrice', 'askPrice'],
      Greeks: ['eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'price'],
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
    });

    ws.on('message', (raw) => {
      let msgs;
      try { msgs = JSON.parse(raw.toString()); } catch { return; }
      const arr = Array.isArray(msgs) ? msgs : [msgs];
      for (const msg of arr) {
        if (msg.type === 'AUTH_STATE' && msg.state === 'UNAUTHORIZED') {
          ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: authToken }));
        }
        if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
          ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
        }
        if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
          ws.send(JSON.stringify({
            type: 'FEED_SETUP', channel: 1,
            acceptAggregationPeriod: 10,
            acceptDataFormat: 'COMPACT',
            acceptEventFields: {
              Quote: ['eventSymbol', 'bidPrice', 'askPrice'],
              Greeks: ['eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'price'],
            },
          }));
          ws.send(JSON.stringify({
            type: 'FEED_SUBSCRIPTION', channel: 1, reset: true,
            add: [
              ...symbols.map(s => ({ type: 'Quote', symbol: s })),
              ...symbols.map(s => ({ type: 'Greeks', symbol: s })),
            ],
          }));
        }
        if (msg.type === 'FEED_CONFIG' && msg.eventFields) {
          Object.assign(fieldLayouts, msg.eventFields);
        }
        if (msg.type === 'FEED_DATA' && msg.channel === 1) {
          // data = [EventType, [flat_value1, flat_value2, ...]]
          const [evType, flatValues] = msg.data || [];
          if (!evType || !Array.isArray(flatValues)) continue;
          const fields = fieldLayouts[evType];
          if (!fields) continue;
          const stride = fields.length;
          for (let j = 0; j < flatValues.length; j += stride) {
            const obj = {};
            fields.forEach((f, fi) => { obj[f] = flatValues[j + fi]; });
            const sym = obj.eventSymbol;
            if (!sym) continue;
            if (!result[sym]) result[sym] = {};
            Object.assign(result[sym], obj);
          }
        }
        if (msg.type === 'KEEPALIVE') {
          ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel }));
        }
      }
    });

    ws.on('error', (e) => { console.error('  WS error:', e.message); });

    setTimeout(() => {
      try { ws.close(); } catch (_) {}
      resolve(result);
    }, timeoutMs);
  });
}

function daysToExp(expDateStr) {
  const exp = new Date(expDateStr + 'T21:00:00.000Z');
  const now = new Date();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

(async () => {
  console.log(`\n🌆 Guvid Agent — Afternoon Check (${TODAY} ~3:00 PM ET)\n`);

  // ── Step 3: Auth ──────────────────────────────────────────────────────────
  console.log('Step 3: Authenticating with TastyTrade...');
  let tastyClient;
  let accountNumber;
  let dxLinkUrl;
  let dxLinkToken;

  try {
    const baDoc = await db.doc(`users/${GUVID_USER_ID}/brokerAccounts/${GUVID_BROKER_ACCT_ID}`).get();
    const creds = baDoc.data()?.credentials;
    if (!creds?.clientSecret || !creds?.refreshToken) throw new Error('Missing broker account credentials');

    tastyClient = new TastyTradeClient({
      ...TastyTradeClient.ProdConfig,
      clientSecret: creds.clientSecret,
      refreshToken: creds.refreshToken,
      oauthScopes: ['read', 'trade'],
    });

    const accounts = await retry(() => tastyClient.accountsAndCustomersService.getCustomerAccounts('me'));
    accountNumber = accounts[0]?.account?.['account-number'];
    console.log(`  ✓ Authenticated — account: ${accountNumber}`);

    // Get DxLink streaming token
    const qt = await retry(() => tastyClient.accountsAndCustomersService.getApiQuoteToken());
    dxLinkUrl = qt['dxlink-url'];
    dxLinkToken = qt['token'];
    console.log(`  ✓ DxLink URL: ${dxLinkUrl}`);
  } catch (e) {
    console.error('  Auth error:', e.message);
    process.exit(1);
  }

  // ── Step 4: Net Liq + VIX ─────────────────────────────────────────────────
  console.log('\nStep 4: Fetching balances and VIX...');
  let afternoonNetLiq = 0;
  let afternoonVix = 0;
  let morningNetLiq = null;
  let yesterdayNetLiq = null;

  try {
    const balances = await retry(() => tastyClient.balancesAndPositionsService.getAccountBalanceValues(accountNumber));
    afternoonNetLiq = parseFloat(balances['net-liquidating-value'] || 0);
    console.log(`  Net Liq: $${afternoonNetLiq.toFixed(2)}`);
  } catch (e) {
    console.error('  Balance error:', e.message);
  }

  // VIX via DxLink
  try {
    console.log('  Streaming VIX (6s)...');
    const vixData = await streamQuotes(dxLinkUrl, dxLinkToken, ['$VIX.X'], 6000);
    const vix = vixData['$VIX.X'];
    if (vix?.bidPrice || vix?.askPrice) {
      const bid = parseFloat(vix.bidPrice ?? 0);
      const ask = parseFloat(vix.askPrice ?? 0);
      afternoonVix = ask > 0 ? (bid + ask) / 2 : bid;
      console.log(`  VIX: ${afternoonVix.toFixed(2)}`);
    } else {
      console.log('  VIX data not received, received symbols:', Object.keys(vixData));
    }
  } catch (e) {
    console.error('  VIX stream error:', e.message);
  }

  // Read morning/yesterday
  try {
    const todayDoc = await db.doc(`guvid-agent-daily/${TODAY}`).get();
    if (todayDoc.exists) morningNetLiq = todayDoc.data().morningNetLiq ?? null;
    const ydayDoc = await db.doc(`guvid-agent-daily/${YESTERDAY}`).get();
    if (ydayDoc.exists) {
      const d = ydayDoc.data();
      yesterdayNetLiq = d.afternoonNetLiq ?? d.morningNetLiq ?? null;
    }
  } catch (e) {
    console.error('  Daily read error:', e.message);
  }

  const netLiqChange = morningNetLiq !== null ? afternoonNetLiq - morningNetLiq : null;
  const netLiqChangeDayOverDay = yesterdayNetLiq !== null ? afternoonNetLiq - yesterdayNetLiq : null;

  try {
    const update = { afternoonNetLiq, afternoonVix, afternoonTimestamp: new Date().toISOString() };
    if (netLiqChange !== null) update.netLiqChange = netLiqChange;
    if (netLiqChangeDayOverDay !== null) update.netLiqChangeDayOverDay = netLiqChangeDayOverDay;
    await db.doc(`guvid-agent-daily/${TODAY}`).set(update, { merge: true });
    console.log('  ✓ Daily doc updated');
  } catch (e) {
    console.error('  Daily save error:', e.message);
  }

  // ── Step 5: Open positions ────────────────────────────────────────────────
  console.log('\nStep 5: Checking open positions...');
  const posSnap = await db.collection('guvid-agent-positions').where('status', '==', 'open').get();
  console.log(`  Found ${posSnap.size} open positions`);

  const profitTargetsReached = [];
  const under21DTE = [];
  const checks = [];

  for (const posDoc of posSnap.docs) {
    const pos = posDoc.data();
    const ticker = pos.ticker || '';
    const profile = pos.profile || 'neutral';
    const credit = parseFloat(pos.ic?.credit ?? pos.credit ?? 0);
    const expDate = pos.expiration || '';
    const openDate = pos.openDate || TODAY;

    console.log(`\n  ${ticker} [${profile}] exp=${expDate} credit=${credit}`);
    if (!expDate) { console.log('    No expiration, skipping'); continue; }

    const daysRemaining = daysToExp(expDate);
    console.log(`    Days remaining: ${daysRemaining}`);

    if (daysRemaining < 0) {
      console.log('    EXPIRED — updating status');
      try { await posDoc.ref.update({ status: 'expired', expiredAt: new Date().toISOString() }); } catch (_) {}
      continue;
    }

    const lp = pos.ic?.longPut?.streamerSymbol;
    const sp = pos.ic?.shortPut?.streamerSymbol;
    const sc = pos.ic?.shortCall?.streamerSymbol;
    const lc = pos.ic?.longCall?.streamerSymbol;

    if (!lp || !sp || !sc || !lc) { console.log('    Missing streamer symbols, skipping'); continue; }

    console.log(`    Streaming ${sp}/${sc} (12s)...`);
    const data = await streamQuotes(dxLinkUrl, dxLinkToken, [lp, sp, sc, lc], 13000);

    const mid = (sym) => {
      const d = data[sym];
      if (!d) return null;
      const bid = parseFloat(d.bidPrice ?? 0);
      const ask = parseFloat(d.askPrice ?? 0);
      if (bid === 0 && ask === 0) return null;
      return (bid + ask) / 2;
    };

    const lpMid = mid(lp);
    const spMid = mid(sp);
    const scMid = mid(sc);
    const lcMid = mid(lc);

    console.log(`    LP:${lpMid?.toFixed(2)??'N/A'} SP:${spMid?.toFixed(2)??'N/A'} SC:${scMid?.toFixed(2)??'N/A'} LC:${lcMid?.toFixed(2)??'N/A'}`);

    let currentValue = null;
    let pl = null;
    let plPerDay = null;
    const daysOpen = Math.max(1, Math.round((new Date() - new Date(openDate)) / (1000 * 60 * 60 * 24)));

    if (lpMid !== null && spMid !== null && scMid !== null && lcMid !== null) {
      currentValue = spMid + scMid - lpMid - lcMid;
      pl = (credit - currentValue) * 100;
      plPerDay = pl / daysOpen;
      console.log(`    Value: ${currentValue.toFixed(2)}, P&L: ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`);
    }

    let targetPct = profile === 'conservative' ? 0.50 : profile === 'aggressive' ? 0.90 : 0.75;
    if (afternoonVix > 25) targetPct = Math.min(targetPct, 0.50);

    const profitTargetReached = pl !== null && pl >= credit * targetPct * 100;
    const isUnder21DTE = daysRemaining <= 21;

    if (profitTargetReached) {
      const pct = credit > 0 ? (pl / (credit * 100) * 100).toFixed(0) : '?';
      console.log(`    ✅ PROFIT TARGET REACHED (${pct}% of max)`);
      profitTargetsReached.push({ ticker, profile, pl, pct: credit > 0 ? pl / (credit * 100) : 0 });
    }
    if (isUnder21DTE) {
      console.log(`    ⚠️  UNDER 21 DTE`);
      under21DTE.push({ ticker, profile, daysRemaining });
    }

    const checkEntry = {
      date: new Date().toISOString(),
      currentValue: currentValue !== null ? +currentValue.toFixed(4) : null,
      pl: pl !== null ? +pl.toFixed(2) : null,
      plPerDay: plPerDay !== null ? +plPerDay.toFixed(2) : null,
      profitTargetReached,
      under21DTE: isUnder21DTE,
      daysRemaining,
    };

    checks.push({
      ticker, profile,
      ic: `${ticker} ${expDate} ${pos.ic?.shortPut?.strike}/${pos.ic?.shortCall?.strike}`,
      credit, daysOpen, ...checkEntry,
    });

    try {
      const existing = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
      await posDoc.ref.update({ dailyChecks: [...existing, checkEntry], lastChecked: new Date().toISOString() });
    } catch (e) { console.error('    dailyChecks error:', e.message); }
  }

  // ── Step 6: Save scan ──────────────────────────────────────────────────────
  console.log('\nStep 6: Saving afternoon scan...');
  try {
    await db.doc(`guvid-agent-scans/${TODAY}`).set({
      afternoon: {
        timestamp: new Date().toISOString(),
        netLiq: afternoonNetLiq,
        netLiqChange,
        vix: afternoonVix,
        positionsChecked: posSnap.size,
        profitTargetsReached: profitTargetsReached.map(p => `${p.ticker} [${p.profile}]: $${p.pl.toFixed(0)} (${(p.pct * 100).toFixed(0)}%)`),
        under21DTE: under21DTE.map(p => `${p.ticker} [${p.profile}]: ${p.daysRemaining}d`),
        checks,
      },
    }, { merge: true });
    console.log('  ✓ Scan saved');
  } catch (e) {
    console.error('  Scan save error:', e.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log('AFTERNOON SUMMARY');
  console.log('═'.repeat(62));

  const morningChangeStr = netLiqChange !== null
    ? ` | morning Δ: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)}`
    : '';
  const dodStr = netLiqChangeDayOverDay !== null
    ? ` | day-over-day: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}`
    : '';

  console.log(`Net Liq:   $${afternoonNetLiq.toFixed(2)}${morningChangeStr}${dodStr}`);
  console.log(`VIX:       ${afternoonVix > 0 ? afternoonVix.toFixed(2) : 'N/A'}`);
  console.log(`Positions: ${posSnap.size} open\n`);

  for (const c of checks) {
    const plStr = c.pl !== null ? `${c.pl >= 0 ? '+' : ''}$${c.pl.toFixed(0)}` : 'N/A';
    const flags = [c.profitTargetReached ? '✅TARGET' : '', c.under21DTE ? '⚠️<21DTE' : ''].filter(Boolean).join(' ');
    console.log(`  ${c.ticker} [${c.profile}] ${c.daysRemaining}d | credit:$${c.credit} | P&L: ${plStr} ${flags}`);
  }

  if (profitTargetsReached.length > 0) {
    console.log(`\n✅ Profit Targets Reached (${profitTargetsReached.length}):`);
    for (const p of profitTargetsReached) {
      console.log(`   ${p.ticker} [${p.profile}]: +$${p.pl.toFixed(0)} (${(p.pct * 100).toFixed(0)}% of max)`);
    }
  } else {
    console.log('\nProfit targets: none reached');
  }

  if (under21DTE.length > 0) {
    console.log(`\n⚠️  Under 21 DTE — needs management (${under21DTE.length}):`);
    for (const p of under21DTE) {
      console.log(`   ${p.ticker} [${p.profile}]: ${p.daysRemaining} days remaining`);
    }
  } else {
    console.log('21 DTE:    all clear (> 21 days)');
  }

  console.log('═'.repeat(62));
  process.exit(0);
})();

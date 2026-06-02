import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastyTradeClient from '@tastytrade/api';

// ─── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TARGET_ACCOUNT = '5WI49175';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt2 = n => (n == null || isNaN(n)) ? 'N/A' : n.toFixed(2);
const fmtMoney = n => (n == null || isNaN(n)) ? 'N/A' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = n => (n == null || isNaN(n)) ? 'N/A' : `${n >= 0 ? '+' : ''}${fmtMoney(n)}`;

function calcDaysToExpiry(expiryDateStr) {
  const expiry = new Date(expiryDateStr + 'T21:00:00Z');
  return Math.max(0, Math.ceil((expiry - Date.now()) / 86400000));
}

// ─── TastyTrade OAuth via library ────────────────────────────────────────────
async function tryAuth(clientSecret, refreshToken) {
  const client = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret,
    refreshToken,
    oauthScopes: ['read', 'trade']
  });
  const resp = await client.httpClient.getData('/customers/me/accounts');
  const accounts = resp?.data?.data?.items ?? [];
  return { client, accounts };
}

// ─── DxLink Streaming ────────────────────────────────────────────────────────
async function streamQuotes(dxToken, dxHost, symbols, waitMs = 12000) {
  const { default: WebSocket } = await import('ws');
  return new Promise((resolve) => {
    const quotes = {};
    let ws, settled = false;

    const done = () => {
      if (!settled) {
        settled = true;
        try { ws?.close(); } catch {}
        resolve(quotes);
      }
    };

    setTimeout(done, waitMs + 3000);

    try {
      ws = new WebSocket(`wss://${dxHost}/feed`, ['dxlink/1.0']);
    } catch (e) {
      console.error('  WS create error:', e.message);
      resolve({});
      return;
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'SETUP', channel: 0, keepaliveTimeout: 60, acceptKeepaliveTimeout: 60, version: '1.0' }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'SETUP') {
        ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxToken }));
      } else if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
        ws.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
      } else if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
        ws.send(JSON.stringify({
          type: 'FEED_SETUP', channel: 1,
          acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
          acceptEventFields: { Quote: ['eventSymbol', 'bidPrice', 'askPrice'] }
        }));
        const subs = [
          ...symbols.map(s => ({ type: 'Quote', symbol: s })),
          { type: 'Quote', symbol: '$VIX.X' },
          { type: 'Quote', symbol: 'VIX' }
        ];
        ws.send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: 1, reset: true, add: subs }));
        setTimeout(done, waitMs);
      } else if (msg.type === 'FEED_DATA' && msg.channel === 1) {
        const data = msg.data;
        if (!Array.isArray(data)) return;
        for (let i = 0; i < data.length; i += 2) {
          const rows = data[i + 1];
          if (!Array.isArray(rows) || rows.length < 2) continue;
          const fields = rows[0];
          for (let r = 1; r < rows.length; r++) {
            const obj = {};
            fields.forEach((f, fi) => { obj[f] = rows[r][fi]; });
            const sym = obj.eventSymbol;
            if (sym) quotes[sym] = { bid: parseFloat(obj.bidPrice) || 0, ask: parseFloat(obj.askPrice) || 0 };
          }
        }
      } else if (msg.type === 'KEEPALIVE') {
        ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: msg.channel ?? 0 }));
      }
    });

    ws.on('error', e => console.error('  WS error:', e.message));
    ws.on('close', done);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🕒 Guvid Agent — Afternoon Check — ${TODAY} 3:00 PM ET\n`);

  // ── Step 3: Auth ──────────────────────────────────────────────────────────
  console.log('🔐 Authenticating with TastyTrade...');
  const usersSnap = await db.collection('users').get();
  let tastyClient = null, accountNumber = null;

  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const bDoc of brokerSnap.docs) {
      const bd = bDoc.data();
      if (bd.credentials?.brokerType !== 'tastytrade') continue;
      const { clientSecret, refreshToken } = bd.credentials ?? {};
      if (!clientSecret || !refreshToken) continue;
      try {
        const { client, accounts } = await tryAuth(clientSecret, refreshToken);
        const acct = accounts.find(a => {
          const num = a.account?.['account-number'] ?? a['account-number'];
          return num === TARGET_ACCOUNT;
        }) ?? accounts[0];
        if (acct) {
          accountNumber = acct.account?.['account-number'] ?? acct['account-number'];
          tastyClient = client;
          console.log(`  ✅ Authenticated — account: ${accountNumber} (user: ${userDoc.id})`);
          break;
        }
      } catch (e) {
        // try next
      }
    }
    if (tastyClient) break;
  }

  const apiAvailable = !!tastyClient;
  if (!apiAvailable) {
    console.log('  ⚠️  All TastyTrade tokens expired — running in read-only mode');
  }

  // ── Step 4: Net Liq + VIX ────────────────────────────────────────────────
  console.log('\n📊 Getting net liq and VIX...');

  let afternoonNetLiq = 0;
  let vixPrice = NaN;
  let dxToken = null, dxHost = null;

  if (apiAvailable) {
    const balResp = await tastyClient.httpClient.getData(`/accounts/${accountNumber}/balances`);
    const balData = balResp?.data?.data;
    afternoonNetLiq = parseFloat(balData?.['net-liquidating-value'] ?? balData?.netLiquidatingValue ?? 0);
    console.log(`  Net Liq: ${fmtMoney(afternoonNetLiq)}`);

    try {
      const tokenResp = await tastyClient.httpClient.getData('/quote-streamer-tokens');
      const tokenData = tokenResp?.data?.data;
      dxToken = tokenData?.token ?? tokenData?.['streamer-token'];
      dxHost = (tokenData?.['websocket-url'] ?? tokenData?.url ?? '').replace(/^wss?:\/\//, '');
      if (!dxHost) dxHost = 'tasty-openapi-ws.dxfeed.com/realtime';

      if (dxToken) {
        console.log('  Streaming VIX (5s)...');
        const vixQ = await streamQuotes(dxToken, dxHost, [], 5000);
        const vq = vixQ['$VIX.X'] ?? vixQ['VIX'];
        if (vq) vixPrice = (vq.bid + vq.ask) / 2;
      }
    } catch (e) {
      console.warn('  DxLink error:', e.message);
    }
  }
  console.log(`  VIX: ${isNaN(vixPrice) ? 'N/A' : vixPrice.toFixed(2)}`);

  // Morning snapshot
  let morningNetLiq = null;
  const morningSnap = await db.doc(`guvid-agent/daily/${TODAY}/morning`).get();
  if (morningSnap.exists) {
    morningNetLiq = morningSnap.data()?.morningNetLiq ?? null;
    console.log(`  Morning net liq: ${fmtMoney(morningNetLiq)}`);
  } else {
    const flatMorning = await db.doc(`guvid-agent/daily-${TODAY}`).get();
    if (flatMorning.exists && flatMorning.data()?.morningNetLiq) {
      morningNetLiq = flatMorning.data().morningNetLiq;
      console.log(`  Morning net liq (flat): ${fmtMoney(morningNetLiq)}`);
    } else {
      console.log('  No morning snapshot for today');
    }
  }

  const netLiqChange = (morningNetLiq != null && apiAvailable) ? afternoonNetLiq - morningNetLiq : null;

  // Yesterday for day-over-day
  let yestNetLiq = null;
  for (const path of [
    `guvid-agent/daily/${YESTERDAY}/afternoon`,
    `guvid-agent/daily-${YESTERDAY}`
  ]) {
    const snap = await db.doc(path).get().catch(() => null);
    if (snap?.exists) {
      yestNetLiq = snap.data()?.afternoonNetLiq ?? snap.data()?.morningNetLiq ?? null;
      if (yestNetLiq) break;
    }
  }
  if (!yestNetLiq) {
    const yestScan = await db.doc(`guvid-agent/scans-${YESTERDAY}`).get().catch(() => null);
    if (yestScan?.exists) yestNetLiq = yestScan.data()?.afternoon?.netLiq ?? null;
  }
  const netLiqChangeDayOverDay = (yestNetLiq != null && apiAvailable) ? afternoonNetLiq - yestNetLiq : null;

  // Save daily snapshot
  const afternoonDoc = {
    afternoonNetLiq: apiAvailable ? afternoonNetLiq : 0,
    afternoonVix: isNaN(vixPrice) ? null : vixPrice,
    netLiqChange,
    netLiqChangeDayOverDay,
    afternoonTimestamp: new Date().toISOString(),
    apiAvailable
  };
  await db.doc(`guvid-agent/daily/${TODAY}/afternoon`).set(afternoonDoc, { merge: true });
  await db.doc(`guvid-agent/daily-${TODAY}`).set(afternoonDoc, { merge: true });
  console.log('  ✅ Daily snapshot saved');

  // ── Step 5: Check open positions ─────────────────────────────────────────
  console.log('\n🔍 Checking open positions...');
  const posSnap = await db.collection('guvid-agent').where('status', '==', 'open').get();
  const posDocs = posSnap.docs;
  console.log(`  Found ${posDocs.length} open position(s)`);

  // Collect option symbols
  const allSymbols = new Set();
  for (const posDoc of posDocs) {
    const ic = posDoc.data().ic ?? {};
    for (const key of ['stoPut', 'btoPut', 'stoCall', 'btoCall']) {
      if (ic[key]?.symbol) allSymbols.add(ic[key].symbol);
    }
  }

  let streamedQuotes = {};
  if (apiAvailable && dxToken && allSymbols.size > 0) {
    console.log(`  Streaming ${allSymbols.size} option symbols (12s)...`);
    streamedQuotes = await streamQuotes(dxToken, dxHost, Array.from(allSymbols), 12000);
    console.log(`  Got quotes for ${Object.keys(streamedQuotes).length} symbols`);
  }

  const isVixEvent = !isNaN(vixPrice) && vixPrice > 25;
  const checks = [];
  const profitTargetsReached = [];
  const under21DTEList = [];

  for (const posDoc of posDocs) {
    const pos = posDoc.data();
    const ticker = pos.ticker ?? 'UNKNOWN';
    const profile = pos.profile ?? 'neutral';
    const ic = pos.ic ?? {};
    const expiry = ic.expiration ?? pos.expiration ?? '';
    const openDate = pos.createdAt ?? pos.openDate ?? pos.date ?? '';
    const daysRemaining = expiry ? calcDaysToExpiry(expiry) : 999;
    const isExpired = expiry && new Date(expiry) < new Date(TODAY);
    const daysOpen = openDate ? Math.floor((Date.now() - new Date(openDate).getTime()) / 86400000) : 0;

    const credit = parseFloat(
      pos.credit ?? pos.originalCredit ??
      ((ic.stoPut?.mid ?? 0) + (ic.stoCall?.mid ?? 0) - (ic.btoPut?.mid ?? 0) - (ic.btoCall?.mid ?? 0))
    );

    const legs = [
      { sym: ic.stoPut?.symbol, side: 'short' },
      { sym: ic.btoPut?.symbol, side: 'long' },
      { sym: ic.stoCall?.symbol, side: 'short' },
      { sym: ic.btoCall?.symbol, side: 'long' }
    ];
    let currentValue = null, quotesAvailable = false;
    if (legs.every(l => l.sym && streamedQuotes[l.sym])) {
      quotesAvailable = true;
      currentValue = 0;
      for (const leg of legs) {
        const mid = (streamedQuotes[leg.sym].bid + streamedQuotes[leg.sym].ask) / 2;
        currentValue += leg.side === 'short' ? mid : -mid;
      }
    }

    const creditDollars = credit * 100;
    const currentValueDollars = currentValue != null ? currentValue * 100 : null;
    const pl = currentValueDollars != null ? creditDollars - currentValueDollars : null;
    const plPct = (pl != null && creditDollars > 0) ? (pl / creditDollars) * 100 : null;
    const plPerDay = (pl != null && daysOpen > 0) ? pl / daysOpen : null;

    const neutralTarget = isVixEvent ? creditDollars * 0.50 : creditDollars * 0.75;
    const profitTargetReached = pl != null && pl >= neutralTarget;
    const isUnder21DTE = daysRemaining <= 21;

    if (isExpired) {
      console.log(`  📅 [${ticker}] ${profile} — EXPIRED (${expiry}), marking expired`);
      await posDoc.ref.update({ status: 'expired', expiredAt: TODAY })
        .catch(e => console.warn(`    Update failed: ${e.message}`));
    } else {
      const flags = [profitTargetReached ? '🎯 PROFIT TARGET' : '', isUnder21DTE ? `⏰ ${daysRemaining}DTE` : ''].filter(Boolean);
      const plStr = pl != null ? `${fmtChange(pl)} (${fmt2(plPct)}%)` : 'N/A';
      console.log(`  [${ticker}] ${profile} | ${expiry} | P&L: ${plStr} | DTE: ${daysRemaining} ${flags.join(' ')}`);
    }

    if (profitTargetReached && !isExpired) profitTargetsReached.push(`${ticker} ${profile} (${expiry})`);
    if (isUnder21DTE && !isExpired) under21DTEList.push({ id: posDoc.id, ticker, daysRemaining, profile, expiry });

    const checkEntry = {
      date: new Date().toISOString(), session: 'afternoon',
      currentValue: currentValueDollars, pl, plPct, plPerDay,
      daysOpen, daysRemaining, profitTargetReached, under21DTE: isUnder21DTE,
      quotesAvailable, expired: isExpired
    };
    await posDoc.ref.update({ dailyChecks: admin.firestore.FieldValue.arrayUnion(checkEntry) })
      .catch(e => console.warn(`  dailyChecks update failed: ${e.message}`));

    const icStr = `${ticker} ${expiry} ${ic.stoPut?.symbol ?? ''}/${ic.btoPut?.symbol ?? ''}/${ic.stoCall?.symbol ?? ''}/${ic.btoCall?.symbol ?? ''}`;
    checks.push({ id: posDoc.id, ticker, profile, ic: icStr, expiration: expiry, credit: creditDollars, currentValue: currentValueDollars, pl, plPct, plPerDay, daysOpen, daysRemaining, profitTargetReached, under21DTE: isUnder21DTE, expired: isExpired, quotesAvailable });
  }

  // ── Step 6: Save afternoon scan ──────────────────────────────────────────
  console.log('\n💾 Saving afternoon scan...');
  await db.doc(`guvid-agent/scans-${TODAY}`).set({
    afternoon: {
      timestamp: new Date().toISOString(),
      netLiq: apiAvailable ? afternoonNetLiq : 0,
      netLiqChange,
      netLiqChangeDayOverDay,
      vix: isNaN(vixPrice) ? null : vixPrice,
      positionsChecked: posDocs.length,
      profitTargetsReached,
      under21DTE: under21DTEList.map(p => `${p.ticker} ${p.profile} (${p.daysRemaining}d)`),
      checks, apiAvailable,
      ...(apiAvailable ? {} : { note: 'TastyTrade API tokens expired — no live market data available' })
    }
  }, { merge: true });
  console.log(`  ✅ Scan saved to guvid-agent/scans-${TODAY}`);

  // ── Print Summary ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log('  AFTERNOON SUMMARY — ' + TODAY);
  console.log('═'.repeat(62));

  if (apiAvailable) {
    console.log(`Net Liq: ${fmtMoney(afternoonNetLiq)}${morningNetLiq != null ? `, change from morning: ${fmtChange(netLiqChange)}` : ' (no morning snapshot)'}`);
    if (netLiqChangeDayOverDay != null) console.log(`Day-over-day change: ${fmtChange(netLiqChangeDayOverDay)}`);
  } else {
    console.log('Net Liq: N/A (TastyTrade tokens expired)');
  }
  console.log(`VIX: ${isNaN(vixPrice) ? 'N/A' : vixPrice.toFixed(2)}${!isNaN(vixPrice) && vixPrice > 25 ? ' ⚠️ ELEVATED' : ''}`);
  console.log(`Positions checked: ${posDocs.length}`);

  const expiredInRun = checks.filter(c => c.expired);
  if (expiredInRun.length > 0) {
    console.log(`\n💀 Expired positions (marked as expired):`);
    for (const p of expiredInRun) console.log(`   • ${p.ticker} ${p.profile} — expired ${p.expiration}`);
  }

  if (profitTargetsReached.length > 0) {
    console.log(`\n🎯 Profit targets reached:`);
    for (const p of profitTargetsReached) console.log(`   • ${p}`);
  } else {
    console.log('\n🎯 Profit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log('\n⏰ Under 21 DTE (need management):');
    for (const p of under21DTEList) console.log(`   • ${p.ticker} ${p.profile} — ${p.daysRemaining} days, expiry ${p.expiry}`);
  } else {
    console.log('\n⏰ Under 21 DTE: none');
  }
  console.log('═'.repeat(62));
}

main()
  .then(() => { console.log('\n✅ Afternoon check complete.\n'); process.exit(0); })
  .catch(e => { console.error('\n❌ Fatal error:', e.message, '\n', e.stack); process.exit(1); });

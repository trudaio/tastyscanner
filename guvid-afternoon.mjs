import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const TastyTradeClient = (await import('@tastytrade/api')).default;
const { MarketDataSubscriptionType } = await import('@tastytrade/api');

// ── Firebase init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── Helpers ────────────────────────────────────────────────────────────────
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().slice(0, 10);

function log(...args) { console.log('[Guvid-PM]', ...args); }

// ── Step 3: Read TastyTrade credentials ────────────────────────────────────
async function getTastyCredentials() {
  log('Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        log(`Found credentials for user ${userDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ── Parse IC string → 4 streamer symbols ───────────────────────────────────
function parseICtoStreamerSymbols(ic) {
  const parts = ic.split('/').map(s => s.trim()).filter(Boolean);
  return parts.map(p => {
    if (p.startsWith('.')) return p;
    const clean = p.replace(/\s+/g, '');
    const m = clean.match(/^([A-Z:]+)(\d{6})([CP])(\d{8})$/);
    if (!m) return p;
    const [, ticker, date, optType, strikePadded] = m;
    const strikeInt = parseInt(strikePadded, 10);
    const strikeDx = (strikeInt / 1000).toString();
    return `.${ticker}${date}${optType}${strikeDx}`;
  });
}

function getExpirationDate(ic) {
  for (const p of ic.split('/')) {
    const clean = p.trim().replace(/\s+/g, '');
    const m = clean.match(/^\.?[A-Z:]+(\d{6})[CP]/);
    if (m) {
      const yymmdd = m[1];
      const yy = parseInt(yymmdd.slice(0, 2), 10);
      const mm = parseInt(yymmdd.slice(2, 4), 10) - 1;
      const dd = parseInt(yymmdd.slice(4, 6), 10);
      return new Date(2000 + yy, mm, dd);
    }
  }
  return null;
}

function daysUntil(date) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

function getMidPrice(quote) {
  if (!quote) return null;
  const bid = parseFloat(quote.bidPrice ?? quote.bid ?? 0);
  const ask = parseFloat(quote.askPrice ?? quote.ask ?? 0);
  if (isNaN(bid) || isNaN(ask) || (bid === 0 && ask === 0)) return null;
  return (bid + ask) / 2;
}

// ── Stream quotes + greeks via SDK ─────────────────────────────────────────
function streamSymbols(client, symbols, waitMs = 12000) {
  return new Promise((resolve) => {
    const quotes = {};
    const greeks = {};

    const handler = (records) => {
      for (const rec of records) {
        const sym = rec.eventSymbol;
        if (!sym) continue;
        if (rec.eventType === 'Quote') quotes[sym] = rec;
        else if (rec.eventType === 'Greeks') greeks[sym] = rec;
      }
    };

    client.quoteStreamer.addEventListener(handler);

    client.quoteStreamer.connect().then(() => {
      client.quoteStreamer.subscribe(symbols, [
        MarketDataSubscriptionType.Quote,
        MarketDataSubscriptionType.Greeks,
      ]);
      setTimeout(async () => {
        client.quoteStreamer.removeEventListener(handler);
        try { await client.quoteStreamer.disconnect(); } catch {}
        resolve({ quotes, greeks });
      }, waitMs);
    }).catch((err) => {
      log('Stream error:', err.message);
      resolve({ quotes, greeks });
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const creds = await getTastyCredentials();

  const tasty = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  // Step 4: Net Liq
  log('Fetching account balances...');
  const accounts = await tasty.accountsAndCustomersService.getCustomerAccounts();
  log(`Found ${accounts.length} account(s)`);
  const accountNumber = accounts[0].account['account-number'];
  log(`Using account: ${accountNumber}`);

  const balances = await tasty.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const afternoonNetLiq = parseFloat(balances['net-liquidating-value']);
  log(`Afternoon Net Liq: $${afternoonNetLiq.toFixed(2)}`);

  // VIX stream (5s)
  log('Streaming VIX (5s)...');
  const tastyVix = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });
  const { quotes: vixQuotes } = await streamSymbols(tastyVix, ['VIX'], 5000);
  const vixMid = getMidPrice(vixQuotes['VIX']) ?? getMidPrice(vixQuotes['.VIX']) ?? null;
  const afternoonVix = vixMid !== null ? parseFloat(vixMid.toFixed(2)) : null;
  log(`VIX: ${afternoonVix}`);

  // Read morning / yesterday docs
  const dailyRef = db.doc(`guvid-agent/daily/${todayStr}`);
  const dailySnap = await dailyRef.get();
  const dailyData = dailySnap.exists ? dailySnap.data() : {};
  const morningNetLiq = dailyData.morningNetLiq ?? null;
  const netLiqChange = morningNetLiq !== null
    ? parseFloat((afternoonNetLiq - morningNetLiq).toFixed(2)) : null;

  const yesterdaySnap = await db.doc(`guvid-agent/daily/${yesterdayStr}`).get();
  const yesterdayNetLiq = yesterdaySnap.exists ? (yesterdaySnap.data().afternoonNetLiq ?? null) : null;
  const netLiqChangeDayOverDay = yesterdayNetLiq !== null
    ? parseFloat((afternoonNetLiq - yesterdayNetLiq).toFixed(2)) : null;

  await dailyRef.set({
    afternoonNetLiq, afternoonVix, netLiqChange, netLiqChangeDayOverDay,
    afternoonTimestamp: new Date().toISOString(),
  }, { merge: true });
  log('Saved afternoon net liq snapshot');

  // Step 5: Open positions
  log('Reading open positions...');
  let positionDocs = [];
  const pathFns = [
    () => db.collection('guvid-agent/positions/items').where('status', '==', 'open').get(),
    () => db.collection('guvid-agent').doc('positions').collection('items').where('status', '==', 'open').get(),
    () => db.collection('guvid-agent').doc('positions').collection('records').where('status', '==', 'open').get(),
    () => db.collectionGroup('positions').where('status', '==', 'open').get(),
  ];
  for (const fn of pathFns) {
    try { const s = await fn(); if (s.docs?.length > 0) { positionDocs = s.docs; break; } } catch {}
  }
  log(`Found ${positionDocs.length} open position(s)`);

  const profitTargetsReached = [], under21DTEList = [], checks = [];

  if (positionDocs.length > 0) {
    const allSymbols = new Set();
    const posData = [];

    for (const doc of positionDocs) {
      const pos = doc.data();
      const ic = pos.ic ?? pos.icString ?? pos.symbol ?? '';
      if (!ic) continue;

      const expDate = getExpirationDate(ic);
      const daysRemaining = expDate ? daysUntil(expDate) : null;

      if (daysRemaining !== null && daysRemaining < 0) {
        log(`Position ${doc.id} expired`);
        await doc.ref.update({ status: 'expired', expiredAt: new Date().toISOString() });
        const openedAt = pos.openedAt ?? pos.date ?? pos.timestamp ?? null;
        const daysOpen = openedAt ? Math.round((Date.now() - new Date(openedAt)) / 86400000) : null;
        checks.push({ id: doc.id, ticker: pos.ticker ?? '?', ic, credit: pos.credit ?? null,
          currentValue: null, pl: pos.credit ?? null, plPerDay: null, daysOpen,
          daysRemaining: 0, profitTargetReached: false, under21DTE: false, status: 'expired' });
        continue;
      }

      const symbols = parseICtoStreamerSymbols(ic);
      symbols.forEach(s => allSymbols.add(s));
      posData.push({ doc, pos, ic, symbols, daysRemaining });
    }

    if (allSymbols.size > 0) {
      const symbolArr = [...allSymbols];
      log(`Streaming ${symbolArr.length} option symbols (12s)...`);
      log(`Symbols: ${symbolArr.join(', ')}`);

      const tastyStream = new TastyTradeClient({
        ...TastyTradeClient.ProdConfig,
        clientSecret: creds.clientSecret,
        refreshToken: creds.refreshToken,
        oauthScopes: ['read', 'trade'],
      });
      const { quotes, greeks } = await streamSymbols(tastyStream, symbolArr, 12000);
      log(`Quotes: ${Object.keys(quotes).join(', ') || 'none'}`);
      log(`Greeks: ${Object.keys(greeks).join(', ') || 'none'}`);

      for (const { doc, pos, ic, symbols, daysRemaining } of posData) {
        const ticker = pos.ticker ?? ic.split(/[\s.]+/)[0].replace(/\d.*/, '') ?? '?';
        const profile = pos.profile ?? 'neutral';
        const credit = parseFloat(pos.credit ?? pos.maxProfit ?? 0);
        const openedAt = pos.openedAt ?? pos.date ?? pos.timestamp ?? null;
        const daysOpen = openedAt ? Math.round((Date.now() - new Date(openedAt)) / 86400000) : null;

        let currentValue = null;
        if (symbols.length === 4) {
          const mids = symbols.map(s => getMidPrice(quotes[s]));
          log(`  ${ticker}: ${symbols.map((s, i) => `${s}=${mids[i]?.toFixed(2) ?? 'null'}`).join(' ')}`);
          if (mids.every(m => m !== null)) {
            const [longPut, shortPut, shortCall, longCall] = mids;
            currentValue = parseFloat(((shortPut + shortCall - longPut - longCall) * 100).toFixed(2));
          }
        }

        let pl = null, plPerDay = null;
        if (currentValue !== null && credit > 0) {
          pl = parseFloat((credit - currentValue).toFixed(2));
          if (daysOpen && daysOpen > 0) plPerDay = parseFloat((pl / daysOpen).toFixed(2));
        }

        let profitTargetReached = false;
        if (pl !== null && credit > 0) {
          const pct = pl / credit;
          if (profile === 'conservative' && pct >= 0.50) profitTargetReached = true;
          else if (profile === 'aggressive' && pct >= 0.90) profitTargetReached = true;
          else if (pct >= 0.75) profitTargetReached = true;
          if (afternoonVix && afternoonVix > 25 && pct >= 0.50) profitTargetReached = true;
        }

        const under21DTE = daysRemaining !== null && daysRemaining <= 21;

        const existingChecks = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
        await doc.ref.update({
          dailyChecks: [...existingChecks, {
            date: new Date().toISOString(), type: 'afternoon',
            currentValue, pl, plPerDay, profitTargetReached, under21DTE, daysRemaining,
          }],
          lastChecked: new Date().toISOString(),
        });

        if (profitTargetReached) profitTargetsReached.push({ id: doc.id, ticker, pl, credit, daysRemaining });
        if (under21DTE) under21DTEList.push({ id: doc.id, ticker, daysRemaining, pl });
        checks.push({ id: doc.id, ticker, profile, ic, credit, currentValue, pl, plPerDay,
          daysOpen, daysRemaining, profitTargetReached, under21DTE });

        log(`  ${ticker} | credit=$${credit} | current=$${currentValue} | P&L=$${pl} | DTE=${daysRemaining}`);
      }
    }
  }

  // Step 6: Save scan summary
  await db.doc(`guvid-agent/scans/${todayStr}`).set({
    afternoon: {
      timestamp: new Date().toISOString(),
      netLiq: afternoonNetLiq, netLiqChange, netLiqChangeDayOverDay, vix: afternoonVix,
      positionsChecked: positionDocs.length,
      profitTargetsReached: profitTargetsReached.map(p => ({ id: p.id, ticker: p.ticker, pl: p.pl })),
      under21DTE: under21DTEList.map(p => ({ id: p.id, ticker: p.ticker, daysRemaining: p.daysRemaining })),
      checks,
    },
  }, { merge: true });
  log('Saved afternoon scan summary');

  // ── Print summary ──────────────────────────────────────────────────────────
  const etTime = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  GUVID AGENT — AFTERNOON CHECK  ${etTime} ET`);
  console.log('═══════════════════════════════════════════════════════');
  const mStr = morningNetLiq !== null
    ? `  (vs morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange?.toFixed(2)})` : '';
  const yStr = netLiqChangeDayOverDay !== null
    ? `  (vs yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay?.toFixed(2)})` : '';
  console.log(`  Net Liq:           $${afternoonNetLiq.toFixed(2)}${mStr}${yStr}`);
  console.log(`  VIX:               ${afternoonVix ?? 'N/A'}`);
  console.log(`  Positions checked: ${positionDocs.length}`);

  if (profitTargetsReached.length > 0) {
    console.log('\n  PROFIT TARGETS REACHED:');
    for (const p of profitTargetsReached) {
      const pct = p.credit > 0 ? (p.pl / p.credit * 100).toFixed(0) : '?';
      console.log(`     ${p.ticker} | P&L: $${p.pl} (${pct}% of $${p.credit} credit) | DTE: ${p.daysRemaining}`);
    }
  } else {
    console.log('  Profit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log('\n  UNDER 21 DTE (need management):');
    for (const p of under21DTEList) {
      console.log(`     ${p.ticker} | ${p.daysRemaining} DTE remaining | P&L: $${p.pl ?? 'N/A'}`);
    }
  } else {
    console.log('  Under 21 DTE: none');
  }

  if (checks.length > 0) {
    console.log('\n  POSITION DETAILS:');
    for (const c of checks) {
      const flags = [c.profitTargetReached ? 'TARGET' : '', c.under21DTE ? '<21DTE' : ''].filter(Boolean).join(' ');
      console.log(`     [${c.ticker}] credit=$${c.credit} | current=${c.currentValue != null ? '$' + c.currentValue : 'N/A'} | P&L=${c.pl != null ? '$' + c.pl : 'N/A'} | DTE=${c.daysRemaining ?? 'N/A'} ${flags}`);
    }
  }

  console.log('═══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[Guvid-PM] FATAL:', err.message ?? err);
  process.exit(1);
});

'use strict';

process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/firebase-sa.json';

const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);

function daysBetween(dateStr) {
  const exp = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp - now) / 86400000);
}

// ─── Read Firestore credentials (users collection, hasCredentials=true) ──────
async function getCredentials() {
  // Primary: users with hasCredentials=true and valid clientSecret/refreshToken
  const hasCredSnap = await db.collection('users').where('hasCredentials', '==', true).get()
    .catch(() => ({ empty: true, docs: [] }));

  let best = null;
  let bestIat = 0;
  for (const doc of hasCredSnap.docs) {
    const data = doc.data();
    if (!data.clientSecret || !data.refreshToken) continue;
    try {
      const parts = data.refreshToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (payload.iat > bestIat) {
        bestIat = payload.iat;
        best = { userId: doc.id, clientSecret: data.clientSecret, refreshToken: data.refreshToken, scope: payload.scope || 'read' };
      }
    } catch (_) {}
  }
  if (best) return best;
  throw new Error('No TastyTrade credentials found');
}

// ─── Build TastytradeClient using OAuth refresh token flow ───────────────────
async function buildClient(creds) {
  const { default: TastytradeClient } = await import('@tastytrade/api');
  // Use OAuth auto-refresh: pass clientSecret + refreshToken + oauthScopes in config.
  // TastytradeHttpClient.generateAccessToken() will call /oauth/token automatically on first request.
  const scopes = (creds.scope || 'read').split(' ').filter(Boolean);
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: scopes
  });
  // Trigger a token refresh eagerly to verify credentials before proceeding
  await client.httpClient.generateAccessToken();
  console.log('  OAuth access token obtained');
  return client;
}

// ─── Get first account number ─────────────────────────────────────────────────
async function getAccountNumber(client) {
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const items = accounts?.['items'] || accounts || [];
  const first = Array.isArray(items) ? items[0] : Object.values(items)[0];
  return first?.account?.['account-number'] || first?.['account-number'] || first?.accountNumber;
}

// ─── Get net liquidity ────────────────────────────────────────────────────────
async function getNetLiq(client, accountNumber) {
  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  return parseFloat(
    balances['net-liquidating-value'] ??
    balances['net-liq'] ??
    balances.netLiq ??
    0
  );
}

// ─── Stream quotes for a list of symbols, wait up to waitMs ──────────────────
async function streamQuotes(client, symbols, waitMs = 12000) {
  return new Promise(async (resolve) => {
    const prices = {};
    const needed = new Set(symbols);
    let resolved = false;

    function done() {
      if (!resolved) {
        resolved = true;
        try { client.quoteStreamer.disconnect(); } catch (_) {}
        resolve(prices);
      }
    }

    const timeout = setTimeout(done, waitMs);

    try {
      const { MarketDataSubscriptionType } = await import('@tastytrade/api');

      client.quoteStreamer.addEventListener((records) => {
        for (const record of records) {
          if (record.eventType === 'Quote') {
            const sym = record.eventSymbol;
            if (needed.has(sym)) {
              const bid = parseFloat(record.bidPrice);
              const ask = parseFloat(record.askPrice);
              if (!isNaN(bid) && !isNaN(ask)) {
                prices[sym] = (bid + ask) / 2;
                needed.delete(sym);
              }
            }
          }
        }
        if (needed.size === 0) {
          clearTimeout(timeout);
          done();
        }
      });

      await client.quoteStreamer.connect();
      client.quoteStreamer.subscribe(symbols, [MarketDataSubscriptionType.Quote]);
    } catch (e) {
      console.log('  streamer error:', e.message);
      clearTimeout(timeout);
      done();
    }
  });
}

// ─── Build dxFeed streamer symbols for an IC position ────────────────────────
function buildStreamerSymbols(pos) {
  const ticker = (pos.ticker || pos.symbol || '').trim();
  const expDate = pos.expirationDate || pos.expiration || '';
  if (!ticker || !expDate) return null;

  const d = new Date(expDate);
  if (isNaN(d.getTime())) return null;
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yymmdd = `${yy}${mm}${dd}`;

  function strikeCode(val) {
    return String(Math.round(parseFloat(val) * 1000)).padStart(8, '0');
  }

  const sp = pos.shortPutStrike ?? pos.shortPut;
  const lp = pos.longPutStrike ?? pos.longPut;
  const sc = pos.shortCallStrike ?? pos.shortCall;
  const lc = pos.longCallStrike ?? pos.longCall;

  if (!sp || !lp || !sc || !lc) return null;

  return {
    shortPut:  `.${ticker}${yymmdd}P${strikeCode(sp)}`,
    longPut:   `.${ticker}${yymmdd}P${strikeCode(lp)}`,
    shortCall: `.${ticker}${yymmdd}C${strikeCode(sc)}`,
    longCall:  `.${ticker}${yymmdd}C${strikeCode(lc)}`,
  };
}

// ─── Calculate IC current cost-to-close from mid prices ──────────────────────
function calcICValue(prices, syms) {
  const sp = prices[syms.shortPut];
  const lp = prices[syms.longPut];
  const sc = prices[syms.shortCall];
  const lc = prices[syms.longCall];
  if (sp == null || lp == null || sc == null || lc == null) return null;
  return (sp + sc) - (lp + lc);
}

// ─── Find open positions across all likely Firestore paths ───────────────────
async function findOpenPositions() {
  const paths = [
    () => db.collection('guvid-agent/positions/items').where('status', '==', 'open').get(),
    () => db.collection('guvid-agent').doc('positions').collection('items').where('status', '==', 'open').get(),
    () => db.collection('positions').where('status', '==', 'open').get(),
  ];
  for (const fn of paths) {
    try {
      const snap = await fn();
      if (!snap.empty) {
        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, ref: d.ref, ...d.data() }));
        return docs;
      }
    } catch (_) {}
  }
  return [];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — Afternoon Check (${TODAY} ~3:00 PM ET) ===\n`);

  // Step 3: Credentials
  console.log('► Reading TastyTrade credentials from Firestore...');
  const creds = await getCredentials();
  console.log(`  User: ${creds.userId}`);

  // Build client and login
  console.log('► Connecting to TastyTrade...');
  const client = await buildClient(creds);
  const accountNumber = await getAccountNumber(client);
  if (!accountNumber) throw new Error('Could not determine account number');
  console.log(`  Account: ${accountNumber}`);

  // Step 4: Net Liq + VIX (stream both via same connect)
  console.log('► Fetching net liquidity...');
  const netLiq = await getNetLiq(client, accountNumber);
  console.log(`  Net Liq: $${netLiq.toFixed(2)}`);

  console.log('► Getting VIX...');
  const vixPrices = await streamQuotes(client, ['VIX'], 10000);
  const vix = vixPrices['VIX'] ?? null;
  console.log(`  VIX: ${vix !== null ? vix.toFixed(2) : 'N/A'}`);

  // Read today's morning snapshot
  const morningDoc = await db.doc('guvid-agent/daily').collection(TODAY).doc('snapshot').get()
    .catch(() => ({ exists: false }));
  const morningNetLiq = morningDoc.exists ? (morningDoc.data().morningNetLiq ?? null) : null;
  const netLiqChange = morningNetLiq !== null ? +(netLiq - morningNetLiq).toFixed(2) : null;
  console.log(`  Morning Net Liq: ${morningNetLiq !== null ? '$' + morningNetLiq.toFixed(2) : 'N/A'}`);

  // Yesterday's afternoon net liq for day-over-day
  const yesterday = new Date(TODAY);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  const yAftDoc = await db.doc('guvid-agent/daily').collection(yStr).doc('afternoon').get()
    .catch(() => ({ exists: false }));
  const yNetLiq = yAftDoc.exists ? (yAftDoc.data().afternoonNetLiq ?? null) : null;
  const netLiqChangeDayOverDay = yNetLiq !== null ? +(netLiq - yNetLiq).toFixed(2) : null;

  const afternoonTimestamp = new Date().toISOString();
  const afternoonSnap = {
    afternoonNetLiq: netLiq,
    afternoonVix: vix,
    afternoonTimestamp,
    netLiqChange: netLiqChange ?? null,
    netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
    apiAvailable: true,
    date: TODAY
  };
  // Save to guvid-agent/daily (doc) > {TODAY} (subcollection) > afternoon (doc)
  await db.doc('guvid-agent/daily').collection(TODAY).doc('afternoon').set(afternoonSnap);
  console.log(`  Saved afternoon snapshot → guvid-agent/daily/${TODAY}/afternoon`);

  // Step 5: Open positions
  console.log('\n► Loading open positions...');
  const positions = await findOpenPositions();
  console.log(`  Found ${positions.length} open position(s)`);

  const positionsChecked = [];
  const profitTargetsReached = [];
  const under21DTEList = [];

  for (const pos of positions) {
    const ticker = pos.ticker || pos.symbol || pos.id;
    const credit = parseFloat(pos.credit ?? pos.openCredit ?? pos.maxProfit ?? 0);
    const expDate = pos.expirationDate || pos.expiration || '';
    const daysRemaining = expDate ? daysBetween(expDate) : null;
    const openDate = pos.openDate || pos.createdAt || null;
    const daysOpen = openDate ? Math.round((Date.now() - new Date(openDate).getTime()) / 86400000) : null;

    console.log(`\n  [${ticker}] credit=$${credit.toFixed(2)} exp=${expDate} DTE=${daysRemaining}`);

    // Mark expired
    if (daysRemaining !== null && daysRemaining < 0) {
      console.log(`    EXPIRED — updating status`);
      await pos.ref.update({ status: 'expired', expiredDate: TODAY, finalPL: credit * 100 }).catch(() => {});
      continue;
    }

    // Stream quotes for IC legs
    const syms = buildStreamerSymbols(pos);
    let currentValue = null, pl = null, plPerDay = null;

    if (syms) {
      const symList = [syms.shortPut, syms.longPut, syms.shortCall, syms.longCall];
      console.log(`    Subscribing: ${symList.join(', ')}`);
      const prices = await streamQuotes(client, symList, 12000);
      console.log(`    Prices: ${symList.map(s => `${s.slice(-12)}=${prices[s]?.toFixed(3) ?? '?'}`).join(' ')}`);
      currentValue = calcICValue(prices, syms);
      if (currentValue !== null) {
        pl = (credit - currentValue) * 100;
        plPerDay = daysOpen && daysOpen > 0 ? +(pl / daysOpen).toFixed(2) : null;
        console.log(`    Value=$${currentValue.toFixed(3)} P&L=$${pl.toFixed(2)} P&L/day=${plPerDay ?? 'N/A'}`);
      }
    } else {
      console.log(`    Cannot build streamer symbols — missing fields`);
    }

    // Profit target check
    let profitTargetReached = false;
    let targetType = null;
    if (currentValue !== null && credit > 0) {
      const plPct = (credit - currentValue) / credit * 100;
      console.log(`    P&L%: ${plPct.toFixed(1)}%`);
      if (plPct >= 90)      { profitTargetReached = true; targetType = 'aggressive (90%)'; }
      else if (plPct >= 75) { profitTargetReached = true; targetType = 'neutral (75%)'; }
      else if (plPct >= 50) { profitTargetReached = true; targetType = 'conservative (50%)'; }
    }

    const isUnder21 = daysRemaining !== null && daysRemaining <= 21;

    if (profitTargetReached) {
      console.log(`    *** PROFIT TARGET: ${targetType} ***`);
      profitTargetsReached.push({ ticker, targetType, pl, currentValue, credit });
    }
    if (isUnder21) {
      console.log(`    *** UNDER 21 DTE: ${daysRemaining}d ***`);
      under21DTEList.push({ ticker, daysRemaining, expDate });
    }

    const checkEntry = {
      date: TODAY,
      time: afternoonTimestamp,
      currentValue,
      pl,
      plPerDay,
      profitTargetReached,
      targetType: targetType ?? null,
      under21DTE: isUnder21,
      daysRemaining
    };
    const existing = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
    await pos.ref.update({ dailyChecks: [...existing, checkEntry] }).catch(() => {});

    positionsChecked.push({
      ticker,
      profile: pos.profile || pos.strategy || 'iron_condor',
      ic: pos.ic || `${ticker} IC`,
      credit,
      currentValue,
      pl,
      plPerDay,
      daysOpen,
      profitTargetReached,
      under21DTE: isUnder21,
      daysRemaining
    });
  }

  // Step 6: Save afternoon scan summary (pattern: guvid-agent/scans-{YYYY-MM-DD})
  console.log('\n► Saving afternoon summary to Firestore...');
  await db.doc(`guvid-agent/scans-${TODAY}`).set({
    afternoon: {
      timestamp: afternoonTimestamp,
      netLiq,
      netLiqChange: netLiqChange ?? null,
      netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
      vix,
      positionsChecked: positionsChecked.length,
      profitTargetsReached,
      under21DTE: under21DTEList,
      checks: positionsChecked,
      apiAvailable: true
    }
  }, { merge: true });
  console.log(`  Saved → guvid-agent/scans-${TODAY}`);

  // Print final summary
  const changeStr = netLiqChange !== null
    ? ` (vs morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)})`
    : '';
  const dodStr = netLiqChangeDayOverDay !== null
    ? ` (vs yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)})`
    : '';

  console.log('\n' + '═'.repeat(60));
  console.log('AFTERNOON SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Net Liq: $${netLiq.toFixed(2)}${changeStr}${dodStr}`);
  console.log(`VIX: ${vix !== null ? vix.toFixed(2) : 'N/A'}`);
  console.log(`Positions checked: ${positionsChecked.length}`);

  if (profitTargetsReached.length > 0) {
    console.log('\nProfit targets reached:');
    profitTargetsReached.forEach(p =>
      console.log(`  • ${p.ticker} — ${p.targetType} | P&L: $${p.pl?.toFixed(2) ?? '?'}`)
    );
  } else {
    console.log('\nProfit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log('\nUnder 21 DTE (need management):');
    under21DTEList.forEach(p =>
      console.log(`  • ${p.ticker} — ${p.daysRemaining} DTE (exp ${p.expDate})`)
    );
  } else {
    console.log('Under 21 DTE: none');
  }

  console.log('═'.repeat(60) + '\n');
  process.exit(0);
}

main().catch(e => {
  console.error('FATAL:', e.message ?? e);
  process.exit(1);
});

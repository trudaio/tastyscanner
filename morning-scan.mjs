import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import admin from 'firebase-admin';
const apiMod = require('@tastytrade/api');
const TastytradeClient = apiMod.default;
const { MarketDataSubscriptionType } = apiMod;

// ─── Firebase Init ────────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Load credentials from Firestore ─────────────────────────────────────────
async function loadCredentials() {
  console.log('📋 Loading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  // First pass: active accounts
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const d = brokerDoc.data();
      const creds = d.credentials;
      if (!creds?.clientSecret || !creds?.refreshToken) continue;
      if (d.isActive) {
        console.log(`  Using user ${userDoc.id} / broker ${brokerDoc.id}`);
        return { clientSecret: creds.clientSecret, refreshToken: creds.refreshToken };
      }
    }
  }
  // Fallback: any TastyTrade creds
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const creds = brokerDoc.data()?.credentials;
      if (creds?.clientSecret && creds?.refreshToken) {
        console.log(`  Fallback: user ${userDoc.id} / broker ${brokerDoc.id}`);
        return { clientSecret: creds.clientSecret, refreshToken: creds.refreshToken };
      }
    }
  }
  throw new Error('No TastyTrade credentials found');
}

// ─── Profile definitions ──────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16,
    dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, minCredit: 1.0, maxRR: 4, spreadPct: 0.08,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24,
    dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, minCredit: 1.0, maxRR: 4, spreadPct: 0.08,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24,
    dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, minCredit: 1.0, maxRR: 4, spreadPct: 0.08,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};

// ─── Scan chain with streamer data ────────────────────────────────────────────
function scanChainWithData(ticker, chain, quotes, greeks) {
  const results = { conservative: [], neutral: [], aggressive: [] };

  // Underlying price
  let underlyingPrice = 0;
  for (const sym of [ticker, `$${ticker}.X`, `/${ticker}`, `${ticker}/X:XCBF`]) {
    const q = quotes[sym];
    if (q) {
      underlyingPrice = (parseFloat(q.bidPrice || 0) + parseFloat(q.askPrice || 0)) / 2;
      break;
    }
  }

  for (const expGroup of chain) {
    for (const exp of (expGroup.expirations || [])) {
      const expDate = exp.expirationDate || exp['expiration-date'];
      if (!expDate) continue;
      const dte = exp.daysToExpiration != null
        ? parseInt(exp.daysToExpiration)
        : Math.round((new Date(expDate + 'T16:00:00') - new Date()) / 86400000);

      for (const [profileName, profile] of Object.entries(PROFILES)) {
        if (dte < profile.dteMin || dte > profile.dteMax) continue;

        // Build option array for this expiration
        const options = [];
        for (const strike of (exp.strikes || [])) {
          const strikePrice = parseFloat(strike.strikePrice ?? strike['strike-price']);
          if (isNaN(strikePrice)) continue;

          for (const optType of ['call', 'put']) {
            const streamerSym = optType === 'call'
              ? (strike.callStreamerSymbol || strike['call-streamer-symbol'])
              : (strike.putStreamerSymbol || strike['put-streamer-symbol']);
            if (!streamerSym) continue;

            const gData = greeks[streamerSym];
            const qData = quotes[streamerSym];
            if (!gData || !qData) continue;

            const delta = Math.abs(parseFloat(gData.delta ?? 0));
            const bid = parseFloat(qData.bidPrice ?? 0);
            const ask = parseFloat(qData.askPrice ?? 0);
            if (ask <= 0 || isNaN(ask)) continue;
            const mid = (bid + ask) / 2;
            if (mid <= 0) continue;

            options.push({
              strikePrice, optType, streamerSym, delta, mid, bid, ask,
              theta: parseFloat(gData.theta ?? 0),
            });
          }
        }

        // Filter to profile delta range, sorted desc by delta
        const puts = options
          .filter((o) => o.optType === 'put' && o.delta >= profile.deltaMin && o.delta <= profile.deltaMax)
          .sort((a, b) => b.delta - a.delta);
        const calls = options
          .filter((o) => o.optType === 'call' && o.delta >= profile.deltaMin && o.delta <= profile.deltaMax)
          .sort((a, b) => b.delta - a.delta);

        if (!puts.length || !calls.length) continue;

        const pairCount = Math.min(puts.length, calls.length);
        let bestIC = null;
        let bestScore = -Infinity;

        for (let i = 0; i < pairCount; i++) {
          const stoPut = puts[i];
          const stoCall = calls[i];

          const btoPut = options.find(
            (o) => o.optType === 'put' &&
              Math.abs(o.strikePrice - (stoPut.strikePrice - profile.wings)) < 0.6
          );
          const btoCall = options.find(
            (o) => o.optType === 'call' &&
              Math.abs(o.strikePrice - (stoCall.strikePrice + profile.wings)) < 0.6
          );
          if (!btoPut || !btoCall) continue;

          const credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid;
          if (credit < profile.minCredit) continue;

          const rr = (profile.wings - credit) / credit;
          if (rr > profile.maxRR || rr < 0) continue;

          const putSpreadQ = stoPut.ask > 0 ? (stoPut.ask - stoPut.bid) / stoPut.ask : 1;
          const callSpreadQ = stoCall.ask > 0 ? (stoCall.ask - stoCall.bid) / stoCall.ask : 1;
          if (putSpreadQ > profile.spreadPct || callSpreadQ > profile.spreadPct) continue;

          const pop = 100 - Math.max(stoPut.delta * 100, stoCall.delta * 100);
          if (pop < profile.minPOP) continue;

          const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
          const netTheta = Math.abs(stoPut.theta) + Math.abs(stoCall.theta) +
            Math.abs(btoPut.theta) + Math.abs(btoCall.theta);
          const netDelta = stoPut.delta + stoCall.delta;
          const alpha = netDelta > 0 ? (netTheta / netDelta) * 100 : 0;

          const score = profile.score(pop, ev, alpha);
          if (score > bestScore) {
            bestScore = score;
            bestIC = {
              expiration: expDate, dte,
              credit: +credit.toFixed(2),
              rr: +rr.toFixed(2),
              pop: +pop.toFixed(1),
              ev: +ev.toFixed(2),
              alpha: +alpha.toFixed(2),
              score: +score.toFixed(2),
              wings: profile.wings,
              legs: {
                longPut:   { strike: btoPut.strikePrice,  mid: +btoPut.mid.toFixed(2),  delta: +btoPut.delta.toFixed(4) },
                shortPut:  { strike: stoPut.strikePrice,  mid: +stoPut.mid.toFixed(2),  delta: +stoPut.delta.toFixed(4) },
                shortCall: { strike: stoCall.strikePrice, mid: +stoCall.mid.toFixed(2), delta: +stoCall.delta.toFixed(4) },
                longCall:  { strike: btoCall.strikePrice, mid: +btoCall.mid.toFixed(2), delta: +btoCall.delta.toFixed(4) },
              },
            };
          }
        }

        if (bestIC) results[profileName].push(bestIC);
      }
    }
  }

  for (const p of Object.keys(results)) results[p].sort((a, b) => b.score - a.score);
  return { results, underlyingPrice };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🌅 GUVID AGENT — MORNING SCAN — ${TODAY}`);
  console.log(`${'═'.repeat(60)}\n`);

  const creds = await loadCredentials();

  console.log('🔑 Creating TastyTrade client...');
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  const quotes = {};
  const greeks = {};
  client.quoteStreamer.addEventListener((records) => {
    for (const r of records) {
      if (r.eventType === 'Quote') quotes[r.eventSymbol] = r;
      else if (r.eventType === 'Greeks') greeks[r.eventSymbol] = r;
    }
  });

  console.log('🔌 Connecting streamer...');
  await client.quoteStreamer.connect();
  console.log('  Connected!');

  console.log('\n📋 Fetching account info...');
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const firstAccount = accounts[0];
  // Handle both { account: { account-number } } and flat { account-number } shapes
  const acctNum =
    firstAccount?.['account-number'] ||
    firstAccount?.account?.['account-number'];
  if (!acctNum) throw new Error('No account-number found in: ' + JSON.stringify(firstAccount));
  console.log(`  Account: ${acctNum}`);

  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(acctNum);
  const netLiq = parseFloat(balances['net-liquidating-value'] ?? balances.netLiquidatingValue ?? 0);
  console.log(`  Net Liq: $${netLiq.toFixed(2)}`);

  // VIX + underlyings
  client.quoteStreamer.subscribe(
    ['VIX/X:XCBF', '$VIX.X', 'SPX', '$SPX.X', 'QQQ'],
    [MarketDataSubscriptionType.Quote]
  );
  await sleep(6000);

  const vixQ = quotes['VIX/X:XCBF'] || quotes['$VIX.X'];
  const vix = vixQ
    ? +((parseFloat(vixQ.bidPrice || 0) + parseFloat(vixQ.askPrice || 0)) / 2).toFixed(2)
    : 0;
  console.log(`  VIX: ${vix}`);

  // Morning snapshot — path: guvid-agent/agent/daily/{date}
  console.log('\n💾 Saving morning snapshot...');
  await db.collection('guvid-agent').doc('agent')
    .collection('daily').doc(TODAY).set({
      morningNetLiq: netLiq,
      morningVix: vix,
      timestamp: new Date().toISOString(),
      date: TODAY,
      accountNumber: acctNum,
    }, { merge: true });
  console.log('  Saved!');

  // Options chains
  console.log('\n📡 Fetching options chains...');
  const [spxChain, qqqChain] = await Promise.all([
    client.instrumentsService.getNestedOptionChain('SPX'),
    client.instrumentsService.getNestedOptionChain('QQQ'),
  ]);
  console.log(`  SPX groups: ${spxChain.length}, QQQ groups: ${qqqChain.length}`);

  // Collect symbols for relevant DTEs
  const allSymbols = [];
  for (const chain of [spxChain, qqqChain]) {
    for (const expGroup of chain) {
      for (const exp of (expGroup.expirations || [])) {
        const expDate = exp.expirationDate || exp['expiration-date'];
        const dte = exp.daysToExpiration != null
          ? parseInt(exp.daysToExpiration)
          : Math.round((new Date(expDate + 'T16:00:00') - new Date()) / 86400000);
        if (dte < 19 || dte > 50) continue;
        for (const strike of (exp.strikes || [])) {
          const c = strike.callStreamerSymbol || strike['call-streamer-symbol'];
          const p = strike.putStreamerSymbol || strike['put-streamer-symbol'];
          if (c) allSymbols.push(c);
          if (p) allSymbols.push(p);
        }
      }
    }
  }

  console.log(`  Subscribing to ${allSymbols.length} option symbols...`);
  // Subscribe in batches of 500 to avoid overwhelming the connection
  for (let i = 0; i < allSymbols.length; i += 500) {
    client.quoteStreamer.subscribe(allSymbols.slice(i, i + 500), [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
    ]);
    if (i + 500 < allSymbols.length) await sleep(200);
  }

  console.log('  Waiting 12s for streamer data...');
  await sleep(12000);

  console.log(`  Received: ${Object.keys(quotes).length} quotes, ${Object.keys(greeks).length} greeks`);

  // Scan
  console.log('\n🔍 Scanning SPX...');
  const spxScan = scanChainWithData('SPX', spxChain, quotes, greeks);
  console.log('🔍 Scanning QQQ...');
  const qqqScan = scanChainWithData('QQQ', qqqChain, quotes, greeks);

  for (const [t, s] of [['SPX', spxScan], ['QQQ', qqqScan]]) {
    for (const p of ['conservative', 'neutral', 'aggressive'])
      console.log(`  ${t} ${p}: ${s.results[p].length} ICs`);
  }

  // Re-read VIX
  const vixQ2 = quotes['VIX/X:XCBF'] || quotes['$VIX.X'];
  const vixFinal = vixQ2
    ? +((parseFloat(vixQ2.bidPrice || 0) + parseFloat(vixQ2.askPrice || 0)) / 2).toFixed(2)
    : vix;

  // Save scan — path: guvid-agent/agent/scans/{date}
  console.log('\n💾 Saving scan...');
  await db.collection('guvid-agent').doc('agent')
    .collection('scans').doc(TODAY).set({
      date: TODAY,
      timestamp: new Date().toISOString(),
      type: 'morning',
      SPX: { underlyingPrice: spxScan.underlyingPrice, ...spxScan.results },
      QQQ: { underlyingPrice: qqqScan.underlyingPrice, ...qqqScan.results },
    });

  // Save positions — path: guvid-agent/agent/positions/{auto-id}
  const posCol = db.collection('guvid-agent').doc('agent').collection('positions');
  const saved = [];
  for (const [ticker, scan] of [['SPX', spxScan], ['QQQ', qqqScan]]) {
    for (const profileName of ['conservative', 'neutral', 'aggressive']) {
      const ics = scan.results[profileName];
      if (!ics.length) continue;
      const best = ics[0];
      const ref = await posCol.add({
        ticker, profile: profileName, ic: best,
        openDate: TODAY, expiration: best.expiration,
        credit: best.credit, pop: best.pop, ev: best.ev,
        alpha: best.alpha, rr: best.rr, wings: best.wings,
        status: 'open', dailyChecks: [],
        marketContext: { underlyingPrice: scan.underlyingPrice, vix: vixFinal, ivRank: 0 },
      });
      saved.push({ ticker, profileName, id: ref.id, best });
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 MORNING SCAN SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`Date:    ${TODAY}  |  Account: ${acctNum}`);
  console.log(`Net Liq: $${netLiq.toFixed(2)}  |  VIX: ${vixFinal}`);
  console.log('');

  for (const [ticker, scan] of [['SPX', spxScan], ['QQQ', qqqScan]]) {
    const px = scan.underlyingPrice > 0 ? `$${scan.underlyingPrice.toFixed(2)}` : 'N/A';
    console.log(`── ${ticker} (${px}) ──`);
    for (const p of ['conservative', 'neutral', 'aggressive']) {
      const ics = scan.results[p];
      if (!ics.length) { console.log(`  ${p.padEnd(14)}: No qualifying ICs`); continue; }
      const b = ics[0];
      console.log(
        `  ${p.padEnd(14)}: ${b.expiration} DTE:${b.dte} Credit:$${b.credit} ` +
        `R/R:${b.rr} POP:${b.pop}% EV:$${b.ev} Score:${b.score}`
      );
      console.log(
        `  ${''.padEnd(16)}  ${b.legs.longPut.strike}P/${b.legs.shortPut.strike}P/` +
        `${b.legs.shortCall.strike}C/${b.legs.longCall.strike}C`
      );
    }
    console.log('');
  }

  console.log(`✅ Done — ${saved.length} positions saved to Firestore`);
  console.log(`${'═'.repeat(60)}\n`);

  client.quoteStreamer.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

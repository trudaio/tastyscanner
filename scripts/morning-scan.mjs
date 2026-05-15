import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastyTradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const today = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16,
    dteMin: 30, dteMax: 47,
    wings: 10,
    minPOP: 80,
    minCredit: 1,
    maxRR: 4,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24,
    dteMin: 19, dteMax: 47,
    wings: 10,
    minPOP: 60,
    minCredit: 1,
    maxRR: 4,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24,
    dteMin: 19, dteMax: 35,
    wings: 5,
    minPOP: 60,
    minCredit: 1,
    maxRR: 4,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mid(q) {
  const bid = parseFloat(q?.bidPrice ?? q?.bid ?? 0);
  const ask = parseFloat(q?.askPrice ?? q?.ask ?? 0);
  if (!bid && !ask) return 0;
  if (!bid) return ask;
  if (!ask) return bid;
  return (bid + ask) / 2;
}

function calcEV(credit, wings, pop) {
  const probLoss = (100 - pop) / 100;
  return (pop / 100) * credit - probLoss * (wings - credit);
}

function calcAlpha(credit, wings) {
  const margin = wings - credit;
  if (!margin) return 0;
  return (credit / margin) * 100;
}

// ─── Iron Condor builder ──────────────────────────────────────────────────────
function buildBestIC(strikeRows, expirationMeta, profile, quotes, greeks) {
  const { deltaMin, deltaMax, wings, minPOP, minCredit, maxRR } = profile;

  // Annotate each strike with live data
  const annotated = strikeRows.map(row => {
    const callQ = quotes[row.callStreamerSymbol] ?? {};
    const putQ = quotes[row.putStreamerSymbol] ?? {};
    const callG = greeks[row.callStreamerSymbol] ?? {};
    const putG = greeks[row.putStreamerSymbol] ?? {};
    return {
      strike: row.strikePrice,
      callMid: mid(callQ),
      putMid: mid(putQ),
      callDelta: Math.abs(parseFloat(callG.delta ?? 0)),
      putDelta: Math.abs(parseFloat(putG.delta ?? 0)),
      callStreamer: row.callStreamerSymbol,
      putStreamer: row.putStreamerSymbol,
    };
  }).filter(r => r.callDelta > 0 && r.putDelta > 0 && r.callMid > 0 && r.putMid > 0);

  // Filter puts and calls by delta range
  const puts  = annotated.filter(r => r.putDelta  >= deltaMin && r.putDelta  <= deltaMax);
  const calls = annotated.filter(r => r.callDelta >= deltaMin && r.callDelta <= deltaMax);

  if (!puts.length || !calls.length) return null;

  // Symmetric delta pairing: sort by delta desc, pair by index
  puts.sort( (a, b) => b.putDelta  - a.putDelta);
  calls.sort((a, b) => b.callDelta - a.callDelta);

  const candidates = [];
  const pairCount = Math.min(puts.length, calls.length);

  for (let i = 0; i < pairCount; i++) {
    const shortPut  = puts[i];
    const shortCall = calls[i];

    // Long put = strike below short put by wings; long call = strike above short call by wings
    const longPutStrike  = shortPut.strike  - wings;
    const longCallStrike = shortCall.strike + wings;

    const longPut = annotated.reduce(
      (best, r) => Math.abs(r.strike - longPutStrike)  < Math.abs((best?.strike ?? 1e9) - longPutStrike)  ? r : best, null
    );
    const longCall = annotated.reduce(
      (best, r) => Math.abs(r.strike - longCallStrike) < Math.abs((best?.strike ?? 1e9) - longCallStrike) ? r : best, null
    );

    if (!longPut || !longCall || !longPut.putMid || !longCall.callMid) continue;

    const credit = shortPut.putMid + shortCall.callMid - longPut.putMid - longCall.callMid;
    if (credit < minCredit) continue;

    const actualPutWing  = Math.abs(shortPut.strike  - longPut.strike);
    const actualCallWing = Math.abs(shortCall.strike - longCall.strike);
    const actualWings = Math.min(actualPutWing, actualCallWing);

    const rr = (actualWings - credit) / credit;
    if (rr > maxRR || rr <= 0) continue;

    const pop = 100 - Math.max(shortPut.putDelta, shortCall.callDelta) * 100;
    if (pop < minPOP) continue;

    const ev = calcEV(credit, actualWings, pop);
    const alpha = calcAlpha(credit, actualWings);
    const scoreVal = profile.score(pop, ev, alpha);

    candidates.push({
      shortPut:  { strike: shortPut.strike,  mid: shortPut.putMid,   delta: -shortPut.putDelta,   symbol: shortPut.putStreamer  },
      longPut:   { strike: longPut.strike,   mid: longPut.putMid,    delta: longPut.putDelta,      symbol: longPut.putStreamer   },
      shortCall: { strike: shortCall.strike, mid: shortCall.callMid, delta: shortCall.callDelta,   symbol: shortCall.callStreamer },
      longCall:  { strike: longCall.strike,  mid: longCall.callMid,  delta: longCall.callDelta,    symbol: longCall.callStreamer  },
      expiration: expirationMeta,
      credit: Math.round(credit * 100) / 100,
      wings: actualWings,
      rr: Math.round(rr * 100) / 100,
      pop: Math.round(pop * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      score: Math.round(scoreVal * 100) / 100,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n====== GUVID AGENT — Morning Scan ${today} ======\n`);

  // ── Step 3: Read TastyTrade credentials from Firestore ──────────────────────
  console.log('[1/6] Reading TastyTrade credentials from Firestore...');
  let clientSecret = null, refreshToken = null;

  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const creds = brokerDoc.data()?.credentials;
      if (creds?.clientSecret && creds?.refreshToken) {
        clientSecret = creds.clientSecret;
        refreshToken = creds.refreshToken;
        console.log(`  Credentials found (user: ${userDoc.id})`);
        break;
      }
    }
    if (clientSecret) break;
  }

  if (!clientSecret) throw new Error('No TastyTrade credentials in Firestore');

  // ── Step 2: Connect TastyTrade SDK ──────────────────────────────────────────
  console.log('[2/6] Connecting to TastyTrade...');
  const client = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret,
    refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  // Set up live data stores
  const quotes = {};
  const greeks = {};
  const trades = {};
  client.quoteStreamer.addEventListener(records => {
    for (const rec of records) {
      if (rec.eventType === 'Quote')   quotes[rec.eventSymbol] = rec;
      else if (rec.eventType === 'Greeks') greeks[rec.eventSymbol] = rec;
      else if (rec.eventType === 'Trade')  trades[rec.eventSymbol] = rec;
    }
  });

  await client.quoteStreamer.connect();
  console.log('  Streamer connected');

  // Get account number
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const accountNumber = accounts[0].account['account-number'];
  console.log(`  Account: ${accountNumber}`);

  // ── Step 4: Morning snapshots ────────────────────────────────────────────────
  console.log('[3/6] Capturing morning snapshots...');

  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const morningNetLiq = parseFloat(balances['net-liquidating-value'] ?? '0');
  console.log(`  Net Liq: $${morningNetLiq.toLocaleString()}`);

  // Subscribe to VIX for price (symbol is 'VIX' in DxFeed, not '$VIX.X')
  client.quoteStreamer.subscribe(['VIX'], [MarketDataSubscriptionType.Trade, MarketDataSubscriptionType.Quote]);
  await sleep(3000);
  const vixTrade = trades['VIX'];
  const vixQuote = quotes['VIX'];
  let morningVix = parseFloat(vixTrade?.price ?? 0);
  if (!morningVix) morningVix = mid(vixQuote);
  console.log(`  VIX: ${morningVix || 'pending...'}`);

  // Firestore path: guvid-agent/agent/daily/{date}  (4 segments = valid document)
  await db.collection('guvid-agent').doc('agent').collection('daily').doc(today).set({
    morningNetLiq,
    morningVix,
    timestamp: new Date().toISOString(),
    date: today,
  }, { merge: true });
  console.log(`  Snapshot → guvid-agent/agent/daily/${today}`);

  // ── Step 5: Fetch option chains ──────────────────────────────────────────────
  console.log('[4/6] Fetching option chains (SPX, QQQ)...');

  const tickers = ['SPX', 'QQQ'];
  const chainsByTicker = {};
  const underlyingPrices = {};

  for (const ticker of tickers) {
    console.log(`  Fetching chain: ${ticker}`);
    try {
      const raw = await client.instrumentsService.getNestedOptionChain(ticker);
      chainsByTicker[ticker] = raw;
      // Try to get underlying price from market metrics
      try {
        const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: ticker });
        const item = (Array.isArray(metrics) ? metrics : metrics?.data?.items ?? [metrics])[0];
        const ivRank = parseFloat(item?.['iv-rank'] ?? item?.['implied-volatility-index-rank'] ?? 0);
        // Subscribe underlying: QQQ -> 'QQQ', SPX -> 'SPX' (both work as Trade symbols)
        const undSymbol = ticker;
        client.quoteStreamer.subscribe([undSymbol], [MarketDataSubscriptionType.Trade, MarketDataSubscriptionType.Quote]);
        underlyingPrices[ticker] = { symbol: undSymbol, ivRank };
      } catch (e) {
        underlyingPrices[ticker] = { symbol: ticker, ivRank: 0 };
      }
    } catch (e) {
      console.log(`  Warning: could not fetch chain for ${ticker}: ${e.message}`);
    }
  }

  // Wait for underlying prices to arrive via streamer
  await sleep(5000);
  for (const ticker of tickers) {
    const sym = underlyingPrices[ticker]?.symbol;
    const t = trades[sym];
    const q = quotes[sym];
    const price = parseFloat(t?.price ?? 0) || mid(q);
    underlyingPrices[ticker].price = price;
    console.log(`  ${ticker} underlying price: ${price || 'unknown'}`);
  }

  // ── Build subscription list (delta-range candidates) ────────────────────────
  console.log('[5/6] Subscribing to option strikes and waiting for greeks...');

  const now = new Date();
  const relevantExpirations = {}; // ticker -> [{expDate, dte, strikes[]}]

  for (const ticker of tickers) {
    const chain = chainsByTicker[ticker];
    if (!chain || !chain.length) continue;

    const underlying = underlyingPrices[ticker]?.price ?? 0;
    relevantExpirations[ticker] = [];

    // Combine expirations across all chain items (SPX may have SPXW + SPX)
    for (const chainItem of chain) {
      for (const exp of (chainItem.expirations ?? [])) {
        const expDate = exp['expiration-date'];
        const dte = parseInt(exp['days-to-expiration'] ?? 0);

        // Keep expirations that ANY profile might use
        if (dte < 19 || dte > 47) continue;

        const strikes = exp.strikes ?? [];
        // Pre-filter to 15% OTM window — captures delta 0.05-0.50 safely
        const filtered = strikes.filter(s => {
          if (!underlying) return true;
          const sp = parseFloat(s['strike-price']);
          const pct = Math.abs(sp - underlying) / underlying;
          return pct <= 0.15;
        });

        if (!filtered.length) continue;

        // Collect streamer symbols to subscribe
        const toSubscribe = [];
        for (const s of filtered) {
          if (s['call-streamer-symbol']) toSubscribe.push(s['call-streamer-symbol']);
          if (s['put-streamer-symbol'])  toSubscribe.push(s['put-streamer-symbol']);
        }

        if (toSubscribe.length) {
          // Subscribe in batches of 200 to avoid overwhelming
          for (let i = 0; i < toSubscribe.length; i += 200) {
            client.quoteStreamer.subscribe(
              toSubscribe.slice(i, i + 200),
              [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Greeks]
            );
          }
        }

        relevantExpirations[ticker].push({
          expDate,
          dte,
          strikes: filtered.map(s => ({
            strikePrice: parseFloat(s['strike-price']),
            callStreamerSymbol: s['call-streamer-symbol'],
            putStreamerSymbol: s['put-streamer-symbol'],
          })),
        });
      }
    }

    console.log(`  ${ticker}: ${relevantExpirations[ticker].length} expirations subscribed`);
  }

  console.log('  Waiting 12s for streamer data...');
  await sleep(12000);

  // Check VIX again after full wait
  if (!morningVix) {
    const vt = trades['VIX'];
    const vq = quotes['VIX'];
    morningVix = parseFloat(vt?.price ?? 0) || mid(vq);
    if (morningVix) {
      await db.collection('guvid-agent').doc('agent').collection('daily').doc(today).set({ morningVix }, { merge: true });
    }
  }
  console.log(`  VIX after wait: ${morningVix}`);
  console.log(`  Streamer quotes collected: ${Object.keys(quotes).length}, greeks: ${Object.keys(greeks).length}`);

  // ── Scan: build ICs per ticker per profile ───────────────────────────────────
  console.log('\n[6/6] Building Iron Condors...\n');

  const scanResults = {};
  for (const ticker of tickers) scanResults[ticker] = {};

  for (const ticker of tickers) {
    const exps = relevantExpirations[ticker] ?? [];
    const underlying = underlyingPrices[ticker]?.price ?? 0;

    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const bestByExp = [];

      for (const exp of exps) {
        if (exp.dte < profile.dteMin || exp.dte > profile.dteMax) continue;

        const best = buildBestIC(
          exp.strikes,
          { date: exp.expDate, dte: exp.dte },
          profile,
          quotes,
          greeks
        );
        if (best) bestByExp.push(best);
      }

      bestByExp.sort((a, b) => b.score - a.score);
      scanResults[ticker][profileName] = bestByExp.slice(0, 3);

      const count = scanResults[ticker][profileName].length;
      if (count) {
        const top = scanResults[ticker][profileName][0];
        console.log(`  ${ticker} [${profileName}] → $${top.credit} credit | POP ${top.pop}% | R/R ${top.rr} | EV $${top.ev} | score ${top.score}`);
        console.log(`    exp ${top.expiration?.date} (${top.expiration?.dte} DTE) | put ${top.shortPut?.strike}/${top.longPut?.strike} | call ${top.shortCall?.strike}/${top.longCall?.strike}`);
      } else {
        console.log(`  ${ticker} [${profileName}] → no qualifying ICs`);
      }
    }
  }

  // ── Save scan document ───────────────────────────────────────────────────────
  await db.collection('guvid-agent').doc('agent').collection('scans').doc(today).set({
    date: today,
    timestamp: new Date().toISOString(),
    type: 'morning',
    SPX: scanResults.SPX,
    QQQ: scanResults.QQQ,
  });
  console.log(`\n  Scan → guvid-agent/agent/scans/${today}`);

  // ── Save best ICs as positions ────────────────────────────────────────────────
  const posCol = db.collection('guvid-agent').doc('agent').collection('positions');
  let posCount = 0;
  for (const ticker of tickers) {
    for (const [profileName, ics] of Object.entries(scanResults[ticker])) {
      if (!ics.length) continue;
      const best = ics[0];
      await posCol.add({
        ticker,
        profile: profileName,
        ic: best,
        openDate: today,
        expiration: best.expiration?.date ?? null,
        credit: best.credit,
        pop: best.pop,
        ev: best.ev,
        alpha: best.alpha,
        rr: best.rr,
        wings: best.wings,
        status: 'open',
        dailyChecks: [],
        marketContext: {
          underlyingPrice: underlyingPrices[ticker]?.price ?? 0,
          vix: morningVix,
          ivRank: underlyingPrices[ticker]?.ivRank ?? 0,
        },
      });
      posCount++;
    }
  }
  console.log(`  Positions → guvid-agent/agent/positions (${posCount} docs)`);

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════');
  console.log(`MORNING SCAN COMPLETE — ${today}`);
  console.log('════════════════════════════════════════════════');
  console.log(`Net Liquidity  : $${morningNetLiq.toLocaleString()}`);
  console.log(`VIX            : ${morningVix || 'N/A'}`);
  console.log('');
  for (const ticker of tickers) {
    console.log(`── ${ticker} ──────────────────────────────────────`);
    for (const profileName of Object.keys(PROFILES)) {
      const ics = scanResults[ticker][profileName];
      if (!ics.length) { console.log(`  ${profileName.padEnd(13)}: no qualifying ICs`); continue; }
      const ic = ics[0];
      console.log(`  ${profileName.padEnd(13)}: $${ic.credit} credit | POP ${ic.pop}% | R/R ${ic.rr} | EV $${ic.ev} | score ${ic.score}`);
    }
  }
  console.log('\nFirestore:');
  console.log(`  guvid-agent/agent/daily/${today}`);
  console.log(`  guvid-agent/agent/scans/${today}`);
  console.log(`  guvid-agent/agent/positions/* (${posCount} positions)`);
  console.log('\n✓ Done\n');

  client.quoteStreamer.disconnect();
}

main()
  .catch(err => { console.error('\n[FATAL]', err?.message ?? err); process.exit(1); })
  .finally(() => setTimeout(() => process.exit(0), 1000));

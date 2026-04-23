import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase Admin Init ───────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
console.log('[Firebase] Admin initialized');

// ─── Date ──────────────────────────────────────────────────────────────────
const TODAY = new Date();
const DATE_STR = TODAY.toISOString().split('T')[0]; // YYYY-MM-DD

// ─── Profiles ─────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16,
    dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24,
    dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24,
    dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};

const TICKERS = ['SPX', 'QQQ'];
const MAX_RR = 4;
const MIN_CREDIT = 1.0;
const SPREAD_PCT = 0.08; // 8% per leg

// ─── Step 3: Read TastyTrade credentials ──────────────────────────────────
async function readCredentials() {
  console.log('[Firestore] Reading TastyTrade credentials...');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`[Firestore] Found credentials for user ${userDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No valid TastyTrade credentials found');
}

// ─── Build TastyTrade client ───────────────────────────────────────────────
function buildClient(clientSecret, refreshToken) {
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret,
    refreshToken,
    oauthScopes: ['read', 'trade'],
  });
  console.log('[TastyTrade] Client created with ProdConfig');
  return client;
}

// ─── Connect streamer ──────────────────────────────────────────────────────
async function connectStreamer(client) {
  console.log('[TastyTrade] Connecting quoteStreamer...');
  await client.quoteStreamer.connect();
  console.log('[TastyTrade] quoteStreamer connected');
}

// ─── Collect quotes+greeks from streamer ──────────────────────────────────
// Using only Quote+Greeks (2 types) to stay under the 100k subscription limit.
// SPX has 31,480 symbols × 2 = 62,960; QQQ has 10,094 × 2 = 20,188. Total ≈ 83k.
function collectData(client, symbols, waitMs = 12000) {
  return new Promise((resolve) => {
    const quotes = {};
    const greeks = {};
    const symSet = new Set(symbols);
    let recordCount = 0;

    const handler = (records) => {
      for (const record of records) {
        if (!symSet.has(record.eventSymbol)) continue;
        recordCount++;
        if (record.eventType === 'Quote') quotes[record.eventSymbol] = record;
        else if (record.eventType === 'Greeks') greeks[record.eventSymbol] = record;
      }
    };

    client.quoteStreamer.addEventListener(handler);
    client.quoteStreamer.subscribe(symbols, [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
    ]);

    setTimeout(() => {
      console.log(`  [streamer] ${recordCount} matching records (quotes=${Object.keys(quotes).length} greeks=${Object.keys(greeks).length})`);
      resolve({ quotes, greeks });
    }, waitMs);
  });
}

// ─── Collect Trade-only events (for indices: $VIX.X, $SPX.X) ──────────────
// Called separately before option subscriptions to avoid hitting the 100k limit.
function collectTrades(client, symbols, waitMs = 6000) {
  return new Promise((resolve) => {
    const trades = {};
    const symSet = new Set(symbols);

    const handler = (records) => {
      for (const record of records) {
        if (!symSet.has(record.eventSymbol)) continue;
        if (record.eventType === 'Trade' && record.price > 0) {
          trades[record.eventSymbol] = record;
        }
      }
    };

    client.quoteStreamer.addEventListener(handler);
    client.quoteStreamer.subscribe(symbols, [MarketDataSubscriptionType.Trade]);

    setTimeout(() => resolve(trades), waitMs);
  });
}

// ─── Estimate underlying price from ATM options (delta ≈ 0.50 call) ────────
// Used when index quote/trade isn't available from the streamer.
function estimateUnderlyingFromGreeks(chains, greeks) {
  let bestDelta = Infinity;
  let bestStrike = 0;

  for (const chain of chains) {
    for (const exp of chain.expirations || []) {
      for (const strike of exp.strikes || []) {
        const callSym = strike['call-streamer-symbol'];
        if (!callSym || !greeks[callSym]) continue;
        const delta = greeks[callSym].delta || 0;
        const dist = Math.abs(delta - 0.5);
        if (dist < bestDelta) {
          bestDelta = dist;
          bestStrike = parseFloat(strike['strike-price']);
        }
      }
    }
  }

  return bestStrike;
}

// ─── Get account number ────────────────────────────────────────────────────
async function getAccountNumber(client) {
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const accNum = accounts[0].account['account-number'];
  console.log(`[TastyTrade] Account: ${accNum}`);
  return accNum;
}

// ─── Get net liq ───────────────────────────────────────────────────────────
async function getNetLiq(client, accountNumber) {
  try {
    const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    const netLiq = parseFloat(balances['net-liquidating-value'] || '0');
    console.log(`[TastyTrade] Net Liquidity: $${netLiq.toFixed(2)}`);
    return netLiq;
  } catch (e) {
    console.warn('[TastyTrade] Could not fetch balances:', e.message);
    return 0;
  }
}

// ─── Fetch nested options chain ────────────────────────────────────────────
async function fetchChain(client, ticker) {
  console.log(`[TastyTrade] Fetching nested option chain for ${ticker}...`);
  const chains = await client.instrumentsService.getNestedOptionChain(ticker);
  return chains; // array of chain objects, each with .expirations
}

// ─── DTE calculation ───────────────────────────────────────────────────────
function calcDTE(expirationDate) {
  const exp = new Date(expirationDate + 'T21:00:00Z');
  const now = new Date();
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

// ─── Collect all streamer symbols from chains ──────────────────────────────
function collectAllSymbols(chains) {
  const syms = new Set();
  for (const chain of chains) {
    for (const exp of chain.expirations || []) {
      for (const strike of exp.strikes || []) {
        if (strike['call-streamer-symbol']) syms.add(strike['call-streamer-symbol']);
        if (strike['put-streamer-symbol']) syms.add(strike['put-streamer-symbol']);
      }
    }
  }
  return [...syms];
}

// ─── Build iron condors ────────────────────────────────────────────────────
function buildIronCondors(chains, quotes, greeks, underlyingPrice, profile) {
  const results = [];

  for (const chain of chains) {
    for (const exp of chain.expirations || []) {
      const expDate = exp['expiration-date'];
      const dte = calcDTE(expDate);
      if (dte < profile.dteMin || dte > profile.dteMax) continue;

      const puts = [];
      const calls = [];

      for (const strike of exp.strikes || []) {
        const strikePrice = parseFloat(strike['strike-price']);
        const putSym = strike['put-streamer-symbol'];
        const callSym = strike['call-streamer-symbol'];

        if (putSym && greeks[putSym] && quotes[putSym]) {
          const delta = Math.abs(greeks[putSym].delta || 0);
          const bid = quotes[putSym].bidPrice || 0;
          const ask = quotes[putSym].askPrice || 0;
          const mid = (bid + ask) / 2;
          if (delta >= profile.deltaMin && delta <= profile.deltaMax && mid > 0) {
            puts.push({ strikePrice, delta, mid, bid, ask, sym: putSym });
          }
        }

        if (callSym && greeks[callSym] && quotes[callSym]) {
          const delta = Math.abs(greeks[callSym].delta || 0);
          const bid = quotes[callSym].bidPrice || 0;
          const ask = quotes[callSym].askPrice || 0;
          const mid = (bid + ask) / 2;
          if (delta >= profile.deltaMin && delta <= profile.deltaMax && mid > 0) {
            calls.push({ strikePrice, delta, mid, bid, ask, sym: callSym });
          }
        }
      }

      // Sort by delta descending
      puts.sort((a, b) => b.delta - a.delta);
      calls.sort((a, b) => b.delta - a.delta);

      // Group by rounded delta bucket for symmetric pairing
      const bucketize = (opts) => {
        const groups = {};
        for (const o of opts) {
          const bucket = Math.round(Math.abs(o.delta * 100));
          if (!groups[bucket]) groups[bucket] = [];
          groups[bucket].push(o);
        }
        return Object.entries(groups)
          .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
          .map(([, arr]) => arr[0]);
      };

      const putList = bucketize(puts);
      const callList = bucketize(calls);
      const minLen = Math.min(putList.length, callList.length);

      for (let i = 0; i < minLen; i++) {
        const stoP = putList[i];
        const stoC = callList[i];
        const wings = profile.wings;

        const btoPStrike = stoP.strikePrice - wings;
        const btoCStrike = stoC.strikePrice + wings;

        let btoP = null, btoC = null;
        for (const strike of exp.strikes || []) {
          const sp = parseFloat(strike['strike-price']);
          const putSym = strike['put-streamer-symbol'];
          const callSym = strike['call-streamer-symbol'];

          if (Math.abs(sp - btoPStrike) < 0.01 && putSym && quotes[putSym]) {
            const bid = quotes[putSym].bidPrice || 0;
            const ask = quotes[putSym].askPrice || 0;
            btoP = { strikePrice: sp, mid: (bid + ask) / 2, bid, ask, sym: putSym };
          }
          if (Math.abs(sp - btoCStrike) < 0.01 && callSym && quotes[callSym]) {
            const bid = quotes[callSym].bidPrice || 0;
            const ask = quotes[callSym].askPrice || 0;
            btoC = { strikePrice: sp, mid: (bid + ask) / 2, bid, ask, sym: callSym };
          }
        }

        if (!btoP || !btoC) continue;

        // Credit
        const credit = stoP.mid + stoC.mid - btoP.mid - btoC.mid;
        if (credit < MIN_CREDIT) continue;

        // R/R
        const rr = (wings - credit) / credit;
        if (rr > MAX_RR) continue;

        // Spread quality check
        const maxSpread = underlyingPrice * SPREAD_PCT;
        const pSpread = stoP.ask - stoP.bid;
        const cSpread = stoC.ask - stoC.bid;
        if (pSpread > maxSpread || cSpread > maxSpread) continue;

        // POP = 100 - max(put delta%, call delta%)
        const putBEDelta = Math.abs(greeks[stoP.sym]?.delta || 0) * 100;
        const callBEDelta = Math.abs(greeks[stoC.sym]?.delta || 0) * 100;
        const pop = 100 - Math.max(putBEDelta, callBEDelta);
        if (pop < profile.minPOP) continue;

        // EV normalized 0-100
        const ev = Math.min((credit / wings) * 100, 100);

        // Alpha: spread quality (0-100)
        const avgSpread = (pSpread + cSpread) / 2;
        const alpha = Math.max(0, 100 - (avgSpread / underlyingPrice) * 10000);

        const score = profile.score(pop, ev, alpha);

        results.push({
          expiration: expDate,
          dte,
          shortPutStrike: stoP.strikePrice,
          longPutStrike: btoP.strikePrice,
          shortCallStrike: stoC.strikePrice,
          longCallStrike: btoC.strikePrice,
          credit: parseFloat(credit.toFixed(2)),
          rr: parseFloat(rr.toFixed(2)),
          pop: parseFloat(pop.toFixed(2)),
          ev: parseFloat(ev.toFixed(2)),
          alpha: parseFloat(alpha.toFixed(2)),
          score: parseFloat(score.toFixed(4)),
          wings,
          shortPutDelta: parseFloat(stoP.delta.toFixed(4)),
          shortCallDelta: parseFloat(stoC.delta.toFixed(4)),
        });
      }
    }
  }

  // Best per expiration
  const bestByExp = {};
  for (const ic of results) {
    if (!bestByExp[ic.expiration] || ic.score > bestByExp[ic.expiration].score) {
      bestByExp[ic.expiration] = ic;
    }
  }

  return Object.values(bestByExp).sort((a, b) => b.score - a.score);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GUVID AGENT — MORNING SCAN — ${DATE_STR}`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 3: credentials
  const { clientSecret, refreshToken } = await readCredentials();

  // Build client + connect streamer
  const client = buildClient(clientSecret, refreshToken);
  await connectStreamer(client);

  // Step 4: snapshots
  const accountNumber = await getAccountNumber(client);
  const morningNetLiq = await getNetLiq(client, accountNumber);

  // VIX: indices only emit Trade events (not Quote/Greeks) — subscribe to Trade first
  // before option subs to avoid hitting the 100k subscription limit.
  console.log('[TastyTrade] Fetching VIX via Trade event ($VIX.X)...');
  const vixTrades = await collectTrades(client, ['$VIX.X'], 6000);
  let morningVix = null;
  const vixTrade = vixTrades['$VIX.X'];
  if (vixTrade?.price > 0) {
    morningVix = parseFloat(vixTrade.price.toFixed(2));
    console.log(`[VIX] Morning VIX: ${morningVix}`);
  } else {
    console.warn('[VIX] No VIX Trade event received (market may be closed)');
  }

  // Save morning snapshot to Firestore
  // Path: collection=guvid-agent, doc=daily, subcollection=snapshots, doc=DATE_STR
  await db.collection('guvid-agent').doc('daily')
    .collection('snapshots').doc(DATE_STR)
    .set({
      morningNetLiq,
      morningVix,
      timestamp: new Date().toISOString(),
      date: DATE_STR,
    }, { merge: true });
  console.log(`[Firestore] Morning snapshot → guvid-agent/daily/snapshots/${DATE_STR}`);

  // ─── Step 5: Scan ─────────────────────────────────────────────────────
  const scanResults = {
    date: DATE_STR,
    timestamp: new Date().toISOString(),
    type: 'morning',
  };
  const positionsToSave = [];

  for (const ticker of TICKERS) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Scanning ${ticker}...`);
    scanResults[ticker] = {};

    let chains;
    try {
      chains = await fetchChain(client, ticker);
    } catch (e) {
      console.error(`[${ticker}] Chain fetch failed: ${e.message}`);
      continue;
    }
    console.log(`[${ticker}] ${chains.length} chain(s)`);

    // Underlying price — ETFs (QQQ) stream Quote; indices ($SPX.X) don't.
    // For indices, we estimate from ATM call delta after collecting option greeks.
    const underlyingStreamerSym = ticker === 'SPX' ? '$SPX.X' : ticker;
    let underlyingPrice = 0;
    if (ticker !== 'SPX') {
      console.log(`[${ticker}] Fetching underlying quote (${underlyingStreamerSym})...`);
      const { quotes: uqMap } = await collectData(client, [underlyingStreamerSym], 5000);
      const uq = uqMap[underlyingStreamerSym];
      underlyingPrice = uq ? ((uq.bidPrice || 0) + (uq.askPrice || 0)) / 2 : 0;
      console.log(`[${ticker}] Price: $${underlyingPrice.toFixed(2)}`);
    }
    // SPX price is estimated from ATM call delta after option greeks are collected (below)

    // IV Rank
    let ivRank = null;
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: ticker });
      if (Array.isArray(metrics) && metrics.length > 0) {
        ivRank = parseFloat(metrics[0]['implied-volatility-index-rank'] || '0');
        console.log(`[${ticker}] IV Rank: ${ivRank}`);
      }
    } catch (e) {
      console.warn(`[${ticker}] IV rank unavailable: ${e.message}`);
    }

    // Subscribe to all options
    const allOptionSyms = collectAllSymbols(chains);
    console.log(`[${ticker}] Subscribing to ${allOptionSyms.length} options, waiting 12s...`);
    const { quotes: optQ, greeks: optG } = await collectData(client, allOptionSyms, 12000);
    console.log(`[${ticker}] Quotes: ${Object.keys(optQ).length}, Greeks: ${Object.keys(optG).length}`);

    // For SPX: estimate underlying price from ATM call (delta ≈ 0.50) using greeks
    if (ticker === 'SPX') {
      underlyingPrice = estimateUnderlyingFromGreeks(chains, optG);
      console.log(`[SPX] Estimated underlying price from ATM call delta: $${underlyingPrice.toFixed(2)}`);
    }

    // Build ICs per profile
    for (const [profName, profile] of Object.entries(PROFILES)) {
      console.log(`[${ticker}/${profName}] Building iron condors...`);
      const ics = buildIronCondors(chains, optQ, optG, underlyingPrice, profile);
      scanResults[ticker][profName] = ics;
      console.log(`[${ticker}/${profName}] ${ics.length} qualifying IC(s)`);

      if (ics.length > 0) {
        const best = ics[0];
        console.log(`  Best: ${best.expiration} DTE=${best.dte} $${best.credit} cr  RR=${best.rr} POP=${best.pop}% Score=${best.score}`);
        positionsToSave.push({
          ticker,
          profile: profName,
          ic: best,
          openDate: DATE_STR,
          expiration: best.expiration,
          credit: best.credit,
          pop: best.pop,
          ev: best.ev,
          alpha: best.alpha,
          rr: best.rr,
          wings: best.wings,
          status: 'open',
          dailyChecks: [],
          marketContext: {
            underlyingPrice: parseFloat(underlyingPrice.toFixed(2)),
            vix: morningVix,
            ivRank,
          },
        });
      }
    }
  }

  // ─── Step 6: Save to Firestore ─────────────────────────────────────────
  console.log('\n[Firestore] Saving scan results...');
  // Path: guvid-agent (collection) / scans (doc) / daily (subcollection) / DATE_STR (doc)
  await db.collection('guvid-agent').doc('scans')
    .collection('daily').doc(DATE_STR)
    .set(scanResults);
  console.log(`[Firestore] Scan → guvid-agent/scans/daily/${DATE_STR}`);

  console.log(`[Firestore] Saving ${positionsToSave.length} position(s)...`);
  // Path: guvid-agent (collection) / positions (doc) / records (subcollection) / auto-id
  const posCol = db.collection('guvid-agent').doc('positions').collection('records');
  for (const pos of positionsToSave) {
    const docRef = await posCol.add(pos);
    console.log(`  [${pos.ticker}/${pos.profile}] → ${docRef.id}  exp=${pos.expiration}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('MORNING SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Date:          ${DATE_STR}`);
  console.log(`Net Liquidity: $${morningNetLiq.toFixed(2)}`);
  console.log(`VIX:           ${morningVix ?? 'N/A'}`);
  for (const ticker of TICKERS) {
    if (!scanResults[ticker]) continue;
    console.log(`\n${ticker}:`);
    for (const [profName, ics] of Object.entries(scanResults[ticker])) {
      const best = ics?.[0];
      if (best) {
        console.log(`  ${profName.padEnd(14)} ${best.expiration}  DTE=${String(best.dte).padStart(2)}  Credit=$${best.credit}  RR=${best.rr}  POP=${best.pop}%  Score=${best.score}`);
      } else {
        console.log(`  ${profName.padEnd(14)} No qualifying ICs`);
      }
    }
  }
  console.log(`\nPositions saved: ${positionsToSave.length}`);
  console.log('='.repeat(60));

  try { client.quoteStreamer.disconnect(); } catch (_) {}
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

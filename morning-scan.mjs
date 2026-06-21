import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastyTradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
db.settings({ preferRest: true });

const TODAY = new Date().toISOString().slice(0, 10);

// ── Helpers ──────────────────────────────────────────────────────────────────
function mid(bid, ask) {
  const b = parseFloat(bid ?? 0);
  const a = parseFloat(ask ?? 0);
  if (b <= 0 && a <= 0) return 0;
  if (b <= 0) return a;
  if (a <= 0) return b;
  return (b + a) / 2;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

// ── Step 3: TastyTrade credentials from Firestore ────────────────────────────
async function getTastyCredentials() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`Credentials found for user ${userDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ── IC Profiles ──────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

// ── Build ICs ─────────────────────────────────────────────────────────────────
// Symmetric delta pairing: group by abs(round(delta*100)) restricted to profile range,
// sort desc, pair by index.
function buildICs(strikes, quotes, greeks, profile, expDate, underlyingMid) {
  function enrich(s) {
    const q = quotes[s.streamerSymbol] || {};
    const g = greeks[s.streamerSymbol] || {};
    return {
      ...s,
      mid: mid(q.bidPrice, q.askPrice),
      bid: q.bidPrice ?? 0,
      ask: q.askPrice ?? 0,
      delta: g.delta ?? 0,
    };
  }

  // Enrich and filter — only keep legs with data AND delta in profile range
  const inRange = (delta) => {
    const d = Math.abs(delta) * 100;
    return d >= profile.deltaMin && d <= profile.deltaMax;
  };

  const puts = strikes
    .filter(s => s.optionType === 'P')
    .map(enrich)
    .filter(s => s.mid > 0 && Math.abs(s.delta) > 0 && inRange(s.delta));

  const calls = strikes
    .filter(s => s.optionType === 'C')
    .map(enrich)
    .filter(s => s.mid > 0 && Math.abs(s.delta) > 0 && inRange(s.delta));

  if (!puts.length || !calls.length) return null;

  // Group by abs(round(delta*100)), sort desc, pair by index
  function groupByDelta(legs) {
    const map = new Map();
    for (const leg of legs) {
      const key = Math.abs(Math.round(leg.delta * 100));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(leg);
    }
    return map;
  }

  const putGroups = groupByDelta(puts);
  const callGroups = groupByDelta(calls);
  const putKeys = [...putGroups.keys()].sort((a, b) => b - a);
  const callKeys = [...callGroups.keys()].sort((a, b) => b - a);

  const candidates = [];

  for (let i = 0; i < Math.min(putKeys.length, callKeys.length); i++) {
    const pKey = putKeys[i];
    const cKey = callKeys[i];

    const stoPut = putGroups.get(pKey).reduce((a, b) => a.mid > b.mid ? a : b);
    const stoCall = callGroups.get(cKey).reduce((a, b) => a.mid > b.mid ? a : b);

    const stoPutPrice = parseFloat(stoPut.strikePrice);
    const stoCallPrice = parseFloat(stoCall.strikePrice);

    // Short put must be BELOW short call (sanity check)
    if (stoPutPrice >= stoCallPrice) continue;

    // Find long legs (wings away from short strikes)
    const btoPutTarget = stoPutPrice - profile.wings;
    const btoCallTarget = stoCallPrice + profile.wings;

    // All puts/calls available as long leg candidates (not restricted to delta range)
    const allPuts = strikes
      .filter(s => s.optionType === 'P')
      .map(enrich)
      .filter(s => s.mid > 0);
    const allCalls = strikes
      .filter(s => s.optionType === 'C')
      .map(enrich)
      .filter(s => s.mid > 0);

    const btoPutCands = allPuts
      .filter(s => parseFloat(s.strikePrice) <= btoPutTarget)
      .sort((a, b) => Math.abs(parseFloat(a.strikePrice) - btoPutTarget) - Math.abs(parseFloat(b.strikePrice) - btoPutTarget));
    const btoCallCands = allCalls
      .filter(s => parseFloat(s.strikePrice) >= btoCallTarget)
      .sort((a, b) => Math.abs(parseFloat(a.strikePrice) - btoCallTarget) - Math.abs(parseFloat(b.strikePrice) - btoCallTarget));

    if (!btoPutCands.length || !btoCallCands.length) continue;

    const btoPut = btoPutCands[0];
    const btoCall = btoCallCands[0];

    const actualPutWing = stoPutPrice - parseFloat(btoPut.strikePrice);
    const actualCallWing = parseFloat(btoCall.strikePrice) - stoCallPrice;
    const actualWings = Math.min(actualPutWing, actualCallWing);
    if (actualWings <= 0) continue;

    const credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid;
    // Credit must be positive and less than wings (otherwise impossible trade)
    if (credit < profile.minCredit || credit >= actualWings) continue;

    const rr = (actualWings - credit) / credit;
    if (rr > profile.maxRR) continue;

    // Bid/ask spread check
    const sp1 = underlyingMid > 0 ? (stoPut.ask - stoPut.bid) / underlyingMid : 0;
    const sp2 = underlyingMid > 0 ? (stoCall.ask - stoCall.bid) / underlyingMid : 0;
    if (sp1 > profile.spreadPct || sp2 > profile.spreadPct) continue;

    // POP = 100 - max(|put delta|*100, |call delta|*100)
    const putBEDelta = Math.abs(stoPut.delta) * 100;
    const callBEDelta = Math.abs(stoCall.delta) * 100;
    const pop = 100 - Math.max(putBEDelta, callBEDelta);
    if (pop < profile.minPOP) continue;

    const ev = credit * (pop / 100) - (actualWings - credit) * (1 - pop / 100);
    const alpha = credit / actualWings;
    const score =
      profile.weights.pop * (pop / 100) +
      profile.weights.ev * (Math.max(0, ev) / actualWings) +
      profile.weights.alpha * alpha;

    candidates.push({
      stoPut: { symbol: stoPut.streamerSymbol, strike: stoPutPrice, mid: stoPut.mid, delta: stoPut.delta },
      stoCall: { symbol: stoCall.streamerSymbol, strike: stoCallPrice, mid: stoCall.mid, delta: stoCall.delta },
      btoPut: { symbol: btoPut.streamerSymbol, strike: parseFloat(btoPut.strikePrice), mid: btoPut.mid, delta: btoPut.delta },
      btoCall: { symbol: btoCall.streamerSymbol, strike: parseFloat(btoCall.strikePrice), mid: btoCall.mid, delta: btoCall.delta },
      credit: Math.round(credit * 100) / 100,
      rr: Math.round(rr * 100) / 100,
      pop: Math.round(pop * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      alpha: Math.round(alpha * 1000) / 1000,
      score: Math.round(score * 10000) / 10000,
      wings: actualWings,
      expiration: expDate,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID MORNING SCAN — ${TODAY} ===\n`);

  const creds = await getTastyCredentials();

  const client = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  // Accounts
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const acctList = Array.isArray(accounts) ? accounts : accounts?.items ?? [accounts];
  const acct = acctList[0];
  const accountNumber = acct?.account?.['account-number'] ?? acct?.['account-number'];
  console.log(`Account: ${accountNumber}`);

  // Step 4: Balances
  const balData = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const netLiq = parseFloat(balData?.['net-liquidating-value'] ?? 0);
  console.log(`Net Liquidity: $${netLiq.toFixed(2)}`);

  // Connect streamer
  console.log('Connecting DxLink streamer...');
  const quotes = {};
  const greeks = {};

  client.quoteStreamer.addEventListener((batch) => {
    const events = Array.isArray(batch) ? batch : [batch];
    for (const ev of events) {
      if (!ev?.eventSymbol) continue;
      if (ev.eventType === 'Quote') quotes[ev.eventSymbol] = ev;
      else if (ev.eventType === 'Greeks') greeks[ev.eventSymbol] = ev;
    }
  });

  await client.quoteStreamer.connect();
  console.log('DxLink connected.');

  // VIX — try multiple event types
  client.quoteStreamer.subscribe(['$VIX.X', 'VIX'], [MarketDataSubscriptionType.Quote]);
  await sleep(5000);

  const vixQ = quotes['$VIX.X'] ?? quotes['VIX'];
  const vix = vixQ ? Math.round(mid(vixQ.bidPrice, vixQ.askPrice) * 100) / 100 : null;
  console.log(`VIX: ${vix ?? 'n/a'}`);

  // Save snapshot
  await db.doc(`guvid-agent/daily/${TODAY}/snapshot`).set(sanitize({
    morningNetLiq: netLiq,
    morningVix: vix,
    timestamp: new Date().toISOString(),
    date: TODAY,
  }), { merge: true });
  console.log('Morning snapshot saved.');

  // Step 5: Scan SPX + QQQ
  const TICKERS = ['SPX', 'QQQ'];
  const results = {};
  const positionsToSave = [];

  for (const ticker of TICKERS) {
    console.log(`\n--- Scanning ${ticker} ---`);
    results[ticker] = { conservative: [], neutral: [], aggressive: [] };

    const apiSymbol = ticker === 'SPX' ? encodeURIComponent('/SPX') : ticker;
    // SPX streamer: 'SPX' or 'SPXW'; QQQ: 'QQQ'
    const streamerUnderlying = ticker === 'SPX' ? 'SPX' : ticker;

    let chainData;
    try {
      chainData = await client.instrumentsService.getNestedOptionChain(apiSymbol);
    } catch (e) {
      console.log(`  Chain fetch failed: ${e.message}`);
      continue;
    }

    const chainRoot = chainData?.['0'] ?? Object.values(chainData ?? {})[0] ?? {};
    const expirations = chainRoot?.expirations ?? [];
    console.log(`  ${expirations.length} expirations total`);

    // Get underlying price
    client.quoteStreamer.subscribe([streamerUnderlying], [MarketDataSubscriptionType.Quote]);
    await sleep(2000);
    const uq = quotes[streamerUnderlying];
    const underlyingMid = uq ? mid(uq.bidPrice, uq.askPrice) : 0;
    console.log(`  ${ticker} ≈ ${underlyingMid.toFixed(2)}`);

    // Build expiration map for DTE 19-47
    const expMap = new Map();
    const allSymbols = [];

    for (const exp of expirations) {
      const expDate = exp['expiration-date'];
      const dte = exp['days-to-expiration'];
      if (dte < 19 || dte > 47) continue;

      const strikesFlat = [];
      for (const strike of (exp.strikes ?? [])) {
        const sp = strike['strike-price'];
        if (strike['call-streamer-symbol']) {
          allSymbols.push(strike['call-streamer-symbol']);
          strikesFlat.push({ strikePrice: sp, optionType: 'C', streamerSymbol: strike['call-streamer-symbol'] });
        }
        if (strike['put-streamer-symbol']) {
          allSymbols.push(strike['put-streamer-symbol']);
          strikesFlat.push({ strikePrice: sp, optionType: 'P', streamerSymbol: strike['put-streamer-symbol'] });
        }
      }
      expMap.set(expDate, { dte, strikes: strikesFlat });
    }

    const dteFilteredCount = expMap.size;
    console.log(`  ${dteFilteredCount} expirations in DTE 19-47, ${allSymbols.length} symbols`);
    if (!allSymbols.length) continue;

    // Subscribe in batches of 200
    for (let i = 0; i < allSymbols.length; i += 200) {
      client.quoteStreamer.subscribe(
        allSymbols.slice(i, i + 200),
        [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Greeks]
      );
    }
    console.log(`  Waiting 12s for market data...`);
    await sleep(12000);

    // Coverage check
    let qCount = 0, gCount = 0;
    for (const sym of allSymbols) {
      if (quotes[sym]) qCount++;
      if (greeks[sym]) gCount++;
    }
    console.log(`  Data coverage: quotes=${qCount}/${allSymbols.length} greeks=${gCount}/${allSymbols.length}`);

    // Build ICs
    let icAttempts = 0;
    for (const [expDate, { dte, strikes }] of expMap) {
      for (const [profileName, profile] of Object.entries(PROFILES)) {
        if (dte < profile.dteMin || dte > profile.dteMax) continue;
        icAttempts++;
        const best = buildICs(strikes, quotes, greeks, profile, expDate, underlyingMid);
        if (best) {
          best.dte = dte;
          results[ticker][profileName].push(best);
          console.log(`  [${profileName}] ${expDate} DTE=${dte}: credit=$${best.credit} POP=${best.pop}% RR=${best.rr} score=${best.score}`);
        }
      }
    }
    console.log(`  IC attempts: ${icAttempts}`);

    for (const pName of Object.keys(PROFILES)) {
      results[ticker][pName].sort((a, b) => b.score - a.score);
    }

    for (const [pName, ics] of Object.entries(results[ticker])) {
      for (const ic of ics.slice(0, 3)) {
        positionsToSave.push(sanitize({
          ticker, profile: pName, ic,
          openDate: TODAY, expiration: ic.expiration,
          credit: ic.credit, pop: ic.pop, ev: ic.ev, alpha: ic.alpha, rr: ic.rr, wings: ic.wings,
          status: 'open', dailyChecks: [],
          marketContext: { underlyingPrice: underlyingMid, vix, ivRank: null },
        }));
      }
    }
  }

  // Step 6: Persist to Firestore
  console.log('\nSaving to Firestore...');
  await db.doc(`guvid-agent/scans/${TODAY}/morning`).set(sanitize({
    date: TODAY, timestamp: new Date().toISOString(), type: 'morning',
    SPX: results['SPX'], QQQ: results['QQQ'],
  }));
  console.log(`Scan → guvid-agent/scans/${TODAY}/morning`);

  for (const pos of positionsToSave) {
    await db.collection('guvid-agent').doc('positions').collection('all').add(pos);
  }
  console.log(`${positionsToSave.length} position candidates saved.`);

  // Summary
  console.log('\n========= MORNING SCAN SUMMARY =========');
  console.log(`Date:     ${TODAY}`);
  console.log(`Net Liq:  $${netLiq.toFixed(2)}`);
  console.log(`VIX:      ${vix ?? 'n/a'}`);
  for (const ticker of TICKERS) {
    console.log(`\n${ticker}:`);
    for (const [pName, ics] of Object.entries(results[ticker])) {
      const best = ics[0];
      if (best) {
        console.log(`  ${pName.padEnd(13)}: ${ics.length} IC(s) | ${best.expiration} DTE=${best.dte} credit=$${best.credit} POP=${best.pop}% RR=${best.rr} score=${best.score}`);
      } else {
        console.log(`  ${pName.padEnd(13)}: no candidates`);
      }
    }
  }
  console.log('\n=========================================\n');

  client.quoteStreamer.disconnect();
  await admin.app().delete();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err.message ?? err);
  process.exit(1);
});

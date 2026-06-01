import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ── Firebase ───────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function dte(expStr) {
  const exp = new Date(expStr + 'T16:00:00-05:00');
  return Math.round((exp - Date.now()) / 86400000);
}

// ── Profiles ───────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25
  }
};

// ── Read Firestore credentials (find first user with valid OAuth token) ────
async function readCredentials() {
  console.log('Step 3: Reading TastyTrade credentials from Firestore…');
  const usersSnap = await db.collection('users').get();
  const candidates = [];

  for (const userDoc of usersSnap.docs) {
    const ud = userDoc.data();
    if (ud.clientSecret && ud.refreshToken) {
      candidates.push({ userId: userDoc.id, clientSecret: ud.clientSecret, refreshToken: ud.refreshToken });
    }
  }

  console.log(`  ${candidates.length} users with credentials, probing for valid token…`);
  for (const cred of candidates) {
    try {
      const testClient = new TastytradeClient({
        ...TastytradeClient.ProdConfig,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
        oauthScopes: ['read', 'trade']
      });
      const accts = await testClient.accountsAndCustomersService.getCustomerAccounts();
      const list = accts?.items || (Array.isArray(accts) ? accts : []);
      if (list.length) {
        const accountNumber = list[0]?.['account-number'] || list[0]?.account?.['account-number'];
        console.log(`  Valid credentials: users/${cred.userId} → account ${accountNumber}`);
        return { ...cred, accountNumber };
      }
    } catch {}
  }
  throw new Error('No valid TastyTrade credentials found in Firestore');
}

// ── Stream data helper: Quote + Greeks + Trade ──────────────────────────────
// The DxLink feed calls listener with an ARRAY of events on each batch
async function streamData(quoteStreamer, symbols, waitMs, types = null) {
  const quotes = {};
  const greeks = {};
  const trades = {};

  const listener = (records) => {
    for (const event of records) {
      const sym = event.eventSymbol;
      if (!sym) continue;
      if (event.eventType === 'Quote') {
        const bid = event.bidPrice ?? event.bid ?? NaN;
        const ask = event.askPrice ?? event.ask ?? NaN;
        if (!isNaN(bid) && !isNaN(ask) && bid > 0) {
          quotes[sym] = { bid, ask, mid: (bid + ask) / 2 };
        }
      } else if (event.eventType === 'Greeks') {
        greeks[sym] = {
          delta: event.delta ?? 0,
          theta: event.theta ?? 0,
          vega: event.vega ?? 0,
          gamma: event.gamma ?? 0
        };
      } else if (event.eventType === 'Trade') {
        const price = event.price ?? NaN;
        if (!isNaN(price) && price > 0) trades[sym] = { price };
      }
    }
  };

  const subTypes = types ?? [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Greeks, MarketDataSubscriptionType.Trade];
  const removeListener = quoteStreamer.addEventListener(listener);
  quoteStreamer.subscribe(symbols, subTypes);
  await sleep(waitMs);
  removeListener();
  quoteStreamer.unsubscribe(symbols);

  return { quotes, greeks, trades };
}

// ── Build best Iron Condor for one expiration ─────────────────────────────
function buildBestIC(expiration, strikesData, quotes, greeks, profile, underlyingMid) {
  const { deltaMin, deltaMax, wings, minPOP, maxRR, minCredit, score } = profile;

  const options = [];
  for (const s of strikesData) {
    const callSym = s.callStreamerSymbol;
    const putSym = s.putStreamerSymbol;
    const callQ = quotes[callSym];
    const putQ = quotes[putSym];
    const callG = greeks[callSym];
    const putG = greeks[putSym];

    if (callQ && callG) {
      options.push({ type: 'C', sym: callSym, strikePrice: s.strikePrice, mid: callQ.mid, bid: callQ.bid, ask: callQ.ask, delta: Math.abs(callG.delta) });
    }
    if (putQ && putG) {
      options.push({ type: 'P', sym: putSym, strikePrice: s.strikePrice, mid: putQ.mid, bid: putQ.bid, ask: putQ.ask, delta: Math.abs(putG.delta) });
    }
  }

  const puts = options.filter(o => o.type === 'P' && o.delta >= deltaMin && o.delta <= deltaMax);
  const calls = options.filter(o => o.type === 'C' && o.delta >= deltaMin && o.delta <= deltaMax);

  const putMap = new Map();
  for (const o of puts) {
    const key = Math.round(o.delta * 100);
    if (!putMap.has(key) || o.delta > putMap.get(key).delta) putMap.set(key, o);
  }
  const callMap = new Map();
  for (const o of calls) {
    const key = Math.round(o.delta * 100);
    if (!callMap.has(key) || o.delta > callMap.get(key).delta) callMap.set(key, o);
  }

  const commonKeys = [...putMap.keys()].filter(k => callMap.has(k)).sort((a, b) => b - a);
  const candidates = [];

  for (const key of commonKeys) {
    const stoPut = putMap.get(key);
    const stoCall = callMap.get(key);

    const btoPutTargetPrice = stoPut.strikePrice - wings;
    const btoCallTargetPrice = stoCall.strikePrice + wings;

    const allPuts = options.filter(o => o.type === 'P');
    const allCalls = options.filter(o => o.type === 'C');

    const btoPut = allPuts
      .filter(o => o.strikePrice < stoPut.strikePrice)
      .sort((a, b) => Math.abs(a.strikePrice - btoPutTargetPrice) - Math.abs(b.strikePrice - btoPutTargetPrice))[0];
    const btoCall = allCalls
      .filter(o => o.strikePrice > stoCall.strikePrice)
      .sort((a, b) => Math.abs(a.strikePrice - btoCallTargetPrice) - Math.abs(b.strikePrice - btoCallTargetPrice))[0];

    if (!btoPut || !btoCall) continue;
    if (!quotes[btoPut.sym] || !quotes[btoCall.sym]) continue;

    const qBtoPut = quotes[btoPut.sym];
    const qBtoCall = quotes[btoCall.sym];

    const credit = stoPut.mid + stoCall.mid - qBtoPut.mid - qBtoCall.mid;
    if (credit < minCredit) continue;

    const actualWings = Math.min(
      Math.abs(stoPut.strikePrice - btoPut.strikePrice),
      Math.abs(btoCall.strikePrice - stoCall.strikePrice)
    );
    if (actualWings <= 0) continue;

    const rr = (actualWings - credit) / credit;
    if (rr > maxRR || rr < 0) continue;

    const pop = 100 - Math.max(stoPut.delta, stoCall.delta) * 100;
    if (pop < minPOP) continue;

    const maxLoss = actualWings - credit;
    const ev = ((pop / 100) * credit) - ((1 - pop / 100) * maxLoss);
    const evNorm = Math.min(100, Math.max(0, (ev / credit) * 100));
    const alpha = underlyingMid > 0 ? Math.min(100, (credit / underlyingMid) * 10000) : 0;
    const scoreVal = score(pop, evNorm, alpha);

    candidates.push({
      score: scoreVal,
      pop: Math.round(pop * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      rr: Math.round(rr * 100) / 100,
      wings: actualWings,
      ev: Math.round(evNorm * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      expiration,
      putSpread: {
        short: { symbol: stoPut.sym, strike: stoPut.strikePrice, delta: stoPut.delta, mid: stoPut.mid },
        long: { symbol: btoPut.sym, strike: btoPut.strikePrice, delta: btoPut.delta, mid: qBtoPut.mid }
      },
      callSpread: {
        short: { symbol: stoCall.sym, strike: stoCall.strikePrice, delta: stoCall.delta, mid: stoCall.mid },
        long: { symbol: btoCall.sym, strike: btoCall.strikePrice, delta: btoCall.delta, mid: qBtoCall.mid }
      }
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  GUVID MORNING SCAN — ${TODAY} 10:30 ET`);
  console.log(`${'='.repeat(60)}\n`);

  const creds = await readCredentials();
  console.log(`  User: ${creds.userId}\n`);

  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade']
  });

  const accountNumber = creds.accountNumber;
  console.log(`  Account: ${accountNumber}`);

  // Step 4
  console.log('\nStep 4: Morning snapshot…');
  const balData = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const morningNetLiq = parseFloat(
    balData?.['net-liquidating-value'] ?? balData?.['net-liq-value'] ?? 0
  );
  console.log(`  Net Liq: $${morningNetLiq.toFixed(2)}`);

  console.log('  Connecting DxLink streamer…');
  await client.quoteStreamer.connect();
  console.log('  Streamer connected');

  console.log('  Streaming VIX (8s)…');
  // VIX streams as a Trade event on symbol 'VIX', not a Quote
  const { trades: vixT } = await streamData(client.quoteStreamer, ['VIX'], 8000, [MarketDataSubscriptionType.Trade]);
  const vixMid = vixT['VIX']?.price ?? null;
  console.log(`  VIX: ${vixMid != null ? vixMid.toFixed(2) : 'N/A'}`);

  await db.collection('guvid-agent').doc('daily').collection(TODAY).doc('morning').set({
    morningNetLiq, morningVix: vixMid, timestamp: new Date().toISOString(), date: TODAY
  });
  console.log('  Snapshot saved');

  // Step 5
  console.log('\nStep 5: Scanning SPX + QQQ…');
  const TICKERS = ['SPX', 'QQQ'];
  const scanResults = {};
  const underlyingPrices = {};

  for (const ticker of TICKERS) {
    console.log(`\n  ── ${ticker} ──`);
    scanResults[ticker] = {};

    // SPX uses 'SPX' for Trade, QQQ uses 'QQQ' — both have Trade prices
    const undSym = ticker;
    console.log(`  Underlying price (6s)…`);
    const { trades: undT } = await streamData(client.quoteStreamer, [undSym], 6000, [MarketDataSubscriptionType.Trade]);
    const underlyingMid = undT[undSym]?.price ?? 0;
    underlyingPrices[ticker] = underlyingMid;
    console.log(`  ${ticker} = $${underlyingMid.toFixed(2)}`);

    console.log('  Fetching nested option chain…');
    const nestedChain = await client.instrumentsService.getNestedOptionChain(ticker);
    const chainArr = Array.isArray(nestedChain) ? nestedChain : [nestedChain];

    const allExpirations = [];
    for (const chain of chainArr) {
      for (const exp of (chain.expirations || [])) {
        const expDate = exp['expiration-date'];
        const d = dte(expDate);
        if (d >= 19 && d <= 47) {
          allExpirations.push({ expDate, d, strikes: exp.strikes || [] });
        }
      }
    }
    allExpirations.sort((a, b) => a.d - b.d);
    console.log(`  ${allExpirations.length} expirations in DTE 19-47`);

    for (const profileName of ['conservative', 'neutral', 'aggressive']) {
      const profile = PROFILES[profileName];
      const bestPerExp = [];
      const validExps = allExpirations.filter(e => e.d >= profile.dteMin && e.d <= profile.dteMax).slice(0, 4);
      console.log(`\n  [${profileName}] ${validExps.length} expirations`);

      for (const { expDate, d, strikes } of validExps) {
        console.log(`    ${expDate} DTE=${d} (${strikes.length} strikes)`);

        const syms = [];
        for (const s of strikes) {
          if (s['call-streamer-symbol']) syms.push(s['call-streamer-symbol']);
          if (s['put-streamer-symbol']) syms.push(s['put-streamer-symbol']);
        }
        const uniqSyms = [...new Set(syms)];
        if (!uniqSyms.length) { console.log('      no streamer symbols'); continue; }

        console.log(`      ${uniqSyms.length} symbols, streaming 12s…`);
        const { quotes: optQ, greeks: optG } = await streamData(client.quoteStreamer, uniqSyms, 12000);
        console.log(`      quotes=${Object.keys(optQ).length} greeks=${Object.keys(optG).length}`);

        const strikesData = strikes.map(s => ({
          strikePrice: parseFloat(s['strike-price']),
          callStreamerSymbol: s['call-streamer-symbol'],
          putStreamerSymbol: s['put-streamer-symbol']
        }));

        const best = buildBestIC(expDate, strikesData, optQ, optG, profile, underlyingMid);
        if (best) {
          console.log(`      ✓ credit=$${best.credit} RR=${best.rr} POP=${best.pop}% score=${best.score.toFixed(1)}`);
          bestPerExp.push(best);
        } else {
          console.log(`      no qualifying IC`);
        }
      }

      bestPerExp.sort((a, b) => b.score - a.score);
      scanResults[ticker][profileName] = bestPerExp;
    }
  }

  // Step 6
  console.log('\nStep 6: Saving to Firestore…');
  await db.collection('guvid-agent').doc('scans').collection(TODAY).doc('morning').set({
    date: TODAY, timestamp: new Date().toISOString(), type: 'morning',
    SPX: scanResults['SPX'], QQQ: scanResults['QQQ']
  });

  const positionsCol = db.collection('guvid-agent').doc('data').collection('positions');
  let saved = 0;
  for (const ticker of TICKERS) {
    for (const profileName of ['conservative', 'neutral', 'aggressive']) {
      const ics = scanResults[ticker][profileName] || [];
      if (!ics.length) continue;
      const best = ics[0];
      await positionsCol.add({
        ticker, profile: profileName, ic: best,
        openDate: TODAY, expiration: best.expiration,
        credit: best.credit, pop: best.pop, ev: best.ev,
        alpha: best.alpha, rr: best.rr, wings: best.wings,
        status: 'open', dailyChecks: [],
        marketContext: { underlyingPrice: underlyingPrices[ticker] || 0, vix: vixMid, ivRank: null }
      });
      saved++;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  MORNING SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Date:     ${TODAY}`);
  console.log(`  Net Liq:  $${morningNetLiq.toFixed(2)}`);
  console.log(`  VIX:      ${vixMid != null ? vixMid.toFixed(2) : 'N/A'}`);
  console.log('');

  for (const ticker of TICKERS) {
    const undStr = underlyingPrices[ticker] ? `$${underlyingPrices[ticker].toFixed(2)}` : 'N/A';
    console.log(`  ${ticker} (${undStr}):`);
    for (const p of ['conservative', 'neutral', 'aggressive']) {
      const ics = scanResults[ticker][p] || [];
      if (ics.length) {
        const b = ics[0];
        console.log(`    ${p.padEnd(13)}: ${ics.length} IC(s)  credit=$${b.credit}  RR=${b.rr}  POP=${b.pop}%  DTE=${dte(b.expiration)}  score=${b.score.toFixed(1)}`);
        console.log(`                 put:  short $${b.putSpread.short.strike} / long $${b.putSpread.long.strike}`);
        console.log(`                 call: short $${b.callSpread.short.strike} / long $${b.callSpread.long.strike}`);
      } else {
        console.log(`    ${p.padEnd(13)}: no qualifying ICs`);
      }
    }
  }

  console.log(`\n  Positions saved: ${saved}`);
  console.log(`  guvid-agent/daily/${TODAY}/morning`);
  console.log(`  guvid-agent/scans/${TODAY}/morning`);
  console.log(`  guvid-agent/data/positions/* (${saved} docs)`);
  console.log(`${'='.repeat(60)}\n`);

  client.quoteStreamer.disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('\nFATAL:', e.message || e);
  console.error(e.stack);
  process.exit(1);
});

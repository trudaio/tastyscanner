import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Step 3: Read TastyTrade credentials from Firestore ──────────────────────
console.log('[1/6] Reading credentials from Firestore...');
const usersSnap = await db.collection('users').get();
if (usersSnap.empty) throw new Error('No users found');

let clientSecret = null;
let refreshToken = null;
let foundUserId = null;

for (const userDoc of usersSnap.docs) {
  const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
  for (const brokerDoc of brokerSnap.docs) {
    const data = brokerDoc.data();
    const creds = data?.credentials;
    if (creds?.clientSecret && creds?.refreshToken) {
      clientSecret = creds.clientSecret;
      refreshToken = creds.refreshToken;
      foundUserId = userDoc.id;
      break;
    }
  }
  if (clientSecret) break;
}

if (!clientSecret || !refreshToken) throw new Error('No TastyTrade credentials found in Firestore');
console.log(`    User: ${foundUserId}`);

// ─── TastyTrade session ───────────────────────────────────────────────────────
console.log('[2/6] Creating TastyTrade session...');
const client = new TastytradeClient({
  ...TastytradeClient.ProdConfig,
  clientSecret,
  refreshToken,
  oauthScopes: ['read', 'trade'],
});
await client.sessionService.validate();
console.log('    Session validated');

const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
const accountNumber = accounts[0]?.account?.['account-number'];
if (!accountNumber) throw new Error('No account found');
console.log(`    Account: ${accountNumber}`);

// ─── Step 4: Capture morning snapshot ────────────────────────────────────────
console.log('[3/6] Fetching morning data...');
const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
const morningNetLiq = parseFloat(balances['net-liquidating-value'] || '0');
console.log(`    Net Liq: $${morningNetLiq.toLocaleString()}`);

// ─── Fetch IV ranks ───────────────────────────────────────────────────────────
const TICKERS = ['SPX', 'QQQ'];
const metricsRaw = await client.marketMetricsService.getMarketMetrics({ symbols: TICKERS.join(',') });
const ivRankByTicker = {};
if (Array.isArray(metricsRaw)) {
  for (const m of metricsRaw) {
    ivRankByTicker[m.symbol] = parseFloat(m['implied-volatility-index-rank'] || '0') * 100;
  }
}
console.log('    IV Ranks:', ivRankByTicker);

// ─── Fetch option chains ──────────────────────────────────────────────────────
console.log('[4/6] Fetching option chains + streaming quotes/greeks...');

const chainData = {};
const allStreamerSymbols = ['$VIX.X'];
const underlyingStreamerMap = { SPX: '$SPX.X', QQQ: 'QQQ' };

for (const ticker of TICKERS) {
  console.log(`    Chain: ${ticker}...`);
  const chains = await client.instrumentsService.getNestedOptionChain(ticker);
  chainData[ticker] = chains;

  const underlyingSym = underlyingStreamerMap[ticker];
  if (!allStreamerSymbols.includes(underlyingSym)) allStreamerSymbols.push(underlyingSym);

  const today = new Date();
  for (const chain of chains) {
    for (const exp of (chain.expirations || [])) {
      const expDate = exp['expiration-date'];
      const dteVal = Math.round((new Date(expDate + 'T16:00:00') - today) / 86400000);
      if (dteVal < 19 || dteVal > 47) continue;
      for (const strike of (exp.strikes || [])) {
        if (strike['call-streamer-symbol']) allStreamerSymbols.push(strike['call-streamer-symbol']);
        if (strike['put-streamer-symbol']) allStreamerSymbols.push(strike['put-streamer-symbol']);
      }
    }
  }
  console.log(`    ${ticker}: ${chains.length} chain(s), ${allStreamerSymbols.length} symbols total`);
}

// ─── Stream via quoteStreamer ─────────────────────────────────────────────────
const streamedData = {}; // sym -> { bid, ask, mid, delta, theta, gamma, vega }

client.quoteStreamer.addEventListener((records) => {
  for (const record of records) {
    const sym = record.eventSymbol;
    if (!sym) continue;
    if (!streamedData[sym]) streamedData[sym] = {};

    if (record.eventType === 'Quote') {
      const bid = parseFloat(record.bidPrice) || 0;
      const ask = parseFloat(record.askPrice) || 0;
      streamedData[sym].bid = bid;
      streamedData[sym].ask = ask;
      streamedData[sym].mid = (bid + ask) / 2;
    } else if (record.eventType === 'Greeks') {
      streamedData[sym].delta = parseFloat(record.delta) || 0;
      streamedData[sym].theta = parseFloat(record.theta) || 0;
      streamedData[sym].gamma = parseFloat(record.gamma) || 0;
      streamedData[sym].vega = parseFloat(record.vega) || 0;
      // Use theoretical price as mid fallback when no live quote arrives
      const greekPrice = parseFloat(record.price) || 0;
      if (greekPrice > 0 && !streamedData[sym].mid) {
        streamedData[sym].mid = greekPrice;
      }
    }
  }
});

await client.quoteStreamer.connect();
client.quoteStreamer.subscribe(allStreamerSymbols, [
  MarketDataSubscriptionType.Quote,
  MarketDataSubscriptionType.Greeks,
]);

console.log('    Waiting 12s for data...');
await new Promise(r => setTimeout(r, 12000));
client.quoteStreamer.disconnect();

const morningVix = streamedData['$VIX.X']?.mid ?? null;
console.log(`    VIX mid: ${morningVix?.toFixed(2) ?? 'N/A'}`);
console.log(`    Symbols with data: ${Object.keys(streamedData).length}`);

// ─── Save snapshot ────────────────────────────────────────────────────────────
await db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot').set({
  morningNetLiq,
  morningVix,
  timestamp: new Date().toISOString(),
  date: TODAY,
});
console.log('    Snapshot saved');

// ─── Step 5: Build Iron Condors ───────────────────────────────────────────────
console.log('[5/6] Building iron condors...');

const profiles = {
  conservative: { deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47, wings: 10, minPOP: 80, weights: { pop: 0.70, ev: 0.20, alpha: 0.10 } },
  neutral:       { deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47, wings: 10, minPOP: 60, weights: { pop: 0.60, ev: 0.25, alpha: 0.15 } },
  aggressive:    { deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35, wings: 5,  minPOP: 60, weights: { pop: 0.40, ev: 0.35, alpha: 0.25 } },
};
const MIN_CREDIT = 1.0;
const MAX_RR = 4.0;

function calcDte(expDate) {
  return Math.round((new Date(expDate + 'T16:00:00') - new Date()) / 86400000);
}

function buildICsForTicker(ticker, chains) {
  const results = { conservative: [], neutral: [], aggressive: [] };
  const ivRank = ivRankByTicker[ticker] || 50;
  const underlyingSym = underlyingStreamerMap[ticker];
  const actualPrice = streamedData[underlyingSym]?.mid || 0;

  for (const chain of chains) {
    for (const exp of (chain.expirations || [])) {
      const expDate = exp['expiration-date'];
      const d = calcDte(expDate);
      const strikes = exp.strikes || [];

      for (const [profileName, profile] of Object.entries(profiles)) {
        if (d < profile.dteMin || d > profile.dteMax) continue;

        const puts = [];
        const calls = [];

        for (const strike of strikes) {
          const strikePrice = parseFloat(strike['strike-price']);
          const putSym = strike['put-streamer-symbol'];
          const callSym = strike['call-streamer-symbol'];

          if (putSym && streamedData[putSym]?.mid > 0) {
            const sd = streamedData[putSym];
            const absDelta = Math.abs(sd.delta || 0) * 100;
            if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
              puts.push({ sym: putSym, strikePrice, delta: sd.delta, mid: sd.mid, theta: sd.theta });
            }
          }

          if (callSym && streamedData[callSym]?.mid > 0) {
            const sd = streamedData[callSym];
            const absDelta = Math.abs(sd.delta || 0) * 100;
            if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
              calls.push({ sym: callSym, strikePrice, delta: sd.delta, mid: sd.mid, theta: sd.theta });
            }
          }
        }

        if (!puts.length || !calls.length) continue;

        // Symmetric delta pairing: sort desc by abs delta, pair by index
        const putsSorted = [...puts].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const callsSorted = [...calls].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const pairCount = Math.min(putsSorted.length, callsSorted.length);

        const candidates = [];
        for (let i = 0; i < pairCount; i++) {
          const stoPut = putsSorted[i];
          const stoCall = callsSorted[i];

          // Sanity: put strike below spot, call strike above spot
          if (actualPrice > 0) {
            if (stoPut.strikePrice >= actualPrice) continue;
            if (stoCall.strikePrice <= actualPrice) continue;
          }

          // Wing legs: find nearest strike at +/- wings distance
          const btoPutTarget = stoPut.strikePrice - profile.wings;
          const btoCallTarget = stoCall.strikePrice + profile.wings;

          const btoPutStrike = strikes.reduce((best, s) => {
            const sp = parseFloat(s['strike-price']);
            const bestSp = best ? parseFloat(best['strike-price']) : Infinity;
            return Math.abs(sp - btoPutTarget) < Math.abs(bestSp - btoPutTarget) ? s : best;
          }, null);
          const btoCallStrike = strikes.reduce((best, s) => {
            const sp = parseFloat(s['strike-price']);
            const bestSp = best ? parseFloat(best['strike-price']) : Infinity;
            return Math.abs(sp - btoCallTarget) < Math.abs(bestSp - btoCallTarget) ? s : best;
          }, null);

          if (!btoPutStrike || !btoCallStrike) continue;
          if (Math.abs(parseFloat(btoPutStrike['strike-price']) - btoPutTarget) > profile.wings * 0.6) continue;
          if (Math.abs(parseFloat(btoCallStrike['strike-price']) - btoCallTarget) > profile.wings * 0.6) continue;

          const btoPutSym = btoPutStrike['put-streamer-symbol'];
          const btoCallSym = btoCallStrike['call-streamer-symbol'];
          if (!btoPutSym || !btoCallSym) continue;
          if (!streamedData[btoPutSym] || !streamedData[btoCallSym]) continue;

          const btoPutMid = streamedData[btoPutSym]?.mid || 0;
          const btoCallMid = streamedData[btoCallSym]?.mid || 0;

          const credit = stoPut.mid + stoCall.mid - btoPutMid - btoCallMid;
          if (credit < MIN_CREDIT) continue;

          const rr = (profile.wings - credit) / credit;
          if (rr > MAX_RR || rr < 0) continue;

          // POP = 100 - max(putBEDelta, callBEDelta)
          const putBEDelta = Math.abs(stoPut.delta || 0) * 100;
          const callBEDelta = Math.abs(stoCall.delta || 0) * 100;
          const pop = 100 - Math.max(putBEDelta, callBEDelta);
          if (pop < profile.minPOP) continue;

          const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
          const alpha = (credit / profile.wings) * (ivRank / 100);
          const w = profile.weights;
          const score = (pop / 100) * w.pop + ev * w.ev + alpha * w.alpha;

          candidates.push({
            expiration: expDate,
            dte: d,
            ticker,
            profile: profileName,
            stoPut: { sym: stoPut.sym, strike: stoPut.strikePrice, mid: Math.round(stoPut.mid * 100) / 100, delta: Math.round(stoPut.delta * 1000) / 1000 },
            stoCall: { sym: stoCall.sym, strike: stoCall.strikePrice, mid: Math.round(stoCall.mid * 100) / 100, delta: Math.round(stoCall.delta * 1000) / 1000 },
            btoPut: { sym: btoPutSym, strike: parseFloat(btoPutStrike['strike-price']), mid: Math.round(btoPutMid * 100) / 100 },
            btoCall: { sym: btoCallSym, strike: parseFloat(btoCallStrike['strike-price']), mid: Math.round(btoCallMid * 100) / 100 },
            credit: Math.round(credit * 100) / 100,
            rr: Math.round(rr * 100) / 100,
            pop: Math.round(pop * 100) / 100,
            ev: Math.round(ev * 100) / 100,
            alpha: Math.round(alpha * 1000) / 1000,
            score: Math.round(score * 10000) / 10000,
            wings: profile.wings,
            ivRank,
            underlyingPrice: Math.round(actualPrice * 100) / 100,
          });
        }

        // Pick best per expiration (highest score)
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          const best = candidates[0];
          if (!results[profileName].find(r => r.expiration === expDate)) {
            results[profileName].push(best);
          }
        }
      }
    }
  }

  for (const profile of Object.keys(results)) {
    results[profile].sort((a, b) => b.score - a.score);
    results[profile] = results[profile].slice(0, 5);
  }
  return results;
}

const scanResults = {};
for (const ticker of TICKERS) {
  if (!chainData[ticker]) continue;
  scanResults[ticker] = buildICsForTicker(ticker, chainData[ticker]);
  for (const [profile, ics] of Object.entries(scanResults[ticker])) {
    console.log(`    ${ticker}/${profile}: ${ics.length} IC(s)${ics.length > 0 ? ` | best: exp=${ics[0].expiration} credit=$${ics[0].credit} POP=${ics[0].pop}% score=${ics[0].score}` : ''}`);
  }
}

// ─── Step 6: Save to Firestore ────────────────────────────────────────────────
console.log('[6/6] Saving to Firestore...');

await db.collection('guvid-agent').doc('scans').collection(TODAY).doc('morning').set({
  date: TODAY,
  timestamp: new Date().toISOString(),
  type: 'morning',
  SPX: scanResults['SPX'] || {},
  QQQ: scanResults['QQQ'] || {},
});
console.log('    Scan saved to guvid-agent/scans/' + TODAY + '/morning');

const positionsRef = db.collection('guvid-agent').doc('positions').collection('open');
const saves = [];
for (const ticker of TICKERS) {
  if (!scanResults[ticker]) continue;
  for (const [profileName, ics] of Object.entries(scanResults[ticker])) {
    if (!ics.length) continue;
    const ic = ics[0];
    saves.push(positionsRef.add({
      ticker,
      profile: profileName,
      ic,
      openDate: TODAY,
      expiration: ic.expiration,
      credit: ic.credit,
      pop: ic.pop,
      ev: ic.ev,
      alpha: ic.alpha,
      rr: ic.rr,
      wings: ic.wings,
      status: 'open',
      dailyChecks: [],
      marketContext: {
        underlyingPrice: ic.underlyingPrice,
        vix: morningVix,
        ivRank: ic.ivRank,
      },
    }));
  }
}
await Promise.all(saves);
console.log(`    ${saves.length} position candidate(s) saved`);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════');
console.log(`  MORNING SCAN SUMMARY — ${TODAY} (10:30 AM ET)`);
console.log('════════════════════════════════════════════════════');
console.log(`  Net Liq : $${morningNetLiq.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  VIX     : ${morningVix?.toFixed(2) ?? 'N/A'}`);
console.log('');
for (const ticker of TICKERS) {
  if (!scanResults[ticker]) continue;
  console.log(`  ── ${ticker} ────────────────────────────────────`);
  for (const [profile, ics] of Object.entries(scanResults[ticker])) {
    if (!ics.length) {
      console.log(`    ${profile.padEnd(13)}: no candidates`);
    } else {
      const ic = ics[0];
      console.log(`    ${profile.padEnd(13)}: ${ic.expiration} (${ic.dte}d) | $${ic.credit} cr | POP ${ic.pop}% | R/R ${ic.rr} | score ${ic.score}`);
      console.log(`                   put: ${ic.btoPut.strike}/${ic.stoPut.strike}  call: ${ic.stoCall.strike}/${ic.btoCall.strike}`);
    }
  }
}
console.log('════════════════════════════════════════════════════');

process.exit(0);

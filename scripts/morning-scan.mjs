/**
 * Guvid Agent — Morning Scan
 * Runs at 10:30 AM ET (1h after market open)
 */

// Polyfill WebSocket for Node.js (required by @dxfeed/dxlink-websocket-client)
import { WebSocket as WsWebSocket } from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WsWebSocket;
}

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16,
    dteMin: 30, dteMax: 47,
    wings: 10,
    minPOP: 80,
    maxRR: 4,
    minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24,
    dteMin: 19, dteMax: 47,
    wings: 10,
    minPOP: 60,
    maxRR: 4,
    minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24,
    dteMin: 19, dteMax: 35,
    wings: 5,
    minPOP: 60,
    maxRR: 4,
    minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};

const TICKERS = ['SPX', 'QQQ'];
const SPREAD_PCT = 0.08; // 8% max spread per leg

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcDTE(expirationDate) {
  const exp = new Date(expirationDate + 'T16:00:00');
  const now = new Date();
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

function mid(bid, ask) {
  const b = parseFloat(bid ?? 0);
  const a = parseFloat(ask ?? 0);
  if (b <= 0 || a <= 0) return 0;
  return (b + a) / 2;
}

function spreadOk(bid, ask) {
  const b = parseFloat(bid ?? 0);
  const a = parseFloat(ask ?? 0);
  if (b <= 0 || a <= 0) return false;
  return (a - b) / b <= SPREAD_PCT;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Read TastyTrade credentials from Firestore ───────────────────────────────
async function loadTastyCredentials() {
  console.log('Loading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users')
      .doc(userDoc.id)
      .collection('brokerAccounts')
      .get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`Found credentials for user ${userDoc.id}, broker ${brokerDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
          docRef: brokerDoc.ref,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ─── Build Iron Condors ────────────────────────────────────────────────────────
function buildIronCondors(expirationStrikes, profileName, profile, quotes, greeks) {
  const byExp = new Map();

  for (const { expDate, dteDays, strikes } of expirationStrikes) {
    if (dteDays < profile.dteMin || dteDays > profile.dteMax) continue;

    const puts = strikes.filter((s) => s.type === 'P');
    const calls = strikes.filter((s) => s.type === 'C');
    if (puts.length < 2 || calls.length < 2) continue;

    // Short leg candidates: filtered by delta range and spread
    const shortPuts = puts.filter((s) => {
      const g = greeks[s.streamerSymbol];
      const q = quotes[s.streamerSymbol];
      if (!g || !q) return false;
      const absDelta = Math.abs(g.delta ?? 0);
      return absDelta >= profile.deltaMin && absDelta <= profile.deltaMax && spreadOk(q.bidPrice, q.askPrice);
    });

    const shortCalls = calls.filter((s) => {
      const g = greeks[s.streamerSymbol];
      const q = quotes[s.streamerSymbol];
      if (!g || !q) return false;
      const absDelta = Math.abs(g.delta ?? 0);
      return absDelta >= profile.deltaMin && absDelta <= profile.deltaMax && spreadOk(q.bidPrice, q.askPrice);
    });

    if (shortPuts.length === 0 || shortCalls.length === 0) continue;

    // Group by abs(round(delta*100)) for symmetric pairing
    const putByDelta = new Map();
    for (const s of shortPuts) {
      const g = greeks[s.streamerSymbol];
      const key = Math.round(Math.abs(g.delta) * 100);
      if (!putByDelta.has(key)) putByDelta.set(key, []);
      putByDelta.get(key).push(s);
    }
    const callByDelta = new Map();
    for (const s of shortCalls) {
      const g = greeks[s.streamerSymbol];
      const key = Math.round(Math.abs(g.delta) * 100);
      if (!callByDelta.has(key)) callByDelta.set(key, []);
      callByDelta.get(key).push(s);
    }

    const commonDeltas = [...putByDelta.keys()]
      .filter((k) => callByDelta.has(k))
      .sort((a, b) => b - a);

    let bestForExp = null;

    for (const deltaKey of commonDeltas) {
      for (const stoP of putByDelta.get(deltaKey)) {
        for (const stoC of callByDelta.get(deltaKey)) {
          const stoPStrike = parseFloat(stoP.strike);
          const stoCStrike = parseFloat(stoC.strike);

          // Long put = short put strike - wings
          const btoP = puts.find((s) => {
            const st = parseFloat(s.strike);
            const q = quotes[s.streamerSymbol];
            return Math.abs(st - (stoPStrike - profile.wings)) < 0.01 && q && spreadOk(q.bidPrice, q.askPrice);
          });

          // Long call = short call strike + wings
          const btoC = calls.find((s) => {
            const st = parseFloat(s.strike);
            const q = quotes[s.streamerSymbol];
            return Math.abs(st - (stoCStrike + profile.wings)) < 0.01 && q && spreadOk(q.bidPrice, q.askPrice);
          });

          if (!btoP || !btoC) continue;

          const stoPQ = quotes[stoP.streamerSymbol];
          const stoCQ = quotes[stoC.streamerSymbol];
          const btoPQ = quotes[btoP.streamerSymbol];
          const btoCQ = quotes[btoC.streamerSymbol];

          const stoPMid = mid(stoPQ.bidPrice, stoPQ.askPrice);
          const stoCMid = mid(stoCQ.bidPrice, stoCQ.askPrice);
          const btoPMid = mid(btoPQ.bidPrice, btoPQ.askPrice);
          const btoCMid = mid(btoCQ.bidPrice, btoCQ.askPrice);

          const credit = stoPMid + stoCMid - btoPMid - btoCMid;
          if (credit < profile.minCredit) continue;

          const rr = (profile.wings - credit) / credit;
          if (rr > profile.maxRR) continue;

          const stoPGreeks = greeks[stoP.streamerSymbol];
          const stoCGreeks = greeks[stoC.streamerSymbol];
          const putBEDelta = Math.abs(stoPGreeks?.delta ?? 0) * 100;
          const callBEDelta = Math.abs(stoCGreeks?.delta ?? 0) * 100;
          const pop = 100 - Math.max(putBEDelta, callBEDelta);
          if (pop < profile.minPOP) continue;

          const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
          const alpha = Math.max(0, Math.min(100, (ev / profile.wings) * 100));
          const scoreVal = profile.score(pop, ev, alpha);

          const candidate = {
            expiration: expDate,
            dte: dteDays,
            shortPutStrike: stoPStrike,
            longPutStrike: stoPStrike - profile.wings,
            shortCallStrike: stoCStrike,
            longCallStrike: stoCStrike + profile.wings,
            credit: Math.round(credit * 100) / 100,
            rr: Math.round(rr * 100) / 100,
            pop: Math.round(pop * 100) / 100,
            ev: Math.round(ev * 100) / 100,
            alpha: Math.round(alpha * 100) / 100,
            score: Math.round(scoreVal * 100) / 100,
            delta: deltaKey / 100,
            wings: profile.wings,
            shortPutSymbol: stoP.streamerSymbol,
            shortCallSymbol: stoC.streamerSymbol,
            longPutSymbol: btoP.streamerSymbol,
            longCallSymbol: btoC.streamerSymbol,
            shortPutMid: Math.round(stoPMid * 100) / 100,
            shortCallMid: Math.round(stoCMid * 100) / 100,
            longPutMid: Math.round(btoPMid * 100) / 100,
            longCallMid: Math.round(btoCMid * 100) / 100,
          };

          if (!bestForExp || candidate.score > bestForExp.score) {
            bestForExp = candidate;
          }
        }
      }
    }

    if (bestForExp) {
      byExp.set(expDate, bestForExp);
    }
  }

  return [...byExp.values()].sort((a, b) => b.score - a.score);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  GUVID AGENT — MORNING SCAN ${TODAY}  ║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // Step 3: Load credentials
  const creds = await loadTastyCredentials();

  // Authenticate using TastytradeClient with OAuth
  console.log('Initializing TastytradeClient...');
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  // Verify auth by fetching accounts
  console.log('Fetching accounts...');
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const accountNumber = accounts[0]?.account?.['account-number'];
  if (!accountNumber) throw new Error('No account found');
  console.log(`Using account: ${accountNumber}`);

  // Step 4: Get balances
  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const morningNetLiq = parseFloat(balances['net-liquidating-value'] ?? 0);
  console.log(`Morning Net Liq: $${morningNetLiq.toFixed(2)}`);

  // Step 4b: Connect quote streamer
  console.log('Connecting QuoteStreamer...');
  const quotes = {};
  const greeks = {};

  client.quoteStreamer.addEventListener((records) => {
    for (const rec of records) {
      const sym = rec.eventSymbol;
      if (!sym) continue;
      if (rec.eventType === 'Quote') {
        quotes[sym] = rec;
      } else if (rec.eventType === 'Greeks') {
        greeks[sym] = rec;
      }
    }
  });

  await client.quoteStreamer.connect();
  console.log('QuoteStreamer connected.');

  // Subscribe to VIX — use Trade event as VIX has no real bid/ask
  const trades = {};
  client.quoteStreamer.addEventListener((records) => {
    for (const rec of records) {
      if (rec.eventType === 'Trade') trades[rec.eventSymbol] = rec;
    }
  });
  client.quoteStreamer.subscribe(['VIX'], [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Trade]);
  console.log('Waiting 10s for WebSocket auth + VIX data...');
  await sleep(10000);

  const vixQ = quotes['VIX'];
  const vixT = trades['VIX'];
  let morningVix = null;
  if (vixQ && !isNaN(parseFloat(vixQ.bidPrice)) && parseFloat(vixQ.bidPrice) > 0) {
    morningVix = Math.round(mid(vixQ.bidPrice, vixQ.askPrice) * 100) / 100;
  } else if (vixT && !isNaN(parseFloat(vixT.price)) && parseFloat(vixT.price) > 0) {
    morningVix = Math.round(parseFloat(vixT.price) * 100) / 100;
  }
  console.log(`Morning VIX: ${morningVix ?? 'N/A'} (raw bid=${vixQ?.bidPrice} ask=${vixQ?.askPrice} trade=${vixT?.price}`);

  // Step 4c: Save morning snapshot (guvid-agent/daily/snapshots/{date})
  console.log('Saving morning snapshot to Firestore...');
  await db.collection('guvid-agent').doc('daily').collection('snapshots').doc(TODAY).set({
    date: TODAY,
    timestamp: new Date().toISOString(),
    morningNetLiq,
    morningVix,
  }, { merge: true });
  console.log('Morning snapshot saved.');

  // ─── Step 5: Scan each ticker ──────────────────────────────────────────────
  const scanResults = {};

  for (const ticker of TICKERS) {
    console.log(`\n📊 Scanning ${ticker}...`);
    scanResults[ticker] = {};

    // Get options chain (nested format)
    const chainData = await client.instrumentsService.getNestedOptionChain(ticker);
    if (!chainData || chainData.length === 0) {
      console.log(`  No options chain for ${ticker}`);
      continue;
    }

    // Collect all streamer symbols across relevant expirations
    const allStreamerSymbols = [];
    const expirationStrikes = [];

    for (const chainEntry of chainData) {
      for (const exp of (chainEntry.expirations ?? [])) {
        const expDate = exp['expiration-date'];
        const dteDays = calcDTE(expDate);

        const needed = Object.values(PROFILES).some(
          (p) => dteDays >= p.dteMin && dteDays <= p.dteMax
        );
        if (!needed) continue;

        const strikeData = [];
        for (const strike of (exp.strikes ?? [])) {
          for (const [optKey, typeChar] of [['call-streamer-symbol', 'C'], ['put-streamer-symbol', 'P']]) {
            const streamerSym = strike[optKey];
            if (!streamerSym) continue;
            allStreamerSymbols.push(streamerSym);
            strikeData.push({
              strike: strike['strike-price'],
              type: typeChar,
              streamerSymbol: streamerSym,
            });
          }
        }
        expirationStrikes.push({ expDate, dteDays, strikes: strikeData });
      }
    }

    // Subscribe underlying for price (SPX index uses plain 'SPX' in dxFeed, not '$SPX.X')
    const underlyingSymbol = ticker;
    client.quoteStreamer.subscribe([underlyingSymbol], [MarketDataSubscriptionType.Quote]);

    // Subscribe options in batches
    const BATCH = 400;
    for (let i = 0; i < allStreamerSymbols.length; i += BATCH) {
      client.quoteStreamer.subscribe(
        allStreamerSymbols.slice(i, i + BATCH),
        [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Greeks]
      );
    }

    console.log(`  Subscribed to ${allStreamerSymbols.length} option symbols + underlying, waiting 12s...`);
    await sleep(12000);

    const underlyingQ = quotes[underlyingSymbol];
    const underlyingPrice = underlyingQ ? Math.round(mid(underlyingQ.bidPrice, underlyingQ.askPrice) * 100) / 100 : 0;
    console.log(`  ${ticker} price: $${underlyingPrice.toFixed(2)}`);

    // Get IV Rank
    let ivRank = null;
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: ticker });
      if (Array.isArray(metrics) && metrics.length > 0) {
        ivRank = parseFloat(metrics[0]['implied-volatility-index-rank'] ?? 0);
      }
    } catch (e) {
      console.log(`  IV Rank fetch failed: ${e.message}`);
    }
    console.log(`  ${ticker} IV Rank: ${ivRank ?? 'N/A'}%`);

    // Count data coverage
    let quoteCoverage = 0, greeksCoverage = 0;
    for (const sym of allStreamerSymbols) {
      if (quotes[sym]) quoteCoverage++;
      if (greeks[sym]) greeksCoverage++;
    }
    console.log(`  Data coverage: quotes=${quoteCoverage}/${allStreamerSymbols.length}, greeks=${greeksCoverage}/${allStreamerSymbols.length}`);

    // Scan each profile
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      console.log(`  Profile: ${profileName}`);
      const condors = buildIronCondors(expirationStrikes, profileName, profile, quotes, greeks);
      scanResults[ticker][profileName] = condors;
      console.log(`    Found ${condors.length} iron condor(s)`);
      if (condors.length > 0) {
        const best = condors[0];
        console.log(`    Best: ${best.expiration} | DTE:${best.dte} | Credit:$${best.credit} | POP:${best.pop}% | R/R:${best.rr} | Score:${best.score}`);
        console.log(`    Legs: P${best.longPutStrike}/${best.shortPutStrike} | C${best.shortCallStrike}/${best.longCallStrike}`);
      }
    }

    scanResults[ticker]._meta = { underlyingPrice, ivRank };
  }

  // ─── Step 6: Save to Firestore ─────────────────────────────────────────────
  console.log('\n💾 Saving scan results to Firestore...');

  const scanDoc = {
    date: TODAY,
    timestamp: new Date().toISOString(),
    type: 'morning',
  };

  for (const ticker of TICKERS) {
    const meta = scanResults[ticker]._meta ?? {};
    scanDoc[ticker] = {
      underlyingPrice: meta.underlyingPrice ?? 0,
      ivRank: meta.ivRank ?? null,
      conservative: (scanResults[ticker].conservative ?? []),
      neutral: (scanResults[ticker].neutral ?? []),
      aggressive: (scanResults[ticker].aggressive ?? []),
    };
  }

  await db.collection('guvid-agent').doc('scans').collection('entries').doc(TODAY).set(scanDoc);
  console.log(`Scan saved to guvid-agent/scans/entries/${TODAY}`);

  // Save best IC per profile per ticker as positions
  const positionRefs = [];
  for (const ticker of TICKERS) {
    const meta = scanResults[ticker]._meta ?? {};
    for (const profileName of Object.keys(PROFILES)) {
      const condors = scanResults[ticker][profileName] ?? [];
      if (condors.length === 0) continue;

      const best = condors[0];
      const posData = {
        ticker,
        profile: profileName,
        ic: best,
        openDate: TODAY,
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
          underlyingPrice: meta.underlyingPrice ?? 0,
          vix: morningVix,
          ivRank: meta.ivRank ?? null,
        },
      };

      const posRef = await db.collection('guvid-agent').doc('positions').collection('list').add(posData);
      positionRefs.push({ id: posRef.id, ticker, profile: profileName });
      console.log(`Position saved: ${ticker} ${profileName} → ${posRef.id}`);
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              GUVID MORNING SCAN SUMMARY                 ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Date:    ${TODAY}                                  ║`);
  console.log(`║  Net Liq: $${padL(morningNetLiq.toFixed(2), 12)}                            ║`);
  console.log(`║  VIX:     ${padL(morningVix ?? 'N/A', 8)}                                  ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');

  for (const ticker of TICKERS) {
    const meta = scanResults[ticker]._meta ?? {};
    console.log(`║  ${ticker} @ $${padL((meta.underlyingPrice ?? 0).toFixed(2), 8)}   IVR: ${padL(meta.ivRank ?? 'N/A', 5)}%               ║`);
    for (const profileName of Object.keys(PROFILES)) {
      const condors = scanResults[ticker][profileName] ?? [];
      if (condors.length === 0) {
        console.log(`║    ${pad(profileName, 13)}: no condors found                         ║`);
      } else {
        const b = condors[0];
        console.log(`║    ${pad(profileName, 13)}: ${b.expiration} DTE:${padL(b.dte, 2)} Cr:$${padL(b.credit, 5)} POP:${padL(b.pop, 5)}% ║`);
        console.log(`║                   R/R:${padL(b.rr, 4)}  Score:${padL(b.score, 6)}  (${condors.length} found)    ║`);
      }
    }
    console.log('║                                                          ║');
  }

  console.log(`║  Positions saved: ${positionRefs.length}                                       ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  client.quoteStreamer.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFATAL ERROR:', err.message ?? err);
  if (err.response?.data) {
    console.error('API response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});

/**
 * Guvid Agent — Morning Scan (10:30 AM ET)
 * Uses @tastytrade/api v6 + firebase-admin
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const TastyTradeClient = require('@tastytrade/api').default;
const { MarketDataSubscriptionType } = require('@tastytrade/api');

// ── Firebase init ─────────────────────────────────────────────────────────────
const sa = require(process.env.GOOGLE_APPLICATION_CREDENTIALS || '/tmp/firebase-sa.json');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Profiles ──────────────────────────────────────────────────────────────────
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

const MAX_RR = 4;
const MIN_CREDIT = 1.0;
const SPREAD_PCT = 0.08;

// ── Read TastyTrade credentials from Firestore ────────────────────────────────
async function readCredentials() {
  console.log('\n📋 Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users in Firestore');

  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').limit(1).get();
    if (brokerSnap.empty) continue;
    const data = brokerSnap.docs[0].data();
    const creds = data?.credentials;
    if (creds?.clientSecret && creds?.refreshToken) {
      console.log(`   ✓ Credentials found for user ${userDoc.id}`);
      return { userId: userDoc.id, clientSecret: creds.clientSecret, refreshToken: creds.refreshToken };
    }
  }
  throw new Error('No valid TastyTrade credentials found in Firestore');
}

// ── Build TastyTrade client ───────────────────────────────────────────────────
const { LogLevel } = require('@tastytrade/api');
function buildClient(creds) {
  return new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
    logLevel: LogLevel.ERROR,
  });
}

// ── Fetch account number ──────────────────────────────────────────────────────
async function getAccountNumber(client) {
  const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
  if (!accounts?.length) throw new Error('No accounts found');
  return accounts[0].account['account-number'];
}

// ── Fetch net liq ─────────────────────────────────────────────────────────────
async function getNetLiq(client, accountNumber) {
  const resp = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  // API returns nested: { data: { ... } } or flat
  const balances = resp?.data ?? resp;
  if (process.env.DEBUG_BALANCE) console.log('   Raw balances:', JSON.stringify(balances).slice(0, 300));
  const netLiq = balances?.['net-liquidating-value'] ?? balances?.['net-liq'] ?? '0';
  return parseFloat(netLiq) || 0;
}

// ── Fetch options chain (nested format) ──────────────────────────────────────
async function fetchChain(client, ticker) {
  const chains = await client.instrumentsService.getNestedOptionChain(ticker);
  if (!chains?.length) return [];
  return chains[0].expirations || [];
}

// ── Subscribe and collect quotes + greeks (chunked to avoid rate limit) ───────
async function collectMarketData(client, symbols, waitMs = 12000, chunkSize = 500) {
  const quotes = {};
  const greeks = {};
  const trades = {};
  const summaries = {};

  const handler = records => {
    for (const r of records) {
      if (r.eventType === 'Quote') {
        const bid = r.bidPrice ?? 0;
        const ask = r.askPrice ?? 0;
        if (bid > 0 || ask > 0) {
          quotes[r.eventSymbol] = { bid, ask, mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask };
        }
      } else if (r.eventType === 'Greeks') {
        greeks[r.eventSymbol] = { delta: r.delta ?? 0, theta: r.theta ?? 0, vega: r.vega ?? 0 };
      } else if (r.eventType === 'Trade') {
        if ((r.price ?? 0) > 0) trades[r.eventSymbol] = { price: r.price };
      } else if (r.eventType === 'Summary') {
        const p = r.prevDayClosePrice ?? r.dayClosePrice ?? r.lastPrice ?? 0;
        if (p > 0) summaries[r.eventSymbol] = { price: p };
      }
    }
  };

  const unsub = client.quoteStreamer.addEventListener(handler);

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    client.quoteStreamer.subscribe(chunk, [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
      MarketDataSubscriptionType.Trade,
      MarketDataSubscriptionType.Summary,
    ]);
    if (i + chunkSize < symbols.length) await sleep(200);
  }

  await sleep(waitMs);

  unsub();
  client.quoteStreamer.unsubscribe(symbols);

  // Merge trade/summary prices for indices that lack bid/ask Quote events
  for (const [sym, t] of Object.entries(trades)) {
    if (!(quotes[sym]?.mid > 0)) quotes[sym] = { bid: t.price, ask: t.price, mid: t.price };
  }
  for (const [sym, s] of Object.entries(summaries)) {
    if (!(quotes[sym]?.mid > 0)) quotes[sym] = { bid: s.price, ask: s.price, mid: s.price };
  }

  return { quotes, greeks };
}

// ── DTE calculator ────────────────────────────────────────────────────────────
function calcDte(expDateStr) {
  const exp = new Date(expDateStr + 'T16:00:00-05:00');
  return Math.round((exp - Date.now()) / 86400000);
}

// ── Build iron condors for one ticker/profile ─────────────────────────────────
function buildICs(expirations, quotes, greeks, profileName, profile, underlyingPrice) {
  const bestByExp = {};

  for (const exp of expirations) {
    const expDate = exp['expiration-date'];
    const days = exp['days-to-expiration'] != null ? exp['days-to-expiration'] : calcDte(expDate);
    if (days < profile.dteMin || days > profile.dteMax) continue;

    const strikes = exp.strikes || [];
    const puts = [];
    const calls = [];

    for (const strike of strikes) {
      const sp = parseFloat(strike['strike-price']);
      const putSym = strike['put-streamer-symbol'];
      const callSym = strike['call-streamer-symbol'];

      if (putSym) {
        const g = greeks[putSym];
        const q = quotes[putSym];
        if (g && q) {
          const absDelta = Math.abs(g.delta);
          if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
            puts.push({ strikePrice: sp, sym: putSym, delta: absDelta, mid: q.mid });
          }
        }
      }
      if (callSym) {
        const g = greeks[callSym];
        const q = quotes[callSym];
        if (g && q) {
          const absDelta = Math.abs(g.delta);
          if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
            calls.push({ strikePrice: sp, sym: callSym, delta: absDelta, mid: q.mid });
          }
        }
      }
    }

    if (!puts.length || !calls.length) continue;

    // Symmetric delta pairing: sort desc, pair by index
    puts.sort((a, b) => b.delta - a.delta);
    calls.sort((a, b) => b.delta - a.delta);

    let bestIC = null;
    const pairCount = Math.min(puts.length, calls.length);

    for (let i = 0; i < pairCount; i++) {
      const shortPut = puts[i];
      const shortCall = calls[i];

      // Wing legs: closest available strike at ±wings distance
      const longPutLeg = strikes
        .filter(s => s['put-streamer-symbol'] && quotes[s['put-streamer-symbol']])
        .map(s => ({ sp: parseFloat(s['strike-price']), sym: s['put-streamer-symbol'] }))
        .filter(s => s.sp < shortPut.strikePrice)
        .sort((a, b) => Math.abs(a.sp - (shortPut.strikePrice - profile.wings)) - Math.abs(b.sp - (shortPut.strikePrice - profile.wings)))[0];

      const longCallLeg = strikes
        .filter(s => s['call-streamer-symbol'] && quotes[s['call-streamer-symbol']])
        .map(s => ({ sp: parseFloat(s['strike-price']), sym: s['call-streamer-symbol'] }))
        .filter(s => s.sp > shortCall.strikePrice)
        .sort((a, b) => Math.abs(a.sp - (shortCall.strikePrice + profile.wings)) - Math.abs(b.sp - (shortCall.strikePrice + profile.wings)))[0];

      if (!longPutLeg || !longCallLeg) continue;

      const longPutQ = quotes[longPutLeg.sym];
      const longCallQ = quotes[longCallLeg.sym];
      if (!longPutQ || !longCallQ) continue;

      const credit = shortPut.mid + shortCall.mid - longPutQ.mid - longCallQ.mid;
      if (credit < MIN_CREDIT) continue;

      const wings = Math.min(shortPut.strikePrice - longPutLeg.sp, longCallLeg.sp - shortCall.strikePrice);
      const rr = (wings - credit) / credit;
      if (rr > MAX_RR) continue;

      if (shortPut.mid / underlyingPrice > SPREAD_PCT || shortCall.mid / underlyingPrice > SPREAD_PCT) continue;

      const pop = 100 - Math.max(shortPut.delta, shortCall.delta) * 100;
      if (pop < profile.minPOP) continue;

      const maxLoss = wings - credit;
      const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
      const alpha = credit / wings;
      const scoreVal = profile.score(pop, ev, alpha);

      const ic = {
        expiration: expDate,
        dte: days,
        shortPut: { strike: shortPut.strikePrice, symbol: shortPut.sym, delta: +shortPut.delta.toFixed(4), mid: +shortPut.mid.toFixed(2) },
        longPut: { strike: longPutLeg.sp, symbol: longPutLeg.sym, mid: +longPutQ.mid.toFixed(2) },
        shortCall: { strike: shortCall.strikePrice, symbol: shortCall.sym, delta: +shortCall.delta.toFixed(4), mid: +shortCall.mid.toFixed(2) },
        longCall: { strike: longCallLeg.sp, symbol: longCallLeg.sym, mid: +longCallQ.mid.toFixed(2) },
        credit: +credit.toFixed(2),
        rr: +rr.toFixed(2),
        pop: +pop.toFixed(1),
        ev: +ev.toFixed(2),
        alpha: +alpha.toFixed(4),
        wings,
        score: +scoreVal.toFixed(4),
        profile: profileName,
        putBE: +(shortPut.strikePrice - credit / 2).toFixed(2),
        callBE: +(shortCall.strikePrice + credit / 2).toFixed(2),
      };

      if (!bestIC || ic.score > bestIC.score) bestIC = ic;
    }

    if (bestIC) bestByExp[expDate] = bestIC;
  }

  return Object.values(bestByExp).sort((a, b) => b.score - a.score);
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  const date = today();
  console.log(`\n🦅 Guvid Agent — Morning Scan [${date}]`);
  console.log('='.repeat(60));

  // Step 1: Credentials
  const creds = await readCredentials();

  // Step 2: Connect
  console.log('\n🔑 Connecting to TastyTrade...');
  const client = buildClient(creds);
  await client.quoteStreamer.connect();
  console.log('   ✓ WebSocket connected');

  // Step 3: Account info + net liq
  console.log('\n💰 Fetching account info...');
  const accountNumber = await getAccountNumber(client);
  console.log(`   Account: ${accountNumber}`);
  const morningNetLiq = await getNetLiq(client, accountNumber);
  console.log(`   Net Liq: $${morningNetLiq.toFixed(2)}`);

  // Step 4: VIX quote — try streamer first, fall back to market metrics
  console.log('\n📊 Fetching VIX...');
  const { quotes: vixQuotes } = await collectMarketData(client, ['$VIX.X', 'VIX', '^VIX'], 8000);
  let morningVix = vixQuotes['$VIX.X']?.mid ?? vixQuotes['VIX']?.mid ?? vixQuotes['^VIX']?.mid ?? null;
  if (!(morningVix > 0)) {
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: ['VIX'] });
      const m = Array.isArray(metrics) ? metrics[0] : metrics;
      const iv = parseFloat(m?.['implied-volatility'] ?? m?.['implied-volatility-30-day'] ?? 0);
      if (iv > 0) morningVix = iv * 100; // Convert to VIX-like scale if needed
    } catch { /* ignore */ }
  }
  console.log(`   VIX: ${morningVix != null && morningVix > 0 ? morningVix.toFixed(2) : 'N/A'}`);

  // Save morning snapshot
  console.log('\n💾 Saving morning snapshot...');
  await db.collection('guvid-daily').doc(date).set(
    { morningNetLiq, morningVix, timestamp: new Date().toISOString(), date },
    { merge: true }
  );
  console.log('   ✓ Snapshot saved');

  // Step 5: Scan SPX and QQQ
  const tickers = ['SPX', 'QQQ'];
  const scanResults = {};

  for (const ticker of tickers) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🔍 Scanning ${ticker}...`);

    const expirations = await fetchChain(client, ticker);
    console.log(`   ${expirations.length} expirations in chain`);

    const underlyingStreamer = ticker === 'SPX' ? '$SPX.X' : ticker;
    const symbols = [underlyingStreamer];

    for (const exp of expirations) {
      const days = exp['days-to-expiration'] != null ? exp['days-to-expiration'] : calcDte(exp['expiration-date']);
      if (days < 15 || days > 55) continue;
      for (const s of (exp.strikes || [])) {
        if (s['put-streamer-symbol']) symbols.push(s['put-streamer-symbol']);
        if (s['call-streamer-symbol']) symbols.push(s['call-streamer-symbol']);
      }
    }

    console.log(`   Subscribing to ${symbols.length} symbols, waiting 12s...`);
    const { quotes, greeks } = await collectMarketData(client, symbols, 12000);
    console.log(`   Received: ${Object.keys(quotes).length} quotes, ${Object.keys(greeks).length} greeks`);

    let underlyingPrice = quotes[underlyingStreamer]?.mid ?? 0;
    if (!(underlyingPrice > 0)) {
      // Index underlyings (SPX) may not emit Quote events — try Trade/Summary first
      for (const alt of [ticker, `$${ticker}.X`, `/${ticker}`]) {
        if (quotes[alt]?.mid > 0) { underlyingPrice = quotes[alt].mid; break; }
      }
    }
    if (!(underlyingPrice > 0)) {
      // Last resort: infer from nearest-to-ATM put strike (abs(delta) closest to 0.50)
      const allPutGreeks = Object.entries(greeks)
        .filter(([sym]) => sym.includes('P') && greeks[sym] && Math.abs(greeks[sym].delta) > 0)
        .map(([sym, g]) => ({ sym, absDelta: Math.abs(g.delta) }))
        .sort((a, b) => Math.abs(a.absDelta - 0.5) - Math.abs(b.absDelta - 0.5));
      if (allPutGreeks.length) {
        // Extract strike from symbol like .SPXW260529P7475
        const atmSym = allPutGreeks[0].sym;
        const m = atmSym.match(/[PC](\d+)$/);
        if (m) {
          underlyingPrice = parseInt(m[1], 10);
          console.log(`   [inferred] ${ticker} price ≈ $${underlyingPrice} from ATM strike ${atmSym} (Δ≈${allPutGreeks[0].absDelta.toFixed(3)})`);
        }
      }
    }
    console.log(`   ${ticker} @ $${underlyingPrice.toFixed(2)}`);

    let ivRank = null;
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: [ticker] });
      const m = Array.isArray(metrics) ? metrics[0] : metrics;
      ivRank = parseFloat(m?.['iv-rank'] ?? m?.['implied-volatility-index-rank'] ?? 0) || null;
    } catch { /* non-critical */ }

    const tickerResults = {};
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const ics = buildICs(expirations, quotes, greeks, profileName, profile, underlyingPrice);
      tickerResults[profileName] = ics;
      console.log(`   ${profileName.padEnd(14)}: ${ics.length} IC(s)`);
      for (const ic of ics.slice(0, 2)) {
        console.log(`     DTE:${ic.dte} ${ic.longPut.strike}/${ic.shortPut.strike}P-${ic.shortCall.strike}/${ic.longCall.strike}C Cr:$${ic.credit} POP:${ic.pop}% R/R:${ic.rr} Score:${ic.score}`);
      }
    }

    scanResults[ticker] = { tickerResults, underlyingPrice, ivRank };
  }

  // Step 6: Save scan to Firestore
  console.log('\n💾 Saving scan results...');
  const scanDoc = { date, timestamp: new Date().toISOString(), type: 'morning', morningVix, morningNetLiq };
  for (const ticker of tickers) {
    const tr = scanResults[ticker]?.tickerResults ?? {};
    scanDoc[ticker] = {
      underlyingPrice: scanResults[ticker]?.underlyingPrice ?? null,
      ivRank: scanResults[ticker]?.ivRank ?? null,
      conservative: tr.conservative ?? [],
      neutral: tr.neutral ?? [],
      aggressive: tr.aggressive ?? [],
    };
  }
  await db.collection('guvid-scans').doc(date).set(scanDoc, { merge: true });
  console.log('   ✓ Scan saved to guvid-scans/' + date);

  // Step 7: Save best positions
  console.log('\n💾 Saving best positions...');
  const posCol = db.collection('guvid-agent-positions');
  let positionsSaved = 0;

  for (const ticker of tickers) {
    const tr = scanResults[ticker]?.tickerResults ?? {};
    const underlyingPrice = scanResults[ticker]?.underlyingPrice ?? 0;
    const ivRank = scanResults[ticker]?.ivRank ?? null;

    for (const [profileName, ics] of Object.entries(tr)) {
      for (const ic of ics) {
        await posCol.add({
          ticker, profile: profileName, ic,
          openDate: date, expiration: ic.expiration,
          credit: ic.credit, pop: ic.pop, ev: ic.ev,
          alpha: ic.alpha, rr: ic.rr, wings: ic.wings,
          status: 'open', dailyChecks: [],
          marketContext: { underlyingPrice, vix: morningVix, ivRank },
        });
        positionsSaved++;
      }
    }
  }
  console.log(`   ✓ ${positionsSaved} positions saved`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ MORNING SCAN COMPLETE');
  console.log(`   Date:     ${date}`);
  console.log(`   VIX:      ${morningVix != null ? morningVix.toFixed(2) : 'N/A'}`);
  console.log(`   Net Liq:  $${morningNetLiq.toFixed(2)}`);

  for (const ticker of tickers) {
    const tr = scanResults[ticker]?.tickerResults ?? {};
    const up = scanResults[ticker]?.underlyingPrice ?? 0;
    const ivr = scanResults[ticker]?.ivRank;
    console.log(`\n   ${ticker} @ $${up.toFixed(2)}${ivr != null ? `  IVR: ${ivr.toFixed(0)}` : ''}`);
    for (const [p, ics] of Object.entries(tr)) {
      if (ics.length) {
        const best = ics[0];
        console.log(`     ${p.padEnd(14)}: DTE:${best.dte}  Cr:$${best.credit}  POP:${best.pop}%  R/R:${best.rr}  Score:${best.score}`);
      } else {
        console.log(`     ${p.padEnd(14)}: no candidates`);
      }
    }
  }
  console.log('='.repeat(60));

  client.quoteStreamer.disconnect();
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

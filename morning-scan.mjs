// Morning Scan — Guvid Agent
// Uses CommonJS-compatible imports via require (mjs with createRequire)
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);

const admin = require('firebase-admin');
const { default: TastyTradeClient, MarketDataSubscriptionType } = require('@tastytrade/api');

// ─── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
console.log('✅ Firebase Admin initialized');

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Step 3: Read TastyTrade Credentials ──────────────────────────────────────
async function getTastyCredentials() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken &&
          data.brokerType === 'tastytrade' && data.isActive !== false) {
        console.log(`✅ Credentials found — user: ${userDoc.id}, broker: ${brokerDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No active TastyTrade credentials found in Firestore');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function midPrice(quote) {
  if (!quote) return null;
  const bid = parseFloat(quote.bidPrice ?? quote.bid ?? 0);
  const ask = parseFloat(quote.askPrice ?? quote.ask ?? 0);
  if (bid <= 0 && ask <= 0) return null;
  if (bid <= 0) return ask;
  if (ask <= 0) return bid;
  return (bid + ask) / 2;
}

function calcDTE(expirationDate) {
  const now = new Date();
  const exp = new Date(expirationDate + 'T16:00:00-05:00');
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16,
    dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.70 + ev * 0.20 + alpha * 0.10,
  },
  neutral: {
    deltaMin: 11, deltaMax: 24,
    dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.60 + ev * 0.25 + alpha * 0.15,
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24,
    dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, minCredit: 1.0,
    score: (pop, ev, alpha) => pop * 0.40 + ev * 0.35 + alpha * 0.25,
  },
};

// ─── IC Builder ───────────────────────────────────────────────────────────────
function buildIronCondors(strikes, greeksMap, quotesMap, profile, expDate, dte) {
  const deltaMinNorm = profile.deltaMin / 100;
  const deltaMaxNorm = profile.deltaMax / 100;

  const shortPutCandidates = [];
  const shortCallCandidates = [];

  for (const strike of strikes) {
    const sp = parseFloat(strike['strike-price']);
    const putSym  = strike['put-streamer-symbol'];
    const callSym = strike['call-streamer-symbol'];

    if (putSym) {
      const g = greeksMap[putSym];
      if (g) {
        const d = Math.abs(parseFloat(g.delta ?? 0));
        if (d >= deltaMinNorm && d <= deltaMaxNorm) {
          shortPutCandidates.push({ strike: sp, sym: putSym, symbol: strike['put'], delta: d });
        }
      }
    }
    if (callSym) {
      const g = greeksMap[callSym];
      if (g) {
        const d = Math.abs(parseFloat(g.delta ?? 0));
        if (d >= deltaMinNorm && d <= deltaMaxNorm) {
          shortCallCandidates.push({ strike: sp, sym: callSym, symbol: strike['call'], delta: d });
        }
      }
    }
  }

  if (!shortPutCandidates.length || !shortCallCandidates.length) return [];

  // Sort by delta desc for symmetric pairing
  shortPutCandidates.sort((a, b) => b.delta - a.delta);
  shortCallCandidates.sort((a, b) => b.delta - a.delta);

  const condors = [];
  const pairCount = Math.min(shortPutCandidates.length, shortCallCandidates.length);

  for (let i = 0; i < pairCount; i++) {
    const stoPut  = shortPutCandidates[i];
    const stoCall = shortCallCandidates[i];

    const btoPutTarget  = stoPut.strike  - profile.wings;
    const btoCallTarget = stoCall.strike + profile.wings;

    const btoPutStrike = strikes.reduce((best, s) => {
      if (!s['put-streamer-symbol']) return best;
      const sp = parseFloat(s['strike-price']);
      const diff = Math.abs(sp - btoPutTarget);
      return !best || diff < Math.abs(parseFloat(best['strike-price']) - btoPutTarget) ? s : best;
    }, null);

    const btoCallStrike = strikes.reduce((best, s) => {
      if (!s['call-streamer-symbol']) return best;
      const sp = parseFloat(s['strike-price']);
      const diff = Math.abs(sp - btoCallTarget);
      return !best || diff < Math.abs(parseFloat(best['strike-price']) - btoCallTarget) ? s : best;
    }, null);

    if (!btoPutStrike || !btoCallStrike) continue;

    const btoPutSym  = btoPutStrike['put-streamer-symbol'];
    const btoCallSym = btoCallStrike['call-streamer-symbol'];
    if (!btoPutSym || !btoCallSym) continue;

    const btoPutStrikePrice  = parseFloat(btoPutStrike['strike-price']);
    const btoCallStrikePrice = parseFloat(btoCallStrike['strike-price']);

    const putWing  = stoPut.strike  - btoPutStrikePrice;
    const callWing = btoCallStrikePrice - stoCall.strike;
    const actualWings = Math.min(putWing, callWing);
    if (actualWings < profile.wings * 0.8) continue;

    const qStoPut  = quotesMap[stoPut.sym];
    const qStoCall = quotesMap[stoCall.sym];
    const qBtoPut  = quotesMap[btoPutSym];
    const qBtoCall = quotesMap[btoCallSym];

    const stoPutMid  = midPrice(qStoPut);
    const stoCallMid = midPrice(qStoCall);
    const btoPutMid  = midPrice(qBtoPut);
    const btoCallMid = midPrice(qBtoCall);

    if (!stoPutMid || !stoCallMid || !btoPutMid || !btoCallMid) continue;

    const credit = stoPutMid + stoCallMid - btoPutMid - btoCallMid;
    if (credit < profile.minCredit) continue;

    const rr = (actualWings - credit) / credit;
    if (rr > profile.maxRR) continue;

    // Spread width check (8%/leg)
    const stoPutAsk  = parseFloat(qStoPut?.askPrice  ?? 0);
    const stoPutBid  = parseFloat(qStoPut?.bidPrice  ?? 0);
    const stoCallAsk = parseFloat(qStoCall?.askPrice ?? 0);
    const stoCallBid = parseFloat(qStoCall?.bidPrice ?? 0);
    const stoPutSpreadPct  = stoPutMid  > 0 ? (stoPutAsk  - stoPutBid)  / stoPutMid  : 1;
    const stoCallSpreadPct = stoCallMid > 0 ? (stoCallAsk - stoCallBid) / stoCallMid : 1;
    if (stoPutSpreadPct > 0.08 || stoCallSpreadPct > 0.08) continue;

    const pop = 100 - Math.max(stoPut.delta * 100, stoCall.delta * 100);
    if (pop < profile.minPOP) continue;

    const alpha = credit / actualWings;
    const ev    = credit * (pop / 100) - (actualWings - credit) * (1 - pop / 100);
    const scoreVal = profile.score(pop, ev, alpha);

    condors.push({
      expiration: expDate, dte,
      stoPut:  { symbol: stoPut.symbol,           streamerSymbol: stoPut.sym,  strike: stoPut.strike,  mid: stoPutMid,  delta: stoPut.delta },
      stoCall: { symbol: stoCall.symbol,           streamerSymbol: stoCall.sym, strike: stoCall.strike, mid: stoCallMid, delta: stoCall.delta },
      btoPut:  { symbol: btoPutStrike['put'],      streamerSymbol: btoPutSym,   strike: btoPutStrikePrice,  mid: btoPutMid  },
      btoCall: { symbol: btoCallStrike['call'],    streamerSymbol: btoCallSym,  strike: btoCallStrikePrice, mid: btoCallMid },
      credit:  Math.round(credit  * 100) / 100,
      rr:      Math.round(rr      * 100) / 100,
      pop:     Math.round(pop     * 100) / 100,
      ev:      Math.round(ev      * 100) / 100,
      alpha:   Math.round(alpha   * 100) / 100,
      score:   Math.round(scoreVal * 100) / 100,
      wings:   actualWings,
    });
  }

  condors.sort((a, b) => b.score - a.score);
  return condors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const creds = await getTastyCredentials();

  console.log('🔗 Connecting to TastyTrade...');
  const client = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  const greeksMap = {};
  const quotesMap = {};
  const tradesMap = {};

  client.quoteStreamer.addEventListener((records) => {
    for (const rec of records) {
      const sym = rec.eventSymbol;
      if (!sym) continue;
      if (rec.eventType === 'Greeks') {
        greeksMap[sym] = rec;
      } else if (rec.eventType === 'Quote') {
        quotesMap[sym] = rec;
      } else if (rec.eventType === 'Trade') {
        tradesMap[sym] = rec;
      }
    }
  });

  await client.quoteStreamer.connect();
  console.log('✅ Streamer connected');

  // Accounts
  let accountNumber;
  try {
    const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
    if (!accounts?.length) throw new Error('No accounts returned');
    accountNumber = accounts[0].account['account-number'];
    console.log(`✅ Account: ${accountNumber}`);
  } catch (e) {
    console.error('❌ Accounts:', e.message);
    process.exit(1);
  }

  // Net Liquidity
  let morningNetLiq = null;
  try {
    const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    morningNetLiq = parseFloat(balances['net-liquidating-value'] ?? 0);
    console.log(`💰 Net Liquidity: $${morningNetLiq.toFixed(2)}`);
  } catch (e) {
    console.warn('⚠️  Balances:', e.message);
  }

  // VIX — VIX is index data; only arrives as Trade event on DxLink
  console.log('📊 Fetching VIX...');
  client.quoteStreamer.subscribe(['VIX'], [MarketDataSubscriptionType.Trade]);
  await sleep(5000);
  const vixTrade = tradesMap['VIX'];
  const morningVix = vixTrade ? parseFloat(vixTrade.price) : null;
  console.log(`📊 VIX: ${morningVix?.toFixed(2) ?? 'N/A'}`);

  // Save snapshot — path: guvid-agent(col)/daily(doc)/entries(col)/{TODAY}(doc)
  await db.collection('guvid-agent').doc('daily').collection('entries').doc(TODAY).set({
    date: TODAY,
    timestamp: new Date().toISOString(),
    morningNetLiq: morningNetLiq ?? null,
    morningVix: morningVix ?? null,
  }, { merge: true });
  console.log(`✅ Snapshot → guvid-agent/daily/entries/${TODAY}`);

  // ─── Scan ─────────────────────────────────────────────────────────────────
  const TICKERS = ['SPX', 'QQQ'];
  const allDteMin = Math.min(...Object.values(PROFILES).map(p => p.dteMin));
  const allDteMax = Math.max(...Object.values(PROFILES).map(p => p.dteMax));
  const results = {
    SPX: { conservative: [], neutral: [], aggressive: [] },
    QQQ: { conservative: [], neutral: [], aggressive: [] },
  };

  for (const ticker of TICKERS) {
    console.log(`\n🔍 Scanning ${ticker}...`);
    // SPX streams as 'SPX' on DxLink (not $SPX.X)
    const underlyingStreamerSym = ticker;

    client.quoteStreamer.subscribe([underlyingStreamerSym], [MarketDataSubscriptionType.Quote]);
    await sleep(2000);
    const underlyingPrice = midPrice(quotesMap[underlyingStreamerSym]);
    console.log(`  ${ticker}: $${underlyingPrice?.toFixed(2) ?? 'N/A'}`);

    let chainData;
    try {
      chainData = await client.instrumentsService.getNestedOptionChain(ticker);
    } catch (e) {
      console.warn(`⚠️  Chain error for ${ticker}: ${e.message}`);
      continue;
    }

    const allExpirations = [];
    for (const chain of (Array.isArray(chainData) ? chainData : [chainData])) {
      for (const exp of (chain.expirations || [])) {
        allExpirations.push(exp);
      }
    }
    console.log(`  Total expirations in chain: ${allExpirations.length}`);

    const validExps = allExpirations.filter(exp => {
      const dte = parseInt(exp['days-to-expiration'] ?? calcDTE(exp['expiration-date']), 10);
      return dte >= allDteMin && dte <= allDteMax;
    });
    console.log(`  Valid expirations (DTE ${allDteMin}–${allDteMax}): ${validExps.length}`);
    if (!validExps.length) continue;

    for (const exp of validExps.slice(0, 6)) {
      const expDate = exp['expiration-date'];
      const dte = parseInt(exp['days-to-expiration'] ?? calcDTE(expDate), 10);
      const strikes = exp['strikes'] || [];
      console.log(`  📅 ${expDate} DTE:${dte} — ${strikes.length} strikes`);
      if (!strikes.length) continue;

      const allSyms = [];
      for (const s of strikes) {
        if (s['put-streamer-symbol'])  allSyms.push(s['put-streamer-symbol']);
        if (s['call-streamer-symbol']) allSyms.push(s['call-streamer-symbol']);
      }

      for (let i = 0; i < allSyms.length; i += 200) {
        client.quoteStreamer.subscribe(allSyms.slice(i, i + 200), [
          MarketDataSubscriptionType.Quote,
          MarketDataSubscriptionType.Greeks,
        ]);
      }

      console.log(`    ⏳ Subscribed ${allSyms.length} symbols, waiting 12s...`);
      await sleep(12000);

      const gotGreeks = allSyms.filter(s => greeksMap[s]).length;
      const gotQuotes = allSyms.filter(s => quotesMap[s]).length;
      console.log(`    Greeks: ${gotGreeks}/${allSyms.length}  Quotes: ${gotQuotes}/${allSyms.length}`);

      for (const [profileName, profile] of Object.entries(PROFILES)) {
        if (dte < profile.dteMin || dte > profile.dteMax) continue;
        const condors = buildIronCondors(strikes, greeksMap, quotesMap, profile, expDate, dte);
        console.log(`    ${profileName}: ${condors.length} condors${condors[0] ? `, best score ${condors[0].score}` : ''}`);
        if (condors.length > 0) results[ticker][profileName].push(condors[0]);
      }
    }
  }

  // ─── Save Scan ────────────────────────────────────────────────────────────
  console.log('\n💾 Saving scan...');
  await db.collection('guvid-agent').doc('scans').collection('entries').doc(TODAY).set({
    date: TODAY,
    timestamp: new Date().toISOString(),
    type: 'morning',
    SPX: results.SPX,
    QQQ: results.QQQ,
  });
  console.log(`✅ Scan → guvid-agent/scans/entries/${TODAY}`);

  // ─── Save Positions ───────────────────────────────────────────────────────
  const spxPrice = midPrice(quotesMap['SPX']);
  const qqqPrice = midPrice(quotesMap['QQQ']);
  const posCol = db.collection('guvid-agent').doc('positions').collection('list');
  let savedCount = 0;

  for (const ticker of TICKERS) {
    const underlyingPx = ticker === 'SPX' ? spxPrice : qqqPrice;
    for (const [profileName, condorList] of Object.entries(results[ticker])) {
      if (!condorList.length) continue;
      const best = condorList.reduce((a, b) => a.score > b.score ? a : b);
      const ref = await posCol.add({
        ticker,
        profile: profileName,
        ic: { stoPut: best.stoPut, stoCall: best.stoCall, btoPut: best.btoPut, btoCall: best.btoCall },
        openDate: TODAY,
        expiration: best.expiration,
        dte: best.dte,
        credit: best.credit,
        pop: best.pop,
        ev: best.ev,
        alpha: best.alpha,
        rr: best.rr,
        wings: best.wings,
        score: best.score,
        status: 'open',
        dailyChecks: [],
        marketContext: { underlyingPrice: underlyingPx ?? null, vix: morningVix ?? null, ivRank: null },
        createdAt: new Date().toISOString(),
      });
      console.log(`✅ Position: ${ticker} ${profileName} exp:${best.expiration} → ${ref.id}`);
      savedCount++;
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log(`📋  MORNING SCAN SUMMARY — ${TODAY}`);
  console.log('═'.repeat(72));
  console.log(`💰  Net Liquidity : $${morningNetLiq?.toFixed(2) ?? 'N/A'}`);
  console.log(`📊  VIX           : ${morningVix?.toFixed(2) ?? 'N/A'}`);

  for (const ticker of TICKERS) {
    const px = ticker === 'SPX' ? spxPrice : qqqPrice;
    console.log(`\n── ${ticker} ($${(px ?? 0).toFixed(2)}) ────────────────────────────────────`);
    for (const [profileName, list] of Object.entries(results[ticker])) {
      if (!list.length) {
        console.log(`  ${profileName.padEnd(15)} NO CANDIDATES`);
        continue;
      }
      const b = list.reduce((a, c) => a.score > c.score ? a : c);
      console.log(`  ${profileName.padEnd(15)} exp:${b.expiration} DTE:${b.dte} | ` +
        `Credit:$${b.credit} POP:${b.pop}% RR:${b.rr} EV:$${b.ev} Score:${b.score}`);
      console.log(`  ${''.padEnd(15)} Put:  ${b.btoPut?.strike}/${b.stoPut?.strike} (Δ${(b.stoPut?.delta*100).toFixed(1)})`);
      console.log(`  ${''.padEnd(15)} Call: ${b.stoCall?.strike}/${b.btoCall?.strike} (Δ${(b.stoCall?.delta*100).toFixed(1)})`);
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`✅  Complete — ${savedCount} positions saved`);
  console.log('═'.repeat(72));

  await sleep(500);
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Fatal:', e.message ?? e);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

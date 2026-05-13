import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(process.env.FIREBASE_SA || '{}');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Firestore helpers ────────────────────────────────────────────────────────
async function getTastyCredentials() {
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  for (const userDoc of usersSnap.docs) {
    const accountsSnap = await db
      .collection('users')
      .doc(userDoc.id)
      .collection('brokerAccounts')
      .get();

    for (const acctDoc of accountsSnap.docs) {
      const data = acctDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`[Firestore] Found credentials for user ${userDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ─── Streamer helpers ─────────────────────────────────────────────────────────
function collectStreamData(client, symbols, waitMs = 12000) {
  return new Promise((resolve) => {
    const quotes = {};
    const greeks = {};

    const handler = (records) => {
      for (const r of records) {
        if (r.eventType === 'Quote') quotes[r.eventSymbol] = r;
        else if (r.eventType === 'Greeks') greeks[r.eventSymbol] = r;
      }
    };

    const removeListener = client.quoteStreamer.addEventListener(handler);

    client.quoteStreamer.subscribe(symbols, [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
    ]);

    setTimeout(() => {
      removeListener();
      client.quoteStreamer.unsubscribe(symbols);
      resolve({ quotes, greeks });
    }, waitMs);
  });
}

// ─── IC Profiles ─────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, minCredit: 1.0,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, minCredit: 1.0,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, minCredit: 1.0,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

function calcDTE(expirationDate) {
  const exp = new Date(expirationDate + 'T16:00:00-05:00');
  return Math.round((exp - Date.now()) / 86400000);
}

function buildICs(options, expirationDate, profile, underlyingPrice) {
  const d = calcDTE(expirationDate);
  if (d < profile.dteMin || d > profile.dteMax) return [];

  const puts = options.filter(o => o.optionType === 'P' && o.delta != null && o.mid > 0);
  const calls = options.filter(o => o.optionType === 'C' && o.delta != null && o.mid > 0);

  // Filter by delta range (delta 0-1, abs value scaled to 0-100)
  const validPuts = puts.filter(o => {
    const absDelta = Math.abs(o.delta) * 100;
    return absDelta >= profile.deltaMin && absDelta <= profile.deltaMax;
  });
  const validCalls = calls.filter(o => {
    const absDelta = Math.abs(o.delta) * 100;
    return absDelta >= profile.deltaMin && absDelta <= profile.deltaMax;
  });

  if (!validPuts.length || !validCalls.length) return [];

  // Group by abs(round(delta*100)), keep highest mid
  const putMap = new Map();
  for (const p of validPuts) {
    const key = Math.round(Math.abs(p.delta) * 100);
    if (!putMap.has(key) || p.mid > putMap.get(key).mid) putMap.set(key, p);
  }
  const callMap = new Map();
  for (const c of validCalls) {
    const key = Math.round(Math.abs(c.delta) * 100);
    if (!callMap.has(key) || c.mid > callMap.get(key).mid) callMap.set(key, c);
  }

  // Sort keys descending, pair by index (symmetric delta pairing)
  const putKeys = [...putMap.keys()].sort((a, b) => b - a);
  const callKeys = [...callMap.keys()].sort((a, b) => b - a);
  const pairCount = Math.min(putKeys.length, callKeys.length);

  const candidates = [];

  for (let i = 0; i < pairCount; i++) {
    const stoP = putMap.get(putKeys[i]);
    const stoC = callMap.get(callKeys[i]);

    // 8%/leg spread check
    const stoPStrike = parseFloat(stoP.strikePrice);
    const stoCStrike = parseFloat(stoC.strikePrice);
    if (Math.abs(stoPStrike - underlyingPrice) / underlyingPrice > 0.08) continue;
    if (Math.abs(stoCStrike - underlyingPrice) / underlyingPrice > 0.08) continue;

    // Find BTO legs at wing width
    const btoPTarget = stoPStrike - profile.wings;
    const btoCTarget = stoCStrike + profile.wings;

    const btoP = puts.reduce((best, o) => {
      const s = parseFloat(o.strikePrice);
      if (!best) return o;
      return Math.abs(s - btoPTarget) < Math.abs(parseFloat(best.strikePrice) - btoPTarget) ? o : best;
    }, null);
    const btoC = calls.reduce((best, o) => {
      const s = parseFloat(o.strikePrice);
      if (!best) return o;
      return Math.abs(s - btoCTarget) < Math.abs(parseFloat(best.strikePrice) - btoCTarget) ? o : best;
    }, null);

    if (!btoP || !btoC) continue;

    const credit = stoP.mid + stoC.mid - btoP.mid - btoC.mid;
    if (credit < profile.minCredit) continue;

    const actualWings = Math.min(
      Math.abs(stoPStrike - parseFloat(btoP.strikePrice)),
      Math.abs(parseFloat(btoC.strikePrice) - stoCStrike)
    );
    const rr = (actualWings - credit) / credit;
    if (rr > profile.maxRR) continue;

    // POP = 100 - max(STO put delta %, STO call delta %)
    const putBEDelta = Math.abs(stoP.delta) * 100;
    const callBEDelta = Math.abs(stoC.delta) * 100;
    const pop = 100 - Math.max(putBEDelta, callBEDelta);
    if (pop < profile.minPOP) continue;

    // EV
    const ev = credit * (pop / 100) - (actualWings - credit) * (1 - pop / 100);

    // Alpha: theta/vega ratio as IV proxy
    const theta = (stoP.theta || 0) + (stoC.theta || 0) - (btoP.theta || 0) - (btoC.theta || 0);
    const vega = Math.abs((stoP.vega || 0) + (stoC.vega || 0) - (btoP.vega || 0) - (btoC.vega || 0));
    const alpha = vega > 0 ? Math.min(100, Math.abs(theta / vega) * 100) : 0;

    const { pop: wp, ev: we, alpha: wa } = profile.weights;
    const score = (pop / 100) * wp * 100 + ev * we + alpha * wa;

    candidates.push({
      expiration: expirationDate,
      dte: d,
      stoP: { symbol: stoP.streamerSymbol, strike: stoPStrike, mid: Math.round(stoP.mid * 100) / 100, delta: stoP.delta },
      btoP: { symbol: btoP.streamerSymbol, strike: parseFloat(btoP.strikePrice), mid: Math.round(btoP.mid * 100) / 100, delta: btoP.delta },
      stoC: { symbol: stoC.streamerSymbol, strike: stoCStrike, mid: Math.round(stoC.mid * 100) / 100, delta: stoC.delta },
      btoC: { symbol: btoC.streamerSymbol, strike: parseFloat(btoC.strikePrice), mid: Math.round(btoC.mid * 100) / 100, delta: btoC.delta },
      credit: Math.round(credit * 100) / 100,
      rr: Math.round(rr * 100) / 100,
      pop: Math.round(pop * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      wings: actualWings,
      score: Math.round(score * 100) / 100,
      theta: Math.round(theta * 100) / 100,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

// ─── Scan one ticker across all profiles ─────────────────────────────────────
async function scanTicker(client, ticker, underlyingPrice) {
  console.log(`\n[Scan] ${ticker} @ $${underlyingPrice.toFixed(2)}`);
  const profileResults = { conservative: [], neutral: [], aggressive: [] };

  let chainData;
  try {
    chainData = await client.instrumentsService.getNestedOptionChain(ticker);
  } catch (e) {
    console.error(`[Scan] Failed to get chain for ${ticker}: ${e.message}`);
    return profileResults;
  }

  // Flatten all expirations across all chain entries
  const expirations = [];
  for (const chain of chainData) {
    for (const exp of (chain.expirations || [])) {
      expirations.push(exp);
    }
  }

  // Filter to DTE range covering all profiles (19-47)
  const validExps = expirations.filter(exp => {
    const d = calcDTE(exp['expiration-date']);
    return d >= 19 && d <= 47;
  });

  console.log(`  ${validExps.length} valid expirations (DTE 19-47)`);

  for (const exp of validExps) {
    const expDate = exp['expiration-date'];
    const d = calcDTE(expDate);
    const strikes = exp['strikes'] || [];

    // Collect streamer symbols
    const streamerSymbols = strikes.flatMap(s => [
      s['call-streamer-symbol'],
      s['put-streamer-symbol'],
    ].filter(Boolean));

    if (!streamerSymbols.length) continue;

    console.log(`  [${expDate}] DTE=${d}, ${streamerSymbols.length} symbols — subscribing...`);

    const { quotes, greeks } = await collectStreamData(client, streamerSymbols, 12000);

    const gotQuotes = Object.keys(quotes).length;
    const gotGreeks = Object.keys(greeks).length;
    console.log(`  [${expDate}] Received: ${gotQuotes} quotes, ${gotGreeks} greeks`);

    if (!gotQuotes && !gotGreeks) continue;

    // Build enriched options list
    const options = strikes.flatMap(s => {
      const result = [];
      for (const [type, sym] of [['C', s['call-streamer-symbol']], ['P', s['put-streamer-symbol']]]) {
        if (!sym) continue;
        const q = quotes[sym] || {};
        const g = greeks[sym] || {};
        const bid = q.bidPrice ?? 0;
        const ask = q.askPrice ?? 0;
        const mid = (bid + ask) / 2;
        if (mid <= 0) continue;
        result.push({
          optionType: type,
          strikePrice: s['strike-price'],
          streamerSymbol: sym,
          mid,
          delta: g.delta ?? null,
          theta: g.theta ?? null,
          vega: g.vega ?? null,
          gamma: g.gamma ?? null,
        });
      }
      return result;
    }).filter(o => o.delta !== null);

    if (!options.length) continue;

    // Run each profile
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const ics = buildICs(options, expDate, profile, underlyingPrice);
      if (ics.length > 0) {
        const best = ics[0];
        console.log(`  [${expDate}/${profileName}] Best: credit=$${best.credit} POP=${best.pop}% RR=${best.rr} score=${best.score}`);
        profileResults[profileName].push(best);
      }
    }
  }

  // Sort each profile by score
  for (const p of Object.keys(profileResults)) {
    profileResults[p].sort((a, b) => b.score - a.score);
  }

  return profileResults;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GUVID MORNING SCAN — ${TODAY} — 10:30 AM ET`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Credentials
  console.log('[Step 1] Reading TastyTrade credentials from Firestore...');
  const creds = await getTastyCredentials();

  // Step 2: Connect
  console.log('[Step 2] Connecting to TastyTrade...');
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  await client.quoteStreamer.connect();
  console.log('[Auth] Streamer connected');

  // Step 3: Morning snapshots
  console.log('\n[Step 3] Capturing morning snapshots...');
  let morningNetLiq = null;
  let morningVix = null;

  try {
    const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
    if (accounts && accounts.length > 0) {
      const acctNum = accounts[0].account?.['account-number'] || accounts[0]['account-number'];
      console.log(`[Snapshot] Using account: ${acctNum}`);
      const balances = await client.balancesAndPositionsService.getAccountBalanceValues(acctNum);
      morningNetLiq = parseFloat(balances['net-liquidating-value'] || '0');
      console.log(`[Snapshot] Net Liq: $${morningNetLiq.toFixed(2)}`);
    }
  } catch (e) {
    console.warn(`[Snapshot] Net liq error: ${e.message}`);
  }

  // VIX via streamer
  try {
    morningVix = await new Promise((resolve) => {
      let captured = null;
      const handler = (records) => {
        for (const r of records) {
          if (r.eventType === 'Quote' && r.eventSymbol === '$VIX.X') {
            captured = (r.bidPrice + r.askPrice) / 2;
          }
        }
      };
      const removeListener = client.quoteStreamer.addEventListener(handler);
      client.quoteStreamer.subscribe(['$VIX.X'], [MarketDataSubscriptionType.Quote]);
      setTimeout(() => {
        removeListener();
        client.quoteStreamer.unsubscribe(['$VIX.X']);
        resolve(captured);
      }, 6000);
    });
    console.log(`[Snapshot] VIX: ${morningVix?.toFixed(2) ?? 'N/A'}`);
  } catch (e) {
    console.warn(`[Snapshot] VIX error: ${e.message}`);
  }

  // Save snapshot — guvid-agent/daily/{date} path requires 4 segments (col/doc/col/doc)
  await db.collection('guvid-agent').doc('daily').collection('entries').doc(TODAY).set({
    morningNetLiq,
    morningVix,
    timestamp: new Date().toISOString(),
    date: TODAY,
  }, { merge: true });
  console.log('[Firestore] Morning snapshot saved');

  // Step 4: Get underlying prices
  console.log('\n[Step 4] Getting underlying prices...');
  let spxPrice = 5600, qqPrice = 470; // fallbacks

  try {
    const prices = await new Promise((resolve) => {
      const collected = {};
      const handler = (records) => {
        for (const r of records) {
          if (r.eventType === 'Quote') {
            if (r.eventSymbol === '$SPX.X' || r.eventSymbol === '$SPX') {
              collected.SPX = (r.bidPrice + r.askPrice) / 2;
            } else if (r.eventSymbol === 'QQQ') {
              collected.QQQ = (r.bidPrice + r.askPrice) / 2;
            }
          }
        }
      };
      const removeListener = client.quoteStreamer.addEventListener(handler);
      client.quoteStreamer.subscribe(['$SPX.X', 'QQQ'], [MarketDataSubscriptionType.Quote]);
      setTimeout(() => {
        removeListener();
        client.quoteStreamer.unsubscribe(['$SPX.X', 'QQQ']);
        resolve(collected);
      }, 6000);
    });
    if (prices.SPX) spxPrice = prices.SPX;
    if (prices.QQQ) qqPrice = prices.QQQ;
    console.log(`[Prices] SPX: $${spxPrice.toFixed(2)}, QQQ: $${qqPrice.toFixed(2)}`);
  } catch (e) {
    console.warn(`[Prices] Error: ${e.message} — using fallbacks`);
  }

  // Step 5: Scan
  console.log('\n[Step 5] Scanning SPX + QQQ...');
  const scanResults = {};
  scanResults['SPX'] = await scanTicker(client, 'SPX', spxPrice);
  scanResults['QQQ'] = await scanTicker(client, 'QQQ', qqPrice);

  // Step 6: Save to Firestore
  console.log('\n[Step 6] Saving to Firestore...');

  await db.collection('guvid-agent').doc('scans').collection('entries').doc(TODAY).set({
    date: TODAY,
    timestamp: new Date().toISOString(),
    type: 'morning',
    SPX: scanResults['SPX'],
    QQQ: scanResults['QQQ'],
  });
  console.log('[Firestore] Scan saved to guvid-agent/scans/entries/' + TODAY);

  // Save best IC per ticker+profile as position
  const posCol = db.collection('guvid-agent').doc('positions').collection('items');
  let positionsSaved = 0;

  for (const [ticker, profiles] of Object.entries(scanResults)) {
    const underlyingPrice = ticker === 'SPX' ? spxPrice : qqPrice;
    for (const [profileName, ics] of Object.entries(profiles)) {
      if (!ics.length) continue;
      const best = ics[0];
      await posCol.add({
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
          underlyingPrice,
          vix: morningVix,
          ivRank: null,
        },
      });
      positionsSaved++;
    }
  }
  console.log(`[Firestore] ${positionsSaved} positions saved`);

  client.quoteStreamer.disconnect();

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MORNING SCAN SUMMARY — ${TODAY}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Net Liq : $${(morningNetLiq || 0).toFixed(2)}`);
  console.log(`VIX     : ${morningVix?.toFixed(2) ?? 'N/A'}`);
  console.log(`SPX     : $${spxPrice.toFixed(2)}`);
  console.log(`QQQ     : $${qqPrice.toFixed(2)}`);
  console.log();

  for (const [ticker, profiles] of Object.entries(scanResults)) {
    for (const [profileName, ics] of Object.entries(profiles)) {
      console.log(`${ticker} — ${profileName.toUpperCase()}: ${ics.length} candidates`);
      if (ics.length > 0) {
        const b = ics[0];
        console.log(`  Best  : exp=${b.expiration} DTE=${b.dte} credit=$${b.credit} POP=${b.pop}% RR=${b.rr} score=${b.score}`);
        console.log(`  Legs  : ${b.btoP.strike}P / ${b.stoP.strike}P | ${b.stoC.strike}C / ${b.btoC.strike}C`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Scan complete.');
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[FATAL]', e.stack || e);
    process.exit(1);
  });

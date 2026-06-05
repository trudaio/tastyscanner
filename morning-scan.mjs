import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import TastytradeClient from './node_modules/@tastytrade/api/dist/tastytrade-api.js';

// ── Firebase init ──────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();
const RISK_FREE_RATE = 0.053; // ~5.3% Fed funds

// ── Profiles ───────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80,
    w: { pop: 0.70, ev: 0.20, alpha: 0.10 }
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60,
    w: { pop: 0.60, ev: 0.25, alpha: 0.15 }
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60,
    w: { pop: 0.40, ev: 0.35, alpha: 0.25 }
  }
};

const TICKERS = ['SPX', 'QQQ'];
const MAX_RR = 4;
const MIN_CREDIT = 1.0;
const SPREAD_PCT = 0.08;

// ── Black-Scholes ──────────────────────────────────────────────────────────
function normCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function bsPrice(S, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0) return Math.max(0, isCall ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (isCall) return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function bsGreeks(S, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0) {
    return { delta: isCall ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0), theta: 0, gamma: 0, vega: 0, price: Math.max(0, isCall ? S-K : K-S) };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPDF(d1);
  const price  = bsPrice(S, K, T, r, sigma, isCall);
  const delta  = isCall ? normCDF(d1) : normCDF(d1) - 1;
  const gamma  = nd1 / (S * sigma * sqrtT);
  const vega   = S * nd1 * sqrtT / 100; // per 1% IV change
  // Theta per day (divide by 365)
  const theta  = isCall
    ? (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365
    : (-(S * nd1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;
  return { delta, theta, gamma, vega, price };
}

// ── Yahoo Finance price fetcher ────────────────────────────────────────────
async function getYahooPrice(symbol) {
  const yahooSym = symbol === 'SPX' ? '%5EGSPC' : symbol === 'VIX' ? '%5EVIX' : symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} → ${res.status}`);
  const data = await res.json();
  return parseFloat(data?.chart?.result?.[0]?.meta?.regularMarketPrice || '0');
}

// ── Date helpers ───────────────────────────────────────────────────────────
function getDte(expirationDate) {
  const exp = new Date(expirationDate + 'T16:00:00-05:00');
  return Math.round((exp - Date.now()) / 86400000);
}

function getT(expirationDate) {
  const dte = getDte(expirationDate);
  return Math.max(dte, 1) / 365;
}

// ── Iron Condor builder (analytical) ──────────────────────────────────────
function buildIronCondors(expirations, ivByExp, underlyingPrice, profile) {
  const { deltaMin, deltaMax, dteMin, dteMax, wings, minPOP, w } = profile;
  const bestPerExp = new Map();

  for (const exp of expirations) {
    const expDate = exp['expiration-date'] || exp.expirationDate;
    if (!expDate) continue;
    const dte = getDte(expDate);
    if (dte < dteMin || dte > dteMax) continue;

    const iv = ivByExp.get(expDate);
    if (!iv || iv <= 0) continue;

    const S = underlyingPrice;
    const T = getT(expDate);
    const r = RISK_FREE_RATE;

    // Iterate over available strikes
    const strikes = (exp.strikes || []).map(s => parseFloat(s['strike-price'] || s.strikePrice)).filter(s => s > 0);
    strikes.sort((a, b) => a - b);

    // For each strike, compute greeks
    const optionData = new Map(); // strike → { put, call }
    for (const K of strikes) {
      const putG  = bsGreeks(S, K, T, r, iv, false);
      const callG = bsGreeks(S, K, T, r, iv, true);
      // Estimate bid/ask spread: OTM options have wider spreads
      const otmFactor = Math.max(0.05, Math.abs(S - K) / S * 0.5);
      const spreadFactor = Math.min(0.15, otmFactor);
      optionData.set(K, {
        put:  { ...putG,  mid: putG.price,  bid: putG.price  * (1 - spreadFactor), ask: putG.price  * (1 + spreadFactor) },
        call: { ...callG, mid: callG.price, bid: callG.price * (1 - spreadFactor), ask: callG.price * (1 + spreadFactor) }
      });
    }

    // Find short put candidates: abs(delta) in [deltaMin/100, deltaMax/100]
    const shortPutCandidates  = strikes.filter(K => {
      const d = optionData.get(K);
      return d && Math.abs(d.put.delta) >= deltaMin/100 && Math.abs(d.put.delta) <= deltaMax/100;
    });
    const shortCallCandidates = strikes.filter(K => {
      const d = optionData.get(K);
      return d && Math.abs(d.call.delta) >= deltaMin/100 && Math.abs(d.call.delta) <= deltaMax/100;
    });

    if (shortPutCandidates.length === 0 || shortCallCandidates.length === 0) continue;

    // Group by abs(round(delta*100)), pick representative per delta bucket, sort desc
    const putGroups  = groupByDeltaAnalytical(shortPutCandidates,  optionData, 'put');
    const callGroups = groupByDeltaAnalytical(shortCallCandidates, optionData, 'call');
    const len = Math.min(putGroups.length, callGroups.length);

    for (let i = 0; i < len; i++) {
      const spK = putGroups[i];
      const scK = callGroups[i];
      const lpK = spK - wings;
      const lcK = scK + wings;

      const spData = optionData.get(spK);
      const scData = optionData.get(scK);
      const lpData = optionData.get(lpK);
      const lcData = optionData.get(lcK);

      if (!spData || !scData || !lpData || !lcData) continue;

      const credit = spData.put.mid + scData.call.mid - lpData.put.mid - lcData.call.mid;
      if (credit < MIN_CREDIT) continue;

      const rr = (wings - credit) / credit;
      if (rr > MAX_RR) continue;

      // Spread width check
      const maxSpread = underlyingPrice * SPREAD_PCT;
      if ((spData.put.ask - spData.put.bid) > maxSpread) continue;
      if ((scData.call.ask - scData.call.bid) > maxSpread) continue;

      const putBEDeltaApprox  = Math.abs(spData.put.delta) * 100;
      const callBEDeltaApprox = Math.abs(scData.call.delta) * 100;
      const pop = 100 - Math.max(putBEDeltaApprox, callBEDeltaApprox);
      if (pop < minPOP) continue;

      const ev = credit * (pop / 100) - wings * (1 - pop / 100);
      const netDelta = Math.abs(spData.put.delta) + Math.abs(scData.call.delta);
      const netTheta = Math.abs(spData.put.theta) + Math.abs(scData.call.theta);
      const alpha = netDelta > 0 ? netTheta / netDelta : 0;

      const evNorm    = Math.min(ev / credit * 100, 100);
      const alphaNorm = Math.min(alpha * 1000, 100);
      const score = w.pop * pop + w.ev * evNorm + w.alpha * alphaNorm;

      const ic = {
        expirationDate: expDate, dte,
        shortPutStrike: spK, shortCallStrike: scK,
        longPutStrike:  lpK, longCallStrike:  lcK,
        credit:  Math.round(credit * 100) / 100,
        rr:      Math.round(rr * 100) / 100,
        pop:     Math.round(pop * 10) / 10,
        ev:      Math.round(ev * 100) / 100,
        alpha:   Math.round(alpha * 1000) / 1000,
        score:   Math.round(score * 10) / 10,
        shortPutDelta:  Math.round(spData.put.delta * 1000) / 1000,
        shortCallDelta: Math.round(scData.call.delta * 1000) / 1000,
        theta:   Math.round((spData.put.theta + scData.call.theta) * 100) / 100,
        iv:      Math.round(iv * 1000) / 1000
      };

      if (!bestPerExp.has(expDate) || ic.score > bestPerExp.get(expDate).score) {
        bestPerExp.set(expDate, ic);
      }
    }
  }

  const results = Array.from(bestPerExp.values());
  results.sort((a, b) => b.score - a.score);
  return results;
}

function groupByDeltaAnalytical(strikeList, optionData, side) {
  const grouped = new Map();
  for (const K of strikeList) {
    const d = optionData.get(K)?.[side];
    if (!d) continue;
    const key = Math.round(Math.abs(d.delta) * 100);
    const existing = grouped.get(key);
    if (!existing || Math.abs(d.delta) > Math.abs(optionData.get(existing)?.[side]?.delta || 0)) {
      grouped.set(key, K);
    }
  }
  const arr = Array.from(grouped.values());
  arr.sort((a, b) => {
    const da = Math.abs(optionData.get(a)?.[side]?.delta || 0);
    const db = Math.abs(optionData.get(b)?.[side]?.delta || 0);
    return db - da;
  });
  return arr;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌅 Guvid Agent — Morning Scan — ${TODAY} ${NOW_ISO}`);
  console.log('='.repeat(60));

  // ── Step 3: Read credentials from Firestore ──────────────────────────────
  console.log('\n📦 Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  let ttCreds = null;
  let userId = null;

  const PREFERRED_UID = 'wDxgHkbPFzYkrp1JEA8ibmZRSp73';
  for (const userDoc of usersSnap.docs) {
    if (userDoc.id !== PREFERRED_UID) continue;
    const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        ttCreds = data.credentials;
        userId = userDoc.id;
        console.log(`  ✓ Credentials for user: ${userId} (broker: ${brokerDoc.id})`);
        break;
      }
    }
    if (ttCreds) break;
  }
  if (!ttCreds) {
    for (const userDoc of usersSnap.docs) {
      const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
      for (const brokerDoc of brokerSnap.docs) {
        const data = brokerDoc.data();
        if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
          ttCreds = data.credentials;
          userId = userDoc.id;
          console.log(`  ✓ Fallback credentials for user: ${userId}`);
          break;
        }
      }
      if (ttCreds) break;
    }
  }
  if (!ttCreds) throw new Error('No TastyTrade credentials found in Firestore');

  // ── TastyTrade SDK client ─────────────────────────────────────────────────
  console.log('\n🔐 Initializing TastyTrade SDK client...');
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: ttCreds.clientSecret,
    refreshToken:  ttCreds.refreshToken,
    oauthScopes:   ['read', 'trade']
  });

  // ── Account balances ──────────────────────────────────────────────────────
  console.log('\n💰 Fetching account balances...');
  const accounts = await client.accountsAndCustomersService.getCustomerAccountResources();
  const accountItems = Array.isArray(accounts) ? accounts : (accounts?.items || []);
  if (!accountItems.length) throw new Error('No accounts found');

  const accountNumber = accountItems[0].account?.['account-number'] || accountItems[0]['account-number'];
  console.log(`  Account: ${accountNumber}`);

  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const morningNetLiq = parseFloat(balances?.['net-liquidating-value'] || balances?.netLiquidatingValue || '0');
  console.log(`  Net Liquidating Value: $${morningNetLiq.toLocaleString()}`);

  // ── Step 4: Get VIX + snapshot ────────────────────────────────────────────
  console.log('\n📊 Fetching VIX from Yahoo Finance...');
  const morningVix = await getYahooPrice('VIX').catch(() => null);
  console.log(`  VIX: ${morningVix ?? 'N/A'}`);

  console.log('\n💾 Saving morning snapshot...');
  await db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot').set({
    morningNetLiq, morningVix, timestamp: NOW_ISO, date: TODAY
  });
  console.log(`  ✓ netLiq=$${morningNetLiq.toLocaleString()}, VIX=${morningVix}`);

  // ── Get market metrics (per-expiration IV) ────────────────────────────────
  console.log('\n📈 Fetching market metrics (per-expiration IVs)...');
  const metricsRaw = await client.marketMetricsService.getMarketMetrics({ symbols: 'SPX,QQQ' });
  const metricsMap = new Map();
  for (const m of (Array.isArray(metricsRaw) ? metricsRaw : [metricsRaw])) {
    const sym = m.symbol;
    const ivRank = parseFloat(m['implied-volatility-index-rank'] || m['tw-implied-volatility-index-rank'] || '0');
    const ivIndex = parseFloat(m['implied-volatility-index'] || '0');
    const expIVs = new Map();
    for (const e of (m['option-expiration-implied-volatilities'] || [])) {
      expIVs.set(e['expiration-date'], parseFloat(e['implied-volatility']));
    }
    metricsMap.set(sym, { ivRank, ivIndex, expIVs });
    console.log(`  ${sym}: IV rank ${(ivRank*100).toFixed(1)}%, IV index ${(ivIndex*100).toFixed(1)}%, ${expIVs.size} exp IVs`);
  }

  // ── Step 5: Scan SPX + QQQ ────────────────────────────────────────────────
  const scanResults = {};

  for (const ticker of TICKERS) {
    console.log(`\n🔍 Scanning ${ticker}...`);
    scanResults[ticker] = {};

    // Underlying price from Yahoo
    const underlyingPrice = await getYahooPrice(ticker);
    scanResults[ticker]._underlyingPrice = underlyingPrice;
    console.log(`  ${ticker} price: $${underlyingPrice}`);

    // Option chain from TastyTrade REST
    let chainData;
    try {
      chainData = await client.instrumentsService.getNestedOptionChain(ticker);
    } catch (e) {
      console.error(`  ✗ Chain failed for ${ticker}: ${e.message}`);
      for (const p of Object.keys(PROFILES)) scanResults[ticker][p] = [];
      continue;
    }

    const items = Array.isArray(chainData) ? chainData : (chainData?.items || [chainData]);
    const expirations = items?.[0]?.expirations || items?.expirations || [];
    console.log(`  Found ${expirations.length} expirations`);

    const metrics = metricsMap.get(ticker);
    if (!metrics) {
      console.warn(`  ⚠️ No metrics for ${ticker}`);
      for (const p of Object.keys(PROFILES)) scanResults[ticker][p] = [];
      continue;
    }

    // Filter to DTE 19-47 and count available exp IVs
    const relevantExps = expirations.filter(exp => {
      const expDate = exp['expiration-date'] || exp.expirationDate;
      const dte = getDte(expDate);
      return dte >= 19 && dte <= 47;
    });

    const expsWithIV = relevantExps.filter(exp => {
      const expDate = exp['expiration-date'] || exp.expirationDate;
      return metrics.expIVs.has(expDate);
    });

    console.log(`  DTE 19-47 expirations: ${relevantExps.length} (${expsWithIV.length} have per-exp IV)`);

    // For expirations without per-exp IV, use the index IV as fallback
    const ivByExp = new Map();
    for (const exp of relevantExps) {
      const expDate = exp['expiration-date'] || exp.expirationDate;
      ivByExp.set(expDate, metrics.expIVs.get(expDate) || metrics.ivIndex);
    }

    // Run 3 profiles
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const ics = buildIronCondors(relevantExps, ivByExp, underlyingPrice, profile);
      scanResults[ticker][profileName] = ics;
      console.log(`  [${profileName}] → ${ics.length} ICs found`);
      if (ics.length > 0) {
        const b = ics[0];
        console.log(`    Best: ${b.expirationDate} DTE${b.dte} | ` +
          `${b.longPutStrike}/${b.shortPutStrike}/${b.shortCallStrike}/${b.longCallStrike} | ` +
          `Credit $${b.credit} | POP ${b.pop}% | R/R ${b.rr} | Score ${b.score}`);
      }
    }
  }

  // ── Step 6: Save to Firestore ─────────────────────────────────────────────
  console.log('\n💾 Saving scan results to Firestore...');

  const scanDoc = { date: TODAY, timestamp: NOW_ISO, type: 'morning', morningNetLiq, morningVix };
  for (const ticker of TICKERS) {
    scanDoc[ticker] = {};
    for (const p of Object.keys(PROFILES)) {
      scanDoc[ticker][p] = scanResults[ticker]?.[p] || [];
    }
  }
  await db.collection('guvid-agent').doc('scans').collection(TODAY).doc('morning').set(scanDoc);
  console.log('  ✓ Scan saved to guvid-agent/scans/' + TODAY + '/morning');

  // Save best IC as candidate positions
  let savedPositions = 0;
  for (const ticker of TICKERS) {
    const tickerMetrics = metricsMap.get(ticker);
    for (const [profileName, ics] of Object.entries(scanResults[ticker] || {})) {
      if (profileName.startsWith('_') || !ics?.length) continue;
      const best = ics[0];
      await db.collection('guvid-agent').doc('positions').collection('all').add({
        ticker, profile: profileName,
        ic: {
          shortPutStrike:  best.shortPutStrike,  shortCallStrike: best.shortCallStrike,
          longPutStrike:   best.longPutStrike,   longCallStrike:  best.longCallStrike,
          shortPutDelta:   best.shortPutDelta,   shortCallDelta:  best.shortCallDelta,
          theta:           best.theta
        },
        openDate: TODAY, expiration: best.expirationDate,
        credit: best.credit, pop: best.pop, ev: best.ev,
        alpha: best.alpha, rr: best.rr, wings: PROFILES[profileName].wings,
        score: best.score, dte: best.dte,
        status: 'open', dailyChecks: [],
        marketContext: {
          underlyingPrice: scanResults[ticker]._underlyingPrice || 0,
          vix:    morningVix,
          ivRank: tickerMetrics?.ivRank ? Math.round(tickerMetrics.ivRank * 1000) / 10 : null
        }
      });
      savedPositions++;
      console.log(`  ✓ ${ticker} [${profileName}] ${best.expirationDate} $${best.credit} credit`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('📋 MORNING SCAN SUMMARY');
  console.log('='.repeat(60));
  console.log(`Date:          ${TODAY}`);
  console.log(`Net Liquidity: $${morningNetLiq.toLocaleString()}`);
  console.log(`VIX:           ${morningVix ?? 'N/A'}`);
  console.log('');

  for (const ticker of TICKERS) {
    const m = metricsMap.get(ticker);
    console.log(`${ticker} (price: $${scanResults[ticker]._underlyingPrice}, IV rank: ${m ? (m.ivRank*100).toFixed(1) : 'N/A'}%):`);
    for (const profileName of Object.keys(PROFILES)) {
      const ics = scanResults[ticker]?.[profileName] || [];
      if (ics.length > 0) {
        const b = ics[0];
        console.log(`  [${profileName.padEnd(12)}] ${b.expirationDate} DTE${b.dte} | ` +
          `${b.longPutStrike}/${b.shortPutStrike}/${b.shortCallStrike}/${b.longCallStrike} | ` +
          `Credit $${b.credit} | POP ${b.pop}% | R/R ${b.rr} | Score ${b.score}`);
      } else {
        console.log(`  [${profileName.padEnd(12)}] No ICs found`);
      }
    }
  }

  console.log(`\nPositions saved: ${savedPositions}`);
  console.log('='.repeat(60));
  console.log('✅ Morning scan complete.\n');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
});

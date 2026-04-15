/**
 * Guvid Agent — Morning Scan (10:30 AM ET)
 * Scans SPX + QQQ with 3 profiles and saves results to Firestore.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Firebase Admin (CJS)
const admin = require('firebase-admin');

// TastyTrade (ESM)
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Init Firebase ────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Step 3: Read TastyTrade credentials from Firestore ───────────────────────
async function loadTastyCredentials() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const subSnap = await userDoc.ref.collection('brokerAccounts').get();
    for (const acctDoc of subSnap.docs) {
      const data = acctDoc.data();
      if (data.isActive && data.credentials) {
        const { clientSecret, refreshToken } = data.credentials;
        if (clientSecret && refreshToken) {
          console.log(`[Firestore] Found active TastyTrade account for user ${userDoc.id}`);
          return { clientSecret, refreshToken };
        }
      }
    }
  }
  throw new Error('No active TastyTrade credentials found in Firestore');
}

// ─── Step 4: Capture Morning Snapshot ────────────────────────────────────────
async function captureMorningSnapshot(tasty, accountNumber, quotes, trades) {
  const date = today();
  const timestamp = new Date().toISOString();

  // Net Liq
  let morningNetLiq = 0;
  try {
    const balances = await tasty.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    const rawNL = balances['net-liquidating-value'];
    console.log('[Snapshot] net-liquidating-value raw:', rawNL);
    morningNetLiq = parseFloat(rawNL || '0');
    console.log(`[Snapshot] Net Liq: $${morningNetLiq.toFixed(2)}`);
  } catch (e) {
    console.warn('[Snapshot] Could not fetch net liq:', e.message);
  }

  // VIX from shared quotes store (populated after underlying subscribe)
  let morningVix = null;
  try {
    for (const vixSym of ['$VIX.X', 'VIX']) {
      const q = quotes[vixSym];
      const t = trades[vixSym];
      if (q?.bidPrice != null && q?.askPrice != null) {
        morningVix = parseFloat(((q.bidPrice + q.askPrice) / 2).toFixed(2));
        break;
      } else if (t?.price != null) {
        morningVix = parseFloat(t.price.toFixed(2));
        break;
      }
    }
    console.log(`[Snapshot] VIX: ${morningVix}`);
  } catch (e) {
    console.warn('[Snapshot] Could not read VIX:', e.message);
  }

  const snapshot = { morningNetLiq, morningVix, timestamp, date };
  await db.collection('guvid-agent-daily').doc(date).set(snapshot, { merge: true });
  console.log(`[Snapshot] Saved to guvid-agent-daily/${date}`);
  return { morningNetLiq, morningVix };
}


// ─── Step 5: IC Scanner ───────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16,
    dteMin: 30, dteMax: 47,
    wings: 10,
    minPOP: 80,
    scoreWeights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
    maxRR: 4,
    spreadPct: 0.08,
    minCredit: 1.0,
  },
  neutral: {
    deltaMin: 11, deltaMax: 24,
    dteMin: 19, dteMax: 47,
    wings: 10,
    minPOP: 60,
    scoreWeights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
    maxRR: 4,
    spreadPct: 0.08,
    minCredit: 1.0,
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24,
    dteMin: 19, dteMax: 35,
    wings: 5,
    minPOP: 60,
    scoreWeights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
    maxRR: 4,
    spreadPct: 0.08,
    minCredit: 1.0,
  },
};

/**
 * Compute mid price from streamer data.
 * Falls back to last trade if no quote available.
 */
function getMid(quotes, trades, sym) {
  const q = quotes[sym];
  if (q && q.bidPrice != null && q.askPrice != null) {
    return (q.bidPrice + q.askPrice) / 2;
  }
  const t = trades[sym];
  if (t && t.price != null) return t.price;
  return null;
}

/**
 * Build all candidate ICs for a given expiration and profile.
 * Returns the best-scoring IC or null.
 */
function buildBestIC(strikes, quotes, trades, greeks, underlyingPrice, profileName) {
  const profile = PROFILES[profileName];

  // Collect puts and calls with valid greeks
  const puts = [];
  const calls = [];

  for (const strike of strikes) {
    const putDelta = greeks[strike.putStreamerSymbol]?.delta;
    const callDelta = greeks[strike.callStreamerSymbol]?.delta;
    const putMid = getMid(quotes, trades, strike.putStreamerSymbol);
    const callMid = getMid(quotes, trades, strike.callStreamerSymbol);

    // Delta from dxFeed: puts are negative (0 to -1), calls positive (0 to 1)
    // We work in abs(delta)*100 for comparison
    if (putDelta != null && putMid != null) {
      const absDelta = Math.abs(putDelta) * 100;
      if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
        puts.push({ strike: strike.strikePrice, streamerSym: strike.putStreamerSymbol, delta: putDelta, mid: putMid });
      }
    }
    if (callDelta != null && callMid != null) {
      const absDelta = Math.abs(callDelta) * 100;
      if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
        calls.push({ strike: strike.strikePrice, streamerSym: strike.callStreamerSymbol, delta: callDelta, mid: callMid });
      }
    }
  }

  if (puts.length === 0 || calls.length === 0) return null;

  // Sort both by abs(delta) descending for symmetric pairing
  puts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  calls.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Group by rounded abs(delta*100) and pair by index
  const putGroups = groupByRoundedDelta(puts);
  const callGroups = groupByRoundedDelta(calls);
  const pairCount = Math.min(putGroups.length, callGroups.length);

  let bestIC = null;
  let bestScore = -Infinity;

  for (let i = 0; i < pairCount; i++) {
    const sto_put = putGroups[i][0]; // short put
    const sto_call = callGroups[i][0]; // short call

    // Find long legs (wings further OTM)
    const bto_put_strike = sto_put.strike - profile.wings;
    const bto_call_strike = sto_call.strike + profile.wings;

    const bto_put = findClosestStrike(strikes, bto_put_strike, 'put', quotes, trades);
    const bto_call = findClosestStrike(strikes, bto_call_strike, 'call', quotes, trades);
    if (!bto_put || !bto_call) continue;

    // Validate spread width constraint (8% of underlying per leg)
    const maxSpread = underlyingPrice * profile.spreadPct;
    if (Math.abs(sto_put.strike - bto_put.strike) > maxSpread) continue;
    if (Math.abs(sto_call.strike - bto_call.strike) > maxSpread) continue;

    // Calculate credit
    const credit = sto_put.mid + sto_call.mid - bto_put.mid - bto_call.mid;
    if (credit < profile.minCredit) continue;

    // R/R = (wings - credit) / credit
    const rr = (profile.wings - credit) / credit;
    if (rr > profile.maxRR) continue;

    // POP = 100 - max(putBEDelta, callBEDelta)
    // Break-even deltas: approximate as the abs delta at BE strikes
    const putBE = sto_put.strike - credit;
    const callBE = sto_call.strike + credit;

    // Interpolate delta at BE strikes from strikes array
    const putBEDelta = interpolateDelta(strikes, putBE, 'put', greeks) ?? Math.abs(sto_put.delta) * 100;
    const callBEDelta = interpolateDelta(strikes, callBE, 'call', greeks) ?? Math.abs(sto_call.delta) * 100;
    const pop = 100 - Math.max(putBEDelta, callBEDelta);

    if (pop < profile.minPOP) continue;

    // EV = credit * (pop/100) - (wings - credit) * ((100 - pop) / 100)
    const ev = credit * (pop / 100) - (profile.wings - credit) * ((100 - pop) / 100);

    // Alpha = credit / wings (normalized premium capture)
    const alpha = credit / profile.wings;

    // Score
    const w = profile.scoreWeights;
    const normPOP = pop / 100;
    const normEV = Math.max(0, ev) / profile.wings;
    const score = w.pop * normPOP + w.ev * normEV + w.alpha * alpha;

    if (score > bestScore) {
      bestScore = score;
      bestIC = {
        shortPut: { strike: sto_put.strike, streamerSymbol: sto_put.streamerSym, delta: sto_put.delta, mid: sto_put.mid },
        longPut: { strike: bto_put.strike, streamerSymbol: bto_put.streamerSym, mid: bto_put.mid },
        shortCall: { strike: sto_call.strike, streamerSymbol: sto_call.streamerSym, delta: sto_call.delta, mid: sto_call.mid },
        longCall: { strike: bto_call.strike, streamerSymbol: bto_call.streamerSym, mid: bto_call.mid },
        credit: parseFloat(credit.toFixed(2)),
        rr: parseFloat(rr.toFixed(2)),
        pop: parseFloat(pop.toFixed(1)),
        ev: parseFloat(ev.toFixed(2)),
        alpha: parseFloat(alpha.toFixed(3)),
        score: parseFloat(score.toFixed(4)),
        wings: profile.wings,
      };
    }
  }

  return bestIC;
}

function groupByRoundedDelta(options) {
  const groups = {};
  for (const opt of options) {
    const key = Math.round(Math.abs(opt.delta) * 100);
    if (!groups[key]) groups[key] = [];
    groups[key].push(opt);
  }
  return Object.values(groups).sort((a, b) => Math.abs(b[0].delta) - Math.abs(a[0].delta));
}

function findClosestStrike(strikes, targetStrike, type, quotes, trades) {
  let best = null;
  let bestDist = Infinity;
  for (const s of strikes) {
    const dist = Math.abs(s.strikePrice - targetStrike);
    const sym = type === 'put' ? s.putStreamerSymbol : s.callStreamerSymbol;
    const mid = getMid(quotes, trades, sym);
    if (dist < bestDist && mid != null) {
      bestDist = dist;
      best = { strike: s.strikePrice, streamerSym: sym, mid };
    }
  }
  return best;
}

function interpolateDelta(strikes, targetStrike, type, greeks) {
  // Find the two nearest strikes and linearly interpolate delta
  const sorted = [...strikes].sort((a, b) => a.strikePrice - b.strikePrice);
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (targetStrike >= lo.strikePrice && targetStrike <= hi.strikePrice) {
      const loSym = type === 'put' ? lo.putStreamerSymbol : lo.callStreamerSymbol;
      const hiSym = type === 'put' ? hi.putStreamerSymbol : hi.callStreamerSymbol;
      const loDelta = greeks[loSym]?.delta;
      const hiDelta = greeks[hiSym]?.delta;
      if (loDelta != null && hiDelta != null) {
        const t = (targetStrike - lo.strikePrice) / (hi.strikePrice - lo.strikePrice);
        return Math.abs(loDelta + t * (hiDelta - loDelta)) * 100;
      }
    }
  }
  return null;
}

/**
 * Scan a single ticker across all 3 profiles.
 */
async function scanTicker(tasty, ticker, quotes, trades, greeks, underlyingPrice, ivRank) {
  console.log(`\n[Scanner] Scanning ${ticker} (price: ${underlyingPrice?.toFixed(2)}, IVR: ${ivRank?.toFixed(0)}%)`);

  const chain = await tasty.instrumentsService.getNestedOptionChain(ticker);
  const results = { conservative: [], neutral: [], aggressive: [] };

  let totalExpirations = 0;
  const allStreamerSymbols = [];

  // Collect all streamer symbols across all profiles' DTE ranges
  for (const chainEntry of chain) {
    for (const expiry of chainEntry.expirations) {
      const dte = parseInt(expiry['days-to-expiration'] || '0', 10);
      if (dte < 19 || dte > 47) continue; // skip outside any profile range

      for (const strike of expiry['strikes'] || []) {
        if (strike['call-streamer-symbol']) allStreamerSymbols.push(strike['call-streamer-symbol']);
        if (strike['put-streamer-symbol']) allStreamerSymbols.push(strike['put-streamer-symbol']);
      }
    }
  }

  // Subscribe and wait for data
  if (allStreamerSymbols.length > 0) {
    console.log(`[Scanner] Subscribing to ${allStreamerSymbols.length} option symbols for ${ticker}`);
    tasty.quoteStreamer.subscribe(allStreamerSymbols, [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
    ]);
    console.log(`[Scanner] Waiting 12s for data...`);
    await sleep(12000);
  }

  // Now scan each expiration
  for (const chainEntry of chain) {
    for (const expiry of chainEntry.expirations) {
      const dte = parseInt(expiry['days-to-expiration'] || '0', 10);
      const expirationDate = expiry['expiration-date'];
      const strikes = (expiry['strikes'] || []).map((s) => ({
        strikePrice: parseFloat(s['strike-price']),
        callId: s['call'],
        callStreamerSymbol: s['call-streamer-symbol'],
        putId: s['put'],
        putStreamerSymbol: s['put-streamer-symbol'],
      }));

      totalExpirations++;

      for (const profileName of Object.keys(PROFILES)) {
        const profile = PROFILES[profileName];
        if (dte < profile.dteMin || dte > profile.dteMax) continue;

        const ic = buildBestIC(strikes, quotes, trades, greeks, underlyingPrice, profileName);
        if (ic) {
          results[profileName].push({ expiration: expirationDate, dte, ic });
          console.log(`  [${profileName}] ${expirationDate} (DTE ${dte}): credit $${ic.credit}, POP ${ic.pop}%, R/R ${ic.rr}, score ${ic.score}`);
        }
      }
    }
  }

  console.log(`[Scanner] ${ticker}: scanned ${totalExpirations} expirations`);

  // Pick best per profile (highest score per expiration, return all qualifying expirations)
  for (const profileName of Object.keys(results)) {
    results[profileName].sort((a, b) => b.ic.score - a.ic.score);
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  GUVID AGENT — MORNING SCAN', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 3: Load credentials
  const { clientSecret, refreshToken } = await loadTastyCredentials();

  // Create TastyTrade client — use read-only scope (refresh token was granted with 'read')
  const tasty = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret,
    refreshToken,
    oauthScopes: ['read'],
  });

  // Shared data stores (populated by event listener)
  const quotes = {};
  const trades = {};
  const greeks = {};

  // Listen to all streamer events
  tasty.quoteStreamer.addEventListener((events) => {
    for (const ev of events) {
      const sym = ev.eventSymbol;
      if (!sym) continue;
      if (ev.eventType === 'Quote') {
        quotes[sym] = { bidPrice: ev.bidPrice, askPrice: ev.askPrice };
      } else if (ev.eventType === 'Trade') {
        trades[sym] = { price: ev.price };
      } else if (ev.eventType === 'Greeks') {
        greeks[sym] = {
          delta: ev.delta,
          theta: ev.theta,
          gamma: ev.gamma,
          vega: ev.vega,
          volatility: ev.volatility,
        };
      }
    }
  });

  // Connect streamer
  console.log('[Setup] Connecting to TastyTrade...');
  await tasty.quoteStreamer.connect();
  console.log('[Setup] Connected.\n');

  // Get account number
  const accounts = await tasty.accountsAndCustomersService.getCustomerAccounts();
  const accountNumber = accounts[0]?.account?.['account-number'];
  if (!accountNumber) throw new Error('No account found');
  console.log(`[Setup] Account: ${accountNumber}`);

  // Subscribe to underlying quotes for SPX, QQQ, and VIX first
  // $VIX.X is TastyTrade's dxFeed symbol for CBOE VIX index
  tasty.quoteStreamer.subscribe(['SPX', 'QQQ', '$VIX.X', 'VIX'], [
    MarketDataSubscriptionType.Quote,
    MarketDataSubscriptionType.Trade,
  ]);
  console.log('[Setup] Waiting 8s for underlying + VIX data...');
  await sleep(8000);

  // Step 4: Capture morning snapshot (quotes now populated)
  const { morningNetLiq, morningVix } = await captureMorningSnapshot(tasty, accountNumber, quotes, trades);

  // Get underlying prices
  const spxPrice = (quotes['SPX']?.bidPrice + quotes['SPX']?.askPrice) / 2
    || trades['SPX']?.price || 0;
  const qqqPrice = (quotes['QQQ']?.bidPrice + quotes['QQQ']?.askPrice) / 2
    || trades['QQQ']?.price || 0;

  console.log(`[Underlying] SPX: $${spxPrice?.toFixed(2)}, QQQ: $${qqqPrice?.toFixed(2)}`);

  // Get market metrics for IV Rank — API expects { symbols: 'SPX,QQQ' }
  let spxIVRank = 0, qqqIVRank = 0;
  try {
    const metrics = await tasty.marketMetricsService.getMarketMetrics({ symbols: 'SPX,QQQ' });
    const spxM = (metrics || []).find((m) => m.symbol === 'SPX');
    const qqqM = (metrics || []).find((m) => m.symbol === 'QQQ');
    spxIVRank = parseFloat(spxM?.['iv-rank'] || spxM?.['ivRank'] || '0');
    qqqIVRank = parseFloat(qqqM?.['iv-rank'] || qqqM?.['ivRank'] || '0');
    console.log(`[IVRank] SPX: ${spxIVRank}%, QQQ: ${qqqIVRank}%`);
  } catch (e) { console.warn('[IVRank] Fetch failed:', e.message); }

  // Step 5: Scan SPX and QQQ
  const spxResults = await scanTicker(tasty, 'SPX', quotes, trades, greeks, spxPrice, spxIVRank);
  const qqqResults = await scanTicker(tasty, 'QQQ', quotes, trades, greeks, qqqPrice, qqqIVRank);

  // Step 6: Save scan to Firestore
  const date = today();
  const timestamp = new Date().toISOString();

  const scanData = {
    date,
    timestamp,
    type: 'morning',
    SPX: spxResults,
    QQQ: qqqResults,
    context: {
      morningNetLiq,
      morningVix,
      spxPrice: parseFloat((spxPrice || 0).toFixed(2)),
      qqqPrice: parseFloat((qqqPrice || 0).toFixed(2)),
      spxIVRank: parseFloat((spxIVRank || 0).toFixed(1)),
      qqqIVRank: parseFloat((qqqIVRank || 0).toFixed(1)),
    },
  };

  await db.collection('guvid-agent-scans').doc(date).set(scanData, { merge: true });
  console.log(`\n[Firestore] Scan saved to guvid-agent-scans/${date}`);

  // Save each best IC as a position
  const positionsRef = db.collection('guvid-agent-positions');
  const savedPositions = [];

  for (const [ticker, tickerResults] of [['SPX', spxResults], ['QQQ', qqqResults]]) {
    const underlyingPrice = ticker === 'SPX' ? spxPrice : qqqPrice;
    const ivRank = ticker === 'SPX' ? spxIVRank : qqqIVRank;

    for (const profileName of Object.keys(PROFILES)) {
      const expirations = tickerResults[profileName];
      if (!expirations || expirations.length === 0) continue;

      // Best IC = top-scoring expiration
      const best = expirations[0];
      const ic = best.ic;

      const posDoc = {
        ticker,
        profile: profileName,
        ic,
        openDate: date,
        expiration: best.expiration,
        dte: best.dte,
        credit: ic.credit,
        pop: ic.pop,
        ev: ic.ev,
        alpha: ic.alpha,
        rr: ic.rr,
        wings: ic.wings,
        score: ic.score,
        status: 'open',
        dailyChecks: [],
        marketContext: {
          underlyingPrice: parseFloat((underlyingPrice || 0).toFixed(2)),
          vix: morningVix,
          ivRank: parseFloat((ivRank || 0).toFixed(1)),
        },
      };

      const ref = await positionsRef.add(posDoc);
      savedPositions.push({ id: ref.id, ticker, profile: profileName, ...posDoc });
      console.log(`[Firestore] Position saved: ${ticker} ${profileName} ${best.expiration} → ${ref.id}`);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║              MORNING SCAN SUMMARY                   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Date:         ${date}                          ║`);
  console.log(`║  Net Liq:      $${(morningNetLiq || 0).toFixed(2).padStart(10)}                     ║`);
  console.log(`║  VIX:          ${(morningVix || 0).toFixed(2).padStart(6)}                             ║`);
  console.log(`║  SPX:          $${(spxPrice || 0).toFixed(2).padStart(8)} (IVR ${(spxIVRank || 0).toFixed(0).padStart(3)}%)          ║`);
  console.log(`║  QQQ:          $${(qqqPrice || 0).toFixed(2).padStart(8)} (IVR ${(qqqIVRank || 0).toFixed(0).padStart(3)}%)          ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  BEST IRON CONDORS FOUND:                            ║');

  for (const pos of savedPositions) {
    const line = `  ${pos.ticker} ${pos.profile.padEnd(12)} ${pos.expiration}  credit $${pos.credit} POP ${pos.pop}%`;
    console.log(`║ ${line.padEnd(53)}║`);
  }

  if (savedPositions.length === 0) {
    console.log('║  No qualifying iron condors found today.             ║');
  }

  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Saved ${savedPositions.length} position(s) to Firestore                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Cleanup
  tasty.quoteStreamer.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ── Firebase init ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();

// ── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16, dteMin: 30, dteMax: 47, wings: 10,
    minPOP: 80, maxRR: 4, minCredit: 1.0, spreadPct: 0.08,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24, dteMin: 19, dteMax: 47, wings: 10,
    minPOP: 60, maxRR: 4, minCredit: 1.0, spreadPct: 0.08,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24, dteMin: 19, dteMax: 35, wings: 5,
    minPOP: 60, maxRR: 4, minCredit: 1.0, spreadPct: 0.08,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function dte(expirationDate) {
  // Compare calendar dates (midnight-to-midnight) to avoid timezone drift
  const exp = new Date(expirationDate + 'T00:00:00');
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exp - todayMidnight) / (1000 * 60 * 60 * 24));
}

function parsePrice(v) {
  if (v === undefined || v === null || v === 'NaN') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

function mid(bid, ask) {
  const b = parsePrice(bid), a = parsePrice(ask);
  if (!b && !a) return 0;
  if (!b) return a;
  if (!a) return b;
  return (b + a) / 2;
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Load credentials from Firestore ──────────────────────────────────────────
async function loadCredentials() {
  console.log('\n[Step 3] Loading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`  Credentials: user=${userDoc.id} broker=${brokerDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ── Main scan ─────────────────────────────────────────────────────────────────
async function runScan() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  GUVID AGENT — Morning Scan  ${NOW_ISO}`);
  console.log(`${'='.repeat(60)}\n`);

  const creds = await loadCredentials();

  // ── Init TastytradeClient (OAuth2) ────────────────────────────────────────
  console.log('\n[Init] Connecting to TastyTrade...');
  const { default: TastytradeClient, MarketDataSubscriptionType } = await import('@tastytrade/api');

  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  await client.httpClient.generateAccessToken();
  console.log('  Access token obtained');

  // ── Connect quote streamer ────────────────────────────────────────────────
  console.log('[Streamer] Connecting DxLink...');
  const quoteData = new Map();
  const greekData = new Map();

  client.quoteStreamer.addEventListener((records) => {
    for (const r of records) {
      if (r.eventType === 'Quote') quoteData.set(r.eventSymbol, r);
      else if (r.eventType === 'Greeks') greekData.set(r.eventSymbol, r);
    }
  });

  await client.quoteStreamer.connect();
  console.log('  Streamer connected');

  // ── Step 4: Morning snapshot ──────────────────────────────────────────────
  console.log('\n[Step 4] Capturing morning snapshot...');

  // Find the open (active) account
  const allAccounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const accounts = Array.isArray(allAccounts) ? allAccounts : (allAccounts?.data?.items || []);
  const openAccount = accounts.find(a => !(a.account || a)['is-closed']) || accounts[0];
  const accountObj = openAccount?.account || openAccount;
  const accountNumber = accountObj?.['account-number'];
  console.log(`  Account: ${accountNumber} (${accounts.length} total, using open)`);

  const balData = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const morningNetLiq = parsePrice(balData?.['net-liquidating-value']);
  console.log(`  Net Liq: $${morningNetLiq.toFixed(2)}`);

  // Subscribe VIX and underlying quotes early
  const vixSymbol = '$VIX.X';
  client.quoteStreamer.subscribe([vixSymbol, '$SPX.X', 'QQQ'], [MarketDataSubscriptionType.Quote]);
  await waitMs(5000);

  const vixQ = quoteData.get(vixSymbol);
  const morningVix = vixQ ? mid(vixQ.bidPrice, vixQ.askPrice) : null;
  console.log(`  VIX: ${morningVix !== null ? morningVix.toFixed(2) : 'N/A (subscribed, may arrive later)'}`);

  // Save morning snapshot
  await db.collection('guvid-agent').doc('daily')
    .collection(TODAY).doc('morning')
    .set({ morningNetLiq, morningVix, timestamp: NOW_ISO, date: TODAY }, { merge: true });
  console.log(`  Snapshot saved → guvid-agent/daily/${TODAY}/morning`);

  // ── Step 5: Scan SPX + QQQ ────────────────────────────────────────────────
  // SPX uses SPXW (weeklies); QQQ uses QQQ
  const TICKER_CONFIGS = [
    { ticker: 'SPX', chainSymbol: 'SPXW', underlyingStreamer: '$SPX.X' },
    { ticker: 'QQQ', chainSymbol: 'QQQ',  underlyingStreamer: 'QQQ' },
  ];

  const scanResults = { SPX: { conservative: [], neutral: [], aggressive: [] },
                        QQQ: { conservative: [], neutral: [], aggressive: [] } };

  const maxDteAll = Math.max(...Object.values(PROFILES).map(p => p.dteMax));
  const minDteAll = Math.min(...Object.values(PROFILES).map(p => p.dteMin));

  for (const { ticker, chainSymbol, underlyingStreamer } of TICKER_CONFIGS) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[Scan] ${ticker} (chain: ${chainSymbol})`);
    console.log(`${'─'.repeat(50)}`);

    // Fetch option chain — response is [{ expirations: [...] }]
    let expirations = [];
    try {
      const chainResp = await client.instrumentsService.getNestedOptionChain(chainSymbol);
      const chainObj = Array.isArray(chainResp) ? chainResp[0] : chainResp;
      expirations = chainObj?.expirations || [];
      console.log(`  Chain: ${expirations.length} total expirations`);
    } catch (e) {
      console.log(`  Chain error: ${e.message}`);
      continue;
    }

    const validExps = expirations.filter(exp => {
      const d = dte(exp['expiration-date']);
      return d >= minDteAll && d <= maxDteAll;
    });
    console.log(`  In DTE ${minDteAll}-${maxDteAll}: ${validExps.length} expirations`);
    validExps.slice(0, 5).forEach(e => console.log(`    ${e['expiration-date']} (${dte(e['expiration-date'])}d)`));

    for (const exp of validExps) {
      const expDate = exp['expiration-date'];
      const expDte = dte(expDate);
      const strikes = exp.strikes || [];
      console.log(`\n  ${expDate} (${expDte}d) — ${strikes.length} strikes`);
      if (!strikes.length) continue;

      // Collect all streamer symbols for this expiration
      // Strike structure: { 'strike-price', 'call', 'call-streamer-symbol', 'put', 'put-streamer-symbol' }
      const putSyms = strikes.map(s => s['put-streamer-symbol']).filter(Boolean);
      const callSyms = strikes.map(s => s['call-streamer-symbol']).filter(Boolean);
      const allSyms = [...putSyms, ...callSyms];

      client.quoteStreamer.subscribe(allSyms, [
        MarketDataSubscriptionType.Quote,
        MarketDataSubscriptionType.Greeks,
      ]);
      console.log(`    Subscribed ${allSyms.length} options, waiting 12s...`);
      await waitMs(12000);
      console.log(`    Quotes: ${quoteData.size} | Greeks: ${greekData.size}`);

      // Get underlying price
      const uQ = quoteData.get(underlyingStreamer);
      let underlyingPrice = uQ ? mid(uQ.bidPrice, uQ.askPrice) : 0;
      if (!underlyingPrice) {
        underlyingPrice = parsePrice(strikes[Math.floor(strikes.length / 2)]?.['strike-price']) || 0;
      }
      console.log(`    Underlying: ${underlyingPrice > 0 ? underlyingPrice.toFixed(2) : 'N/A'}`);

      // ── Per-profile IC building ────────────────────────────────────────────
      for (const [profileName, profile] of Object.entries(PROFILES)) {
        if (expDte < profile.dteMin || expDte > profile.dteMax) continue;

        const putCandidates = [];
        const callCandidates = [];

        for (const strike of strikes) {
          const strikePrice = parsePrice(strike['strike-price']);

          // Short put candidate
          const pSym = strike['put-streamer-symbol'];
          if (pSym) {
            const gk = greekData.get(pSym);
            const qt = quoteData.get(pSym);
            if (gk && qt) {
              const absDelta = Math.abs(parsePrice(gk.delta));
              if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
                const m = mid(qt.bidPrice, qt.askPrice);
                if (m > 0) {
                  putCandidates.push({
                    strikePrice, absDelta, roundDelta: Math.round(absDelta * 100),
                    delta: parsePrice(gk.delta), theta: parsePrice(gk.theta),
                    iv: parsePrice(gk.volatility),
                    bid: parsePrice(qt.bidPrice), ask: parsePrice(qt.askPrice), mid: m,
                    symbol: strike.put,        // TT format string
                    streamerSymbol: pSym,
                  });
                }
              }
            }
          }

          // Short call candidate
          const cSym = strike['call-streamer-symbol'];
          if (cSym) {
            const gk = greekData.get(cSym);
            const qt = quoteData.get(cSym);
            if (gk && qt) {
              const absDelta = Math.abs(parsePrice(gk.delta));
              if (absDelta >= profile.deltaMin && absDelta <= profile.deltaMax) {
                const m = mid(qt.bidPrice, qt.askPrice);
                if (m > 0) {
                  callCandidates.push({
                    strikePrice, absDelta, roundDelta: Math.round(absDelta * 100),
                    delta: parsePrice(gk.delta), theta: parsePrice(gk.theta),
                    iv: parsePrice(gk.volatility),
                    bid: parsePrice(qt.bidPrice), ask: parsePrice(qt.askPrice), mid: m,
                    symbol: strike.call,       // TT format string
                    streamerSymbol: cSym,
                  });
                }
              }
            }
          }
        }

        console.log(`    [${profileName}] puts=${putCandidates.length} calls=${callCandidates.length}`);
        if (!putCandidates.length || !callCandidates.length) continue;

        // Symmetric delta pairing: sort desc by roundDelta, pair by index
        putCandidates.sort((a, b) => b.roundDelta - a.roundDelta);
        callCandidates.sort((a, b) => b.roundDelta - a.roundDelta);
        const pairCount = Math.min(putCandidates.length, callCandidates.length);

        const validICs = [];

        for (let i = 0; i < pairCount; i++) {
          const shortPut = putCandidates[i];
          const shortCall = callCandidates[i];

          // Find protective legs
          const lpTarget = shortPut.strikePrice - profile.wings;
          const lcTarget = shortCall.strikePrice + profile.wings;

          // Tolerance: 3 for QQQ/equities, 10 for SPX
          const tol = ticker === 'SPX' ? 10 : 3;
          const lpStrike = strikes.find(s => Math.abs(parsePrice(s['strike-price']) - lpTarget) < tol);
          const lcStrike = strikes.find(s => Math.abs(parsePrice(s['strike-price']) - lcTarget) < tol);
          if (!lpStrike || !lcStrike) continue;

          const lpSym = lpStrike['put-streamer-symbol'];
          const lcSym = lcStrike['call-streamer-symbol'];
          if (!lpSym || !lcSym) continue;

          const lpQt = quoteData.get(lpSym);
          const lcQt = quoteData.get(lcSym);
          if (!lpQt || !lcQt) continue;

          const longPutMid = mid(lpQt.bidPrice, lpQt.askPrice);
          const longCallMid = mid(lcQt.bidPrice, lcQt.askPrice);
          if (!longPutMid || !longCallMid) continue;

          // Spread quality check
          if (shortPut.mid > 0 && (shortPut.ask - shortPut.bid) / shortPut.mid > profile.spreadPct) continue;
          if (shortCall.mid > 0 && (shortCall.ask - shortCall.bid) / shortCall.mid > profile.spreadPct) continue;

          const credit = shortPut.mid + shortCall.mid - longPutMid - longCallMid;
          if (credit < profile.minCredit) continue;

          const rr = (profile.wings - credit) / credit;
          if (rr > profile.maxRR || rr < 0) continue;

          const pop = 100 - Math.max(shortPut.absDelta, shortCall.absDelta) * 100;
          if (pop < profile.minPOP) continue;

          const popFrac = pop / 100;
          const ev = credit * popFrac - (profile.wings - credit) * (1 - popFrac);
          const totalTheta = Math.abs(shortPut.theta + shortCall.theta) * 100;
          const margin = profile.wings * 100;
          const alpha = margin > 0 ? totalTheta / margin : 0;

          const score =
            profile.weights.pop * (pop / 100) +
            profile.weights.ev * (credit > 0 ? ev / credit : 0) +
            profile.weights.alpha * alpha;

          validICs.push({
            expiration: expDate, dte: expDte,
            shortPut: {
              symbol: shortPut.symbol, streamerSymbol: shortPut.streamerSymbol,
              strike: shortPut.strikePrice, delta: shortPut.delta,
              mid: shortPut.mid, bid: shortPut.bid, ask: shortPut.ask,
              theta: shortPut.theta, iv: shortPut.iv,
            },
            longPut: {
              symbol: lpStrike.put, streamerSymbol: lpSym,
              strike: parsePrice(lpStrike['strike-price']), mid: longPutMid,
            },
            shortCall: {
              symbol: shortCall.symbol, streamerSymbol: shortCall.streamerSymbol,
              strike: shortCall.strikePrice, delta: shortCall.delta,
              mid: shortCall.mid, bid: shortCall.bid, ask: shortCall.ask,
              theta: shortCall.theta, iv: shortCall.iv,
            },
            longCall: {
              symbol: lcStrike.call, streamerSymbol: lcSym,
              strike: parsePrice(lcStrike['strike-price']), mid: longCallMid,
            },
            credit: Math.round(credit * 100) / 100,
            rr: Math.round(rr * 100) / 100,
            pop: Math.round(pop * 100) / 100,
            ev: Math.round(ev * 100) / 100,
            alpha: Math.round(alpha * 10000) / 10000,
            score: Math.round(score * 10000) / 10000,
            wings: profile.wings,
            underlyingPrice,
          });
        }

        if (!validICs.length) {
          console.log(`    [${profileName}] no valid ICs`);
          continue;
        }

        validICs.sort((a, b) => b.score - a.score);
        const best = validICs[0];
        scanResults[ticker][profileName].push(best);
        console.log(`    [${profileName}] BEST: credit=$${best.credit} POP=${best.pop.toFixed(1)}% R/R=${best.rr.toFixed(2)} score=${best.score.toFixed(4)}`);
        console.log(`      ${best.longPut.strike}/${best.shortPut.strike}p | ${best.shortCall.strike}/${best.longCall.strike}c`);
      }
    }
  }

  // ── Step 6: Save to Firestore ─────────────────────────────────────────────
  console.log('\n[Step 6] Saving to Firestore...');

  await db.collection('guvid-agent').doc('scans')
    .collection(TODAY).doc('morning')
    .set({
      date: TODAY, timestamp: NOW_ISO, type: 'morning',
      SPX: scanResults.SPX,
      QQQ: scanResults.QQQ,
    });
  console.log(`  Scan → guvid-agent/scans/${TODAY}/morning`);

  let positionsSaved = 0;
  for (const ticker of ['SPX', 'QQQ']) {
    for (const [profileName, ics] of Object.entries(scanResults[ticker])) {
      for (const ic of ics) {
        await db.collection('guvid-agent').doc('positions')
          .collection('open').add({
            ticker, profile: profileName, ic,
            openDate: TODAY, expiration: ic.expiration,
            credit: ic.credit, pop: ic.pop, ev: ic.ev,
            alpha: ic.alpha, rr: ic.rr, wings: ic.wings,
            status: 'open', dailyChecks: [],
            marketContext: {
              underlyingPrice: ic.underlyingPrice,
              vix: morningVix,
              ivRank: null,
            },
          });
        positionsSaved++;
      }
    }
  }
  console.log(`  ${positionsSaved} position candidates saved`);

  // Re-fetch VIX in case it arrived late
  const vixFinal = quoteData.get(vixSymbol);
  const morningVixFinal = vixFinal ? mid(vixFinal.bidPrice, vixFinal.askPrice) : morningVix;

  // Update snapshot with final VIX if different
  if (morningVixFinal !== morningVix) {
    await db.collection('guvid-agent').doc('daily')
      .collection(TODAY).doc('morning')
      .update({ morningVix: morningVixFinal });
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('  MORNING SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Date:          ${TODAY}`);
  console.log(`  Net Liquidity: $${morningNetLiq.toFixed(2)}`);
  console.log(`  VIX:           ${morningVixFinal !== null ? morningVixFinal.toFixed(2) : 'N/A'}`);
  console.log('');

  for (const ticker of ['SPX', 'QQQ']) {
    console.log(`  ${ticker}:`);
    for (const [profileName, ics] of Object.entries(scanResults[ticker])) {
      if (ics.length) {
        console.log(`    ${profileName}: ${ics.length} candidate(s)`);
        for (const ic of ics) {
          console.log(`      [${ic.expiration} ${ic.dte}d] credit=$${ic.credit} POP=${ic.pop.toFixed(1)}% R/R=${ic.rr.toFixed(2)} score=${ic.score.toFixed(4)}`);
          console.log(`        ${ic.longPut.strike}/${ic.shortPut.strike}p | ${ic.shortCall.strike}/${ic.longCall.strike}c`);
        }
      } else {
        console.log(`    ${profileName}: no candidates`);
      }
    }
  }

  console.log(`\n  Total positions saved: ${positionsSaved}`);
  console.log(`${'='.repeat(60)}\n`);

  client.quoteStreamer.disconnect();
}

runScan()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch(err => { console.error('FATAL:', err.message, '\n', err.stack); process.exit(1); });

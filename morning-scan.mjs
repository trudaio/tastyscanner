import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

// ─── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

// ─── Step 3: Read TastyTrade credentials ─────────────────────────────────────
async function readTastyCredentials() {
  console.log('\n[1/6] Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`  Found credentials for user ${userDoc.id}, broker ${brokerDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken,
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ─── Create TastyTrade client and authenticate ────────────────────────────────
async function createClient(clientSecret, refreshToken) {
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret,
    refreshToken,
    oauthScopes: ['read', 'trade'],
  });
  // Trigger token generation
  await client.httpClient.generateAccessToken();
  return client;
}

// ─── Subscribe to quotes via DxLink ──────────────────────────────────────────
async function getQuotesAndGreeks(client, symbols, waitMs = 12000) {
  const quotes = {};
  const greeks = {};

  await client.quoteStreamer.connect();

  const removeListener = client.quoteStreamer.addEventListener((events) => {
    for (const evt of events) {
      if (evt.eventType === 'Quote') {
        const sym = evt.eventSymbol;
        if (!quotes[sym]) quotes[sym] = {};
        if (evt.bidPrice != null && evt.bidPrice !== 'NaN') quotes[sym].bid = Number(evt.bidPrice);
        if (evt.askPrice != null && evt.askPrice !== 'NaN') quotes[sym].ask = Number(evt.askPrice);
        if (quotes[sym].bid != null && quotes[sym].ask != null) {
          quotes[sym].mid = (quotes[sym].bid + quotes[sym].ask) / 2;
        }
      } else if (evt.eventType === 'Trade') {
        const sym = evt.eventSymbol;
        if (!quotes[sym]) quotes[sym] = {};
        if (evt.price != null && evt.price !== 'NaN' && Number(evt.price) > 0) {
          quotes[sym].price = Number(evt.price);
          // If no mid yet, use trade price as fallback
          if (quotes[sym].mid == null) quotes[sym].mid = Number(evt.price);
        }
      } else if (evt.eventType === 'Greeks') {
        const sym = evt.eventSymbol;
        if (!greeks[sym]) greeks[sym] = {};
        if (evt.delta != null) greeks[sym].delta = Number(evt.delta);
        if (evt.theta != null) greeks[sym].theta = Number(evt.theta);
        if (evt.vega != null) greeks[sym].vega = Number(evt.vega);
        if (evt.gamma != null) greeks[sym].gamma = Number(evt.gamma);
        if (evt.volatility != null) greeks[sym].volatility = Number(evt.volatility);
      }
    }
  });

  // Subscribe to quotes + trade for all symbols
  client.quoteStreamer.subscribe(symbols, [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Trade]);

  // Subscribe to greeks for option symbols (those that start with '.')
  const optionSymbols = symbols.filter(s => s.startsWith('.'));
  if (optionSymbols.length > 0) {
    client.quoteStreamer.subscribe(optionSymbols, [MarketDataSubscriptionType.Greeks]);
  }

  console.log(`  Waiting ${waitMs}ms for quote data...`);
  await sleep(waitMs);

  client.quoteStreamer.disconnect();

  return { quotes, greeks };
}

// ─── IC Building ─────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: { deltaMin: 0.11, deltaMax: 0.16, dteMin: 30, dteMax: 47, wings: 10, minPOP: 80, w: { pop: 0.70, ev: 0.20, alpha: 0.10 } },
  neutral:      { deltaMin: 0.11, deltaMax: 0.24, dteMin: 19, dteMax: 47, wings: 10, minPOP: 60, w: { pop: 0.60, ev: 0.25, alpha: 0.15 } },
  aggressive:   { deltaMin: 0.15, deltaMax: 0.24, dteMin: 19, dteMax: 35, wings:  5, minPOP: 60, w: { pop: 0.40, ev: 0.35, alpha: 0.25 } },
};

function buildICs(expirationStrikes, quotes, greeks, profile, underlyingPrice, wings) {
  const candidates = [];

  // Separate puts and calls (use greek delta if available, fallback to chain delta)
  const putStrikes = expirationStrikes.filter(s => s.optionType === 'P');
  const callStrikes = expirationStrikes.filter(s => s.optionType === 'C');

  const getEffectiveDelta = (s) => {
    const greekDelta = greeks[s.streamerSymbol]?.delta;
    if (greekDelta != null && !isNaN(greekDelta)) return Math.abs(greekDelta);
    return Math.abs(parseFloat(s.delta || 0));
  };

  const filterByDelta = (opts) => opts.filter(s => {
    const delta = getEffectiveDelta(s);
    const mid = quotes[s.streamerSymbol]?.mid;
    return delta >= profile.deltaMin && delta <= profile.deltaMax && mid != null && mid > 0 && !isNaN(mid);
  });

  const filteredPuts = filterByDelta(putStrikes);
  const filteredCalls = filterByDelta(callStrikes);

  if (filteredPuts.length === 0 || filteredCalls.length === 0) return [];

  // Group by abs delta bucket (rounded to nearest integer * 100)
  const groupByDelta = (opts) => {
    const map = {};
    for (const o of opts) {
      const key = Math.round(getEffectiveDelta(o) * 100);
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    return map;
  };

  const putGroups = groupByDelta(filteredPuts);
  const callGroups = groupByDelta(filteredCalls);

  const putKeys = Object.keys(putGroups).map(Number).sort((a, b) => b - a);
  const callKeys = Object.keys(callGroups).map(Number).sort((a, b) => b - a);
  const pairLen = Math.min(putKeys.length, callKeys.length);

  for (let i = 0; i < pairLen; i++) {
    const shortPuts = putGroups[putKeys[i]];
    const shortCalls = callGroups[callKeys[i]];

    for (const shortPut of shortPuts) {
      for (const shortCall of shortCalls) {
        const stoPutStrike = parseFloat(shortPut['strike-price']);
        const stoCallStrike = parseFloat(shortCall['strike-price']);

        if (stoPutStrike >= stoCallStrike) continue;

        const btoPutStrike = stoPutStrike - wings;
        const btoCallStrike = stoCallStrike + wings;

        const btoPut = putStrikes.reduce((best, s) => {
          const diff = Math.abs(parseFloat(s['strike-price']) - btoPutStrike);
          const bestDiff = best ? Math.abs(parseFloat(best['strike-price']) - btoPutStrike) : Infinity;
          return diff < bestDiff ? s : best;
        }, null);

        const btoCall = callStrikes.reduce((best, s) => {
          const diff = Math.abs(parseFloat(s['strike-price']) - btoCallStrike);
          const bestDiff = best ? Math.abs(parseFloat(best['strike-price']) - btoCallStrike) : Infinity;
          return diff < bestDiff ? s : best;
        }, null);

        if (!btoPut || !btoCall) continue;

        const stoPutMid = quotes[shortPut.streamerSymbol]?.mid || 0;
        const stoCallMid = quotes[shortCall.streamerSymbol]?.mid || 0;
        const btoPutMid = quotes[btoPut.streamerSymbol]?.mid || 0;
        const btoCallMid = quotes[btoCall.streamerSymbol]?.mid || 0;

        if (!stoPutMid || !stoCallMid || !btoPutMid || !btoCallMid) continue;

        const credit = stoPutMid + stoCallMid - btoPutMid - btoCallMid;
        if (credit < 1.0) continue;

        const rr = (wings - credit) / credit;
        if (rr > 4) continue;

        const putSpreadPct = Math.abs(stoPutStrike - underlyingPrice) / underlyingPrice;
        const callSpreadPct = Math.abs(stoCallStrike - underlyingPrice) / underlyingPrice;
        if (putSpreadPct > 0.08 || callSpreadPct > 0.08) continue;

        const putBEDelta = getEffectiveDelta(shortPut) * 100;
        const callBEDelta = getEffectiveDelta(shortCall) * 100;
        const pop = 100 - Math.max(putBEDelta, callBEDelta);

        if (pop < profile.minPOP) continue;

        const ev = credit * (pop / 100) - (wings - credit) * (1 - pop / 100);
        const alpha = credit / wings;

        const popN = pop / 100;
        const evN = Math.max(0, Math.min(1, (ev + wings) / (wings * 2)));
        const score = profile.w.pop * popN + profile.w.ev * evN + profile.w.alpha * alpha;

        candidates.push({
          shortPutStrike: stoPutStrike,
          longPutStrike: parseFloat(btoPut['strike-price']),
          shortCallStrike: stoCallStrike,
          longCallStrike: parseFloat(btoCall['strike-price']),
          shortPutStreamer: shortPut.streamerSymbol,
          shortCallStreamer: shortCall.streamerSymbol,
          longPutStreamer: btoPut.streamerSymbol,
          longCallStreamer: btoCall.streamerSymbol,
          stoPutMid: +stoPutMid.toFixed(2),
          stoCallMid: +stoCallMid.toFixed(2),
          btoPutMid: +btoPutMid.toFixed(2),
          btoCallMid: +btoCallMid.toFixed(2),
          credit: +credit.toFixed(2),
          rr: +rr.toFixed(2),
          pop: +pop.toFixed(1),
          ev: +ev.toFixed(2),
          alpha: +alpha.toFixed(4),
          score: +score.toFixed(4),
          putDelta: +getEffectiveDelta(shortPut).toFixed(4),
          callDelta: +getEffectiveDelta(shortCall).toFixed(4),
          wings,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ─── Parse chain to flat strike list ─────────────────────────────────────────
function parseChainToStrikes(chainItems) {
  const expirationMap = {};
  const todayDate = new Date();

  for (const chainItem of chainItems) {
    // Nested format: chainItem.expirations[] contains expiration objects
    const expirations = chainItem.expirations || [];
    for (const expItem of expirations) {
      const expDateStr = expItem['expiration-date'];
      if (!expDateStr) continue;
      const expDate = new Date(expDateStr + 'T16:00:00Z');
      const dte = Math.round((expDate - todayDate) / (1000 * 60 * 60 * 24));
      if (dte < 19 || dte > 47) continue;

      const strikes = [];
      for (const sg of (expItem.strikes || [])) {
        const strikePrice = sg['strike-price'];
        // Nested format: call-streamer-symbol / put-streamer-symbol at top level
        if (sg['call-streamer-symbol']) {
          strikes.push({
            'strike-price': strikePrice,
            optionType: 'C',
            delta: sg['call-delta'] || null,
            streamerSymbol: sg['call-streamer-symbol'],
            ttSymbol: sg['call'],
          });
        }
        if (sg['put-streamer-symbol']) {
          strikes.push({
            'strike-price': strikePrice,
            optionType: 'P',
            delta: sg['put-delta'] || null,
            streamerSymbol: sg['put-streamer-symbol'],
            ttSymbol: sg['put'],
          });
        }
      }
      if (strikes.length > 0) {
        expirationMap[expDateStr] = { dte, strikes };
      }
    }
  }
  return expirationMap;
}

// ─── Scan one ticker ──────────────────────────────────────────────────────────
async function scanTicker(client, ticker) {
  console.log(`\n  Scanning ${ticker}...`);

  // Use the SDK to get option chains
  let chainItems;
  try {
    const chainResp = await client.instrumentsService.getNestedOptionChain(ticker);
    chainItems = chainResp?.items || (Array.isArray(chainResp) ? chainResp : []);
  } catch (e) {
    console.log(`  Chain error for ${ticker}: ${e.message}`);
    return null;
  }

  if (!chainItems || chainItems.length === 0) {
    console.log(`  No chain data for ${ticker}`);
    return null;
  }

  // Count expirations
  let totalExps = 0;
  for (const ci of chainItems) totalExps += (ci.expirations || []).length;

  const expirationMap = parseChainToStrikes(chainItems);

  console.log(`  ${totalExps} total expirations, ${Object.keys(expirationMap).length} in DTE range 19-47`);
  if (Object.keys(expirationMap).length === 0) {
    console.log(`  No expirations in DTE range 19-47 for ${ticker}`);
    return null;
  }

  // Collect all streamer symbols
  const allStreamerSymbols = new Set();
  for (const { strikes } of Object.values(expirationMap)) {
    for (const s of strikes) allStreamerSymbols.add(s.streamerSymbol);
  }

  const underlyingStreamer = ticker;  // SPX / QQQ — plain ticker works in dxLink
  allStreamerSymbols.add(underlyingStreamer);
  allStreamerSymbols.add('VIX');

  const symbolList = [...allStreamerSymbols];
  console.log(`  Requesting ${symbolList.length} symbols from DxLink streamer...`);

  const { quotes, greeks } = await getQuotesAndGreeks(client, symbolList, 12000);

  const underlyingQ = quotes[underlyingStreamer];
  const underlyingPrice = underlyingQ?.mid ?? (underlyingQ?.bid != null && underlyingQ?.ask != null ? (underlyingQ.bid + underlyingQ.ask) / 2 : null);
  const vixQ = quotes['VIX'];
  const vixPrice = vixQ?.mid ?? vixQ?.price ?? (vixQ?.bid != null && vixQ?.ask != null ? (vixQ.bid + vixQ.ask) / 2 : null);
  const quotedCount = Object.keys(quotes).filter(k => quotes[k]?.mid != null).length;
  console.log(`  ${ticker} price: ${underlyingPrice?.toFixed(2) || 'N/A'}, VIX: ${vixPrice?.toFixed(2) || 'N/A'}`);
  console.log(`  Quotes received: ${quotedCount}/${symbolList.length}, Greeks: ${Object.keys(greeks).length}`);

  if (!underlyingPrice) {
    console.log(`  Could not get underlying price for ${ticker}`);
    return { results: { conservative: [], neutral: [], aggressive: [] }, underlyingPrice: null, vixPrice };
  }

  const results = { conservative: [], neutral: [], aggressive: [] };

  for (const [expDateStr, { dte, strikes }] of Object.entries(expirationMap)) {
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      if (dte < profile.dteMin || dte > profile.dteMax) continue;

      const ics = buildICs(strikes, quotes, greeks, profile, underlyingPrice, profile.wings);
      if (ics.length > 0) {
        results[profileName].push({ expiration: expDateStr, dte, bestIC: ics[0], candidateCount: ics.length });
        console.log(`  [${profileName}] ${expDateStr} DTE ${dte}: ${ics.length} candidates | best score ${ics[0].score} credit $${ics[0].credit} pop ${ics[0].pop}%`);
      }
    }
  }

  for (const pName of Object.keys(results)) {
    results[pName].sort((a, b) => b.bestIC.score - a.bestIC.score);
  }

  return { results, underlyingPrice, vixPrice };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    // Step 3: credentials
    const creds = await readTastyCredentials();

    // Authenticate
    console.log('\n[2/6] Authenticating with TastyTrade (OAuth2)...');
    const client = await createClient(creds.clientSecret, creds.refreshToken);
    console.log('  Access token obtained');

    // Get accounts
    const accountsResp = await client.accountsAndCustomersService.getCustomerAccountResources();
    const accountsList = accountsResp?.items || accountsResp || [];
    const accountNumber = accountsList[0]?.account?.['account-number'] || accountsList[0]?.['account-number'];
    console.log(`  Account: ${accountNumber}`);

    // Step 4: Morning snapshot
    console.log('\n[3/6] Capturing morning snapshot...');
    const balResp = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    const balData = balResp || {};
      const morningNetLiq = parseFloat(String(balData?.['net-liquidating-value'] || 0).replace(/,/g, ''));
    console.log(`  Net Liq: $${morningNetLiq.toFixed(2)}`);

    // VIX (plain 'VIX' ticker works in dxLink)
    console.log('  Getting VIX quote...');
    const vixResult = await getQuotesAndGreeks(client, ['VIX'], 5000);
    const vixQ = vixResult.quotes['VIX'];
    const morningVix = vixQ?.mid ?? vixQ?.price ?? (vixQ?.bid != null && vixQ?.ask != null ? (vixQ.bid + vixQ.ask) / 2 : null);
    console.log(`  VIX: ${morningVix?.toFixed(2) || 'N/A'}`);

    // Save snapshot
    await db.collection('guvid-agent').doc('daily').collection('snapshots').doc(today).set({
      morningNetLiq,
      morningVix,
      timestamp: new Date().toISOString(),
      date: today,
      accountNumber,
    });
    console.log('  Snapshot saved');

    // Fetch IV ranks
    console.log('  Fetching IV ranks...');
    let ivRanks = {};
    try {
      const metrics = await client.marketMetricsService.getMarketMetrics({ symbols: 'SPX,QQQ' });
      for (const m of (metrics?.items || metrics || [])) {
        ivRanks[m.symbol] = Math.round(parseFloat(m['implied-volatility-index-rank'] || 0) * 100);
      }
      console.log(`  IV Ranks — SPX: ${ivRanks.SPX}%, QQQ: ${ivRanks.QQQ}%`);
    } catch(e) { console.log('  IV rank fetch failed:', e.message); }

    // Step 5: Scan
    console.log('\n[4/6] Scanning SPX and QQQ...');
    const spxResult = await scanTicker(client, 'SPX');
    const qqqResult = await scanTicker(client, 'QQQ');

    // Step 6: Save scan
    console.log('\n[5/6] Saving scan results to Firestore...');
    const scanData = {
      date: today,
      timestamp: new Date().toISOString(),
      type: 'morning',
      SPX: spxResult?.results || { conservative: [], neutral: [], aggressive: [] },
      QQQ: qqqResult?.results || { conservative: [], neutral: [], aggressive: [] },
      SPX_price: spxResult?.underlyingPrice || null,
      QQQ_price: qqqResult?.underlyingPrice || null,
      vix: morningVix,
    };
    await db.collection('guvid-agent').doc('scans').collection('daily').doc(today).set(scanData);

    // Save position candidates
    let posCount = 0;
    const positionsBatch = db.batch();
    for (const [ticker, result] of [['SPX', spxResult], ['QQQ', qqqResult]]) {
      if (!result) continue;
      for (const [profileName, expirations] of Object.entries(result.results)) {
        for (const { expiration, dte, bestIC } of expirations) {
          const posRef = db.collection('guvid-agent').doc('positions').collection('open').doc();
          positionsBatch.set(posRef, {
            ticker,
            profile: profileName,
            ic: bestIC,
            openDate: today,
            expiration,
            dte,
            credit: bestIC.credit,
            pop: bestIC.pop,
            ev: bestIC.ev,
            alpha: bestIC.alpha,
            rr: bestIC.rr,
            wings: bestIC.wings,
            status: 'open',
            dailyChecks: [],
            marketContext: {
              underlyingPrice: result.underlyingPrice,
              vix: morningVix,
              ivRank: ivRanks[ticker] ?? null,
            },
          });
          posCount++;
        }
      }
    }
    if (posCount > 0) await positionsBatch.commit();
    console.log(`  Saved ${posCount} position candidates`);

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(62));
    console.log(`GUVID MORNING SCAN — ${today}`);
    console.log('═'.repeat(62));
    console.log(`Net Liquidity:  $${morningNetLiq.toFixed(2)}`);
    console.log(`VIX:            ${morningVix != null ? morningVix.toFixed(2) : 'N/A'}`);
    console.log(`SPX Price:      ${spxResult?.underlyingPrice != null ? '$' + spxResult.underlyingPrice.toFixed(2) : 'N/A'}`);
    console.log(`QQQ Price:      ${qqqResult?.underlyingPrice != null ? '$' + qqqResult.underlyingPrice.toFixed(2) : 'N/A'}`);
    console.log('');

    for (const [ticker, result] of [['SPX', spxResult], ['QQQ', qqqResult]]) {
      if (!result) { console.log(`${ticker}: No data`); continue; }
      console.log(`── ${ticker} ──────────────────────────────────────────────────`);
      for (const [pName, exps] of Object.entries(result.results)) {
        if (exps.length === 0) {
          console.log(`  ${pName.padEnd(13)}: No candidates`);
        } else {
          const { expiration, dte, bestIC: ic } = exps[0];
          console.log(`  ${pName.padEnd(13)}: ${expiration} (DTE ${dte}) | Credit $${ic.credit} | R/R ${ic.rr} | POP ${ic.pop}% | EV $${ic.ev} | Score ${ic.score}`);
          console.log(`  ${''.padEnd(13)}  Put: ${ic.longPutStrike}/${ic.shortPutStrike}  Call: ${ic.shortCallStrike}/${ic.longCallStrike}`);
        }
      }
      console.log('');
    }

    console.log(`${posCount} position candidates saved to Firestore`);
    console.log('═'.repeat(62));

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
}

main();

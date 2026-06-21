'use strict';

const admin = require('firebase-admin');
const fs = require('fs');
const WebSocket = require('ws');

// ─── Firebase init ────────────────────────────────────────────────────────────
const sa = JSON.parse(fs.readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 0.11, deltaMax: 0.16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, spreadPct: 0.08, minCredit: 1,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 }
  },
  neutral: {
    deltaMin: 0.11, deltaMax: 0.24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, spreadPct: 0.08, minCredit: 1,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 }
  },
  aggressive: {
    deltaMin: 0.15, deltaMax: 0.24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, spreadPct: 0.08, minCredit: 1,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 }
  }
};

function midPrice(bid, ask) {
  bid = parseFloat(bid ?? 0);
  ask = parseFloat(ask ?? 0);
  if (bid <= 0 || ask <= 0 || isNaN(bid) || isNaN(ask)) return null;
  return (bid + ask) / 2;
}

// ─── Step 1: Read credentials from Firestore ─────────────────────────────────
async function readCredentials() {
  console.log('\n[1] Reading TastyTrade credentials from Firestore...');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
        console.log(`  User: ${userDoc.id} | Broker: ${brokerDoc.id}`);
        return {
          clientSecret: data.credentials.clientSecret,
          refreshToken: data.credentials.refreshToken
        };
      }
    }
  }
  throw new Error('No TastyTrade credentials found in Firestore');
}

// ─── Step 2: Create TastyTrade client ────────────────────────────────────────
async function createClient(creds) {
  console.log('\n[2] Authenticating with TastyTrade...');
  const { default: TTC } = await import('@tastytrade/api');
  const client = new TTC({
    ...TTC.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read']
  });

  await client.httpClient.generateAccessToken();
  console.log('  Access token acquired.');

  const accountsData = await client.accountsAndCustomersService.getCustomerAccounts();
  const items = Array.isArray(accountsData) ? accountsData : (accountsData?.items ?? []);
  const firstItem = items[0];
  const accountNumber = firstItem?.account?.['account-number'] ?? firstItem?.['account-number'];
  if (!accountNumber) throw new Error('Could not find account number. Response: ' + JSON.stringify(accountsData).slice(0, 200));
  console.log(`  Account: ${accountNumber}`);

  return { client, accountNumber };
}

// ─── Step 3: Get balances ─────────────────────────────────────────────────────
async function getBalances(client, accountNumber) {
  console.log('\n[3] Fetching account balances...');
  const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
  const netLiq = parseFloat(balances?.['net-liquidating-value'] ?? 0);
  console.log(`  Net Liq: $${netLiq.toLocaleString()}`);
  return { netLiq };
}

// ─── Step 4: Get market metrics (single symbol each) ──────────────────────────
async function getMarketMetrics(client, symbols) {
  console.log('\n[4] Fetching market metrics (IV Rank)...');
  const result = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const data = await client.marketMetricsService.getMarketMetrics({ symbols: sym });
      const item = Array.isArray(data) ? data[0] : data;
      if (item) {
        result[sym] = {
          ivRank: Math.round(parseFloat(item['implied-volatility-index-rank'] ?? 0) * 100 * 10) / 10,
          ivPercentile: Math.round(parseFloat(item['implied-volatility-percentile'] ?? 0) * 100 * 10) / 10
        };
      }
    } catch (e) {
      console.warn(`  Warning: metrics for ${sym} failed: ${e.message}`);
    }
  }));
  for (const sym of symbols) {
    console.log(`  ${sym} IV Rank: ${result[sym]?.ivRank ?? 'N/A'}%`);
  }
  return result;
}

// ─── Step 5: Get options chains ───────────────────────────────────────────────
async function getOptionsChains(client) {
  console.log('\n[5] Fetching options chains...');
  const [spxData, qqqData] = await Promise.all([
    client.instrumentsService.getNestedOptionChain('SPX'),
    client.instrumentsService.getNestedOptionChain('QQQ')
  ]);

  // SDK returns array-like object: chain[0] has the data
  const spxExpirations = spxData?.[0]?.expirations ?? [];
  const qqqExpirations = qqqData?.[0]?.expirations ?? [];
  console.log(`  SPX expirations: ${spxExpirations.length}`);
  console.log(`  QQQ expirations: ${qqqExpirations.length}`);
  return { spxExpirations, qqqExpirations };
}

// ─── Step 6: Stream quotes + greeks via DxLink ────────────────────────────────
function collectStreamerSymbols(expirations, dteMin, dteMax) {
  const syms = new Set();
  for (const exp of expirations) {
    const dte = parseInt(exp['days-to-expiration'] ?? 0);
    if (dte < dteMin || dte > dteMax) continue;
    for (const strike of (exp.strikes ?? [])) {
      // Symbols are at the top-level of the strike object
      if (strike['call-streamer-symbol']) syms.add(strike['call-streamer-symbol']);
      if (strike['put-streamer-symbol']) syms.add(strike['put-streamer-symbol']);
    }
  }
  return [...syms];
}

async function streamMarketData(client, symbols, waitSeconds = 12) {
  console.log(`\n[6] Streaming ${symbols.length} symbols via DxLink (waiting ${waitSeconds}s)...`);

  const tokenData = await client.accountsAndCustomersService.getApiQuoteToken();
  const dxToken = tokenData?.token ?? tokenData?.['token'];
  const wsUrl = tokenData?.['dxlink-url'] ?? 'wss://tasty-openapi-ws.dxfeed.com/realtime';

  if (!dxToken) throw new Error('No DxLink token: ' + JSON.stringify(tokenData));
  console.log(`  DxLink URL: ${wsUrl}`);

  // Field orders we request — must match what we send in acceptEventFields
  const QUOTE_FIELDS = ['eventSymbol', 'bidPrice', 'askPrice', 'bidSize', 'askSize'];
  const GREEKS_FIELDS = ['eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'price', 'volatility'];

  // Track accepted field orders from FEED_CONFIG responses
  const acceptedFields = {
    Quote: QUOTE_FIELDS,
    Greeks: GREEKS_FIELDS
  };

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const quotes = {};
    const greeks = {};
    let channelOpen = false;

    const done = () => {
      try { ws.close(); } catch (_) {}
      resolve({ quotes, greeks });
    };

    const hardTimeout = setTimeout(done, (waitSeconds + 15) * 1000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'SETUP', channel: 0,
        keepaliveTimeout: 60, acceptKeepaliveTimeout: 60, version: '0.1'
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'SETUP':
            ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: dxToken }));
            break;

          case 'AUTH_STATE':
            if (msg.state === 'AUTHORIZED' && !channelOpen) {
              channelOpen = true;
              ws.send(JSON.stringify({
                type: 'CHANNEL_REQUEST', channel: 1,
                service: 'FEED', parameters: { contract: 'AUTO' }
              }));
            }
            break;

          case 'CHANNEL_OPENED':
            if (msg.channel === 1) {
              ws.send(JSON.stringify({
                type: 'FEED_SETUP', channel: 1,
                acceptAggregationPeriod: 10,
                acceptDataFormat: 'COMPACT',
                acceptEventFields: {
                  Quote: QUOTE_FIELDS,
                  Greeks: GREEKS_FIELDS
                }
              }));

              // Subscribe in batches of 500
              const batchSize = 500;
              for (let i = 0; i < symbols.length; i += batchSize) {
                const batch = symbols.slice(i, i + batchSize);
                ws.send(JSON.stringify({
                  type: 'FEED_SUBSCRIPTION', channel: 1,
                  add: [
                    ...batch.map(s => ({ type: 'Quote', symbol: s })),
                    ...batch.map(s => ({ type: 'Greeks', symbol: s }))
                  ]
                }));
              }

              setTimeout(() => {
                clearTimeout(hardTimeout);
                done();
              }, waitSeconds * 1000);
            }
            break;

          case 'FEED_CONFIG':
            // Capture server-accepted field order (comes per event type)
            if (msg.channel === 1 && msg.eventFields) {
              for (const [evtType, fields] of Object.entries(msg.eventFields)) {
                if (Array.isArray(fields)) acceptedFields[evtType] = fields;
              }
            }
            break;

          case 'FEED_DATA':
            // COMPACT format: msg.data = [eventType, [sym1, v1, v2, ..., sym2, v1, v2, ...]]
            if (msg.channel === 1 && Array.isArray(msg.data) && msg.data.length >= 2) {
              const [eventType, valuesArr] = msg.data;
              if (!Array.isArray(valuesArr)) break;

              const fields = acceptedFields[eventType];
              if (!fields) break;
              const fl = fields.length;
              if (fl === 0) break;

              for (let i = 0; i + fl <= valuesArr.length; i += fl) {
                const evt = {};
                for (let j = 0; j < fl; j++) evt[fields[j]] = valuesArr[i + j];
                const sym = evt.eventSymbol;
                if (!sym || typeof sym !== 'string') continue;
                if (eventType === 'Quote') quotes[sym] = evt;
                else if (eventType === 'Greeks') greeks[sym] = evt;
              }
            }
            break;

          case 'KEEPALIVE':
            ws.send(JSON.stringify({ type: 'KEEPALIVE', channel: 0 }));
            break;
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      console.warn('  WS error:', err.message);
      clearTimeout(hardTimeout);
      done();
    });
  });
}

// ─── Step 7: Build Iron Condors ───────────────────────────────────────────────
function buildIronCondors(expirations, quotes, greeks, underlyingPrice, profile) {
  const bestPerExpiration = {};

  for (const exp of expirations) {
    const expDate = exp['expiration-date'];
    const dte = parseInt(exp['days-to-expiration'] ?? 0);
    if (dte < profile.dteMin || dte > profile.dteMax) continue;

    const strikes = exp.strikes ?? [];
    const puts = [];
    const calls = [];

    for (const strike of strikes) {
      const sp = parseFloat(strike['strike-price']);

      // Streamer symbols are at top level
      const callSym = strike['call-streamer-symbol'];
      const putSym = strike['put-streamer-symbol'];

      if (callSym && quotes[callSym] && greeks[callSym]) {
        const delta = Math.abs(parseFloat(greeks[callSym].delta ?? 0));
        const mid = midPrice(quotes[callSym].bidPrice, quotes[callSym].askPrice);
        if (delta >= profile.deltaMin && delta <= profile.deltaMax && mid !== null && mid > 0) {
          calls.push({ strike: sp, delta, mid, sym: callSym });
        }
      }

      if (putSym && quotes[putSym] && greeks[putSym]) {
        const delta = Math.abs(parseFloat(greeks[putSym].delta ?? 0));
        const mid = midPrice(quotes[putSym].bidPrice, quotes[putSym].askPrice);
        if (delta >= profile.deltaMin && delta <= profile.deltaMax && mid !== null && mid > 0) {
          puts.push({ strike: sp, delta, mid, sym: putSym });
        }
      }
    }

    if (puts.length === 0 || calls.length === 0) continue;

    // Symmetric delta pairing: sort desc by delta, pair by index
    puts.sort((a, b) => b.delta - a.delta);
    calls.sort((a, b) => b.delta - a.delta);

    const pairCount = Math.min(puts.length, calls.length);

    for (let i = 0; i < pairCount; i++) {
      const shortPut = puts[i];
      const shortCall = calls[i];

      // Find closest long strikes at ±wings distance
      const targetLongPut = shortPut.strike - profile.wings;
      const targetLongCall = shortCall.strike + profile.wings;

      const longPutStrikeObj = strikes.reduce((best, s) => {
        const sp = parseFloat(s['strike-price']);
        if (sp >= shortPut.strike) return best;
        if (!best) return s;
        return Math.abs(sp - targetLongPut) < Math.abs(parseFloat(best['strike-price']) - targetLongPut) ? s : best;
      }, null);

      const longCallStrikeObj = strikes.reduce((best, s) => {
        const sp = parseFloat(s['strike-price']);
        if (sp <= shortCall.strike) return best;
        if (!best) return s;
        return Math.abs(sp - targetLongCall) < Math.abs(parseFloat(best['strike-price']) - targetLongCall) ? s : best;
      }, null);

      if (!longPutStrikeObj || !longCallStrikeObj) continue;

      const btoPutSym = longPutStrikeObj['put-streamer-symbol'];
      const btoCallSym = longCallStrikeObj['call-streamer-symbol'];
      if (!btoPutSym || !btoCallSym) continue;

      const btoPutMid = midPrice(quotes[btoPutSym]?.bidPrice, quotes[btoPutSym]?.askPrice);
      const btoCallMid = midPrice(quotes[btoCallSym]?.bidPrice, quotes[btoCallSym]?.askPrice);
      if (btoPutMid === null || btoCallMid === null) continue;

      const credit = shortPut.mid + shortCall.mid - btoPutMid - btoCallMid;
      if (credit < profile.minCredit) continue;

      const actualPutWing = shortPut.strike - parseFloat(longPutStrikeObj['strike-price']);
      const actualCallWing = parseFloat(longCallStrikeObj['strike-price']) - shortCall.strike;
      const actualWings = Math.min(actualPutWing, actualCallWing);
      if (actualWings <= 0) continue;

      const rr = (actualWings - credit) / credit;
      if (rr > profile.maxRR || rr < 0) continue;

      const putSpreadPct = Math.abs(shortPut.mid - btoPutMid) / underlyingPrice;
      const callSpreadPct = Math.abs(shortCall.mid - btoCallMid) / underlyingPrice;
      if (putSpreadPct > profile.spreadPct || callSpreadPct > profile.spreadPct) continue;

      const putBEDelta = shortPut.delta * 100;
      const callBEDelta = shortCall.delta * 100;
      const pop = 100 - Math.max(putBEDelta, callBEDelta);
      if (pop < profile.minPOP) continue;

      const ev = credit - (actualWings * (1 - pop / 100));
      const alpha = credit / actualWings;

      const score = profile.weights.pop * (pop / 100)
        + profile.weights.ev * Math.max(0, ev / Math.max(credit, 0.01))
        + profile.weights.alpha * Math.min(alpha, 1);

      const ic = {
        expiration: expDate,
        dte,
        shortPutStrike: shortPut.strike,
        shortCallStrike: shortCall.strike,
        longPutStrike: parseFloat(longPutStrikeObj['strike-price']),
        longCallStrike: parseFloat(longCallStrikeObj['strike-price']),
        shortPutDelta: Math.round(shortPut.delta * 1000) / 1000,
        shortCallDelta: Math.round(shortCall.delta * 1000) / 1000,
        shortPutMid: Math.round(shortPut.mid * 100) / 100,
        shortCallMid: Math.round(shortCall.mid * 100) / 100,
        longPutMid: Math.round(btoPutMid * 100) / 100,
        longCallMid: Math.round(btoCallMid * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        wings: actualWings,
        rr: Math.round(rr * 100) / 100,
        pop: Math.round(pop * 10) / 10,
        ev: Math.round(ev * 100) / 100,
        alpha: Math.round(alpha * 1000) / 1000,
        score: Math.round(score * 10000) / 10000
      };

      if (!bestPerExpiration[expDate] || ic.score > bestPerExpiration[expDate].score) {
        bestPerExpiration[expDate] = ic;
      }
    }
  }

  return Object.values(bestPerExpiration).sort((a, b) => b.score - a.score);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  GUVID AGENT — Morning Scan — ${TODAY}`);
  console.log(`${'='.repeat(60)}`);

  const creds = await readCredentials();
  const { client, accountNumber } = await createClient(creds);

  const [{ netLiq }, metrics, { spxExpirations, qqqExpirations }] = await Promise.all([
    getBalances(client, accountNumber),
    getMarketMetrics(client, ['SPX', 'QQQ']),
    getOptionsChains(client)
  ]);

  const allDteMin = Math.min(PROFILES.conservative.dteMin, PROFILES.neutral.dteMin, PROFILES.aggressive.dteMin);
  const allDteMax = Math.max(PROFILES.conservative.dteMax, PROFILES.neutral.dteMax, PROFILES.aggressive.dteMax);

  const spxSyms = collectStreamerSymbols(spxExpirations, allDteMin, allDteMax);
  const qqqSyms = collectStreamerSymbols(qqqExpirations, allDteMin, allDteMax);
  // Also add VIX and underlying quotes
  const allSyms = [...new Set([...spxSyms, ...qqqSyms, '$VIX.X', 'SPX', 'QQQ'])];
  console.log(`  Total symbols to stream: ${allSyms.length}`);

  const { quotes, greeks } = await streamMarketData(client, allSyms, 12);

  const quotedCount = Object.keys(quotes).length;
  const greeksCount = Object.keys(greeks).length;
  console.log(`  Received: ${quotedCount} quotes, ${greeksCount} greeks`);

  const vixQ = quotes['$VIX.X'];
  const vix = vixQ ? (midPrice(vixQ.bidPrice, vixQ.askPrice) ?? parseFloat(vixQ.bidPrice ?? 0)) : null;
  const vixDisplay = vix ? Math.round(vix * 100) / 100 : null;
  console.log(`  VIX: ${vixDisplay ?? 'N/A'}`);

  const spxQ = quotes['SPX'];
  const qqqQ = quotes['QQQ'];
  const spxPrice = spxQ ? (midPrice(spxQ.bidPrice, spxQ.askPrice) ?? parseFloat(spxQ.bidPrice ?? 5800)) : 5800;
  const qqqPrice = qqqQ ? (midPrice(qqqQ.bidPrice, qqqQ.askPrice) ?? parseFloat(qqqQ.bidPrice ?? 480)) : 480;
  console.log(`  SPX: $${Math.round(spxPrice * 100) / 100}`);
  console.log(`  QQQ: $${Math.round(qqqPrice * 100) / 100}`);

  // Save morning snapshot
  console.log('\n[7] Saving morning snapshot...');
  await db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot').set({
    morningNetLiq: netLiq,
    morningVix: vixDisplay,
    timestamp: new Date().toISOString(),
    date: TODAY,
    spxPrice: Math.round(spxPrice * 100) / 100,
    qqqPrice: Math.round(qqqPrice * 100) / 100,
    spxIvRank: metrics.SPX?.ivRank ?? null,
    qqqIvRank: metrics.QQQ?.ivRank ?? null
  });
  console.log('  Snapshot saved.');

  // Build iron condors
  console.log('\n[8] Building iron condors...');
  const scanResults = { SPX: {}, QQQ: {} };

  for (const [ticker, expirations, uprice] of [
    ['SPX', spxExpirations, spxPrice],
    ['QQQ', qqqExpirations, qqqPrice]
  ]) {
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const ics = buildIronCondors(expirations, quotes, greeks, uprice, profile);
      scanResults[ticker][profileName] = ics;
      if (ics.length > 0) {
        const b = ics[0];
        console.log(`  ${ticker} ${profileName.padEnd(14)}: ${ics.length} ICs | Best: ${b.expiration} P${b.shortPutStrike}/C${b.shortCallStrike} credit=$${b.credit} pop=${b.pop}% rr=${b.rr}`);
      } else {
        console.log(`  ${ticker} ${profileName.padEnd(14)}: No candidates`);
      }
    }
  }

  // Save scan
  console.log('\n[9] Saving scan to Firestore...');
  await db.collection('guvid-agent').doc('scans').collection(TODAY).doc('morning').set({
    date: TODAY,
    timestamp: new Date().toISOString(),
    type: 'morning',
    SPX: scanResults.SPX,
    QQQ: scanResults.QQQ
  });
  console.log('  Scan saved to guvid-agent/scans/' + TODAY + '/morning');

  // Save positions
  console.log('\n[10] Saving positions...');
  let saved = 0;
  const batch = db.batch();

  for (const [ticker, profileResults] of Object.entries(scanResults)) {
    const uprice = ticker === 'SPX' ? spxPrice : qqqPrice;
    const ivRank = ticker === 'SPX' ? metrics.SPX?.ivRank : metrics.QQQ?.ivRank;

    for (const [profileName, ics] of Object.entries(profileResults)) {
      if (ics.length === 0) continue;
      const best = ics[0];
      const ref = db.collection('guvid-agent').doc('positions').collection(TODAY).doc();
      batch.set(ref, {
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
          underlyingPrice: Math.round(uprice * 100) / 100,
          vix: vixDisplay,
          ivRank: ivRank ?? null
        }
      });
      saved++;
    }
  }

  await batch.commit();
  console.log(`  ${saved} positions saved.`);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  MORNING SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Date:        ${TODAY}`);
  console.log(`  Net Liq:     $${netLiq.toLocaleString()}`);
  console.log(`  VIX:         ${vixDisplay ?? 'N/A'}`);
  console.log(`  SPX:         $${Math.round(spxPrice * 100) / 100}`);
  console.log(`  QQQ:         $${Math.round(qqqPrice * 100) / 100}`);
  console.log(`  SPX IV Rank: ${metrics.SPX?.ivRank ?? 'N/A'}%`);
  console.log(`  QQQ IV Rank: ${metrics.QQQ?.ivRank ?? 'N/A'}%`);
  console.log('');

  for (const ticker of ['SPX', 'QQQ']) {
    console.log(`  ── ${ticker} ──────────────────────────────────`);
    for (const profileName of ['conservative', 'neutral', 'aggressive']) {
      const ics = scanResults[ticker][profileName];
      if (ics.length === 0) {
        console.log(`    ${profileName.padEnd(14)}: No candidates found`);
      } else {
        const b = ics[0];
        console.log(`    ${profileName.padEnd(14)}: ${b.expiration} (${b.dte}d)`);
        console.log(`      Strikes: P${b.longPutStrike}/${b.shortPutStrike} x C${b.shortCallStrike}/${b.longCallStrike}`);
        console.log(`      Credit: $${b.credit} | Wings: $${b.wings} | R/R: ${b.rr}`);
        console.log(`      POP: ${b.pop}% | EV: $${b.ev} | Score: ${b.score}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('  All data saved to Firestore.');
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n[FATAL]', err.message);
    console.error(err.stack);
    process.exit(1);
  });

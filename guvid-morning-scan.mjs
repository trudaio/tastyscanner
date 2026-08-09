// Guvid Agent — Morning Scan  (2026-04-28, 10:30 AM ET)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

// WebSocket polyfill for Node (DxLink requires global.WebSocket)
const require = createRequire(import.meta.url);
const IsoWS = require('isomorphic-ws');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = IsoWS;

// ── Firebase ──────────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TODAY = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mid   = (b, a) => (parseFloat(b ?? 0) + parseFloat(a ?? 0)) / 2;

// ── Profiles ──────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: { deltaMin:0.11, deltaMax:0.16, dteMin:30, dteMax:47, wings:10, minPOP:80, w:{pop:0.70,ev:0.20,alpha:0.10} },
  neutral:      { deltaMin:0.11, deltaMax:0.24, dteMin:19, dteMax:47, wings:10, minPOP:60, w:{pop:0.60,ev:0.25,alpha:0.15} },
  aggressive:   { deltaMin:0.15, deltaMax:0.24, dteMin:19, dteMax:35, wings: 5, minPOP:60, w:{pop:0.40,ev:0.35,alpha:0.25} },
};
const MAX_RR     = 4;
const MIN_CREDIT = 1.0;
const SPREAD_PCT = 0.08;
const TICKERS    = ['SPX', 'QQQ'];
const WAIT_MS    = 14000;

// ── Step 3: Load TastyTrade credentials from Firestore ────────────────────────
async function loadCredentials() {
  console.log('Reading TastyTrade credentials from Firestore…');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users in Firestore');
  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db.collection('users').doc(userDoc.id).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data  = brokerDoc.data();
      const creds = data.credentials ?? {};
      const cs    = creds.clientSecret;
      const rt    = creds.refreshToken;
      if (cs && rt) {
        console.log(`  Found creds: user=${userDoc.id}  broker=${brokerDoc.id}`);
        return { clientSecret: cs, refreshToken: rt };
      }
    }
    // Fallback: legacy fields on user doc
    const ud = userDoc.data();
    if (ud.clientSecret && ud.refreshToken) {
      console.log(`  Found legacy creds on user doc ${userDoc.id}`);
      return { clientSecret: ud.clientSecret, refreshToken: ud.refreshToken };
    }
  }
  throw new Error('No TastyTrade credentials found');
}

// ── Build TastyTrade client ───────────────────────────────────────────────────
function buildClient(creds) {
  return new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret:  creds.clientSecret,
    refreshToken:  creds.refreshToken,
    oauthScopes:   ['read', 'trade'],
  });
}

// ── Collect data from streamer ────────────────────────────────────────────────
async function streamData(client, symbols) {
  const quotes = {};
  const greeks = {};
  const remove = client.quoteStreamer.addEventListener((records) => {
    for (const r of records) {
      if (r.eventType === 'Quote')  quotes[r.eventSymbol] = r;
      if (r.eventType === 'Greeks') greeks[r.eventSymbol] = r;
    }
  });
  await client.quoteStreamer.connect();
  client.quoteStreamer.subscribe(symbols, [
    MarketDataSubscriptionType.Quote,
    MarketDataSubscriptionType.Greeks,
  ]);
  await sleep(WAIT_MS);
  client.quoteStreamer.disconnect();
  remove();
  return { quotes, greeks };
}

// ── Step 4: Morning snapshot ──────────────────────────────────────────────────
async function captureSnapshot(client) {
  console.log('\nCapturing morning snapshot…');
  let morningNetLiq = null;

  try {
    const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
    const acn = accounts[0]?.account?.['account-number'] ?? accounts[0]?.['account-number'];
    if (acn) {
      const bal = await client.balancesAndPositionsService.getAccountBalanceValues(acn);
      morningNetLiq = parseFloat(bal['net-liquidating-value'] ?? 0);
      console.log(`  Account: ${acn}  NetLiq: $${morningNetLiq.toFixed(2)}`);
    }
  } catch (e) { console.warn('  Balances error:', e.message); }

  // VIX will be picked up during the main SPX scan (we subscribe $VIX.X there)
  // Skip a separate streamer session for VIX here to avoid connection overhead
  let morningVix = null;
  console.log('  VIX: will capture during SPX scan');

  const snapshot = { morningNetLiq, morningVix, timestamp: new Date().toISOString(), date: TODAY };
  // Firestore paths must have even segments: use guvid-agent-daily/{date}
  await db.collection('guvid-agent-daily').doc(TODAY).set(snapshot, { merge: true });
  console.log('  Snapshot saved.');
  return snapshot;
}

// ── Iron Condor builder ───────────────────────────────────────────────────────
function buildICs(strikes, quotes, greeks, profile, underlyingPrice) {
  const enriched = [];
  for (const s of strikes) {
    const sp = parseFloat(s['strike-price']);
    if (!sp) continue;
    for (const [type, symKey] of [['call', s['call-streamer-symbol']], ['put', s['put-streamer-symbol']]]) {
      if (!symKey) continue;
      const q = quotes[symKey];
      const g = greeks[symKey];
      if (!q && !g) continue;
      const bidP  = parseFloat(q?.bidPrice ?? 0);
      const askP  = parseFloat(q?.askPrice ?? 0);
      const midP  = mid(bidP, askP);
      const delta = parseFloat(g?.delta ?? 0);
      const theta = parseFloat(g?.theta ?? 0);
      if (midP <= 0) continue;
      enriched.push({ type, strike: sp, sym: symKey, bid: bidP, ask: askP, mid: midP, delta, theta });
    }
  }

  const puts  = enriched.filter(o => o.type === 'put'  && o.strike < underlyingPrice);
  const calls = enriched.filter(o => o.type === 'call' && o.strike > underlyingPrice);

  const shortPuts  = puts .filter(o => Math.abs(o.delta) >= profile.deltaMin && Math.abs(o.delta) <= profile.deltaMax);
  const shortCalls = calls.filter(o => Math.abs(o.delta) >= profile.deltaMin && Math.abs(o.delta) <= profile.deltaMax);
  if (!shortPuts.length || !shortCalls.length) return [];

  shortPuts .sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
  shortCalls.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));

  const spreadMax = underlyingPrice * SPREAD_PCT;
  const ics = [];

  for (let i = 0; i < Math.min(shortPuts.length, shortCalls.length); i++) {
    const stoPut  = shortPuts[i];
    const stoCall = shortCalls[i];

    const btoPut  = puts .find(o => Math.abs(o.strike - (stoPut.strike  - profile.wings)) < 0.01);
    const btoCall = calls.find(o => Math.abs(o.strike - (stoCall.strike + profile.wings)) < 0.01);
    if (!btoPut || !btoCall) continue;

    const putSpread  = stoPut.strike  - btoPut.strike;
    const callSpread = btoCall.strike - stoCall.strike;
    if (putSpread > spreadMax || callSpread > spreadMax) continue;

    const credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid;
    if (credit < MIN_CREDIT) continue;

    const rr = (profile.wings - credit) / credit;
    if (rr > MAX_RR) continue;

    const putBEDelta  = Math.abs(stoPut.delta)  * 100;
    const callBEDelta = Math.abs(stoCall.delta) * 100;
    const pop = 100 - Math.max(putBEDelta, callBEDelta);
    if (pop < profile.minPOP) continue;

    const ev    = credit * (pop/100) - (profile.wings - credit) * (1 - pop/100);
    const alpha = (Math.abs(stoPut.theta) + Math.abs(stoCall.theta)) / 2;
    const w     = profile.w;
    const score = w.pop*(pop/100) + w.ev*Math.max(0,ev)/profile.wings + w.alpha*Math.min(alpha/2,1);

    ics.push({
      stoPutStrike:  stoPut.strike,  stoCallStrike: stoCall.strike,
      btoPutStrike:  btoPut.strike,  btoCallStrike: btoCall.strike,
      stoPutDelta:   +stoPut.delta.toFixed(4),
      stoCallDelta:  +stoCall.delta.toFixed(4),
      stoPutMid:     +stoPut.mid.toFixed(2),
      stoCallMid:    +stoCall.mid.toFixed(2),
      btoPutMid:     +btoPut.mid.toFixed(2),
      btoCallMid:    +btoCall.mid.toFixed(2),
      credit: +credit.toFixed(2),
      rr:     +rr.toFixed(3),
      pop:    +pop.toFixed(2),
      ev:     +ev.toFixed(2),
      alpha:  +alpha.toFixed(4),
      score:  +score.toFixed(4),
      wings:  putSpread,
    });
  }

  ics.sort((a,b) => b.score - a.score);
  return ics;
}

// ── Step 5: Scan a ticker ─────────────────────────────────────────────────────
async function scanTicker(client, ticker) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Scanning ${ticker}…`);

  const chains = await client.instrumentsService.getNestedOptionChain(ticker);
  const allExpirations = chains.flatMap(c => c.expirations ?? []);

  const validExps = allExpirations.filter(exp => {
    const d = parseInt(exp['days-to-expiration'] ?? 999);
    return d >= 19 && d <= 47;
  });
  console.log(`  ${validExps.length} expirations in DTE 19-47`);
  if (!validExps.length) return { underlyingPrice: null, results: { conservative:[], neutral:[], aggressive:[] } };

  const allSyms = new Set();
  // Try multiple candidate symbols for the underlying; SPX index may be $SPX.X or $SPX
  const underCandidates = ticker === 'SPX' ? ['$SPX.X', '$SPX', 'SPX'] : [ticker];
  for (const s of underCandidates) allSyms.add(s);
  // Also pull VIX inline to avoid extra streamer session
  allSyms.add('$VIX.X');
  for (const exp of validExps) {
    for (const s of exp.strikes ?? []) {
      if (s['call-streamer-symbol']) allSyms.add(s['call-streamer-symbol']);
      if (s['put-streamer-symbol'])  allSyms.add(s['put-streamer-symbol']);
    }
  }
  console.log(`  Subscribing to ${allSyms.size} symbols (${WAIT_MS/1000}s wait)…`);

  const { quotes, greeks } = await streamData(client, [...allSyms]);
  console.log(`  Received: quotes=${Object.keys(quotes).length}  greeks=${Object.keys(greeks).length}`);

  // Resolve underlying price: try each candidate symbol
  let underlyingPrice = 0;
  let resolvedSym = null;
  for (const sym of underCandidates) {
    const uq = quotes[sym];
    if (uq) {
      const p = mid(uq.bidPrice, uq.askPrice) || parseFloat(uq.lastPrice ?? uq.last ?? 0);
      if (p > 0) { underlyingPrice = p; resolvedSym = sym; break; }
    }
  }
  // Fallback: infer from at-the-money greeks (strike where |delta| ≈ 0.50)
  if (underlyingPrice === 0) {
    const allEnriched = [];
    for (const exp of validExps) {
      for (const s of exp.strikes ?? []) {
        for (const symKey of [s['call-streamer-symbol'], s['put-streamer-symbol']]) {
          if (!symKey) continue;
          const g = greeks[symKey];
          if (g && Math.abs(parseFloat(g.delta ?? 0)) > 0.40 && Math.abs(parseFloat(g.delta ?? 0)) < 0.60) {
            allEnriched.push({ strike: parseFloat(s['strike-price']), absDelta: Math.abs(parseFloat(g.delta)) });
          }
        }
      }
    }
    if (allEnriched.length) {
      allEnriched.sort((a,b) => Math.abs(a.absDelta - 0.5) - Math.abs(b.absDelta - 0.5));
      underlyingPrice = allEnriched[0].strike;
      console.log(`  ${ticker} price inferred from ATM greeks: ${underlyingPrice}`);
    }
  }
  console.log(`  ${ticker} price: ${underlyingPrice.toFixed(2)} (sym=${resolvedSym ?? 'inferred'})`);

  const results = { conservative:[], neutral:[], aggressive:[] };

  for (const [profName, profile] of Object.entries(PROFILES)) {
    const profExps = validExps.filter(e => {
      const d = parseInt(e['days-to-expiration'] ?? 0);
      return d >= profile.dteMin && d <= profile.dteMax;
    });
    for (const exp of profExps) {
      const expDate = exp['expiration-date'];
      const expDTE  = parseInt(exp['days-to-expiration']);
      const ics = buildICs(exp.strikes ?? [], quotes, greeks, profile, underlyingPrice);
      if (ics.length > 0) {
        const best = { expiration: expDate, dte: expDTE, ...ics[0] };
        results[profName].push(best);
        console.log(`  [${profName}] ${expDate} (${expDTE}d): $${best.credit} POP=${best.pop}% R/R=${best.rr} score=${best.score}`);
      }
    }
    if (!results[profName].length) console.log(`  [${profName}]: no qualifying setups`);
  }

  // Capture VIX if available from this batch
  const vixQ = quotes['$VIX.X'];
  const vixPrice = vixQ ? (mid(vixQ.bidPrice, vixQ.askPrice) || parseFloat(vixQ.lastPrice ?? vixQ.last ?? 0)) : null;

  return { underlyingPrice, results, vixPrice };
}

// ── Step 6: Save to Firestore ─────────────────────────────────────────────────
async function saveResults(scanData, snapshot) {
  console.log('\nSaving to Firestore…');
  const ts = new Date().toISOString();

  const scanPayload = { date: TODAY, timestamp: ts, type: 'morning' };
  for (const [ticker, data] of Object.entries(scanData)) {
    scanPayload[ticker] = { underlyingPrice: data.underlyingPrice, results: data.results };
  }
  await db.collection('guvid-agent-scans').doc(TODAY).set(scanPayload, { merge: true });
  console.log(`  Scan → guvid-agent-scans/${TODAY}`);

  const posRef = db.collection('guvid-agent-positions');
  let n = 0;
  for (const [ticker, data] of Object.entries(scanData)) {
    for (const [profName, ics] of Object.entries(data.results ?? {})) {
      for (const ic of ics) {
        await posRef.add({
          ticker, profile: profName, ic,
          openDate: TODAY, expiration: ic.expiration,
          credit: ic.credit, pop: ic.pop, ev: ic.ev,
          alpha: ic.alpha, rr: ic.rr, wings: ic.wings,
          status: 'open', dailyChecks: [],
          marketContext: { underlyingPrice: data.underlyingPrice ?? null, vix: snapshot.morningVix, ivRank: null },
          createdAt: ts,
        });
        n++;
      }
    }
  }
  console.log(`  ${n} positions saved.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nGuvid Agent — Morning Scan — ${TODAY}`);
  console.log('═'.repeat(60));

  const creds    = await loadCredentials();
  const client   = buildClient(creds);
  const snapshot = await captureSnapshot(client);
  const scanData = {};

  for (const ticker of TICKERS) {
    scanData[ticker] = await scanTicker(client, ticker);
  }

  // Update snapshot VIX from scan data
  const vixFromScan = scanData['SPX']?.vixPrice ?? scanData['QQQ']?.vixPrice;
  if (vixFromScan && vixFromScan > 0) {
    snapshot.morningVix = vixFromScan;
    await db.collection('guvid-agent-daily').doc(TODAY).set({ morningVix: vixFromScan }, { merge: true });
    console.log(`  VIX updated: ${vixFromScan.toFixed(2)}`);
  }

  await saveResults(scanData, snapshot);

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Date:    ${TODAY}`);
  console.log(`NetLiq:  ${snapshot.morningNetLiq != null ? '$'+snapshot.morningNetLiq.toFixed(2) : 'n/a'}`);
  console.log(`VIX:     ${snapshot.morningVix   != null ? snapshot.morningVix.toFixed(2)        : 'n/a'}`);
  for (const [ticker, data] of Object.entries(scanData)) {
    console.log(`\n${ticker} @ ${data.underlyingPrice?.toFixed(2) ?? '?'}`);
    for (const [prof, ics] of Object.entries(data.results ?? {})) {
      console.log(`  ${prof}: ${ics.length} setups`);
      const b = ics[0];
      if (b) console.log(`    Best → ${b.expiration} (${b.dte}d) | P ${b.btoPutStrike}/${b.stoPutStrike} C ${b.stoCallStrike}/${b.btoCallStrike} | $${b.credit} POP=${b.pop}% R/R=${b.rr}`);
    }
  }
  console.log('\nScan complete.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

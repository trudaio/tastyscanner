import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import TastytradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';
import { readFileSync } from 'fs';

// ── Firebase Init ─────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TODAY = new Date().toISOString().slice(0, 10);

// ── Profiles ──────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    w: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    w: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, minCredit: 1, maxRR: 4, spreadPct: 0.08,
    w: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

function daysToExpiry(expirationDate) {
  const exp = new Date(expirationDate + 'T16:00:00-05:00');
  return Math.round((exp - Date.now()) / 86400000);
}

function mid(b, a) {
  b = parseFloat(b ?? 0);
  a = parseFloat(a ?? 0);
  if (b <= 0 && a <= 0) return null;
  if (b <= 0) return a;
  if (a <= 0) return b;
  return (b + a) / 2;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Read Credentials from Firestore ──────────────────────────────────────────
async function readCredentials() {
  console.log('📂 Reading TastyTrade credentials from Firestore…');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();

    for (const acctDoc of brokerSnap.docs) {
      const data = acctDoc.data();
      const creds = data.credentials ?? data;
      if (creds.clientSecret && creds.refreshToken) {
        console.log(`✅ Credentials: user=${userDoc.id} broker=${acctDoc.id}`);
        return { clientSecret: creds.clientSecret, refreshToken: creds.refreshToken };
      }
    }
  }
  throw new Error('No valid TastyTrade credentials found in Firestore');
}

// ── Build TastyTrade client (OAuth2 — no explicit login) ──────────────────────
function buildClient(creds) {
  console.log('🔑 Building TastyTrade client…');
  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });
  console.log('✅ Client ready (OAuth2 auto-refresh)');
  return client;
}

// ── Subscribe to streamer events (chunked to avoid rate limits) ───────────────
async function collectStreamerData(client, symbols, waitMs = 12000) {
  const quotes = {};
  const greeks = {};
  const trades = {};

  const removeListener = client.quoteStreamer.addEventListener((records) => {
    if (!Array.isArray(records)) records = [records];
    for (const ev of records) {
      const sym = ev?.eventSymbol;
      if (!sym) continue;
      if (ev.eventType === 'Quote') quotes[sym] = ev;
      else if (ev.eventType === 'Greeks') greeks[sym] = ev;
      else if (ev.eventType === 'Trade') trades[sym] = ev;
    }
  });

  // Chunk subscriptions in batches of 500 to avoid BAD_ACTION rate errors
  const CHUNK = 500;
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    client.quoteStreamer.subscribe(chunk, [
      MarketDataSubscriptionType.Quote,
      MarketDataSubscriptionType.Greeks,
      MarketDataSubscriptionType.Trade,
    ]);
    if (i + CHUNK < symbols.length) await sleep(800);
  }

  console.log(`  Subscribed ${symbols.length} symbols (${Math.ceil(symbols.length / CHUNK)} chunks), waiting ${waitMs / 1000}s…`);
  await sleep(waitMs);

  // Unsubscribe in chunks
  for (let i = 0; i < symbols.length; i += CHUNK) {
    client.quoteStreamer.unsubscribe(symbols.slice(i, i + CHUNK));
  }
  removeListener();

  return { quotes, greeks, trades };
}

// ── Snapshot: Net Liq + VIX ───────────────────────────────────────────────────
async function captureSnapshot(client, accountNumber, vixPrice) {
  console.log('\n📸 Capturing morning snapshot…');
  let morningNetLiq = null;
  try {
    const resp = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    const bal = resp?.data ?? resp;
    const raw = bal?.['net-liquidating-value'] ?? bal?.netLiquidatingValue;
    morningNetLiq = raw != null ? parseFloat(raw) : null;
    console.log(`  Net Liq: $${morningNetLiq?.toLocaleString() ?? 'N/A'}`);
  } catch (e) {
    console.warn(`  ⚠️  Net liq failed: ${e.message}`);
  }

  if (vixPrice != null) console.log(`  VIX: ${vixPrice.toFixed(2)}`);
  else console.log('  VIX: not available');

  const snapshot = { morningNetLiq, morningVix: vixPrice, timestamp: new Date().toISOString(), date: TODAY };
  await db.collection('guvid-agent-daily').doc(TODAY).set(snapshot, { merge: true });
  console.log('  ✅ Snapshot saved');
  return snapshot;
}

// ── Build best IC from a set of strikes ──────────────────────────────────────
function buildBestIC(strikes, quotes, greeks, underlyingPrice, dte, profile) {
  const options = [];
  for (const strike of strikes) {
    const strikePrice = parseFloat(strike['strike-price'] ?? strike.strikePrice ?? 0);
    if (!strikePrice) continue;
    // Streamer symbols are at strike level, not nested in put/call objects
    for (const side of ['put', 'call']) {
      const sym = strike[`${side}-streamer-symbol`];
      if (!sym) continue;
      const q = quotes[sym];
      const g = greeks[sym];
      const midPrice = q ? mid(q.bidPrice, q.askPrice) : null;
      if (midPrice == null || midPrice <= 0) continue;
      const delta = g ? parseFloat(g.delta ?? 0) : null;
      if (delta == null) continue;
      options.push({ strikePrice, side, sym, mid: midPrice, delta, theta: parseFloat(g?.theta ?? 0), bid: parseFloat(q?.bidPrice ?? 0), ask: parseFloat(q?.askPrice ?? 0) });
    }
  }

  const puts = options.filter(o => o.side === 'put');
  const calls = options.filter(o => o.side === 'call');
  if (!puts.length || !calls.length) return null;

  // Group short-leg candidates by delta bucket for symmetric pairing
  const putBuckets = {}, callBuckets = {};
  for (const p of puts) {
    const abs = Math.abs(p.delta) * 100;
    if (abs < profile.deltaMin || abs > profile.deltaMax) continue;
    const k = Math.round(abs);
    (putBuckets[k] ??= []).push(p);
  }
  for (const c of calls) {
    const abs = Math.abs(c.delta) * 100;
    if (abs < profile.deltaMin || abs > profile.deltaMax) continue;
    const k = Math.round(abs);
    (callBuckets[k] ??= []).push(c);
  }

  const commonKeys = Object.keys(putBuckets).filter(k => callBuckets[k]).sort((a, b) => b - a);
  if (!commonKeys.length) return null;

  let bestIC = null, bestScore = -Infinity;

  for (const key of commonKeys) {
    const pList = putBuckets[key].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const cList = callBuckets[key].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    for (let i = 0; i < Math.min(pList.length, cList.length, 3); i++) {
      const stoP = pList[i], stoC = cList[i];
      const targetW = profile.wings;

      // Long put: closest available below stoP.strikePrice targeting ~wings away
      const btoP = puts
        .filter(o => o.strikePrice < stoP.strikePrice)
        .sort((a, b) => Math.abs(a.strikePrice - (stoP.strikePrice - targetW)) - Math.abs(b.strikePrice - (stoP.strikePrice - targetW)))[0];
      const btoC = calls
        .filter(o => o.strikePrice > stoC.strikePrice)
        .sort((a, b) => Math.abs(a.strikePrice - (stoC.strikePrice + targetW)) - Math.abs(b.strikePrice - (stoC.strikePrice + targetW)))[0];

      if (!btoP || !btoC) continue;

      const credit = stoP.mid + stoC.mid - btoP.mid - btoC.mid;
      if (credit < profile.minCredit) continue;

      const actualWings = Math.min(stoP.strikePrice - btoP.strikePrice, btoC.strikePrice - stoC.strikePrice);
      const rr = (actualWings - credit) / credit;
      if (rr > profile.maxRR) continue;

      if (underlyingPrice) {
        if ((stoP.ask - stoP.bid) / underlyingPrice > profile.spreadPct) continue;
        if ((stoC.ask - stoC.bid) / underlyingPrice > profile.spreadPct) continue;
      }

      // POP via break-even delta interpolation
      const putBEStrike = stoP.strikePrice - credit;
      const callBEStrike = stoC.strikePrice + credit;
      const putBEOpt = puts.reduce((a, b) => Math.abs(a.strikePrice - putBEStrike) < Math.abs(b.strikePrice - putBEStrike) ? a : b);
      const callBEOpt = calls.reduce((a, b) => Math.abs(a.strikePrice - callBEStrike) < Math.abs(b.strikePrice - callBEStrike) ? a : b);
      const pop = 100 - Math.max(Math.abs(putBEOpt.delta) * 100, Math.abs(callBEOpt.delta) * 100);
      if (pop < profile.minPOP) continue;

      const popFrac = pop / 100;
      const ev = credit * popFrac - (actualWings - credit) * (1 - popFrac);
      const theta = Math.abs(stoP.theta) + Math.abs(stoC.theta);
      const maxRisk = actualWings - credit;
      const alpha = maxRisk > 0 ? theta / maxRisk : 0;

      const wt = profile.w;
      const score = wt.pop * (pop / 100) + wt.ev * Math.max(0, ev / actualWings) + wt.alpha * Math.min(1, alpha * 10);

      if (score > bestScore) {
        bestScore = score;
        bestIC = {
          stoP: { strike: stoP.strikePrice, delta: stoP.delta, mid: stoP.mid, sym: stoP.sym },
          btoP: { strike: btoP.strikePrice, delta: btoP.delta, mid: btoP.mid, sym: btoP.sym },
          stoC: { strike: stoC.strikePrice, delta: stoC.delta, mid: stoC.mid, sym: stoC.sym },
          btoC: { strike: btoC.strikePrice, delta: btoC.delta, mid: btoC.mid, sym: btoC.sym },
          credit: Math.round(credit * 100) / 100,
          rr: Math.round(rr * 100) / 100,
          pop: Math.round(pop * 10) / 10,
          ev: Math.round(ev * 100) / 100,
          alpha: Math.round(alpha * 10000) / 10000,
          score: Math.round(score * 10000) / 10000,
          wings: actualWings,
          dte,
        };
      }
    }
  }
  return bestIC;
}

// ── Scan one ticker ───────────────────────────────────────────────────────────
async function scanTicker(client, ticker) {
  const results = { conservative: [], neutral: [], aggressive: [] };
  console.log(`\n${'─'.repeat(55)}\n  Scanning ${ticker}…\n${'─'.repeat(55)}`);

  let chainArr;
  try {
    const resp = await client.instrumentsService.getNestedOptionChain(ticker);
    chainArr = resp?.data ?? resp;
  } catch (e) {
    console.error(`  ❌ Chain fetch failed: ${e.message}`);
    return results;
  }

  // getNestedOptionChain returns an array; first element has .expirations
  const chain = Array.isArray(chainArr) ? chainArr[0] : chainArr;
  const expirations = chain?.expirations ?? chain?.items ?? [];
  const validExps = expirations.filter(exp => {
    const dte = daysToExpiry(exp['expiration-date'] ?? exp.expirationDate);
    return dte >= 19 && dte <= 47;
  });

  console.log(`  ${validExps.length} expirations in 19-47 DTE window (of ${expirations.length} total)`);
  if (!validExps.length) return results;

  // Collect all streamer symbols in one batch
  // Symbols are at strike level: strike['put-streamer-symbol'], strike['call-streamer-symbol']
  // dxFeed symbol for underlying: SPX trades as 'SPX', QQQ as 'QQQ'
  const undStreamerSym = ticker;
  const allSymbols = [undStreamerSym];
  const symbolSet = new Set([undStreamerSym]);
  for (const exp of validExps) {
    for (const strike of exp.strikes ?? exp['option-strikes'] ?? []) {
      for (const side of ['put', 'call']) {
        const sym = strike[`${side}-streamer-symbol`];
        if (sym && !symbolSet.has(sym)) { symbolSet.add(sym); allSymbols.push(sym); }
      }
    }
  }

  console.log(`  Fetching ${allSymbols.length} symbols…`);
  const { quotes, greeks, trades } = await collectStreamerData(client, allSymbols, 12000);

  const undQ = quotes[undStreamerSym];
  const undT = trades[undStreamerSym];
  const underlyingPrice = undQ ? mid(undQ.bidPrice, undQ.askPrice) : (undT ? parseFloat(undT.price ?? 0) || null : null);
  if (underlyingPrice) console.log(`  ${ticker} @ $${underlyingPrice.toFixed(2)}`);

  for (const exp of validExps) {
    const expDate = exp['expiration-date'] ?? exp.expirationDate;
    const dte = daysToExpiry(expDate);
    const strikes = exp.strikes ?? exp['option-strikes'] ?? [];
    if (!strikes.length) continue;

    for (const [profileName, profile] of Object.entries(PROFILES)) {
      if (dte < profile.dteMin || dte > profile.dteMax) continue;
      const ic = buildBestIC(strikes, quotes, greeks, underlyingPrice, dte, profile);
      if (ic) {
        results[profileName].push({ ...ic, ticker, profile: profileName, expiration: expDate, underlyingPrice });
        console.log(`    [${profileName}] ${expDate} DTE:${dte} Credit:$${ic.credit} POP:${ic.pop}% RR:${ic.rr} Score:${ic.score}`);
      }
    }
  }

  return results;
}

// ── Save to Firestore ─────────────────────────────────────────────────────────
async function saveScan(scanDoc, positions) {
  console.log('\n💾 Saving to Firestore…');
  await db.collection('guvid-agent-scans').doc(TODAY).set(scanDoc, { merge: true });
  for (const pos of positions) {
    await db.collection('guvid-agent-positions').add({ ...pos, scanDate: TODAY });
  }
  console.log(`✅ Scan + ${positions.length} positions written.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GUVID AGENT — Morning Scan');
  console.log(`  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('═══════════════════════════════════════════════════════\n');

  const creds = await readCredentials();
  const client = buildClient(creds);

  // Fetch account number
  let accountNumber = null;
  try {
    const accounts = await client.accountsAndCustomersService.getCustomerAccounts();
    const accts = Array.isArray(accounts) ? accounts : accounts?.data ?? [];
    accountNumber = accts[0]?.account?.['account-number'] ?? accts[0]?.accountNumber ?? null;
    console.log(`  Account: ${accountNumber}`);
  } catch (e) {
    console.warn(`  ⚠️  Could not fetch account number: ${e.message}`);
  }

  // Connect streamer once, then fetch VIX
  console.log('\n📡 Connecting streamer…');
  try {
    await client.quoteStreamer.connect();
    console.log('  ✅ Streamer connected');
  } catch (e) {
    console.warn(`  ⚠️  Streamer connect failed: ${e.message}`);
  }

  // VIX: in dxFeed format the symbol is 'VIX', trades-only (no bid/ask quotes for index)
  let vixPrice = null;
  try {
    console.log('  Fetching VIX…');
    const { quotes: vq, trades: vt } = await collectStreamerData(client, ['VIX'], 10000);
    const vixQ = vq['VIX'];
    const vixT = vt['VIX'];
    vixPrice = vixQ ? mid(vixQ.bidPrice, vixQ.askPrice) : (vixT ? parseFloat(vixT.price ?? 0) || null : null);
    if (vixPrice != null) console.log(`  VIX: ${vixPrice.toFixed(2)}`);
    else console.log('  VIX: no data received');
  } catch (e) {
    console.warn(`  ⚠️  VIX failed: ${e.message}`);
  }

  const snapshot = await captureSnapshot(client, accountNumber, vixPrice);

  // Scan tickers
  const scanResults = {};
  for (const ticker of ['SPX', 'QQQ']) {
    try {
      scanResults[ticker] = await scanTicker(client, ticker);
    } catch (e) {
      console.error(`❌ ${ticker} scan error: ${e.message}`);
      scanResults[ticker] = { conservative: [], neutral: [], aggressive: [] };
    }
  }

  // Best IC per ticker+profile
  const positions = [];
  for (const ticker of ['SPX', 'QQQ']) {
    for (const profileName of Object.keys(PROFILES)) {
      const ics = (scanResults[ticker]?.[profileName] ?? []).sort((a, b) => b.score - a.score);
      if (!ics.length) continue;
      const best = ics[0];
      positions.push({
        ticker, profile: profileName, ic: best, openDate: TODAY,
        expiration: best.expiration, credit: best.credit, pop: best.pop,
        ev: best.ev, alpha: best.alpha, rr: best.rr, wings: best.wings,
        status: 'open', dailyChecks: [],
        marketContext: { underlyingPrice: best.underlyingPrice ?? null, vix: snapshot.morningVix, ivRank: null },
      });
    }
  }

  await saveScan({
    date: TODAY, timestamp: new Date().toISOString(), type: 'morning',
    morningNetLiq: snapshot.morningNetLiq, morningVix: snapshot.morningVix,
    SPX: scanResults.SPX, QQQ: scanResults.QQQ,
  }, positions);

  // ── Print Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  MORNING SCAN SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Date:    ${TODAY}`);
  console.log(`  Net Liq: $${snapshot.morningNetLiq?.toLocaleString() ?? 'N/A'}`);
  console.log(`  VIX:     ${snapshot.morningVix?.toFixed(2) ?? 'N/A'}`);

  for (const ticker of ['SPX', 'QQQ']) {
    console.log(`\n  ${ticker}:`);
    for (const profileName of Object.keys(PROFILES)) {
      const ics = (scanResults[ticker]?.[profileName] ?? []).sort((a, b) => b.score - a.score);
      if (!ics.length) { console.log(`    ${profileName.padEnd(14)} — no candidates`); continue; }
      const b = ics[0];
      console.log(`    ${profileName.padEnd(14)} ${b.expiration} DTE:${b.dte} | Credit:$${b.credit} POP:${b.pop}% RR:${b.rr} Score:${b.score}`);
      console.log(`    ${''.padEnd(14)} P${b.stoP.strike}/${b.btoP.strike} | C${b.stoC.strike}/${b.btoC.strike}`);
    }
  }

  console.log(`\n  Positions saved: ${positions.length}`);
  console.log('═══════════════════════════════════════════════════════\n');

  try { client.quoteStreamer.disconnect(); } catch (_) {}
}

main()
  .catch(e => { console.error('💥 Fatal:', e.message, '\n', e.stack); process.exit(1); })
  .finally(() => setTimeout(() => process.exit(0), 1500));

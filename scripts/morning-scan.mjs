// Morning scan agent — runs at ~10:30 AM ET (1h after open)
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import ws from 'ws';

// DxLink WebSocket requires global.WebSocket in Node.js
global.WebSocket = ws;

// ── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const TODAY = new Date().toISOString().slice(0, 10);

// ── TastyTrade SDK ───────────────────────────────────────────────────────────
const { default: TastytradeClient } = await import('@tastytrade/api');

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function midPrice(q) {
  if (!q) return 0;
  const bid = parseFloat(q.bidPrice ?? 0);
  const ask = parseFloat(q.askPrice ?? 0);
  if (bid <= 0 && ask <= 0) return parseFloat(q.lastPrice ?? q.price ?? 0);
  return (bid + ask) / 2;
}

function dteDays(expStr) {
  const exp = new Date(expStr + 'T16:00:00-05:00');
  const now = new Date();
  return Math.round((exp - now) / 86400000);
}

// ── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: {
    deltaMin: 11, deltaMax: 16, dteMin: 30, dteMax: 47,
    wings: 10, minPOP: 80, maxRR: 4, minCredit: 1,
    weights: { pop: 0.70, ev: 0.20, alpha: 0.10 },
  },
  neutral: {
    deltaMin: 11, deltaMax: 24, dteMin: 19, dteMax: 47,
    wings: 10, minPOP: 60, maxRR: 4, minCredit: 1,
    weights: { pop: 0.60, ev: 0.25, alpha: 0.15 },
  },
  aggressive: {
    deltaMin: 15, deltaMax: 24, dteMin: 19, dteMax: 35,
    wings: 5, minPOP: 60, maxRR: 4, minCredit: 1,
    weights: { pop: 0.40, ev: 0.35, alpha: 0.25 },
  },
};

// ── Step 3: Read credentials from Firestore ──────────────────────────────────
async function loadCredentials() {
  console.log('[Step 3] Loading TastyTrade credentials from Firestore…');
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) throw new Error('No users found in Firestore');

  for (const userDoc of usersSnap.docs) {
    const brokerSnap = await db
      .collection('users').doc(userDoc.id)
      .collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      const creds = data.credentials;
      if (creds?.clientSecret && creds?.refreshToken) {
        const accountNumber = data.accountNumber || brokerDoc.id;
        console.log(`  Found credentials for user ${userDoc.id}, account ${accountNumber}`);
        return { clientSecret: creds.clientSecret, refreshToken: creds.refreshToken, accountNumber };
      }
    }
  }
  throw new Error('No valid TastyTrade credentials found in Firestore');
}

// ── Fetch OAuth token via curl subprocess (avoids Node.js DNS cache issues) ──
import { execSync } from 'child_process';

async function fetchAccessToken(creds) {
  const payload = JSON.stringify({
    refresh_token: creds.refreshToken,
    client_secret: creds.clientSecret,
    scope: 'read trade',
    grant_type: 'refresh_token',
  });
  const escaped = payload.replace(/'/g, `'\\''`);
  const cmd = `curl -s --max-time 15 -X POST https://api.tastyworks.com/oauth/token -H 'Content-Type: application/json' -d '${escaped}'`;
  const delays = [2000, 4000, 8000, 16000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const out = execSync(cmd, { encoding: 'utf8' });
      const resp = JSON.parse(out);
      if (resp.access_token) return resp;
      throw new Error(`No access_token: ${out}`);
    } catch (e) {
      if (attempt < delays.length) {
        console.warn(`  OAuth attempt ${attempt + 1} failed (${e.message.slice(0, 80)}), retrying in ${delays[attempt] / 1000}s…`);
        await sleep(delays[attempt]);
      } else {
        throw new Error(`OAuth failed after ${delays.length + 1} attempts: ${e.message}`);
      }
    }
  }
}

// ── Raw DxLink streamer (bypasses SDK WebSocket layer) ───────────────────────
class RawDxStreamer {
  constructor() {
    this.quotes = {};
    this.greeks = {};
    this._socket = null;
    this._pendingSubs = [];
    this._ready = false;
    this._compact = false;
    this._quoteFields = null;
    this._greeksFields = null;
  }

  connect(url, token) {
    return new Promise((resolve, reject) => {
      const socket = new ws(url);
      this._socket = socket;
      const timeout = setTimeout(() => reject(new Error('DxLink connect timeout')), 30000);

      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'SETUP', channel: 0, version: '0.1-DXF-JS/0.3.0', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }));
      });

      socket.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SETUP') {
          socket.send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
        } else if (msg.type === 'AUTH_STATE') {
          if (msg.state === 'AUTHORIZED') {
            socket.send(JSON.stringify({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } }));
          }
          // UNAUTHORIZED may appear transiently before AUTHORIZED — just wait
        } else if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
          socket.send(JSON.stringify({
            type: 'FEED_SETUP', channel: 1,
            acceptAggregationPeriod: 10,
            acceptDataFormat: 'COMPACT',
            acceptEventFields: { Quote: ['eventType','eventSymbol','bidPrice','askPrice'], Greeks: ['eventType','eventSymbol','delta','theta','gamma','vega','volatility'] }
          }));
          this._ready = true;
          clearTimeout(timeout);
          resolve();
          // Flush pending subscriptions
          if (this._pendingSubs.length > 0) {
            this._sendSubs(this._pendingSubs);
            this._pendingSubs = [];
          }
        } else if (msg.type === 'FEED_CONFIG') {
          this._compact = msg.dataFormat === 'COMPACT';
          if (msg.eventFields?.Quote) this._quoteFields = msg.eventFields.Quote;
          if (msg.eventFields?.Greeks) this._greeksFields = msg.eventFields.Greeks;
        } else if (msg.type === 'FEED_DATA') {
          this._handleData(msg.data);
        } else if (msg.type === 'ERROR') {
          console.warn('[DxLink] Server error:', msg.message);
        }
      });

      socket.on('error', (e) => console.warn('[DxLink] WS error:', e.message));
      socket.on('close', () => console.log('[DxLink] WS closed'));
    });
  }

  _sendSubs(symbols, types = ['Quote', 'Greeks']) {
    if (!this._socket || !this._ready) return;
    const add = [];
    for (const sym of symbols) for (const t of types) add.push({ type: t, symbol: sym });
    this._socket.send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: 1, add }));
  }

  subscribe(symbols, types) {
    if (!this._ready) { this._pendingSubs.push(...symbols); return; }
    this._sendSubs(symbols, types);
  }

  _handleData(data) {
    if (!Array.isArray(data)) return;
    // Compact format: [eventType, [field, field, ...], [field, field, ...], ...]
    for (let i = 0; i < data.length; i += 2) {
      const evType = data[i];
      const rows = data[i + 1];
      if (!Array.isArray(rows)) continue;
      const fields = evType === 'Quote' ? this._quoteFields : evType === 'Greeks' ? this._greeksFields : null;
      if (!fields) continue;
      for (let j = 0; j < rows.length; j += fields.length) {
        const rec = {};
        for (let k = 0; k < fields.length; k++) rec[fields[k]] = rows[j + k];
        const sym = rec.eventSymbol;
        if (!sym) continue;
        if (evType === 'Quote') this.quotes[sym] = rec;
        else if (evType === 'Greeks') this.greeks[sym] = rec;
      }
    }
  }

  disconnect() { this._socket?.close(); }
}

// ── Build client + connect streamer ──────────────────────────────────────────
async function buildClient(creds) {
  console.log('[Auth] Fetching OAuth access token via curl…');
  const tokenResp = await fetchAccessToken(creds);
  console.log(`  Access token obtained (expires in ${tokenResp.expires_in}s)`);

  const client = new TastytradeClient({
    ...TastytradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });

  // Inject token directly — bypasses the axios-based generateAccessToken call
  client.httpClient.accessToken.token = tokenResp.access_token;
  client.httpClient.accessToken.expiresIn = (tokenResp.expires_in ?? 900) - 30;

  // Resolve actual TastyTrade account number via API
  let accountNumber = null;
  try {
    const accts = await client.accountsAndCustomersService.getCustomerAccounts();
    const first = Array.isArray(accts) ? accts[0] : accts;
    accountNumber = first?.account?.['account-number'] ?? first?.['account-number'] ?? first?.accountNumber ?? null;
    if (accountNumber) console.log(`  Account number: ${accountNumber}`);
    else console.warn('  Could not determine account number, will skip balances');
  } catch (e) {
    console.warn('  Could not fetch accounts:', e.message);
  }

  // Get DxLink URL and token
  let dxUrl, dxToken;
  try {
    const qt = await client.accountsAndCustomersService.getApiQuoteToken();
    dxUrl = qt['dxlink-url'];
    dxToken = qt.token;
    console.log(`[Streamer] DxLink URL: ${dxUrl}`);
  } catch (e) {
    throw new Error(`Failed to get DxLink token: ${e.message}`);
  }

  // Connect raw DxLink streamer (retry on 503)
  const streamer = new RawDxStreamer();
  console.log('[Streamer] Connecting via raw WebSocket…');
  const dxDelays = [3000, 6000, 12000];
  for (let attempt = 0; attempt <= dxDelays.length; attempt++) {
    try {
      await streamer.connect(dxUrl, dxToken);
      console.log('  Connected and AUTHORIZED');
      break;
    } catch (e) {
      if (attempt < dxDelays.length) {
        console.warn(`  DxLink attempt ${attempt + 1} failed (${e.message.slice(0, 60)}), retrying in ${dxDelays[attempt] / 1000}s…`);
        await sleep(dxDelays[attempt]);
        // Re-instantiate streamer for clean state
        Object.assign(streamer, new RawDxStreamer());
      } else {
        throw new Error(`DxLink connect failed after retries: ${e.message}`);
      }
    }
  }

  return { client, streamer, accountNumber };
}

// ── Step 4: Morning snapshot ─────────────────────────────────────────────────
async function captureSnapshot(client, streamer, accountNumber) {
  console.log('\n[Step 4] Capturing morning snapshot…');

  let morningNetLiq = null;
  try {
    const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
    morningNetLiq = parseFloat(balances['net-liquidating-value'] ?? 0);
    console.log(`  Net liq: $${morningNetLiq.toFixed(2)}`);
  } catch (e) {
    console.warn('  Could not fetch net liq:', e.message);
  }

  // Subscribe to VIX
  streamer.subscribe(['$VIX.X'], ['Quote']);
  await sleep(5000);

  let morningVix = null;
  const vixQ = streamer.quotes['$VIX.X'];
  if (vixQ) {
    morningVix = midPrice(vixQ);
    console.log(`  VIX: ${morningVix.toFixed(2)}`);
  } else {
    console.warn('  VIX quote not received');
  }

  const snapshot = {
    morningNetLiq,
    morningVix,
    timestamp: new Date().toISOString(),
    date: TODAY,
  };
  await db.doc(`guvid-agent/daily/${TODAY}/snapshot`).set(snapshot, { merge: true });
  console.log('  Snapshot saved');
  return snapshot;
}

// ── IC Builder ───────────────────────────────────────────────────────────────
function buildICs(expirations, quotes, greeks, profile) {
  const results = [];

  for (const exp of expirations) {
    const expDate = exp['expiration-date'] ?? exp.expirationDate;
    const dte = parseInt(exp['days-to-expiration'] ?? exp.daysToExpiration ?? dteDays(expDate));
    if (dte < profile.dteMin || dte > profile.dteMax) continue;

    const strikes = exp.strikes ?? [];

    // Collect qualifying puts and calls
    const puts = [];
    const calls = [];

    for (const strike of strikes) {
      const sp = parseFloat(strike['strike-price'] ?? strike.strikePrice ?? 0);
      if (!sp) continue;

      const putSym = strike['put-streamer-symbol'] ?? strike.putStreamerSymbol;
      const callSym = strike['call-streamer-symbol'] ?? strike.callStreamerSymbol;

      if (putSym) {
        const q = quotes[putSym];
        const g = greeks[putSym];
        if (q && g) {
          const rawDelta = parseFloat(g.delta ?? 0);
          // Delta for puts is negative; abs and convert to 0-100 pct
          const deltaPct = Math.abs(rawDelta) < 1 ? Math.abs(rawDelta) * 100 : Math.abs(rawDelta);
          const mid = midPrice(q);
          if (mid > 0 && deltaPct >= profile.deltaMin && deltaPct <= profile.deltaMax) {
            puts.push({ sp, sym: putSym, mid, delta: deltaPct });
          }
        }
      }

      if (callSym) {
        const q = quotes[callSym];
        const g = greeks[callSym];
        if (q && g) {
          const rawDelta = parseFloat(g.delta ?? 0);
          const deltaPct = Math.abs(rawDelta) < 1 ? Math.abs(rawDelta) * 100 : Math.abs(rawDelta);
          const mid = midPrice(q);
          if (mid > 0 && deltaPct >= profile.deltaMin && deltaPct <= profile.deltaMax) {
            calls.push({ sp, sym: callSym, mid, delta: deltaPct });
          }
        }
      }
    }

    if (!puts.length || !calls.length) continue;

    // Sort desc by delta; group by rounded delta; pair by index
    puts.sort((a, b) => b.delta - a.delta);
    calls.sort((a, b) => b.delta - a.delta);

    const putGroups = groupByRoundedDelta(puts);
    const callGroups = groupByRoundedDelta(calls);

    for (const dKey of Object.keys(putGroups)) {
      const dk = parseInt(dKey);
      const cStrikes = callGroups[String(dk)] ?? callGroups[String(dk + 1)] ?? callGroups[String(dk - 1)];
      if (!cStrikes) continue;

      const pStrikes = putGroups[dKey];
      const pairs = Math.min(pStrikes.length, cStrikes.length);

      for (let i = 0; i < pairs; i++) {
        const stoPut = pStrikes[i];
        const stoCall = cStrikes[i];

        // Protective wings
        const btoPut = findClosestStrike(strikes, stoPut.sp - profile.wings, 'put-streamer-symbol', 'putStreamerSymbol', quotes);
        const btoCall = findClosestStrike(strikes, stoCall.sp + profile.wings, 'call-streamer-symbol', 'callStreamerSymbol', quotes);
        if (!btoPut || !btoCall) continue;

        const credit = stoPut.mid + stoCall.mid - btoPut.mid - btoCall.mid;
        if (credit < profile.minCredit) continue;

        const rr = (profile.wings - credit) / credit;
        if (rr > profile.maxRR || rr <= 0) continue;

        const pop = 100 - Math.max(stoPut.delta, stoCall.delta);
        if (pop < profile.minPOP) continue;

        const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
        const alpha = credit / profile.wings;
        const w = profile.weights;
        const score = pop * w.pop + ev * w.ev * 10 + alpha * w.alpha * 100;

        results.push({
          expiration: expDate,
          dte,
          stoPut:  { strikePrice: stoPut.sp,  sym: stoPut.sym,  mid: +stoPut.mid.toFixed(2),  delta: +stoPut.delta.toFixed(2) },
          btoPut:  { strikePrice: btoPut.sp,  sym: btoPut.sym,  mid: +btoPut.mid.toFixed(2) },
          stoCall: { strikePrice: stoCall.sp, sym: stoCall.sym, mid: +stoCall.mid.toFixed(2), delta: +stoCall.delta.toFixed(2) },
          btoCall: { strikePrice: btoCall.sp, sym: btoCall.sym, mid: +btoCall.mid.toFixed(2) },
          credit: +credit.toFixed(2),
          rr: +rr.toFixed(2),
          pop: +pop.toFixed(1),
          ev: +ev.toFixed(2),
          alpha: +alpha.toFixed(3),
          score: +score.toFixed(2),
        });
      }
    }
  }

  // Best per expiration
  const bestByExp = {};
  for (const ic of results) {
    if (!bestByExp[ic.expiration] || ic.score > bestByExp[ic.expiration].score) {
      bestByExp[ic.expiration] = ic;
    }
  }
  return Object.values(bestByExp).sort((a, b) => b.score - a.score);
}

function groupByRoundedDelta(opts) {
  const g = {};
  for (const o of opts) {
    const k = String(Math.round(o.delta));
    (g[k] = g[k] ?? []).push(o);
  }
  return g;
}

function findClosestStrike(strikes, targetSP, symKey1, symKey2, quotes) {
  let best = null, bestDiff = Infinity;
  for (const s of strikes) {
    const sp = parseFloat(s['strike-price'] ?? s.strikePrice ?? 0);
    const diff = Math.abs(sp - targetSP);
    if (diff < bestDiff) {
      const sym = s[symKey1] ?? s[symKey2];
      const q = sym ? quotes[sym] : null;
      if (q) { bestDiff = diff; best = { sp, sym, mid: midPrice(q) }; }
    }
  }
  return best;
}

// ── Scan one ticker ───────────────────────────────────────────────────────────
async function scanTicker(client, streamer, ticker) {
  console.log(`\n[Scan] ${ticker}…`);

  // Get options chain with retry for intermittent 503s
  let chainItems;
  const chainDelays = [3000, 6000, 12000];
  for (let attempt = 0; attempt <= chainDelays.length; attempt++) {
    try {
      chainItems = await client.instrumentsService.getNestedOptionChain(ticker);
      break;
    } catch (e) {
      if (attempt < chainDelays.length) {
        console.warn(`  getNestedOptionChain attempt ${attempt + 1} failed (${e.message.slice(0,60)}), retrying in ${chainDelays[attempt] / 1000}s…`);
        await sleep(chainDelays[attempt]);
      } else {
        console.warn(`  getNestedOptionChain failed after retries:`, e.message);
        return null;
      }
    }
  }
  if (!Array.isArray(chainItems) || !chainItems.length) {
    console.warn(`  No chain data for ${ticker}`);
    return null;
  }

  // Collect all streamer symbols across all expirations
  const allExpirations = [];
  const symbols = new Set();
  for (const item of chainItems) {
    for (const exp of (item.expirations ?? [])) {
      allExpirations.push(exp);
      for (const strike of (exp.strikes ?? [])) {
        const p = strike['put-streamer-symbol'];
        const c = strike['call-streamer-symbol'];
        if (p) symbols.add(p);
        if (c) symbols.add(c);
      }
    }
  }
  console.log(`  ${allExpirations.length} expirations, ${symbols.size} option symbols`);

  // Subscribe in batches
  const symArr = [...symbols];
  const BATCH = 300;
  for (let i = 0; i < symArr.length; i += BATCH) {
    streamer.subscribe(symArr.slice(i, i + BATCH), ['Quote', 'Greeks']);
  }

  console.log(`  Waiting 12s for streamer data…`);
  await sleep(12000);

  const { quotes, greeks } = streamer;
  const qCount = Object.keys(quotes).length;
  const gCount = Object.keys(greeks).length;
  console.log(`  Quotes: ${qCount}, Greeks: ${gCount}`);

  // Underlying price (best effort)
  let underlyingPrice = 0;
  try {
    const eq = await client.instrumentsService.getSingleEquity(ticker);
    underlyingPrice = parseFloat(eq?.['last-price'] ?? eq?.lastPrice ?? 0);
  } catch (_) {}
  if (!underlyingPrice) {
    const uq = quotes[ticker];
    if (uq) underlyingPrice = midPrice(uq);
  }

  const tickerResults = {};
  for (const [profileName, profile] of Object.entries(PROFILES)) {
    const ics = buildICs(allExpirations, quotes, greeks, profile);
    tickerResults[profileName] = ics;
    console.log(`  [${profileName}] ${ics.length} IC(s)`);
    if (ics[0]) {
      const b = ics[0];
      console.log(`    Best: ${b.expiration} DTE=${b.dte} Credit=$${b.credit} POP=${b.pop}% RR=${b.rr} Score=${b.score}`);
    }
  }

  return { tickerResults, underlyingPrice };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GUVID MORNING SCAN — ${TODAY} 10:30 AM ET`);
  console.log(`${'='.repeat(60)}\n`);

  const creds = await loadCredentials();
  const { client, streamer, accountNumber } = await buildClient(creds);

  const snapshot = await captureSnapshot(client, streamer, accountNumber);

  const tickers = ['SPX', 'QQQ'];
  const scanResults = {};
  for (const ticker of tickers) {
    scanResults[ticker] = await scanTicker(client, streamer, ticker);
  }

  // ── Step 6: Save scan ──────────────────────────────────────────────────────
  console.log('\n[Step 6] Saving to Firestore…');

  const scanDoc = { date: TODAY, timestamp: new Date().toISOString(), type: 'morning' };
  for (const ticker of tickers) {
    const r = scanResults[ticker];
    scanDoc[ticker] = {};
    for (const p of Object.keys(PROFILES)) {
      scanDoc[ticker][p] = r?.tickerResults?.[p] ?? [];
    }
  }
  await db.doc(`guvid-agent/scans/${TODAY}/morning`).set(scanDoc, { merge: true });
  console.log('  Scan saved');

  let positionsSaved = 0;
  const posRef = db.collection('guvid-agent').doc('positions').collection('open');

  for (const ticker of tickers) {
    const r = scanResults[ticker];
    if (!r) continue;
    for (const [profileName, ics] of Object.entries(r.tickerResults)) {
      if (!ics?.length) continue;
      const best = ics[0];
      await posRef.add({
        ticker, profile: profileName, ic: best,
        openDate: TODAY, expiration: best.expiration,
        credit: best.credit, pop: best.pop, ev: best.ev,
        alpha: best.alpha, rr: best.rr, wings: PROFILES[profileName].wings,
        status: 'open', dailyChecks: [],
        marketContext: {
          underlyingPrice: r.underlyingPrice ?? 0,
          vix: snapshot.morningVix,
          ivRank: null,
        },
      });
      positionsSaved++;
    }
  }
  console.log(`  ${positionsSaved} position(s) saved`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('MORNING SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Date:    ${TODAY}`);
  console.log(`Net Liq: $${snapshot.morningNetLiq?.toFixed(2) ?? 'N/A'}`);
  console.log(`VIX:     ${snapshot.morningVix?.toFixed(2) ?? 'N/A'}`);
  console.log('');

  for (const ticker of tickers) {
    const r = scanResults[ticker];
    console.log(`${ticker} (price: $${r?.underlyingPrice?.toFixed(2) ?? 'N/A'})`);
    for (const p of Object.keys(PROFILES)) {
      const ics = r?.tickerResults?.[p] ?? [];
      const best = ics[0];
      if (best) {
        console.log(`  [${p.padEnd(12)}] ${ics.length} candidates | Best: ${best.expiration} DTE=${best.dte} Credit=$${best.credit} POP=${best.pop}% RR=${best.rr} Score=${best.score}`);
      } else {
        console.log(`  [${p.padEnd(12)}] No candidates`);
      }
    }
    console.log('');
  }

  streamer.disconnect();
  console.log('Scan complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import axios from 'axios';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const TT_BASE = 'https://api.tastytrade.com';

function mid(bid, ask) {
  const b = parseFloat(bid) || 0, a = parseFloat(ask) || 0;
  if (!b && !a) return 0; if (!b) return a; if (!a) return b;
  return (b + a) / 2;
}
function r2(v) { return Math.round(v * 100) / 100; }
function r4(v) { return Math.round(v * 10000) / 10000; }

// ── Credentials ────────────────────────────────────────────────────────────
async function getAllCredentials() {
  console.log('📋 Reading credentials…');
  const usersSnap = await db.collection('users').get();
  const accounts = [];
  for (const u of usersSnap.docs) {
    const bs = await db.collection('users').doc(u.id).collection('brokerAccounts').get();
    for (const b of bs.docs) {
      const d = b.data();
      if (!d.isActive || !d.credentials?.clientSecret || !d.credentials?.refreshToken) continue;
      let scope = 'read';
      try { scope = JSON.parse(Buffer.from(d.credentials.refreshToken.split('.')[1], 'base64url').toString()).scope || 'read'; } catch {}
      accounts.push({ label: d.label || '', clientSecret: d.credentials.clientSecret, refreshToken: d.credentials.refreshToken, scope });
    }
  }
  console.log(`  ${accounts.length} accounts`);
  return [...accounts.filter(a => a.scope.includes('trade') && a.scope.includes('openid')),
          ...accounts.filter(a => a.scope.includes('trade') && !a.scope.includes('openid')),
          ...accounts.filter(a => !a.scope.includes('trade'))];
}

// ── TastyTrade REST ─────────────────────────────────────────────────────────
async function ttPost(path, body) {
  const r = await axios.post(`${TT_BASE}${path}`, body, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, validateStatus: () => true,
  });
  if (r.status >= 400) throw new Error(`TT ${path} ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
async function ttGet(path, token) {
  const r = await axios.get(`${TT_BASE}${path}`, {
    headers: { 'Accept': 'application/json', Authorization: token }, validateStatus: () => true,
  });
  if (r.status >= 400) throw new Error(`TT GET ${path} ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
async function getToken(creds) {
  const d = await ttPost('/oauth/token', { grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_secret: creds.clientSecret, scope: creds.scope || 'read' });
  if (!d.access_token) throw new Error('No access_token');
  return `Bearer ${d.access_token}`;
}
async function getAccountNumber(token) {
  const d = await ttGet('/customers/me/accounts', token);
  const items = d?.data?.items || [];
  if (!items.length) throw new Error('No accounts');
  return items[0].account['account-number'];
}
async function getBalances(token, acct) {
  return (await ttGet(`/accounts/${acct}/balances`, token))?.data || {};
}
async function getDxToken(token) {
  const d = (await ttGet('/api-quote-tokens', token))?.data || {};
  return { wsUrl: d['dxlink-url'] || d['websocket-url'], token: d.token, level: d.level };
}

// ── DxLink ─────────────────────────────────────────────────────────────────
const WS = (await import('ws')).default;

async function streamData(symbols, dxTok, timeoutMs = 25000) {
  // Returns { quotes: {sym: {bid,ask,mid}}, greeks: {sym: {delta,...}} }
  return new Promise((resolve, reject) => {
    if (!dxTok.wsUrl) { resolve({ quotes: {}, greeks: {} }); return; }
    const quotes = {}, greeks = {};
    let ready = false, kaTimer;
    const ws = new WS(dxTok.wsUrl, { headers: { Authorization: dxTok.token } });
    const send = msg => { try { ws.send(JSON.stringify(msg)); } catch {} };
    const resetKA = () => { clearTimeout(kaTimer); kaTimer = setTimeout(() => { send({ type: 'KEEPALIVE', channel: 0 }); resetKA(); }, 20000); };
    const done = () => { clearTimeout(doneTimer); clearTimeout(kaTimer); try { ws.close(); } catch {} resolve({ quotes, greeks }); };
    const doneTimer = setTimeout(done, timeoutMs);

    ws.on('open', () => {
      send({ type: 'SETUP', channel: 0, version: '0.1', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 });
      resetKA();
    });
    ws.on('message', raw => {
      let msgs; try { msgs = JSON.parse(raw.toString()); } catch { return; }
      for (const msg of (Array.isArray(msgs) ? msgs : [msgs])) {
        if (msg.type === 'AUTH_STATE' && msg.state === 'UNAUTHORIZED') send({ type: 'AUTH', channel: 0, token: dxTok.token });
        else if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED')
          send({ type: 'CHANNEL_REQUEST', channel: 1, service: 'FEED', parameters: { contract: 'AUTO' } });
        else if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
          ready = true;
          send({
            type: 'FEED_SETUP', channel: 1, acceptAggregationPeriod: 0.1, acceptDataFormat: 'COMPACT',
            acceptEventFields: {
              Quote: ['eventSymbol', 'bidPrice', 'askPrice'],
              Greeks: ['eventSymbol', 'delta', 'theta', 'gamma', 'vega', 'volatility'],
            },
          });
          const add = symbols.flatMap(s => [{ type: 'Quote', symbol: s }, { type: 'Greeks', symbol: s }]);
          send({ type: 'FEED_SUBSCRIPTION', channel: 1, reset: true, add });
        } else if (msg.type === 'FEED_DATA' && ready) {
          // data = ["EventType", [sym, v1, v2, sym2, v1, v2, ...]]  (LIST/COMPACT format)
          // Can also batch: [["EventType", [...]], ["EventType2", [...]]]
          const rawData = msg.data || [];
          const batches = Array.isArray(rawData[0]) ? rawData : [rawData];
          for (const [type, vals] of batches) {
            if (!Array.isArray(vals)) continue;
            if (type === 'Quote') {
              // fields: eventSymbol, bidPrice, askPrice  (3 per record)
              for (let i = 0; i + 2 < vals.length; i += 3) {
                const sym = vals[i]; if (!sym || typeof sym !== 'string') continue;
                quotes[sym] = { bid: parseFloat(vals[i+1])||0, ask: parseFloat(vals[i+2])||0, mid: mid(vals[i+1], vals[i+2]) };
              }
            } else if (type === 'Greeks') {
              // fields: eventSymbol, delta  (2 per record — as configured)
              for (let i = 0; i + 1 < vals.length; i += 2) {
                const sym = vals[i]; if (!sym || typeof sym !== 'string') continue;
                greeks[sym] = { delta: parseFloat(vals[i+1]) || 0 };
              }
            }
          }
        } else if (msg.type === 'KEEPALIVE') send({ type: 'KEEPALIVE', channel: 0 });
      }
    });
    ws.on('error', e => { clearTimeout(doneTimer); clearTimeout(kaTimer); reject(e); });
    ws.on('close', () => { clearTimeout(doneTimer); clearTimeout(kaTimer); resolve({ quotes, greeks }); });
  });
}

// ── Options chain parsing ─────────────────────────────────────────────────
async function getChain(ticker, token) {
  const d = await ttGet(`/option-chains/${encodeURIComponent(ticker)}/nested`, token);
  return d?.data?.items || [];
}

// Flatten chain items into [{expDate, dte, strikesData}]
function flattenChain(chainItems) {
  const now = Date.now();
  const exps = {};
  for (const item of chainItems) {
    for (const exp of (item.expirations || [])) {
      const expDate = exp['expiration-date'];
      const dte = parseInt(exp['days-to-expiration']) || Math.round((new Date(expDate) - now) / 86400000);
      if (!exps[expDate]) exps[expDate] = { expDate, dte, strikes: [] };
      exps[expDate].strikes.push(...(exp.strikes || []));
    }
  }
  return Object.values(exps).sort((a, b) => a.dte - b.dte);
}

// ── Profiles ───────────────────────────────────────────────────────────────
const PROFILES = {
  conservative: { deltaMin: 0.11, deltaMax: 0.16, dteMin: 30, dteMax: 47, wings: 10, minPOP: 80, maxRR: 4, minCredit: 1, w: { pop: 0.70, ev: 0.20, alpha: 0.10 } },
  neutral:      { deltaMin: 0.11, deltaMax: 0.24, dteMin: 19, dteMax: 47, wings: 10, minPOP: 60, maxRR: 4, minCredit: 1, w: { pop: 0.60, ev: 0.25, alpha: 0.15 } },
  aggressive:   { deltaMin: 0.15, deltaMax: 0.24, dteMin: 19, dteMax: 35, wings:  5, minPOP: 60, maxRR: 4, minCredit: 1, w: { pop: 0.40, ev: 0.35, alpha: 0.25 } },
};

function buildICs(strikesData, quotes, greeks, profile, expDate, dte) {
  // strikesData: [{strike-price, call-streamer-symbol, put-streamer-symbol}]
  const putCandidates = [], callCandidates = [];

  for (const s of strikesData) {
    const strike = parseFloat(s['strike-price']);
    const putSym = s['put-streamer-symbol'];
    const callSym = s['call-streamer-symbol'];

    const putQ = quotes[putSym], putG = greeks[putSym];
    const callQ = quotes[callSym], callG = greeks[callSym];

    if (putQ && putQ.mid > 0 && putG) {
      const delta = Math.abs(putG.delta); // put delta is negative, abs it
      if (delta >= profile.deltaMin && delta <= profile.deltaMax)
        putCandidates.push({ strike, sym: putSym, mid: putQ.mid, absDelta: delta });
    }
    if (callQ && callQ.mid > 0 && callG) {
      const delta = Math.abs(callG.delta);
      if (delta >= profile.deltaMin && delta <= profile.deltaMax)
        callCandidates.push({ strike, sym: callSym, mid: callQ.mid, absDelta: delta });
    }
  }

  // Sort puts desc by delta, calls desc by delta
  putCandidates.sort((a, b) => b.absDelta - a.absDelta);
  callCandidates.sort((a, b) => b.absDelta - a.absDelta);

  const results = [];
  const strikeMap = {};
  strikesData.forEach(s => { strikeMap[parseFloat(s['strike-price'])] = s; });

  for (let i = 0; i < Math.min(putCandidates.length, callCandidates.length); i++) {
    const sp = putCandidates[i], sc = callCandidates[i];
    if (sp.strike >= sc.strike) continue;

    const lpStrike = sp.strike - profile.wings;
    const lcStrike = sc.strike + profile.wings;

    const lpData = strikeMap[lpStrike];
    const lcData = strikeMap[lcStrike];
    if (!lpData || !lcData) continue;

    const lpSym = lpData['put-streamer-symbol'];
    const lcSym = lcData['call-streamer-symbol'];
    const qLP = quotes[lpSym], qLC = quotes[lcSym];
    if (!qLP || !qLC) continue;

    const credit = sp.mid + sc.mid - qLP.mid - qLC.mid;
    if (credit < profile.minCredit) continue;
    const rr = (profile.wings - credit) / credit;
    if (rr > profile.maxRR || rr <= 0) continue;
    const pop = 100 - Math.max(sp.absDelta * 100, sc.absDelta * 100);
    if (pop < profile.minPOP) continue;

    const ev = credit * (pop / 100) - (profile.wings - credit) * (1 - pop / 100);
    const alpha = credit / profile.wings;
    const score = profile.w.pop * (pop / 100) + profile.w.ev * ev + profile.w.alpha * alpha;

    results.push({
      expirationDate: expDate, dte,
      shortPutStrike: sp.strike, longPutStrike: lpStrike,
      shortCallStrike: sc.strike, longCallStrike: lcStrike,
      shortPutSymbol: sp.sym, longPutSymbol: lpSym,
      shortCallSymbol: sc.sym, longCallSymbol: lcSym,
      putDelta: r2(sp.absDelta * 100),
      callDelta: r2(sc.absDelta * 100),
      credit: r2(credit), rr: r2(rr), pop: r2(pop),
      ev: r2(ev), alpha: r2(alpha * 100), wings: profile.wings,
      score: r4(score),
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

async function scanTicker(ticker, token, dxTok, profileName, profile) {
  const chainItems = await getChain(ticker, token);
  const allExps = flattenChain(chainItems);
  const filtered = allExps.filter(e => e.dte >= profile.dteMin && e.dte <= profile.dteMax).slice(0, 4);
  if (!filtered.length) { console.log(`  ${ticker}/${profileName}: no expirations in DTE[${profile.dteMin}-${profile.dteMax}]`); return []; }

  const allSyms = new Set();
  for (const e of filtered) {
    for (const s of e.strikes) {
      if (s['put-streamer-symbol']) allSyms.add(s['put-streamer-symbol']);
      if (s['call-streamer-symbol']) allSyms.add(s['call-streamer-symbol']);
    }
  }

  console.log(`  ${ticker}/${profileName}: ${filtered.length} exps, streaming ${allSyms.size} symbols…`);
  const { quotes, greeks } = await streamData([...allSyms], dxTok, 25000);
  const qCount = Object.keys(quotes).length, gCount = Object.keys(greeks).length;
  console.log(`    quotes=${qCount} greeks=${gCount}`);

  const best = [];
  for (const { expDate, dte, strikes } of filtered) {
    const ics = buildICs(strikes, quotes, greeks, profile, expDate, dte);
    if (ics.length) {
      best.push(ics[0]);
      const ic = ics[0];
      console.log(`    ${expDate}(DTE${dte}): $${ic.credit}cr ${ic.pop}%POP r/r=${ic.rr} score=${ic.score}`);
    }
  }
  return best;
}

// ── Snapshot ────────────────────────────────────────────────────────────────
async function captureSnapshot(token, acct, dxTok) {
  console.log('\n📸 Morning snapshot…');
  const bal = await getBalances(token, acct);
  const netLiq = parseFloat(bal['net-liquidating-value'] || 0);
  console.log(`  Net Liq: $${netLiq.toFixed(2)} | account level: ${dxTok.level}`);

  let vix = null;
  try {
    const { quotes } = await streamData(['$VIX.X'], dxTok, 12000);
    vix = quotes['$VIX.X']?.mid ?? null;
    console.log(`  VIX: ${vix?.toFixed(2) ?? 'N/A'}`);
  } catch(e) { console.warn('  VIX error:', e.message); }

  const snap = { morningNetLiq: netLiq, morningVix: vix, timestamp: new Date().toISOString(), date: TODAY };
  await db.collection('guvid-agent-daily').doc(TODAY).set(snap, { merge: true });
  console.log('  ✅ Snapshot → guvid-agent-daily/' + TODAY);
  return snap;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌅 Guvid Agent — Morning Scan — ${TODAY}\n`);

  const allCreds = await getAllCredentials();
  let token, acct, dxTok;

  for (const creds of allCreds) {
    try {
      token = await getToken(creds);
      const dx = await getDxToken(token);
      if (!dx.wsUrl) throw new Error('No DxLink URL');
      if (dx.level !== 'api') throw new Error(`Demo account (level=${dx.level}), skipping`);
      acct = await getAccountNumber(token);
      dxTok = dx;
      console.log(`✅ Auth: ${creds.label||'?'} | account=${acct} | level=${dx.level}`);
      break;
    } catch(e) { console.warn(`⚠️  ${creds.label||'?'}: ${e.message.slice(0, 80)}`); token = null; }
  }
  if (!token) throw new Error('No real API-level account found');

  const snapshot = await captureSnapshot(token, acct, dxTok);

  console.log('\n📈 Underlying prices…');
  const { quotes: uQ } = await streamData(['SPX', 'QQQ', '$VIX.X'], dxTok, 12000);
  const spxPrice = uQ['SPX']?.mid ?? null, qqqPrice = uQ['QQQ']?.mid ?? null;
  console.log(`  SPX=$${spxPrice?.toFixed(2) ?? 'N/A'} | QQQ=$${qqqPrice?.toFixed(2) ?? 'N/A'}`);

  const scanResults = { SPX: {}, QQQ: {} };
  for (const ticker of ['SPX', 'QQQ']) {
    console.log(`\n🔍 ${ticker}…`);
    for (const [pName, profile] of Object.entries(PROFILES)) {
      try { scanResults[ticker][pName] = await scanTicker(ticker, token, dxTok, pName, profile); }
      catch(e) { console.error(`  ❌ ${ticker}/${pName}: ${e.message}`); scanResults[ticker][pName] = []; }
    }
  }

  // Save
  console.log('\n💾 Saving…');
  await db.collection('guvid-agent-scans').doc(TODAY).set({
    date: TODAY, timestamp: new Date().toISOString(), type: 'morning',
    SPX: scanResults.SPX, QQQ: scanResults.QQQ,
    morningNetLiq: snapshot.morningNetLiq, morningVix: snapshot.morningVix,
  });
  console.log('  ✅ guvid-agent-scans/' + TODAY);

  const savedAt = new Date().toISOString();
  let posCount = 0;
  for (const ticker of ['SPX', 'QQQ']) {
    const price = ticker === 'SPX' ? spxPrice : qqqPrice;
    for (const [pName, ics] of Object.entries(scanResults[ticker])) {
      for (const ic of (ics || [])) {
        await db.collection('guvid-agent-positions').add({
          ticker, profile: pName, savedAt, openDate: TODAY,
          ic: { putBuy: ic.longPutStrike, putSell: ic.shortPutStrike, callSell: ic.shortCallStrike, callBuy: ic.longCallStrike },
          expiration: ic.expirationDate,
          credit: ic.credit, pop: ic.pop, ev: ic.ev, alpha: ic.alpha, rr: ic.rr, wings: ic.wings,
          status: 'open', dailyChecks: [],
          marketContext: { underlyingPrice: price, vix: snapshot.morningVix, ivRank: 0 },
        });
        posCount++;
      }
    }
  }
  console.log(`  ✅ ${posCount} positions saved`);

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log(`  MORNING SCAN — ${TODAY}`);
  console.log('═══════════════════════════════════════════');
  console.log(`  Net Liq : $${snapshot.morningNetLiq?.toFixed(2) ?? 'N/A'}`);
  console.log(`  VIX     : ${snapshot.morningVix?.toFixed(2) ?? 'N/A'}`);
  console.log(`  SPX     : $${spxPrice?.toFixed(2) ?? 'N/A'}`);
  console.log(`  QQQ     : $${qqqPrice?.toFixed(2) ?? 'N/A'}`);
  let totalICs = 0;
  for (const t of ['SPX', 'QQQ']) {
    for (const [pName, ics] of Object.entries(scanResults[t])) {
      if (ics?.length) {
        console.log(`  ${t}/${pName}: ${ics.length} IC(s)`);
        for (const ic of ics)
          console.log(`    DTE${ic.dte} $${ic.credit}cr ${ic.pop}%POP r/r=${ic.rr} | SP${ic.shortPutStrike}/SC${ic.shortCallStrike} exp=${ic.expirationDate}`);
      } else {
        console.log(`  ${t}/${pName}: —`);
      }
      totalICs += ics?.length || 0;
    }
  }
  console.log(`\n  Total ICs: ${totalICs}`);
  console.log('═══════════════════════════════════════════\n');
  return { snapshot, scanResults, totalICs, spxPrice, qqqPrice };
}

main()
  .then(r => { console.log('✅ Done'); process.exit(0); })
  .catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });

/**
 * Guvid Agent — Afternoon Check (~3PM ET)
 * Data sources:
 *   - VIX + underlying prices: Yahoo Finance chart API
 *   - QQQ option quotes: CBOE delayed quotes
 *   - SPX/SPXW option quotes: Black-Scholes approximation
 *   - Positions: guvid-agent-positions Firestore collection
 *   - Net liq: computed from positions + yesterday's baseline
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const NOW_MS = Date.now();

// ── Market data ────────────────────────────────────────────────────────────
async function getPrice(symbol) {
  const enc = encodeURIComponent(symbol);
  const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1m&range=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
}

async function loadCboeChain(ticker) {
  const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker}.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
  });
  if (!res.ok) { console.log(`  CBOE ${ticker}: ${res.status}`); return null; }
  const data = await res.json();
  const chain = {};
  for (const opt of (data.data?.options || [])) {
    chain[opt.option] = opt;
  }
  return { chain, underlyingPrice: data.data?.current_price };
}

// dxFeed symbol → CBOE OCC symbol
// ".QQQ260618P702" → "QQQ260618P00702000"
// ".SPXW260630P7195" → "SPXW260630P07195000"
function dxToCboe(dxSym) {
  if (!dxSym) return null;
  // Strip leading dot
  const s = dxSym.startsWith('.') ? dxSym.slice(1) : dxSym;
  // Parse: ticker + YYMMDD + C/P + strike
  const m = s.match(/^([A-Z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const [, ticker, date, type, strikeStr] = m;
  const strikeInt = Math.round(parseFloat(strikeStr) * 1000);
  const strikeOcc = String(strikeInt).padStart(8, '0');
  return `${ticker}${date}${type.toUpperCase()}${strikeOcc}`;
}

// TastyTrade format → dxFeed (for positions stored in TT format)
// "QQQ   260618P00702000" → ".QQQ260618P702"
function ttToDx(ttSym) {
  if (!ttSym) return null;
  const s = ttSym.replace(/\s+/g, '');
  const m = s.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/i);
  if (!m) return null;
  const [, ticker, date, type, strikeStr] = m;
  const strike = parseInt(strikeStr) / 1000;
  const strikeDisplay = strike % 1 === 0 ? String(Math.round(strike)) : strike.toFixed(3);
  return `.${ticker}${date}${type.toUpperCase()}${strikeDisplay}`;
}

function normalizeDxSym(sym) {
  if (!sym) return null;
  if (sym.includes(' ')) return ttToDx(sym);
  if (!sym.startsWith('.')) return '.' + sym;
  return sym;
}

// ── Black-Scholes ──────────────────────────────────────────────────────────
function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / Math.sqrt(2));
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2));
  return 0.5 * (1 + sign * y);
}

function bsOption(S, K, T, r, sigma, type) {
  if (T <= 0) {
    if (type === 'C') return Math.max(S - K, 0);
    return Math.max(K - S, 0);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'C') return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function getOptionMid(dxSym, cboeChain, spxPrice, qqqPrice, vix) {
  if (!dxSym) return null;
  // Try CBOE first (for QQQ)
  if (cboeChain) {
    const cboeSym = dxToCboe(dxSym);
    if (cboeSym && cboeChain[cboeSym]) {
      const opt = cboeChain[cboeSym];
      if (opt.bid != null && opt.ask != null && opt.bid >= 0 && opt.ask >= 0) {
        return (opt.bid + opt.ask) / 2;
      }
    }
  }
  // Fall back to Black-Scholes
  const s = dxSym.startsWith('.') ? dxSym.slice(1) : dxSym;
  const m = s.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const [, ticker, yy, mm, dd, type, strikeStr] = m;
  const strike = parseFloat(strikeStr);
  const expDate = new Date(`20${yy}-${mm}-${dd}T16:00:00Z`);
  const T = Math.max((expDate.getTime() - NOW_MS) / (365.25 * 24 * 3600 * 1000), 0);
  const isSPX = ticker.startsWith('SPX');
  const underlying = isSPX ? spxPrice : qqqPrice;
  if (!underlying) return null;
  const sigma = vix ? vix / 100 : 0.20;
  const r = 0.053;
  const val = bsOption(underlying, strike, T, r, sigma, type.toUpperCase());
  return Math.max(val, 0.01);
}

// ── Parse IC symbols from position ────────────────────────────────────────
function extractSymbols(pos) {
  const ic = pos.ic;
  if (!ic) return null;

  // Format 1: {shortPutSymbol, longPutSymbol, shortCallSymbol, longCallSymbol}
  if (ic.shortPutSymbol) {
    return {
      sp: normalizeDxSym(ic.shortPutSymbol),
      lp: normalizeDxSym(ic.longPutSymbol),
      sc: normalizeDxSym(ic.shortCallSymbol),
      lc: normalizeDxSym(ic.longCallSymbol),
    };
  }
  // Format 2: {shortPut: {symbol/streamerSymbol}, ...}
  if (ic.shortPut?.symbol || ic.shortPut?.streamerSymbol) {
    return {
      sp: normalizeDxSym(ic.shortPut?.symbol || ic.shortPut?.streamerSymbol),
      lp: normalizeDxSym(ic.longPut?.symbol || ic.longPut?.streamerSymbol),
      sc: normalizeDxSym(ic.shortCall?.symbol || ic.shortCall?.streamerSymbol),
      lc: normalizeDxSym(ic.longCall?.symbol || ic.longCall?.streamerSymbol),
    };
  }
  return null;
}

function getExpiration(pos) {
  const ic = pos.ic;
  return ic?.expirationDate || ic?.expiration || pos.expiration || '';
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Guvid Agent — Afternoon Check (${TODAY} ~15:00 ET) ===`);
  console.log('Note: TastyTrade OAuth expired. Using CBOE (QQQ) + Black-Scholes (SPX) for quotes.\n');

  // Get market data
  console.log('📊 Fetching market data...');
  const [vix, spxPrice, qqqPrice] = await Promise.all([
    getPrice('^VIX'),
    getPrice('^SPX'),
    getPrice('QQQ'),
  ]);
  console.log(`  VIX: ${vix?.toFixed(2) ?? 'N/A'}  SPX: ${spxPrice?.toFixed(2) ?? 'N/A'}  QQQ: ${qqqPrice?.toFixed(2) ?? 'N/A'}`);

  // Load QQQ CBOE option chain
  console.log('  Loading QQQ option chain from CBOE...');
  const qqqChainData = await loadCboeChain('QQQ');
  const qqqChain = qqqChainData?.chain || null;
  console.log(`  QQQ chain: ${qqqChain ? Object.keys(qqqChain).length + ' contracts' : 'unavailable'}`);

  // Read yesterday's daily doc for baseline
  const yestDailyRef = db.doc(`guvid-agent/daily-${YESTERDAY}`);
  const yestDailySnap = await yestDailyRef.get();
  const yestDaily = yestDailySnap.exists ? yestDailySnap.data() : {};
  const yestNetLiq = yestDaily.afternoonNetLiq ?? yestDaily.morningNetLiq ?? null;
  const yestTotalPositionPL = yestDaily.totalPositionPL ?? 0;
  const lastKnownNetLiq = yestNetLiq != null ? yestNetLiq - yestTotalPositionPL : null;
  console.log(`\n  Yesterday afternoon netLiq: ${yestNetLiq != null ? '$' + yestNetLiq.toFixed(2) : 'N/A'}`);
  console.log(`  Yesterday position P&L: ${yestTotalPositionPL >= 0 ? '+' : ''}$${yestTotalPositionPL.toFixed(2)}`);
  console.log(`  Clean baseline (ex-positions): ${lastKnownNetLiq != null ? '$' + lastKnownNetLiq.toFixed(2) : 'N/A'}`);

  // Read today's morning doc
  const todayDailyRef = db.doc(`guvid-agent/daily-${TODAY}`);
  const todayDailySnap = await todayDailyRef.get();
  const todayDaily = todayDailySnap.exists ? todayDailySnap.data() : {};
  const morningNetLiq = todayDaily.morningNetLiq ?? null;

  // Read all open positions from guvid-agent-positions
  console.log('\n📋 Reading open positions from Firestore...');
  const posSnap = await db.collection('guvid-agent-positions')
    .where('status', '==', 'open')
    .get();

  // Filter to active (expiration >= today) positions with symbols
  const activePositions = [];
  const expiredToMark = [];
  for (const doc of posSnap.docs) {
    const pos = doc.data();
    const expiration = getExpiration(pos);
    if (!expiration) continue;
    if (expiration < TODAY) {
      expiredToMark.push(doc);
    } else {
      const syms = extractSymbols(pos);
      if (syms && syms.sp && syms.lp && syms.sc && syms.lc) {
        activePositions.push({ doc, pos, syms, expiration });
      }
    }
  }
  console.log(`  Total open: ${posSnap.docs.length} | Active with symbols: ${activePositions.length} | Stale (expired): ${expiredToMark.length}`);

  // Mark expired positions
  if (expiredToMark.length > 0) {
    console.log(`  Marking ${expiredToMark.length} stale positions as expired...`);
    const batch = db.batch();
    for (const doc of expiredToMark.slice(0, 490)) {
      batch.update(doc.ref, { status: 'expired', expiredDate: TODAY });
    }
    await batch.commit();
  }

  // ── Calculate P&L for each position ──────────────────────────────────────
  console.log('\n💹 Calculating position P&L...');

  const positionChecks = [];
  const profitTargetsReached = [];
  const under21DTEList = [];
  const expiringTodayList = [];
  let totalPositionPL = 0;
  let quotesObtained = 0;

  for (const { doc, pos, syms, expiration } of activePositions) {
    const credit = parseFloat(pos.credit || pos.ic?.credit || 0);
    const profile = pos.profile || 'neutral';
    const ticker = pos.ticker || '';
    const openDate = pos.openDate ? new Date(pos.openDate + 'T12:00:00Z') : null;
    const daysOpen = openDate ? Math.floor((NOW_MS - openDate.getTime()) / 86400000) : null;
    const expDate = new Date(expiration + 'T16:00:00Z');
    const daysRemaining = Math.ceil((expDate.getTime() - NOW_MS) / 86400000);

    // Get option mids
    const spMid = getOptionMid(syms.sp, qqqChain, spxPrice, qqqPrice, vix);
    const lpMid = getOptionMid(syms.lp, qqqChain, spxPrice, qqqPrice, vix);
    const scMid = getOptionMid(syms.sc, qqqChain, spxPrice, qqqPrice, vix);
    const lcMid = getOptionMid(syms.lc, qqqChain, spxPrice, qqqPrice, vix);

    const hasQuotes = spMid != null && lpMid != null && scMid != null && lcMid != null;
    if (hasQuotes) quotesObtained++;

    // Current IC value = cost to close (short - long for each spread)
    const currentValue = hasQuotes
      ? (spMid - lpMid + scMid - lcMid)
      : null;

    const pl = currentValue != null ? (credit - currentValue) * 100 : null;
    const plPerDay = pl != null && daysOpen && daysOpen > 0 ? pl / daysOpen : null;
    const pctCapture = credit > 0 && currentValue != null ? (credit - currentValue) / credit : null;

    if (pl != null) totalPositionPL += pl;

    // Profit target check
    const neutralTarget = vix && vix > 25 ? 0.50 : 0.75;
    const targetByProfile = { conservative: 0.50, neutral: neutralTarget, aggressive: 0.90 };
    const myTarget = targetByProfile[profile] ?? 0.75;
    const profitTargetReached = pctCapture != null ? pctCapture >= myTarget : false;
    const under21DTE = daysRemaining <= 21;
    const expiringToday = daysRemaining <= 0;

    const checkEntry = {
      ticker, profile, expiration, credit,
      shortPut: syms.sp, longPut: syms.lp, shortCall: syms.sc, longCall: syms.lc,
      spMid: spMid?.toFixed(4) ?? null, lpMid: lpMid?.toFixed(4) ?? null,
      scMid: scMid?.toFixed(4) ?? null, lcMid: lcMid?.toFixed(4) ?? null,
      currentValue: currentValue != null ? parseFloat(currentValue.toFixed(4)) : null,
      pl: pl != null ? parseFloat(pl.toFixed(2)) : null,
      plPerDay: plPerDay != null ? parseFloat(plPerDay.toFixed(2)) : null,
      pctCapture: pctCapture != null ? parseFloat((pctCapture * 100).toFixed(1)) : null,
      daysOpen, daysRemaining, profitTargetReached, under21DTE,
      quotesAvailable: hasQuotes,
      session: 'afternoon', date: TODAY,
    };

    positionChecks.push({ id: doc.id, ...checkEntry });

    if (profitTargetReached) profitTargetsReached.push({ id: doc.id, ticker, expiration, pl: pl?.toFixed(2), pctCapture: pctCapture != null ? (pctCapture * 100).toFixed(1) : null, target: profile.toUpperCase() + '(' + Math.round(myTarget * 100) + '%)' });
    if (under21DTE) under21DTEList.push({ id: doc.id, ticker, expiration, daysRemaining, credit: credit.toFixed(2), pl: pl?.toFixed(2) ?? 'N/A' });
    if (expiringToday) expiringTodayList.push({ id: doc.id, ticker, expiration, credit: credit.toFixed(2), pl: pl?.toFixed(2) ?? 'N/A' });

    // Update position doc with daily check entry
    await doc.ref.update({
      dailyChecks: admin.firestore.FieldValue.arrayUnion({
        date: TODAY, session: 'afternoon',
        currentValue: currentValue != null ? parseFloat(currentValue.toFixed(4)) : null,
        pl: pl != null ? parseFloat(pl.toFixed(2)) : null,
        pctCapture: pctCapture != null ? parseFloat((pctCapture * 100).toFixed(1)) : null,
        profitTargetReached, under21DTE, daysRemaining, quotesAvailable: hasQuotes,
      }),
      lastChecked: TODAY,
      ...(currentValue != null ? { currentValue: parseFloat(currentValue.toFixed(4)) } : {}),
      ...(pl != null ? { currentPL: parseFloat(pl.toFixed(2)) } : {}),
    });
  }

  console.log(`  Positions with quotes: ${quotesObtained}/${activePositions.length}`);
  console.log(`  Total position P&L: ${totalPositionPL >= 0 ? '+' : ''}$${totalPositionPL.toFixed(2)}`);

  // ── Compute afternoon net liq ─────────────────────────────────────────────
  const afternoonNetLiq = lastKnownNetLiq != null ? lastKnownNetLiq + totalPositionPL : null;
  const netLiqChange = morningNetLiq != null && afternoonNetLiq != null ? afternoonNetLiq - morningNetLiq : null;

  // Read yesterday's daily-YYYY-MM-DD doc for day-over-day
  const prevDaySnap = await db.doc(`guvid-agent/daily-${YESTERDAY}`).get();
  const prevDayAfternoon = prevDaySnap.exists ? prevDaySnap.data()?.afternoonNetLiq : null;
  const netLiqChangeDayOverDay = afternoonNetLiq != null && prevDayAfternoon != null ? afternoonNetLiq - prevDayAfternoon : null;

  // ── Save daily doc ────────────────────────────────────────────────────────
  console.log('\n💾 Saving to Firestore...');
  await todayDailyRef.set({
    afternoonNetLiq,
    afternoonVix: vix,
    afternoonTimestamp: new Date().toISOString(),
    netLiqSource: 'computed_from_positions',
    totalPositionPL: parseFloat(totalPositionPL.toFixed(2)),
    lastKnownNetLiq,
    spxPrice,
    qqqPrice,
    ...(netLiqChange != null ? { netLiqChange } : {}),
    ...(netLiqChangeDayOverDay != null ? { netLiqChangeDayOverDay } : {}),
  }, { merge: true });

  // ── Save afternoon scan ───────────────────────────────────────────────────
  await db.doc(`guvid-agent/scans-${TODAY}`).set({
    afternoon: {
      timestamp: new Date().toISOString(),
      netLiq: afternoonNetLiq,
      netLiqChange: netLiqChange ?? null,
      netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
      netLiqSource: 'computed_from_positions',
      vix,
      spxPrice,
      qqqPrice,
      positionsChecked: activePositions.length,
      quotesObtained,
      totalPositionPL: parseFloat(totalPositionPL.toFixed(2)),
      profitTargetsReached,
      under21DTE: under21DTEList,
      expiringToday: expiringTodayList,
      checks: positionChecks,
    },
  }, { merge: true });
  console.log('  Saved daily + scan docs');

  // ── Print summary ─────────────────────────────────────────────────────────
  const divider = '═'.repeat(56);
  console.log('\n' + divider);
  console.log('  AFTERNOON SUMMARY — ' + TODAY);
  console.log(divider);

  console.log(`Net Liq:  ${afternoonNetLiq != null ? '$' + afternoonNetLiq.toFixed(2) : 'N/A'}`);
  if (netLiqChange != null) console.log(`  vs. morning:   ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)}`);
  if (netLiqChangeDayOverDay != null) console.log(`  vs. yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}`);
  console.log(`VIX: ${vix?.toFixed(2) ?? 'N/A'}  SPX: ${spxPrice?.toFixed(2) ?? 'N/A'}  QQQ: ${qqqPrice?.toFixed(2) ?? 'N/A'}`);
  console.log(`Positions checked: ${activePositions.length} (${quotesObtained} with live quotes)`);
  console.log(`Total position P&L: ${totalPositionPL >= 0 ? '+' : ''}$${totalPositionPL.toFixed(2)}`);

  if (expiringTodayList.length > 0) {
    console.log(`\n🔴 EXPIRING TODAY (${expiringTodayList.length}):`);
    for (const p of expiringTodayList)
      console.log(`  • ${p.ticker} ${p.expiration} credit $${p.credit} | P&L: ${p.pl ? (parseFloat(p.pl) >= 0 ? '+' : '') + '$' + p.pl : 'N/A'}`);
  }

  if (profitTargetsReached.length > 0) {
    console.log(`\n✅ Profit targets reached (${profitTargetsReached.length}):`);
    for (const p of profitTargetsReached)
      console.log(`  • ${p.ticker} ${p.expiration} [${p.target}] ${p.pctCapture}% captured | P&L: ${p.pl ? (parseFloat(p.pl) >= 0 ? '+' : '') + '$' + p.pl : 'N/A'}`);
  } else {
    console.log('\nProfit targets reached: none');
  }

  if (under21DTEList.length > 0) {
    console.log(`\n⚠️  Under 21 DTE — need management (${under21DTEList.length}):`);
    // Group by expiration for readability
    const byExp = {};
    for (const p of under21DTEList) {
      const key = `${p.ticker} ${p.expiration} (${p.daysRemaining}d)`;
      if (!byExp[key]) byExp[key] = { count: 0, totalPL: 0 };
      byExp[key].count++;
      byExp[key].totalPL += parseFloat(p.pl || 0);
    }
    for (const [key, val] of Object.entries(byExp))
      console.log(`  • ${key} × ${val.count} positions | P&L: ${val.totalPL >= 0 ? '+' : ''}$${val.totalPL.toFixed(0)}`);
  } else {
    console.log('Under 21 DTE: none');
  }

  console.log('\nDone ✓');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('\nFatal:', e.message); process.exit(1); });

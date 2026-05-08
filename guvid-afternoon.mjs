import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const TastyTradeClient = require('@tastytrade/api').default;
const { MarketDataSubscriptionType } = require('@tastytrade/api');

// ─── Firebase Init ────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TODAY = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function daysRemaining(dateStr) {
  const exp = new Date(dateStr + 'T20:00:00Z');
  return Math.round((exp - Date.now()) / 86400000);
}

// ─── Extract IC symbols from position (handles all schema variants) ───────────
function extractICSymbols(pos) {
  const ic = pos.ic || {};
  const ticker = pos.ticker || '';
  // For SPX options, prefer SPXW (weekly) format in dxFeed
  const dxTicker = ticker === 'SPX' ? 'SPXW' : ticker;

  const legSym = (leg, strike, type, exp) => {
    const stored = leg?.streamerSymbol || leg?.sym || leg?.symbol || null;
    if (stored) return stored;
    // Build from strike + expiration if available
    const s = strike || leg?.strike;
    const e = exp || ic.expiration;
    if (s && e) return buildDxSym(dxTicker, e, type, s);
    return null;
  };

  // Variant A: shortPut / longPut / shortCall / longCall
  if (ic.shortPut || ic.longPut || ic.shortCall || ic.longCall) {
    const exp = parseExpFromSym(ic.shortPut?.streamerSymbol) || ic.shortPut?.sym || ic.expiration;
    return {
      stoP: legSym(ic.shortPut, ic.shortPut?.strike, 'P', exp),
      btoP: legSym(ic.longPut, ic.longPut?.strike, 'P', exp),
      stoC: legSym(ic.shortCall, ic.shortCall?.strike, 'C', exp),
      btoC: legSym(ic.longCall, ic.longCall?.strike, 'C', exp),
      expiration: exp,
    };
  }
  // Variant B: stoP / btoP / stoC / btoC (with sym field)
  if (ic.stoP || ic.btoP || ic.stoC || ic.btoC) {
    return {
      stoP: legSym(ic.stoP, ic.stoP?.strike, 'P', ic.expiration),
      btoP: legSym(ic.btoP, ic.btoP?.strike, 'P', ic.expiration),
      stoC: legSym(ic.stoC, ic.stoC?.strike, 'C', ic.expiration),
      btoC: legSym(ic.btoC, ic.btoC?.strike, 'C', ic.expiration),
      expiration: ic.expiration,
    };
  }
  // Variant C: stoPut / btoPut / stoCall / btoCall (objects with symbol/strike field)
  if (ic.stoPut || ic.btoPut || ic.stoCall || ic.btoCall) {
    return {
      stoP: legSym(ic.stoPut, ic.stoPut?.strike, 'P', ic.expiration),
      btoP: legSym(ic.btoPut, ic.btoPut?.strike, 'P', ic.expiration),
      stoC: legSym(ic.stoCall, ic.stoCall?.strike, 'C', ic.expiration),
      btoC: legSym(ic.btoCall, ic.btoCall?.strike, 'C', ic.expiration),
      expiration: ic.expiration,
    };
  }
  // Variant D: flat strike fields
  if (ic.stoPutStrike && ic.stoCallStrike && ic.btoPutStrike && ic.btoCallStrike && ic.expiration) {
    return {
      stoP: buildDxSym(dxTicker, ic.expiration, 'P', ic.stoPutStrike),
      btoP: buildDxSym(dxTicker, ic.expiration, 'P', ic.btoPutStrike),
      stoC: buildDxSym(dxTicker, ic.expiration, 'C', ic.stoCallStrike),
      btoC: buildDxSym(dxTicker, ic.expiration, 'C', ic.btoCallStrike),
      expiration: ic.expiration,
    };
  }
  return null;
}

function parseExpFromSym(sym) {
  if (!sym) return null;
  const m = sym.match(/[A-Z](\d{2})(\d{2})(\d{2})[CP]/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

function buildDxSym(ticker, dateStr, type, strike) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `.${ticker}${yy}${mm}${dd}${type}${Math.round(parseFloat(strike))}`;
}

// ─── Stream using SDK's quoteStreamer ─────────────────────────────────────────
async function streamData(client, symbols, waitMs = 12000) {
  const quotes = {};
  const greeks = {};
  let vixPrice = null;

  const listener = (records) => {
    for (const r of records) {
      if (r.eventType === 'Quote') {
        const bid = parseFloat(r.bidPrice);
        const ask = parseFloat(r.askPrice);
        if (!isNaN(bid) && !isNaN(ask)) {
          quotes[r.eventSymbol] = { bid, ask, mid: (bid + ask) / 2 };
        }
      } else if (r.eventType === 'Greeks') {
        greeks[r.eventSymbol] = {
          delta: parseFloat(r.delta), theta: parseFloat(r.theta),
          gamma: parseFloat(r.gamma), vega: parseFloat(r.vega),
          price: parseFloat(r.price),
        };
      } else if (r.eventType === 'Trade' && r.eventSymbol === 'VIX') {
        const p = parseFloat(r.price);
        if (!isNaN(p) && p > 0) vixPrice = p;
      }
    }
  };

  client.quoteStreamer.addEventListener(listener);
  await client.quoteStreamer.connect();

  if (symbols.length > 0) {
    client.quoteStreamer.subscribe(symbols, [MarketDataSubscriptionType.Quote, MarketDataSubscriptionType.Greeks]);
  }
  // VIX via Trade event
  client.quoteStreamer.subscribe(['VIX'], [MarketDataSubscriptionType.Trade]);

  await sleep(waitMs);
  client.quoteStreamer.disconnect();

  return { quotes, greeks, vixPrice };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== GUVID AGENT — Afternoon Check (${TODAY} ~15:00 ET) ===\n`);

  // Get credentials
  const usersSnap = await db.collection('users').get();
  let creds;
  for (const u of usersSnap.docs) {
    const bSnap = await db.collection('users').doc(u.id).collection('brokerAccounts').get();
    for (const b of bSnap.docs) {
      const d = b.data();
      if (d.credentials?.clientSecret && d.credentials?.refreshToken) {
        creds = { clientSecret: d.credentials.clientSecret, refreshToken: d.credentials.refreshToken };
        console.log(`Credentials: user ${u.id}`);
        break;
      }
    }
    if (creds) break;
  }
  if (!creds) throw new Error('No TastyTrade credentials in Firestore');

  const client = new TastyTradeClient({
    ...TastyTradeClient.ProdConfig,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
    oauthScopes: ['read', 'trade'],
  });
  await client.httpClient.generateAccessToken();
  console.log('OAuth token obtained');

  // Find active account with positive net liq
  const allAccounts = await client.accountsAndCustomersService.getCustomerAccounts();
  const acctList = Array.isArray(allAccounts) ? allAccounts : (allAccounts.items || []);
  console.log(`Accounts: ${acctList.map(a => a.account?.['account-number'] + (a.account?.['is-closed'] ? '(closed)' : '')).join(', ')}`);
  const openAccts = acctList.filter(a => !a.account?.['is-closed']);
  let accountNumber = null;
  let balData = null;
  for (const acct of openAccts) {
    const num = acct.account?.['account-number'];
    if (!num) continue;
    try {
      const b = await client.balancesAndPositionsService.getAccountBalanceValues(num);
      const nlv = parseFloat(b['net-liquidating-value']);
      console.log(`  ${num}: net-liq=$${nlv.toFixed(2)}`);
      if (nlv >= 0) { // accept 0 too in case of margin account
        accountNumber = num;
        balData = b;
        break;
      }
    } catch (e) {
      console.log(`  ${num}: error - ${e.message}`);
    }
  }
  if (!accountNumber) throw new Error('No active account found');
  console.log(`Account: ${accountNumber}`);

  const netLiq = parseFloat(balData['net-liquidating-value']);
  const buyingPower = parseFloat(balData['derivative-buying-power']);
  console.log(`Net Liq: $${netLiq.toFixed(2)} | Buying Power: $${buyingPower.toFixed(2)}`);

  // Read today's morning doc & yesterday's
  const todayDocRef = db.collection('guvid-agent-daily').doc(TODAY);
  const todayDoc = await todayDocRef.get();
  const todayData = todayDoc.exists ? todayDoc.data() : {};
  const morningNetLiq = todayData.morningNetLiq || null;
  const netLiqChange = morningNetLiq ? netLiq - morningNetLiq : null;

  const ydDoc = await db.collection('guvid-agent-daily').doc(yesterday).get();
  const ydNetLiq = ydDoc.exists ? (ydDoc.data().afternoonNetLiq || ydDoc.data().morningNetLiq || null) : null;
  const netLiqChangeDayOverDay = ydNetLiq ? netLiq - ydNetLiq : null;

  // Load open positions
  console.log('\nLoading open positions...');
  const posSnap = await db.collection('guvid-agent-positions').where('status', '==', 'open').get();
  const allPositions = [];
  posSnap.forEach(d => allPositions.push({ id: d.id, ref: d.ref, ...d.data() }));
  console.log(`Found ${allPositions.length} open positions`);

  // Gather all symbols
  const posSymMap = {};
  const allSymbols = new Set();
  for (const pos of allPositions) {
    const syms = extractICSymbols(pos);
    if (syms) {
      posSymMap[pos.id] = syms;
      [syms.stoP, syms.btoP, syms.stoC, syms.btoC].forEach(s => { if (s) allSymbols.add(s); });
    }
  }

  // Stream all at once
  const symList = [...allSymbols].filter(Boolean);
  console.log(`\nStreaming ${symList.length} symbols + VIX (12s)...`);
  const { quotes, greeks, vixPrice } = await streamData(client, symList, 12000);

  const vix = vixPrice;
  console.log(`VIX: ${vix !== null ? vix.toFixed(2) : 'N/A'} | Quotes received: ${Object.keys(quotes).length} | Greeks: ${Object.keys(greeks).length}`);

  const isVixEvent = vix !== null && vix > 30;

  // Save afternoon snapshot
  const afternoonSnap = {
    afternoonNetLiq: netLiq,
    afternoonVix: vix,
    afternoonTimestamp: new Date().toISOString(),
    netLiqChange: netLiqChange ?? null,
    netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null,
  };
  await todayDocRef.set(afternoonSnap, { merge: true });
  // Mirror to subcollection path
  await db.collection('guvid-agent').doc('daily').collection(TODAY).doc('snapshot').set(afternoonSnap, { merge: true });
  console.log(`Saved net liq → guvid-agent-daily/${TODAY}`);

  // Process positions
  const checks = [];
  const profitTargetsReached = [];
  const under21DTEList = [];

  for (const pos of allPositions) {
    const ticker = pos.ticker || pos.id;
    const profile = pos.profile || '';
    const credit = parseFloat(pos.credit || pos.ic?.credit || 0);
    const contracts = pos.contracts || 1;
    const syms = posSymMap[pos.id];
    const expDate = syms?.expiration || pos.expirationDate || pos.ic?.expiration;
    const dte = expDate ? daysRemaining(expDate) : null;

    console.log(`\n${ticker} ${profile} | exp: ${expDate || '?'} | DTE: ${dte ?? '?'} | credit: $${credit.toFixed(2)}`);

    if (dte !== null && dte < 0) {
      console.log(`  → EXPIRED`);
      const finalPL = credit * 100 * contracts;
      await pos.ref.update({ status: 'expired', finalPL, expiredAt: new Date().toISOString() });
      checks.push({ ticker, profile, status: 'expired', finalPL });
      continue;
    }

    if (!syms) {
      checks.push({ ticker, profile, error: 'No symbols', daysRemaining: dte });
      continue;
    }

    const stoPQ = quotes[syms.stoP];
    const btoPQ = quotes[syms.btoP];
    const stoCQ = quotes[syms.stoC];
    const btoCQ = quotes[syms.btoC];
    const gotAll = stoPQ?.mid != null && btoPQ?.mid != null && stoCQ?.mid != null && btoCQ?.mid != null;

    if (!gotAll) {
      console.log(`  Missing quotes: stoP=${stoPQ?.mid} btoP=${btoPQ?.mid} stoC=${stoCQ?.mid} btoC=${btoCQ?.mid}`);
      checks.push({ ticker, profile, error: 'No quote data', daysRemaining: dte });
      continue;
    }

    const currentValue = (stoPQ.mid + stoCQ.mid) - (btoPQ.mid + btoCQ.mid);
    const pl = (credit - currentValue) * 100 * contracts;
    const profitPct = credit > 0 ? (credit - currentValue) / credit : 0;

    const openDate = pos.openDate ? new Date(pos.openDate) : null;
    const daysOpen = openDate ? Math.max(1, Math.round((Date.now() - openDate.getTime()) / 86400000)) : null;
    const plPerDay = daysOpen ? pl / daysOpen : null;

    const targetPct = isVixEvent ? 0.50 : 0.75;
    const profitTargetReached = profitPct >= targetPct;
    const isUnder21 = dte !== null && dte <= 21;

    console.log(`  stoP=$${stoPQ.mid.toFixed(2)} btoP=$${btoPQ.mid.toFixed(2)} stoC=$${stoCQ.mid.toFixed(2)} btoC=$${btoCQ.mid.toFixed(2)}`);
    console.log(`  Current: $${currentValue.toFixed(2)} | P&L: $${pl.toFixed(2)} (${(profitPct * 100).toFixed(1)}%)${profitTargetReached ? ' ✅ TARGET!' : ''}`);

    if (profitTargetReached) profitTargetsReached.push({ ticker, profile, pl: pl.toFixed(2), profitPct: `${(profitPct * 100).toFixed(1)}%` });
    if (isUnder21) {
      console.log(`  ⚠ Under 21 DTE`);
      under21DTEList.push({ ticker, profile, daysRemaining: dte });
      await pos.ref.update({ under21DTE: true, daysRemaining: dte });
    }

    const checkEntry = { date: new Date().toISOString(), currentValue, pl, plPerDay: plPerDay ?? null, profitPct, profitTargetReached, under21DTE: isUnder21, daysRemaining: dte };
    const existing = Array.isArray(pos.dailyChecks) ? [...pos.dailyChecks] : [];
    existing.push(checkEntry);
    await pos.ref.update({ dailyChecks: existing });

    checks.push({ ticker, profile, credit: credit.toFixed(2), currentValue: currentValue.toFixed(2), pl: pl.toFixed(2), plPerDay: plPerDay?.toFixed(2) ?? null, daysOpen, profitTargetReached, under21DTE: isUnder21, daysRemaining: dte });
  }

  // Save scan summary
  await db.collection('guvid-agent-scans').doc(TODAY).set({
    afternoon: {
      timestamp: new Date().toISOString(), netLiq, netLiqChange: netLiqChange ?? null,
      netLiqChangeDayOverDay: netLiqChangeDayOverDay ?? null, vix,
      positionsChecked: allPositions.length, profitTargetsReached, under21DTE: under21DTEList, checks,
    },
  }, { merge: true });
  console.log(`\nSaved scan → guvid-agent-scans/${TODAY}`);

  // ─── Print Summary ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log('GUVID AGENT — AFTERNOON SUMMARY');
  console.log('═'.repeat(64));
  const changeStr = netLiqChange !== null ? ` | Δ morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)}` : '';
  const dowStr = netLiqChangeDayOverDay !== null ? ` | Δ yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}` : '';
  console.log(`Net Liq:  $${netLiq.toFixed(2)}${changeStr}${dowStr}`);
  console.log(`VIX:      ${vix !== null ? vix.toFixed(2) : 'N/A'}${isVixEvent ? ' ⚠ HIGH VIX — 50% profit target' : ''}`);
  console.log(`Positions checked: ${allPositions.length}`);

  if (profitTargetsReached.length > 0) {
    console.log('\n✅ PROFIT TARGETS REACHED:');
    profitTargetsReached.forEach(p => console.log(`  • ${p.ticker} ${p.profile} — ${p.profitPct} profit | P&L: $${p.pl}`));
  } else {
    console.log('\nNo profit targets reached.');
  }

  if (under21DTEList.length > 0) {
    console.log('\n⚠ UNDER 21 DTE (NEED MANAGEMENT):');
    under21DTEList.forEach(p => console.log(`  • ${p.ticker} ${p.profile} — ${p.daysRemaining} days remaining`));
  } else {
    console.log('No positions under 21 DTE.');
  }

  if (checks.length > 0) {
    console.log('\nPosition Detail:');
    checks.forEach(c => {
      if (c.status === 'expired') {
        console.log(`  ${c.ticker} ${c.profile}: EXPIRED | Final P&L: $${(c.finalPL ?? 0).toFixed(2)}`);
      } else if (c.error) {
        console.log(`  ${c.ticker} ${c.profile}: ERROR — ${c.error} | DTE: ${c.daysRemaining}`);
      } else {
        const flag = c.profitTargetReached ? ' ✅' : c.under21DTE ? ' ⚠' : '';
        console.log(`  ${c.ticker} ${c.profile}: credit=$${c.credit} curr=$${c.currentValue} P&L=$${c.pl} DTE=${c.daysRemaining}${flag}`);
      }
    });
  }

  console.log('\n' + '═'.repeat(64));
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import TastytradeClient from '@tastytrade/api';
import WebSocket from 'ws';

// ── Firebase init ─────────────────────────────────────────────────────────────
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function calcDaysToExpiry(expStr) {
  if (!expStr) return null;
  const exp = new Date(expStr + 'T16:00:00-05:00');
  return Math.ceil((exp - Date.now()) / 86400000);
}

// Build dxFeed streamer symbol from parts
function makeStreamerSymbol(ticker, expiration, side, strike) {
  const yy = expiration.slice(2, 4);
  const mm = expiration.slice(5, 7);
  const dd = expiration.slice(8, 10);
  const root = ticker === 'SPX' ? 'SPXW' : ticker;
  const strikeInt = Math.round(parseFloat(strike));
  return `.${root}${yy}${mm}${dd}${side}${strikeInt}`;
}

// Extract 4 legs {sym, side} from a position's ic object
function extractLegs(pos) {
  const { ic, expiration, ticker } = pos;
  if (!ic) return [];

  // Normalize leg to {sym, side}
  const legSym = (leg, fallbackSide, fallbackStrike) => {
    const sym = leg?.streamerSymbol || leg?.symbol || leg?.['streamer-symbol'];
    if (sym) return sym;
    if (expiration && fallbackStrike) {
      return makeStreamerSymbol(ticker, expiration, fallbackSide, fallbackStrike);
    }
    return null;
  };

  // SPX/SPXW format: shortPut / longPut / shortCall / longCall
  if (ic.shortPut) {
    return [
      { sym: legSym(ic.shortPut, 'P', ic.shortPut?.strike), side: 'short' },
      { sym: legSym(ic.longPut, 'P', ic.longPut?.strike), side: 'long' },
      { sym: legSym(ic.shortCall, 'C', ic.shortCall?.strike), side: 'short' },
      { sym: legSym(ic.longCall, 'C', ic.longCall?.strike), side: 'long' },
    ].filter(l => l.sym);
  }

  // QQQ format: stoPut / stoCall / btoPut / btoCall
  if (ic.stoPut) {
    return [
      { sym: legSym(ic.stoPut, 'P', ic.stoPut?.strike), side: 'short' },
      { sym: legSym(ic.btoPut, 'P', ic.btoPut?.strike), side: 'long' },
      { sym: legSym(ic.stoCall, 'C', ic.stoCall?.strike), side: 'short' },
      { sym: legSym(ic.btoCall, 'C', ic.btoCall?.strike), side: 'long' },
    ].filter(l => l.sym);
  }

  return [];
}

function icDescription(pos) {
  const { ic, ticker, expiration } = pos;
  if (!ic) return '';
  if (ic.shortPut) {
    return `${ticker} ${expiration} ${ic.shortPut.strike}/${ic.shortCall.strike}`;
  }
  if (ic.stoPut) {
    return `${ticker} ${expiration} ${ic.stoPut.strike}/${ic.stoCall.strike}`;
  }
  return ticker;
}

// ── Step 3: Read TastyTrade creds ─────────────────────────────────────────────
console.log('Reading TastyTrade credentials from Firestore...');
const usersSnap = await db.collection('users').limit(10).get();
let credentials = null;

for (const userDoc of usersSnap.docs) {
  const brokerSnap = await db.collection('users').doc(userDoc.id)
    .collection('brokerAccounts').limit(5).get();
  for (const brokerDoc of brokerSnap.docs) {
    const data = brokerDoc.data();
    if (data.credentials?.clientSecret && data.credentials?.refreshToken) {
      credentials = data.credentials;
      console.log(`Found credentials for user: ${userDoc.id}`);
      break;
    }
  }
  if (credentials) break;
}

if (!credentials) { console.error('No credentials found'); process.exit(1); }

// ── Step 3b: Authenticate ────────────────────────────────────────────────────
console.log('Authenticating with TastyTrade...');
const client = new TastytradeClient({
  ...TastytradeClient.ProdConfig,
  clientSecret: credentials.clientSecret,
  refreshToken: credentials.refreshToken,
  oauthScopes: ['read', 'trade'],
});
await client.httpClient.generateAccessToken();
console.log('Access token generated');

const accountsResp = await client.accountsAndCustomersService.getCustomerAccounts();
const accountItems = Array.isArray(accountsResp) ? accountsResp : (accountsResp?.data?.items || []);
const account = accountItems[0]?.account || accountItems[0];
if (!account) { console.error('No accounts found'); process.exit(1); }
const accountNumber = account['account-number'] || account.accountNumber;
console.log(`Account: ${accountNumber}`);

// ── Step 4: Balances ─────────────────────────────────────────────────────────
const balances = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
const afternoonNetLiq = parseFloat(balances?.['net-liquidating-value'] ?? 0);
console.log(`Afternoon Net Liq: $${afternoonNetLiq.toFixed(2)}`);

// ── Get DxFeed token ─────────────────────────────────────────────────────────
const tokenResp = await client.accountsAndCustomersService.getApiQuoteToken();
const streamerToken = tokenResp?.data?.token || tokenResp?.token;
const streamerUrl = tokenResp?.data?.['dxlink-url'] || tokenResp?.['dxlink-url']
  || 'wss://tasty-openapi-ws.dxfeed.com/realtime';
console.log(`Streamer: ${streamerUrl}`);

// ── Batch stream quotes ───────────────────────────────────────────────────────
async function streamQuotes(symbols, waitMs = 12000) {
  if (symbols.length === 0) return {};
  const unique = [...new Set(symbols)];
  return new Promise((resolve) => {
    const ws = new WebSocket(streamerUrl);
    const collected = {};
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch {}
      resolve(collected);
    };

    const hardStop = setTimeout(finish, waitMs + 8000);

    ws.on('error', (e) => { console.error('WS error:', e.message); clearTimeout(hardStop); resolve(collected); });

    ws.on('open', () => ws.send(JSON.stringify({
      type: 'SETUP', channel: 0, version: '0.1',
      keepaliveTimeout: 60, acceptKeepaliveTimeout: 60
    })));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'SETUP') {
        ws.send(JSON.stringify({ type: 'AUTH', channel: 0, token: streamerToken }));

      } else if (msg.type === 'AUTH_STATE' && msg.state === 'AUTHORIZED') {
        ws.send(JSON.stringify({
          type: 'CHANNEL_REQUEST', channel: 1,
          service: 'FEED', parameters: { contract: 'AUTO' }
        }));

      } else if (msg.type === 'CHANNEL_OPENED' && msg.channel === 1) {
        ws.send(JSON.stringify({
          type: 'FEED_SETUP', channel: 1,
          acceptAggregationPeriod: 0, acceptDataFormat: 'COMPACT',
          acceptEventFields: { 'Quote': ['eventType', 'eventSymbol', 'bidPrice', 'askPrice'] }
        }));
        ws.send(JSON.stringify({
          type: 'FEED_SUBSCRIPTION', channel: 1, reset: true,
          add: unique.map(s => ({ type: 'Quote', symbol: s }))
        }));
        setTimeout(() => { clearTimeout(hardStop); finish(); }, waitMs);

      } else if (msg.type === 'FEED_DATA' && msg.channel === 1) {
        const data = msg.data;
        if (!Array.isArray(data)) return;
        for (const item of data) {
          if (Array.isArray(item) && item[0] === 'Quote' && typeof item[1] === 'string') {
            const bid = parseFloat(item[2]);
            const ask = parseFloat(item[3]);
            if (!isNaN(bid) && !isNaN(ask)) collected[item[1]] = { bid, ask, mid: (bid + ask) / 2 };
          } else if (item && typeof item === 'object' && item.eventType === 'Quote' && item.eventSymbol) {
            const bid = parseFloat(item.bidPrice);
            const ask = parseFloat(item.askPrice);
            if (!isNaN(bid) && !isNaN(ask)) collected[item.eventSymbol] = { bid, ask, mid: (bid + ask) / 2 };
          }
        }
      }
    });
  });
}

// ── VIX quote ────────────────────────────────────────────────────────────────
console.log('Fetching VIX quote (12s)...');
const vixQuotes = await streamQuotes(['VIX'], 12000);
const vixPrice = vixQuotes['VIX']?.mid ?? null;
console.log(`VIX: ${vixPrice !== null ? vixPrice.toFixed(2) : 'N/A'}`);

// ── Save afternoon daily snapshot ────────────────────────────────────────────
const morningDoc = await db.collection('guvid-agent-daily').doc(today).get();
const morningNetLiq = morningDoc.exists ? (morningDoc.data()?.morningNetLiq ?? null) : null;
const netLiqChange = morningNetLiq !== null ? afternoonNetLiq - morningNetLiq : null;

const yestDoc = await db.collection('guvid-agent-daily').doc(yesterday).get();
const yesterdayNetLiq = yestDoc.exists ? (yestDoc.data()?.afternoonNetLiq ?? null) : null;
const netLiqChangeDayOverDay = yesterdayNetLiq !== null ? afternoonNetLiq - yesterdayNetLiq : null;

const afternoonTimestamp = new Date().toISOString();

await db.collection('guvid-agent-daily').doc(today).set({
  afternoonNetLiq,
  afternoonVix: vixPrice,
  netLiqChange: netLiqChange !== null ? parseFloat(netLiqChange.toFixed(2)) : null,
  netLiqChangeDayOverDay: netLiqChangeDayOverDay !== null ? parseFloat(netLiqChangeDayOverDay.toFixed(2)) : null,
  afternoonTimestamp,
}, { merge: true });

// Also write to legacy path guvid-agent/daily/{date}/snapshot
await db.collection('guvid-agent').doc('daily')
  .collection(today).doc('snapshot').set({
    afternoonNetLiq,
    afternoonVix: vixPrice,
    netLiqChange: netLiqChange !== null ? parseFloat(netLiqChange.toFixed(2)) : null,
    afternoonTimestamp,
  }, { merge: true });

console.log('Afternoon snapshot saved');

// ── Step 5: Check open positions ──────────────────────────────────────────────
console.log('\nLoading open positions...');
const posSnap = await db.collection('guvid-agent-positions')
  .where('status', '==', 'open').get();
const positionDocs = posSnap.docs;
console.log(`Found ${positionDocs.length} open positions`);

// Collect all streamer symbols for batch streaming
const allSymbols = [];
for (const posDoc of positionDocs) {
  const legs = extractLegs(posDoc.data());
  legs.forEach(l => { if (l.sym) allSymbols.push(l.sym); });
}
const uniqueSymbols = [...new Set(allSymbols)];
console.log(`Streaming ${uniqueSymbols.length} unique option symbols (12s wait)...`);
const quotes = await streamQuotes(uniqueSymbols, 12000);
console.log(`Received quotes for ${Object.keys(quotes).length} symbols`);

const profitTargetsReached = [];
const under21DTEList = [];
const positionChecks = [];

for (const posDoc of positionDocs) {
  const pos = posDoc.data();
  const ticker = pos.ticker || 'UNKNOWN';
  const expiration = pos.expiration || pos.expirationDate || null;
  const credit = parseFloat(pos.credit || pos.ic?.credit || 0);
  const openDate = pos.openDate || pos.createdAt || null;
  const profile = pos.profile || 'Neutral';
  const ic = icDescription(pos);
  const contracts = parseFloat(pos.contracts || pos.quantity || 1);

  const daysRemaining = calcDaysToExpiry(expiration);
  const daysOpen = openDate
    ? Math.ceil((Date.now() - new Date(openDate).getTime()) / 86400000)
    : null;

  // Skip/mark expired
  if (daysRemaining !== null && daysRemaining < 0) {
    await posDoc.ref.update({ status: 'expired', expiredAt: new Date().toISOString() });
    positionChecks.push({ ticker, profile, ic, credit, status: 'expired', daysRemaining });
    console.log(`${ticker} ${expiration}: EXPIRED`);
    continue;
  }

  // Calculate current IC value from quotes
  const legs = extractLegs(pos);
  let currentValue = null;
  let pl = null;
  let plPerDay = null;

  if (legs.length === 4) {
    let costToClose = 0;
    let allFound = true;
    for (const leg of legs) {
      const q = quotes[leg.sym];
      if (!q) { allFound = false; break; }
      // Short legs: cost to buy back; long legs: receive when selling
      costToClose += leg.side === 'short' ? q.mid : -q.mid;
    }
    if (allFound) {
      currentValue = parseFloat((costToClose * 100 * contracts).toFixed(2));
      pl = parseFloat(((credit - costToClose) * 100 * contracts).toFixed(2));
      if (daysOpen && daysOpen > 0) plPerDay = parseFloat((pl / daysOpen).toFixed(2));
    }
  }

  // Profit target logic
  let profitTargetReached = false;
  let targetType = null;
  const isVixEvent = vixPrice !== null && vixPrice > 30;
  if (pl !== null && credit > 0) {
    const plPct = pl / (credit * 100 * contracts);
    if (plPct >= 0.90) { profitTargetReached = true; targetType = 'Aggressive (90%)'; }
    else if (plPct >= 0.75) { profitTargetReached = true; targetType = isVixEvent ? 'VIX Event (75%)' : 'Neutral (75%)'; }
    else if (plPct >= 0.50 && isVixEvent) { profitTargetReached = true; targetType = 'VIX Event (50%)'; }
    else if (plPct >= 0.50) { profitTargetReached = true; targetType = 'Conservative (50%)'; }
  }

  const needsManagement = daysRemaining !== null && daysRemaining <= 21;

  const logParts = [`${ticker} ${expiration}:`];
  if (pl !== null) logParts.push(`P&L $${pl} (${credit > 0 ? (pl / (credit * 100 * contracts) * 100).toFixed(0) + '%' : 'N/A'})`);
  if (daysRemaining !== null) logParts.push(`${daysRemaining} DTE`);
  if (profitTargetReached) logParts.push(`-> ${targetType}`);
  if (needsManagement) logParts.push('-> MANAGE');
  console.log(' ', logParts.join(' | '));

  if (profitTargetReached) {
    profitTargetsReached.push({
      ticker, ic, targetType,
      pl,
      plPct: credit > 0 ? (pl / (credit * 100 * contracts) * 100).toFixed(1) + '%' : 'N/A'
    });
  }
  if (needsManagement) under21DTEList.push({ ticker, ic, daysRemaining });

  const checkEntry = {
    date: afternoonTimestamp,
    currentValue,
    pl,
    plPerDay,
    profitTargetReached,
    targetType: targetType || null,
    under21DTE: needsManagement,
    daysRemaining,
  };

  const existingChecks = Array.isArray(pos.dailyChecks) ? pos.dailyChecks : [];
  await posDoc.ref.update({
    dailyChecks: [...existingChecks, checkEntry],
    lastChecked: afternoonTimestamp,
  });

  positionChecks.push({
    ticker, profile, ic,
    credit: parseFloat((credit * 100 * contracts).toFixed(2)),
    currentValue,
    pl,
    plPerDay,
    daysOpen,
    profitTargetReached,
    targetType: targetType || null,
    under21DTE: needsManagement,
    daysRemaining,
  });
}

// ── Step 6: Save afternoon scan summary ──────────────────────────────────────
const scanData = {
  afternoon: {
    timestamp: afternoonTimestamp,
    netLiq: afternoonNetLiq,
    netLiqChange: netLiqChange !== null ? parseFloat(netLiqChange.toFixed(2)) : null,
    netLiqChangeDayOverDay: netLiqChangeDayOverDay !== null ? parseFloat(netLiqChangeDayOverDay.toFixed(2)) : null,
    vix: vixPrice !== null ? parseFloat(vixPrice.toFixed(2)) : null,
    positionsChecked: positionChecks.length,
    profitTargetsReached,
    under21DTE: under21DTEList,
    checks: positionChecks,
  }
};

await db.collection('guvid-agent-scans').doc(today).set(scanData, { merge: true });

// Also write to legacy guvid-agent/scans/{date}/afternoon
await db.collection('guvid-agent').doc('scans').collection(today).doc('afternoon').set(scanData.afternoon, { merge: true });

console.log('\nAfternoon scan saved to Firestore');

// ── Print summary ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('GUVID AGENT — AFTERNOON SUMMARY');
console.log('═'.repeat(60));
console.log(`Net Liq: $${afternoonNetLiq.toFixed(2)}` +
  (netLiqChange !== null ? ` (change from morning: ${netLiqChange >= 0 ? '+' : ''}$${netLiqChange.toFixed(2)})` : ' (no morning snapshot)') +
  (netLiqChangeDayOverDay !== null ? `, change from yesterday: ${netLiqChangeDayOverDay >= 0 ? '+' : ''}$${netLiqChangeDayOverDay.toFixed(2)}` : '')
);
console.log(`VIX: ${vixPrice !== null ? vixPrice.toFixed(2) : 'N/A'}`);
console.log(`Positions checked: ${positionChecks.length}`);

if (profitTargetsReached.length > 0) {
  console.log('\nProfit targets reached:');
  profitTargetsReached.forEach(p => console.log(`  • ${p.ticker} — ${p.targetType} — P&L: $${p.pl} (${p.plPct})`));
} else {
  console.log('\nProfit targets reached: none');
}

if (under21DTEList.length > 0) {
  console.log('\nUnder 21 DTE (need management):');
  under21DTEList.forEach(p => console.log(`  • ${p.ticker} — ${p.daysRemaining} DTE — ${p.ic}`));
} else {
  console.log('Under 21 DTE: none');
}

console.log('═'.repeat(60));
process.exit(0);

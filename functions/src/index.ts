import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import * as https from 'https';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

const db = admin.firestore();

interface ICredentialsRequest {
  clientSecret: string;
  refreshToken: string;
}

interface IStoredCredentials {
  encryptedClientSecret: string;
  encryptedRefreshToken: string;
  iv: string;
  updatedAt: admin.firestore.FieldValue;
}

interface ICredentialsResponse {
  clientSecret: string;
  refreshToken: string;
}

interface IValidateResponse {
  valid: boolean;
  message: string;
}

interface IAuthContext {
  uid: string;
  isSuperadmin: boolean;
}

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return key;
}

function encrypt(text: string, key: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted: `${encrypted}:${authTag}`, iv: iv.toString('hex') };
}

function decrypt(encryptedWithTag: string, ivHex: string, key: string): string {
  const colonIdx = encryptedWithTag.lastIndexOf(':');
  const encrypted = encryptedWithTag.substring(0, colonIdx);
  const authTag = encryptedWithTag.substring(colonIdx + 1);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function getAuthContext(req: express.Request): Promise<IAuthContext> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED');
  }
  const idToken = authHeader.substring(7);
  const decoded = await admin.auth().verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    isSuperadmin: decoded['role'] === 'superadmin' || decoded.uid === '7OcSxAkz8eahmOJD2ddu4ElBPsf2',
  };
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// POST /api/credentials — save (or update) TastyTrade credentials for the caller
app.post('/api/credentials', async (req: express.Request, res: express.Response) => {
  try {
    const { uid } = await getAuthContext(req);
    const body = req.body as ICredentialsRequest;
    if (!body.clientSecret || !body.refreshToken) {
      res.status(400).json({ error: 'clientSecret and refreshToken are required' });
      return;
    }
    const key = getEncryptionKey();
    const encryptedSecret = encrypt(body.clientSecret, key);
    const encryptedToken = encrypt(body.refreshToken, key);
    const stored: IStoredCredentials = {
      encryptedClientSecret: encryptedSecret.encrypted,
      encryptedRefreshToken: encryptedToken.encrypted,
      iv: `${encryptedSecret.iv}:${encryptedToken.iv}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('credentials').doc(uid).set(stored);
    await db.collection('users').doc(uid).set(
      { updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// GET /api/credentials — retrieve decrypted credentials
// Superadmin can request any user's credentials via ?uid=<targetUid>
app.get('/api/credentials', async (req: express.Request, res: express.Response) => {
  try {
    const { uid, isSuperadmin } = await getAuthContext(req);
    const targetUid =
      isSuperadmin && typeof req.query['uid'] === 'string'
        ? req.query['uid']
        : uid;
    // Try encrypted credentials first, then fall back to plaintext in 'users' collection
    const credDoc = await db.collection('credentials').doc(targetUid).get();
    if (credDoc.exists) {
      const data = credDoc.data() as IStoredCredentials;
      const key = getEncryptionKey();
      const [secretIv, tokenIv] = data.iv.split(':');
      const clientSecret = decrypt(data.encryptedClientSecret, secretIv, key);
      const refreshToken = decrypt(data.encryptedRefreshToken, tokenIv, key);
      res.json({ clientSecret, refreshToken } as ICredentialsResponse);
      return;
    }
    // Fallback: plaintext credentials in 'users' collection
    const userDoc = await db.collection('users').doc(targetUid).get();
    if (userDoc.exists) {
      const data = userDoc.data() as Record<string, unknown>;
      if (data.clientSecret && data.refreshToken) {
        res.json({ clientSecret: data.clientSecret, refreshToken: data.refreshToken } as ICredentialsResponse);
        return;
      }
    }
    res.status(404).json({ error: 'No credentials found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// GET /api/admin/users — list all user UIDs that have stored credentials (superadmin only)
app.get('/api/admin/users', async (req: express.Request, res: express.Response) => {
  try {
    const { isSuperadmin } = await getAuthContext(req);
    if (!isSuperadmin) {
      res.status(403).json({ error: 'Forbidden — superadmin only' });
      return;
    }
    // Check both collections: 'credentials' (encrypted) and 'users' (plaintext legacy)
    const [credsSnap, usersSnap] = await Promise.all([
      db.collection('credentials').get(),
      db.collection('users').get(),
    ]);
    const uidSet = new Set<string>();
    credsSnap.docs.forEach((d: admin.firestore.QueryDocumentSnapshot) => uidSet.add(d.id));
    usersSnap.docs.forEach((d: admin.firestore.QueryDocumentSnapshot) => {
      const data = d.data();
      if (data.clientSecret && data.refreshToken) uidSet.add(d.id);
    });
    const uids = Array.from(uidSet);
    res.json({ uids });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// POST /api/validate-credentials — check credentials format
app.post('/api/validate-credentials', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthContext(req);
    const body = req.body as ICredentialsRequest;
    const valid = typeof body.clientSecret === 'string' && body.clientSecret.length >= 10
      && typeof body.refreshToken === 'string' && body.refreshToken.length >= 50;
    const response: IValidateResponse = {
      valid,
      message: valid ? 'Credentials format valid' : 'Invalid credentials format',
    };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// ─── Polygon.io / Massive Proxy ──────────────────────────────────────────────
// Proxies requests to Polygon API, keeping the API key server-side.
// Used by the backtest engine to fetch historical stock + options data.

const polygonApiKey = defineSecret('POLYGON_API_KEY');

function getPolygonApiKey(): string {
  const key = polygonApiKey.value();
  if (!key) {
    throw new Error('POLYGON_API_KEY secret not configured');
  }
  return key;
}

interface IPolygonAggResult {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  n?: number;
  t: number;
}

interface IPolygonAggsResponse {
  results?: IPolygonAggResult[];
  resultsCount?: number;
  status?: string;
  next_url?: string;
}

interface IPolygonContractResult {
  ticker: string;
  underlying_ticker: string;
  contract_type: 'call' | 'put';
  strike_price: number;
  expiration_date: string;
  exercise_style?: string;
}

interface IPolygonContractsResponse {
  results?: IPolygonContractResult[];
  status?: string;
  next_url?: string;
}

/**
 * Fetch JSON from a URL using Node https module.
 */
function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

// GET /api/polygon/stock-bars — daily OHLCV for an underlying stock
app.get('/api/polygon/stock-bars', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthContext(req);
    const symbol = req.query['symbol'] as string;
    const from = req.query['from'] as string;
    const to = req.query['to'] as string;

    if (!symbol || !from || !to) {
      res.status(400).json({ error: 'symbol, from, and to are required' });
      return;
    }

    const apiKey = getPolygonApiKey();
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

    const data = await fetchJson<IPolygonAggsResponse>(url);
    const bars = (data.results || []).map((r: IPolygonAggResult) => ({
      date: msToDateStr(r.t),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));

    res.json({ bars, count: bars.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[polygon/stock-bars]', message);
      res.status(500).json({ error: message });
    }
  }
});

// GET /api/polygon/options-contracts — list option contracts for an underlying
app.get('/api/polygon/options-contracts', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthContext(req);
    const underlying = req.query['underlying'] as string;
    if (!underlying) {
      res.status(400).json({ error: 'underlying is required' });
      return;
    }

    const apiKey = getPolygonApiKey();
    const allContracts: Array<{
      ticker: string;
      underlyingTicker: string;
      contractType: 'call' | 'put';
      strikePrice: number;
      expirationDate: string;
    }> = [];

    // Build query params from request
    const params = new URLSearchParams();
    params.set('underlying_ticker', underlying);
    params.set('limit', '1000');
    params.set('apiKey', apiKey);

    // Forward filter params
    const filterKeys = [
      'expiration_date', 'expiration_date.gte', 'expiration_date.lte',
      'expiration_date.gt', 'expiration_date.lt',
      'strike_price', 'strike_price.gte', 'strike_price.lte',
      'strike_price.gt', 'strike_price.lt',
      'contract_type', 'expired',
    ];
    for (const key of filterKeys) {
      const val = req.query[key];
      if (typeof val === 'string') {
        params.set(key, val);
      }
    }

    let url: string | null = `https://api.polygon.io/v3/reference/options/contracts?${params.toString()}`;

    // Paginate through all results
    while (url) {
      const pageData: IPolygonContractsResponse = await fetchJson<IPolygonContractsResponse>(url);
      for (const c of pageData.results || []) {
        allContracts.push({
          ticker: c.ticker,
          underlyingTicker: c.underlying_ticker,
          contractType: c.contract_type,
          strikePrice: c.strike_price,
          expirationDate: c.expiration_date,
        });
      }
      // Follow pagination
      url = pageData.next_url ? `${pageData.next_url}&apiKey=${apiKey}` : null;
    }

    res.json({ contracts: allContracts, count: allContracts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[polygon/options-contracts]', message);
      res.status(500).json({ error: message });
    }
  }
});

// GET /api/polygon/option-bars — daily OHLCV for a specific option contract
app.get('/api/polygon/option-bars', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthContext(req);
    const ticker = req.query['ticker'] as string;
    const from = req.query['from'] as string;
    const to = req.query['to'] as string;

    if (!ticker || !from || !to) {
      res.status(400).json({ error: 'ticker, from, and to are required' });
      return;
    }

    const apiKey = getPolygonApiKey();
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

    const data = await fetchJson<IPolygonAggsResponse>(url);
    const bars = (data.results || []).map((r: IPolygonAggResult) => ({
      date: msToDateStr(r.t),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));

    res.json({ bars, count: bars.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[polygon/option-bars]', message);
      res.status(500).json({ error: message });
    }
  }
});

// POST /api/polygon/option-bars-batch — fetch bars for multiple option contracts at once
// Body: { tickers: string[], from: string, to: string }
// Returns: { results: { [ticker: string]: bar[] } }
app.post('/api/polygon/option-bars-batch', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthContext(req);
    const { tickers, from, to } = req.body as { tickers: string[]; from: string; to: string };

    if (!tickers || !Array.isArray(tickers) || !from || !to) {
      res.status(400).json({ error: 'tickers (array), from, and to are required' });
      return;
    }

    if (tickers.length > 100) {
      res.status(400).json({ error: 'Maximum 100 tickers per batch' });
      return;
    }

    const apiKey = getPolygonApiKey();
    const results: Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>> = {};

    // Process in parallel batches of 10 to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const promises = batch.map(async (ticker: string) => {
        const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
        try {
          const data = await fetchJson<IPolygonAggsResponse>(url);
          results[ticker] = (data.results || []).map((r: IPolygonAggResult) => ({
            date: msToDateStr(r.t),
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
          }));
        } catch {
          results[ticker] = [];
        }
      });
      await Promise.all(promises);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[polygon/option-bars-batch]', message);
      res.status(500).json({ error: message });
    }
  }
});

export const api = onRequest({ invoker: 'public', secrets: [polygonApiKey] }, app);

// IBKR CP Gateway proxy and keep-alive scheduler
export { ibkrProxy, ibkrKeepAlive } from './ibkr-proxy';

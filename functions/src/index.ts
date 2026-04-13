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
    isSuperadmin: decoded['role'] === 'superadmin',
  };
}

const app = express();
const ALLOWED_ORIGINS = [
  'https://operatiunea-guvidul.web.app',
  'https://operatiunea-guvidul.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5174',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
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
      console.error('[API Error]', message);
      res.status(500).json({ error: 'Internal server error' });
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
    // Plaintext fallback removed for security — credentials must be encrypted
    res.status(404).json({ error: 'No credentials found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[API Error]', message);
      res.status(500).json({ error: 'Internal server error' });
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
    // Only check encrypted credentials collection
    const credsSnap = await db.collection('credentials').get();
    const uids = credsSnap.docs.map((d: admin.firestore.QueryDocumentSnapshot) => d.id);
    res.json({ uids });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[API Error]', message);
      res.status(500).json({ error: 'Internal server error' });
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
      console.error('[API Error]', message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ─── IBKR OAuth ─────────────────────────────────────────────────────────────
// Handles OAuth 2.0 token exchange and refresh for IBKR Web API (cloud mode).
// consumer_key is public (sent from frontend), consumer_secret is server-side only.

const ibkrConsumerSecret = defineSecret('IBKR_CONSUMER_SECRET');

function getIbkrConsumerSecret(): string {
  const key = ibkrConsumerSecret.value();
  if (!key) throw new Error('IBKR_CONSUMER_SECRET not configured');
  return key;
}

// POST /api/ibkr/oauth/token — exchange authorization code for access + refresh tokens
app.post('/api/ibkr/oauth/token', async (req: express.Request, res: express.Response) => {
  try {
    const { uid } = await getAuthContext(req);
    const { code, redirectUri, consumerKey } = req.body as {
      code: string;
      redirectUri: string;
      consumerKey: string;
    };
    if (!code || !redirectUri || !consumerKey) {
      res.status(400).json({ error: 'code, redirectUri, and consumerKey are required' });
      return;
    }

    const secret = getIbkrConsumerSecret();

    // Exchange code for tokens at IBKR OAuth endpoint
    const tokenUrl = 'https://api.ibkr.com/v1/api/oauth/token';
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: consumerKey,
      client_secret: secret,
    });

    const tokenResp = await new Promise<{ access_token?: string; refresh_token?: string; error?: string }>((resolve, reject) => {
      const postData = tokenBody.toString();
      const reqOpt = new URL(tokenUrl);
      const hreq = https.request({
        hostname: reqOpt.hostname,
        path: reqOpt.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (hres) => {
        let data = '';
        hres.on('data', (chunk: string) => { data += chunk; });
        hres.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Bad response: ${data.substring(0, 200)}`)); }
        });
      });
      hreq.on('error', reject);
      hreq.write(postData);
      hreq.end();
    });

    if (tokenResp.error || !tokenResp.access_token) {
      res.status(400).json({ error: tokenResp.error || 'No access_token received' });
      return;
    }

    // Store tokens encrypted in Firestore
    const encKey = getEncryptionKey();
    const encAccess = encrypt(tokenResp.access_token, encKey);
    const encRefresh = tokenResp.refresh_token ? encrypt(tokenResp.refresh_token, encKey) : null;

    await db.collection('users').doc(uid).collection('ibkrTokens').doc('current').set({
      encryptedAccessToken: encAccess.encrypted,
      accessTokenIv: encAccess.iv,
      encryptedRefreshToken: encRefresh?.encrypted ?? null,
      refreshTokenIv: encRefresh?.iv ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      accessToken: tokenResp.access_token,
      hasRefreshToken: !!tokenResp.refresh_token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[ibkr/oauth/token]', message);
      res.status(500).json({ error: 'Token exchange failed' });
    }
  }
});

// POST /api/ibkr/oauth/refresh — use stored refresh token to get a new access token
app.post('/api/ibkr/oauth/refresh', async (req: express.Request, res: express.Response) => {
  try {
    const { uid } = await getAuthContext(req);

    // Load stored tokens
    const tokenDoc = await db.collection('users').doc(uid).collection('ibkrTokens').doc('current').get();
    if (!tokenDoc.exists) {
      res.status(404).json({ error: 'No IBKR tokens found — please reconnect' });
      return;
    }

    const data = tokenDoc.data()!;
    if (!data['encryptedRefreshToken'] || !data['refreshTokenIv']) {
      res.status(400).json({ error: 'No refresh token stored' });
      return;
    }

    const encKey = getEncryptionKey();
    const refreshTkn = decrypt(data['encryptedRefreshToken'], data['refreshTokenIv'], encKey);
    const secret = getIbkrConsumerSecret();

    // Use refresh token to get new access token
    const tokenUrl = 'https://api.ibkr.com/v1/api/oauth/token';
    const tokenBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTkn,
      client_secret: secret,
    });

    const tokenResp = await new Promise<{ access_token?: string; refresh_token?: string; error?: string }>((resolve, reject) => {
      const postData = tokenBody.toString();
      const reqOpt = new URL(tokenUrl);
      const hreq = https.request({
        hostname: reqOpt.hostname,
        path: reqOpt.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (hres) => {
        let data2 = '';
        hres.on('data', (chunk: string) => { data2 += chunk; });
        hres.on('end', () => {
          try { resolve(JSON.parse(data2)); }
          catch { reject(new Error(`Bad response: ${data2.substring(0, 200)}`)); }
        });
      });
      hreq.on('error', reject);
      hreq.write(postData);
      hreq.end();
    });

    if (tokenResp.error || !tokenResp.access_token) {
      res.status(400).json({ error: tokenResp.error || 'Refresh failed' });
      return;
    }

    // Update stored tokens
    const encAccess = encrypt(tokenResp.access_token, encKey);
    const updateData: Record<string, unknown> = {
      encryptedAccessToken: encAccess.encrypted,
      accessTokenIv: encAccess.iv,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // If a new refresh token was issued, update it too
    if (tokenResp.refresh_token) {
      const encRefresh = encrypt(tokenResp.refresh_token, encKey);
      updateData['encryptedRefreshToken'] = encRefresh.encrypted;
      updateData['refreshTokenIv'] = encRefresh.iv;
    }
    await db.collection('users').doc(uid).collection('ibkrTokens').doc('current').set(updateData, { merge: true });

    res.json({ accessToken: tokenResp.access_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[ibkr/oauth/refresh]', message);
      res.status(500).json({ error: 'Token refresh failed' });
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

export const api = onRequest({ invoker: 'public', secrets: [polygonApiKey, ibkrConsumerSecret] }, app);

// ─── Guvid vs User Competition v2 ─────────────────────────────────────────────
// Autonomous AI that competes against Catalin — scheduled daily
export { aiDailySubmit } from './aiDailySubmit';
export { closeCheck } from './closeCheck';
export { aiLearning } from './aiLearning';
export { weeklyReflect } from './weeklyReflect';

// ─── Technical Indicators (RSI / Bollinger Bands / ATR) ─────────────────────
// Scheduler writes marketTechnicals/{SPX,QQQ} daily after close.
// Callable returns on-demand computation for other tickers.
export { computeTechnicals } from './computeTechnicals';
export { getTechnicalsOnDemand } from './getTechnicalsOnDemand';

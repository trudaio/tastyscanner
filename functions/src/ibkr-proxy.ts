import * as admin from 'firebase-admin';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import express from 'express';
import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGatewayUrl(): string {
  const url = process.env['IBKR_GATEWAY_URL'];
  if (!url) {
    throw new Error('IBKR_GATEWAY_URL environment variable is not set');
  }
  return url.replace(/\/$/, '');
}

async function verifyAuth(req: express.Request): Promise<string> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED');
  }
  const idToken = authHeader.substring(7);
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

interface IProxyResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

function forwardRequest(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer
): Promise<IProxyResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers,
    };

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 502,
          headers: res.headers as Record<string, string | string[]>,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', reject);

    if (body && body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true }));

// Parse raw body so we can forward it as-is
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Proxy all /v1/api/* requests to the CP Gateway
app.all('/v1/api/*', async (req: express.Request, res: express.Response) => {
  try {
    await verifyAuth(req);

    const gatewayUrl = getGatewayUrl();
    const targetPath = req.url; // preserves /v1/api/... and query string
    const targetUrl = `${gatewayUrl}${targetPath}`;

    // Build forwarded headers — strip hop-by-hop and authorization
    const forwardHeaders: Record<string, string> = {};
    const skipHeaders = new Set([
      'authorization', 'host', 'connection', 'transfer-encoding',
      'te', 'trailer', 'upgrade', 'keep-alive', 'proxy-authorization',
      'proxy-authenticate',
    ]);
    for (const [key, value] of Object.entries(req.headers)) {
      if (!skipHeaders.has(key.toLowerCase()) && typeof value === 'string') {
        forwardHeaders[key] = value;
      }
    }

    const body = req.body instanceof Buffer ? req.body : undefined;

    const proxyRes = await forwardRequest(targetUrl, req.method, forwardHeaders, body);

    // Forward response headers (skip hop-by-hop)
    const skipResponseHeaders = new Set([
      'connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'keep-alive',
    ]);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!skipResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(proxyRes.statusCode).send(proxyRes.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      console.error('[ibkr-proxy]', message);
      res.status(502).json({ error: `Gateway error: ${message}` });
    }
  }
});

// ─── Exported Cloud Functions ─────────────────────────────────────────────────

/**
 * HTTP proxy — forwards authenticated requests to the IBKR CP Gateway.
 * All /v1/api/* endpoints are proxied.
 */
export const ibkrProxy = onRequest({ invoker: 'public' }, app);

/**
 * Keep-alive scheduler — pings the CP Gateway every 5 minutes to prevent
 * session expiry. The CP Gateway session times out after ~1h of inactivity.
 */
export const ibkrKeepAlive = onSchedule('every 5 minutes', async () => {
  try {
    const gatewayUrl = getGatewayUrl();
    await forwardRequest(`${gatewayUrl}/v1/api/tickle`, 'GET', {});
    console.info('[ibkr-keepalive] tickle sent');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ibkr-keepalive] failed:', message);
  }
});

import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';

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

async function getAuthenticatedUid(req: express.Request): Promise<string> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED');
  }
  const idToken = authHeader.substring(7);
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post('/api/credentials', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await getAuthenticatedUid(req);
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

app.get('/api/credentials', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await getAuthenticatedUid(req);
    const doc = await db.collection('credentials').doc(uid).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'No credentials found' });
      return;
    }
    const data = doc.data() as IStoredCredentials;
    const key = getEncryptionKey();
    const [secretIv, tokenIv] = data.iv.split(':');
    const clientSecret = decrypt(data.encryptedClientSecret, secretIv, key);
    const refreshToken = decrypt(data.encryptedRefreshToken, tokenIv, key);
    const response: ICredentialsResponse = { clientSecret, refreshToken };
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

app.post('/api/validate-credentials', async (req: express.Request, res: express.Response) => {
  try {
    await getAuthenticatedUid(req);
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

export const api = onRequest(app);

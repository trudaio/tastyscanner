// Read and decrypt Catalin's TastyTrade credentials from Firestore

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import type { TastyCredentials } from './tasty-rest-client';

interface IStoredCredentials {
    encryptedClientSecret: string;
    encryptedRefreshToken: string;
    iv: string;
}

function getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
    }
    return key;
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

/** Fetch and decrypt credentials for a given uid */
export async function getCredentialsForUser(uid: string): Promise<TastyCredentials | null> {
    const doc = await admin.firestore().collection('credentials').doc(uid).get();
    if (!doc.exists) return null;
    const data = doc.data() as IStoredCredentials;
    const key = getEncryptionKey();
    const [secretIv, tokenIv] = data.iv.split(':');
    return {
        clientSecret: decrypt(data.encryptedClientSecret, secretIv, key),
        refreshToken: decrypt(data.encryptedRefreshToken, tokenIv, key),
    };
}

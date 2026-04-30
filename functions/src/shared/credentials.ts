// Read Catalin's TastyTrade credentials from Firestore
// Credentials are stored plaintext in users/{uid}/brokerAccounts/{accountId}
// under the `credentials` field. No server-side encryption — browser reads same docs.

import * as admin from 'firebase-admin';
import type { TastyCredentials } from './tasty-rest-client';

// Hardcoded so background jobs can never fall back to another user's TastyTrade
// account. Email: macovei17@gmail.com. Source of past abuse: scheduled jobs
// picked the first active TastyTrade user and consumed their DxLink quota.
export const CATALIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2';

interface IBrokerAccountDoc {
    brokerType: 'tastytrade' | 'TastyTrade' | 'IBKR' | string;
    label: string;
    isActive: boolean;
    credentials: {
        brokerType: string;
        clientSecret?: string;
        refreshToken?: string;
    };
}

/**
 * Returns Catalin's UID iff he has an active TastyTrade broker account.
 * Replaces the previous "first active user" scan that abused other users' tokens.
 */
export async function findActiveTastyUser(): Promise<string | null> {
    const subs = await admin.firestore()
        .collection('users').doc(CATALIN_UID)
        .collection('brokerAccounts')
        .where('isActive', '==', true)
        .get();
    for (const s of subs.docs) {
        const d = s.data();
        if (d['brokerType']?.toLowerCase() === 'tastytrade' && d['credentials']?.refreshToken) {
            return CATALIN_UID;
        }
    }
    return null;
}

/** Find active TastyTrade account for a given uid and return its credentials */
export async function getCredentialsForUser(uid: string): Promise<TastyCredentials | null> {
    const snap = await admin.firestore()
        .collection('users').doc(uid)
        .collection('brokerAccounts')
        .where('isActive', '==', true)
        .get();

    for (const d of snap.docs) {
        const data = d.data() as IBrokerAccountDoc;
        if (data.brokerType?.toLowerCase() === 'tastytrade' && data.credentials?.clientSecret && data.credentials?.refreshToken) {
            return {
                clientSecret: data.credentials.clientSecret,
                refreshToken: data.credentials.refreshToken,
            };
        }
    }

    // Fallback to legacy user doc (old schema)
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (userDoc.exists) {
        const data = userDoc.data() as { clientSecret?: string; refreshToken?: string };
        if (data.clientSecret && data.refreshToken) {
            return {
                clientSecret: data.clientSecret,
                refreshToken: data.refreshToken,
            };
        }
    }

    return null;
}

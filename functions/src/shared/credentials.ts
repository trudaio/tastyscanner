// Read Catalin's TastyTrade credentials from Firestore
// Credentials are stored plaintext in users/{uid}/brokerAccounts/{accountId}
// under the `credentials` field. No server-side encryption — browser reads same docs.

import * as admin from 'firebase-admin';
import type { TastyCredentials } from './tasty-rest-client';

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

/** Find the first user with an active TastyTrade account. Returns their uid. */
export async function findActiveTastyUser(): Promise<string | null> {
    // Iterate users and check their brokerAccounts subcollection
    const users = await admin.firestore().collection('users').get();
    for (const u of users.docs) {
        const subs = await admin.firestore()
            .collection('users').doc(u.id)
            .collection('brokerAccounts')
            .where('isActive', '==', true)
            .get();
        for (const s of subs.docs) {
            const d = s.data();
            if (d['brokerType']?.toLowerCase() === 'tastytrade' && d['credentials']?.refreshToken) {
                return u.id;
            }
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

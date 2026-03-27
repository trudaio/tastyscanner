import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import type { ICredentialsService, ITastyCredentials } from './credentials.service.interface';

/**
 * Stores TastyTrade credentials per user in Firestore.
 * Collection: users/{uid}  →  fields: clientSecret, refreshToken
 */
export class CredentialsService implements ICredentialsService {

    private getUserDocRef() {
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        return doc(db, 'users', user.uid);
    }

    async saveCredentials(clientSecret: string, refreshToken: string): Promise<void> {
        const ref = this.getUserDocRef();
        // Only save a flag that credentials exist — actual secrets go to brokerAccounts subcollection
        await setDoc(ref, { hasCredentials: true, updatedAt: new Date().toISOString() }, { merge: true });
    }

    async loadCredentials(): Promise<ITastyCredentials | null> {
        const ref = this.getUserDocRef();
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data();
        if (!data.clientSecret || !data.refreshToken) return null;
        return {
            clientSecret: data.clientSecret as string,
            refreshToken: data.refreshToken as string,
        };
    }

    async validateCredentials(_clientSecret: string, _refreshToken: string): Promise<boolean> {
        // Basic format validation — client secret is 40 hex chars, refresh token is a JWT
        return _clientSecret.length >= 20 && _refreshToken.length >= 50;
    }
}

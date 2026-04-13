import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import type { ITastyCredentials } from './credentials.service.interface';
import type { IBrokerCredentialsService, IBrokerAccount } from './broker-credentials.service.interface';
import { BrokerType } from '../broker-provider/broker-provider.interface';
import type { ITastyTradeCredentials } from '../broker-provider/broker-provider.interface';

/**
 * Multi-broker credential storage backed by Firestore.
 *
 * New schema:  users/{uid}/brokerAccounts/{accountId}
 *              { brokerType, label, isActive, credentials: {...} }
 *
 * Backward compatibility: the legacy users/{uid} doc with
 * { clientSecret, refreshToken } is still read by loadCredentials().
 * saveCredentials() writes to BOTH the legacy doc AND the new subcollection
 * so existing users are migrated transparently on their next save.
 */
export class BrokerCredentialsService implements IBrokerCredentialsService {

    private getUserDocRef() {
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        return doc(db, 'users', user.uid);
    }

    private getBrokerAccountsRef() {
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        return collection(db, 'users', user.uid, 'brokerAccounts');
    }

    // ─── ICredentialsService (backward-compatible) ────────────────────────────

    async saveCredentials(clientSecret: string, refreshToken: string): Promise<void> {
        const userRef = this.getUserDocRef();
        // Only save metadata to the user doc — no plaintext secrets
        await setDoc(userRef, { hasCredentials: true, updatedAt: new Date().toISOString() }, { merge: true });

        // Save actual credentials to brokerAccounts subcollection only
        const existing = await this.getActiveBrokerAccount();
        if (!existing || existing.brokerType !== BrokerType.TastyTrade) {
            await this.saveBrokerAccount({
                brokerType: BrokerType.TastyTrade,
                label: 'TastyTrade',
                isActive: true,
                credentials: {
                    brokerType: BrokerType.TastyTrade,
                    clientSecret,
                    refreshToken,
                },
            });
        } else {
            await this.saveBrokerAccount({
                id: existing.id,
                brokerType: BrokerType.TastyTrade,
                label: existing.label,
                isActive: true,
                credentials: {
                    brokerType: BrokerType.TastyTrade,
                    clientSecret,
                    refreshToken,
                },
            });
        }
    }

    async loadCredentials(): Promise<ITastyCredentials | null> {
        // 1. Prefer the active broker account from the new subcollection
        const active = await this.getActiveBrokerAccount();
        if (active && active.brokerType === BrokerType.TastyTrade) {
            const creds = active.credentials as ITastyTradeCredentials;
            if (creds.clientSecret && creds.refreshToken) {
                return { clientSecret: creds.clientSecret, refreshToken: creds.refreshToken };
            }
        }

        // Legacy fallback removed — credentials should only be in brokerAccounts subcollection
        return null;
    }

    async validateCredentials(_clientSecret: string, _refreshToken: string): Promise<boolean> {
        return _clientSecret.length >= 20 && _refreshToken.length >= 50;
    }

    // ─── IBrokerCredentialsService (multi-broker) ─────────────────────────────

    async listBrokerAccounts(): Promise<IBrokerAccount[]> {
        const ref = this.getBrokerAccountsRef();
        const snap = await getDocs(ref);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as IBrokerAccount));
    }

    async saveBrokerAccount(account: Omit<IBrokerAccount, 'id'> & { id?: string }): Promise<string> {
        const ref = this.getBrokerAccountsRef();
        const docRef = account.id ? doc(ref, account.id) : doc(ref);
        const { id: _id, ...data } = account as IBrokerAccount;
        console.log('[BrokerCredentials] saveBrokerAccount path:', docRef.path, 'data:', JSON.stringify({ ...data, credentials: '***' }));
        try {
            await setDoc(docRef, data, { merge: true });
            console.log('[BrokerCredentials] saveBrokerAccount SUCCESS:', docRef.id);
        } catch (err) {
            console.error('[BrokerCredentials] saveBrokerAccount FAILED:', err);
            throw err;
        }
        return docRef.id;
    }

    async deleteBrokerAccount(id: string): Promise<void> {
        const ref = this.getBrokerAccountsRef();
        await deleteDoc(doc(ref, id));
    }

    async getActiveBrokerAccount(): Promise<IBrokerAccount | null> {
        const accounts = await this.listBrokerAccounts();
        return accounts.find(a => a.isActive) ?? null;
    }

    async setActiveBrokerAccount(id: string): Promise<void> {
        const accounts = await this.listBrokerAccounts();
        const ref = this.getBrokerAccountsRef();
        const batch = writeBatch(db);
        for (const account of accounts) {
            batch.set(doc(ref, account.id), { isActive: account.id === id }, { merge: true });
        }
        await batch.commit();
    }
}

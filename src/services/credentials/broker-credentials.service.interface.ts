import type { ICredentialsService } from './credentials.service.interface';
import type { BrokerType, IBrokerCredentials } from '../broker-provider/broker-provider.interface';

export interface IBrokerAccount {
    /** Firestore doc id under users/{uid}/brokerAccounts/{accountId} */
    id: string;
    brokerType: BrokerType;
    label: string;
    isActive: boolean;
    credentials: IBrokerCredentials;
}

/**
 * Extends ICredentialsService for backward compatibility.
 * Adds multi-broker CRUD on the brokerAccounts subcollection.
 */
export interface IBrokerCredentialsService extends ICredentialsService {
    /** List all saved broker accounts for the current user. */
    listBrokerAccounts(): Promise<IBrokerAccount[]>;

    /** Save (create or update) a broker account entry. */
    saveBrokerAccount(account: Omit<IBrokerAccount, 'id'> & { id?: string }): Promise<string>;

    /** Delete a broker account by id. */
    deleteBrokerAccount(id: string): Promise<void>;

    /** Get the active broker account (isActive === true), or null. */
    getActiveBrokerAccount(): Promise<IBrokerAccount | null>;

    /** Set a broker account as active (deactivates others). */
    setActiveBrokerAccount(id: string): Promise<void>;
}

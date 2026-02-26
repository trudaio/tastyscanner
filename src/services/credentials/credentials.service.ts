import { auth } from '../../firebase';
import type { ICredentialsService, ITastyCredentials } from './credentials.service.interface';

export class CredentialsService implements ICredentialsService {
    private get baseUrl(): string {
        return import.meta.env.VITE_FUNCTIONS_BASE_URL;
    }

    private async getAuthHeader(): Promise<string> {
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        const token = await user.getIdToken();
        return `Bearer ${token}`;
    }

    async saveCredentials(clientSecret: string, refreshToken: string): Promise<void> {
        const authHeader = await this.getAuthHeader();
        const resp = await fetch(`${this.baseUrl}/api/credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ clientSecret, refreshToken }),
        });
        if (!resp.ok) {
            throw new Error(`Failed to save credentials: ${resp.statusText}`);
        }
    }

    async loadCredentials(): Promise<ITastyCredentials | null> {
        const authHeader = await this.getAuthHeader();
        const resp = await fetch(`${this.baseUrl}/api/credentials`, {
            headers: { 'Authorization': authHeader },
        });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error(`Failed to load credentials: ${resp.statusText}`);
        return resp.json() as Promise<ITastyCredentials>;
    }

    async validateCredentials(clientSecret: string, refreshToken: string): Promise<boolean> {
        const authHeader = await this.getAuthHeader();
        const resp = await fetch(`${this.baseUrl}/api/validate-credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ clientSecret, refreshToken }),
        });
        if (!resp.ok) return false;
        const data = await resp.json() as { valid: boolean };
        return data.valid;
    }
}

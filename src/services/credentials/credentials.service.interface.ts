export interface ITastyCredentials {
    clientSecret: string;
    refreshToken: string;
}

export interface ICredentialsService {
    saveCredentials(clientSecret: string, refreshToken: string): Promise<void>;
    loadCredentials(): Promise<ITastyCredentials | null>;
    validateCredentials(clientSecret: string, refreshToken: string): Promise<boolean>;
}

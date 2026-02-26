import type { User } from 'firebase/auth';

export interface IAuthService {
    login(email: string, password: string): Promise<User>;
    register(email: string, password: string): Promise<User>;
    logout(): Promise<void>;
    getCurrentUser(): User | null;
    getIdToken(): Promise<string | null>;
    onAuthStateChanged(callback: (user: User | null) => void): () => void;
}

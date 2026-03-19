import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth } from '../../firebase';
import type { IAuthService } from './auth.service.interface';

export class FirebaseAuthService implements IAuthService {
    async login(email: string, password: string): Promise<User> {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    }

    async register(email: string, password: string): Promise<User> {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return result.user;
    }

    async logout(): Promise<void> {
        await signOut(auth);
    }

    getCurrentUser(): User | null {
        return auth.currentUser;
    }

    async getIdToken(): Promise<string | null> {
        const user = auth.currentUser;
        if (!user) return null;
        return user.getIdToken();
    }

    onAuthStateChanged(callback: (user: User | null) => void): () => void {
        return firebaseOnAuthStateChanged(auth, callback);
    }
}

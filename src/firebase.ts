import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;
const useFirebaseEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';
const defaultProjectId = env.VITE_FIREBASE_PROJECT_ID || 'operatiunea-guvidul';

function hasCloudFirebaseConfig(): boolean {
    return Boolean(
        env.VITE_FIREBASE_API_KEY &&
        env.VITE_FIREBASE_AUTH_DOMAIN &&
        env.VITE_FIREBASE_PROJECT_ID &&
        env.VITE_FIREBASE_APP_ID
    );
}

function getFirebaseConfig(): FirebaseOptions {
    if (useFirebaseEmulators) {
        return {
            apiKey: env.VITE_FIREBASE_API_KEY || 'local-demo-api-key',
            authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${defaultProjectId}.firebaseapp.com`,
            projectId: defaultProjectId,
            storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${defaultProjectId}.appspot.com`,
            messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
            appId: env.VITE_FIREBASE_APP_ID || '1:1234567890:web:localdemo',
        };
    }

    if (!hasCloudFirebaseConfig()) {
        throw new Error(
            'Missing Firebase config. Add VITE_FIREBASE_* values to .env.local or enable local emulators with VITE_USE_FIREBASE_EMULATORS=true.'
        );
    }

    return {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
    };
}

const firebaseConfig = getFirebaseConfig();

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const emulatorFlag = '__tastyscanner_firebase_emulators_connected__';
const globalState = globalThis as unknown as Record<string, boolean | undefined>;

if (useFirebaseEmulators && !globalState[emulatorFlag]) {
    const authUrl = env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
    const firestoreHost = env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(env.VITE_FIRESTORE_EMULATOR_PORT || '8080');

    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    globalState[emulatorFlag] = true;
}

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { expandSeed } from './shared/seed-helpers';
import { EVENTS_2026_US } from './data/economic-events-2026';
import type { IEconomicEventSeed } from './shared/economic-event.types';

const ADMIN_EMAIL = 'macovei17@gmail.com';

export const seedEconomicEvents = onCall(
    { region: 'us-central1', cors: true },
    async (request) => {
        const email = request.auth?.token?.email;
        if (email !== ADMIN_EMAIL) {
            throw new HttpsError('permission-denied', `Admin only (got ${email})`);
        }

        const year: number = request.data?.year;
        if (!year || typeof year !== 'number') {
            throw new HttpsError('invalid-argument', 'year (number) required');
        }

        let seeds: IEconomicEventSeed[];
        if (year === 2026) {
            seeds = EVENTS_2026_US;
        } else {
            throw new HttpsError('invalid-argument', `Year ${year} not supported yet`);
        }

        const seededBy = `admin:${email}`;
        const batch = admin.firestore().batch();
        let count = 0;
        for (const seed of seeds) {
            const doc = expandSeed(seed, seededBy);
            const ref = admin.firestore().collection('economicEvents').doc(doc.id);
            batch.set(ref, doc, { merge: true });
            count++;
        }
        await batch.commit();

        return { seeded: count, year };
    }
);

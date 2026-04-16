import { makeObservable, observable, computed, action, runInAction } from 'mobx';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DateTime } from 'luxon';
import { db, auth } from '../../firebase';
import type {
    IEconomicCalendarService,
    IActivePauseState,
} from './economic-calendar.service.interface';
import type { IEconomicEvent, ISystemAlert } from '../../models/economic-event.model';

const ET_ZONE = 'America/New_York';

function normalizeEvent(id: string, data: Record<string, unknown>): IEconomicEvent {
    return {
        id,
        eventType: data.eventType as IEconomicEvent['eventType'],
        name: data.name as string,
        country: data.country as string,
        impact: data.impact as IEconomicEvent['impact'],
        scheduledUtc: (data.scheduledUtc as Timestamp).toDate(),
        scheduledEtString: data.scheduledEtString as string,
        scheduledEestString: data.scheduledEestString as string,
        gatesLadderingPause: data.gatesLadderingPause as boolean,
        gatesPreEventClose: data.gatesPreEventClose as boolean,
        previousValue: (data.previousValue as string | null) ?? null,
        forecastValue: (data.forecastValue as string | null) ?? null,
        actualValue: (data.actualValue as string | null) ?? null,
        source: data.source as IEconomicEvent['source'],
        sourceUrl: data.sourceUrl as string,
        seededAt: (data.seededAt as Timestamp).toDate(),
        seededBy: data.seededBy as string,
        verifiedAt: data.verifiedAt ? (data.verifiedAt as Timestamp).toDate() : null,
    };
}

export class EconomicCalendarService implements IEconomicCalendarService {
    events: IEconomicEvent[] = [];
    isLoading = true;
    systemAlerts: ISystemAlert[] = [];

    private unsubEvents?: Unsubscribe;
    private unsubAlerts?: Unsubscribe;

    constructor() {
        makeObservable(this, {
            events: observable,
            isLoading: observable,
            systemAlerts: observable,
            init: action,
            dispose: action,
            todaysEvents: computed,
            tomorrowsEvents: computed,
            groupedByDay: computed,
            activePauseState: computed,
            nextCloseWindowEvent: computed,
            maxScheduledDate: computed,
        });
    }

    init(): void {
        // Events subscription
        const evtQ = query(
            collection(db, 'economicEvents'),
            where('country', '==', 'US'),
            orderBy('scheduledUtc', 'asc'),
            limit(200)
        );
        this.unsubEvents = onSnapshot(
            evtQ,
            snap => runInAction(() => {
                this.events = snap.docs
                    .map(d => normalizeEvent(d.id, d.data()))
                    .filter(e => (e.scheduledUtc as Date).getTime() >= Date.now() - 24 * 3_600_000);
                this.isLoading = false;
            }),
            err => {
                console.error('[economic-calendar] subscription error', err);
                runInAction(() => { this.isLoading = false; });
            }
        );

        // System alerts (unacknowledged)
        const alertQ = query(
            collection(db, 'system_alerts'),
            where('acknowledgedAt', '==', null),
            where('type', 'in', [
                'calendar_seed_low',
                'calendar_reconcile_mismatch',
                'calendar_fomc_reschedule',
            ])
        );
        this.unsubAlerts = onSnapshot(alertQ, snap => runInAction(() => {
            this.systemAlerts = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    type: data.type,
                    severity: data.severity,
                    message: data.message,
                    relatedEventId: data.relatedEventId ?? null,
                    createdAt: (data.createdAt as Timestamp).toDate(),
                    acknowledgedAt: null,
                    acknowledgedBy: null,
                } as ISystemAlert;
            });
        }));
    }

    dispose(): void {
        this.unsubEvents?.();
        this.unsubAlerts?.();
    }

    get todaysEvents(): IEconomicEvent[] {
        const today = DateTime.now().setZone(ET_ZONE).toISODate();
        if (!today) return [];
        return this.events.filter(
            e => DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate() === today
        );
    }

    get tomorrowsEvents(): IEconomicEvent[] {
        const tomorrow = DateTime.now().setZone(ET_ZONE).plus({ days: 1 }).toISODate();
        if (!tomorrow) return [];
        return this.events.filter(
            e => DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate() === tomorrow
        );
    }

    get groupedByDay(): Map<string, IEconomicEvent[]> {
        const map = new Map<string, IEconomicEvent[]>();
        for (const e of this.events) {
            const day = DateTime.fromJSDate(e.scheduledUtc as Date).setZone(ET_ZONE).toISODate();
            if (!day) continue;
            if (!map.has(day)) map.set(day, []);
            map.get(day)!.push(e);
        }
        return map;
    }

    get activePauseState(): IActivePauseState {
        const etNow = DateTime.now().setZone(ET_ZONE);
        const startMs = etNow.startOf('day').toMillis();
        const endMs = etNow.plus({ days: 1 }).endOf('day').toMillis();
        const blocking = this.events.filter(e =>
            e.gatesLadderingPause &&
            (e.scheduledUtc as Date).getTime() >= startMs &&
            (e.scheduledUtc as Date).getTime() <= endMs
        );
        return {
            paused: blocking.length > 0,
            reason: blocking.length
                ? blocking.map(e => e.name).join(', ')
                : '',
            blockingEvents: blocking,
        };
    }

    get nextCloseWindowEvent(): IEconomicEvent | null {
        const nowMs = Date.now();
        const cutoffMs = nowMs + 4 * 3_600_000;
        const found = this.events.find(e =>
            e.gatesPreEventClose &&
            (e.scheduledUtc as Date).getTime() >= nowMs &&
            (e.scheduledUtc as Date).getTime() <= cutoffMs
        );
        return found ?? null;
    }

    get maxScheduledDate(): Date | null {
        if (this.events.length === 0) return null;
        return this.events[this.events.length - 1].scheduledUtc as Date;
    }

    async acknowledgeSystemAlert(alertId: string): Promise<void> {
        const uid = auth.currentUser?.uid ?? 'anonymous';
        await updateDoc(doc(db, 'system_alerts', alertId), {
            acknowledgedAt: serverTimestamp(),
            acknowledgedBy: uid,
        });
    }

    async seedYear(year: number): Promise<{ seeded: number; year: number }> {
        const functions = getFunctions(undefined, 'us-central1');
        const callable = httpsCallable<{ year: number }, { seeded: number; year: number }>(
            functions,
            'seedEconomicEvents'
        );
        const result = await callable({ year });
        return result.data;
    }
}

import { DateTime } from 'luxon';
import * as admin from 'firebase-admin';
import type { IEconomicEvent } from './economic-event.types';

function toMillis(scheduledUtc: Date | { toMillis(): number }): number {
    return scheduledUtc instanceof Date
        ? scheduledUtc.getTime()
        : scheduledUtc.toMillis();
}

/**
 * Returns events that gate laddering within [now, now + lookAheadHours].
 */
export function getLadderingPauseEvents(
    now: Date,
    events: IEconomicEvent[],
    lookAheadHours = 48
): IEconomicEvent[] {
    const nowMs = now.getTime();
    const cutoffMs = nowMs + lookAheadHours * 3_600_000;
    return events.filter(e => {
        const evtMs = toMillis(e.scheduledUtc as Date);
        return e.gatesLadderingPause && evtMs >= nowMs && evtMs <= cutoffMs;
    });
}

/**
 * Returns events that gate pre-event close within [now, now + closeWindowHours].
 */
export function getCloseWindowEvents(
    now: Date,
    events: IEconomicEvent[],
    closeWindowHours = 4
): IEconomicEvent[] {
    const nowMs = now.getTime();
    const cutoffMs = nowMs + closeWindowHours * 3_600_000;
    return events.filter(e => {
        const evtMs = toMillis(e.scheduledUtc as Date);
        return e.gatesPreEventClose && evtMs >= nowMs && evtMs <= cutoffMs;
    });
}

/**
 * Day-boundary laddering pause check: is today OR tomorrow (ET) blocked?
 */
export function isInLadderingPauseWindow(
    now: Date,
    events: IEconomicEvent[]
): { paused: boolean; reason: string; blockingEvents: IEconomicEvent[] } {
    const etNow = DateTime.fromJSDate(now, { zone: 'utc' }).setZone('America/New_York');
    const startOfTodayEt = etNow.startOf('day').toJSDate();
    const endOfTomorrowEt = etNow.plus({ days: 1 }).endOf('day').toJSDate();
    const startMs = startOfTodayEt.getTime();
    const endMs = endOfTomorrowEt.getTime();

    const blocking = events.filter(e => {
        const evtMs = toMillis(e.scheduledUtc as Date);
        return e.gatesLadderingPause && evtMs >= startMs && evtMs <= endMs;
    });

    return {
        paused: blocking.length > 0,
        reason: blocking.length
            ? `${blocking.map(e => e.name).join(', ')} in ET window (today/tomorrow)`
            : '',
        blockingEvents: blocking,
    };
}

/**
 * Wrapper with feature-flag short-circuit for safe rollback.
 * Reads `featureFlags/economicCalendar.enabled` — if false, all gates disabled.
 */
export async function checkGates(
    now: Date,
    events: IEconomicEvent[]
): Promise<{
    ladderingPause: ReturnType<typeof isInLadderingPauseWindow>;
    closeWindow: IEconomicEvent[];
}> {
    try {
        const flagDoc = await admin.firestore().doc('featureFlags/economicCalendar').get();
        const enabled = flagDoc.exists ? flagDoc.data()?.enabled !== false : true;

        if (!enabled) {
            return {
                ladderingPause: { paused: false, reason: 'feature disabled', blockingEvents: [] },
                closeWindow: [],
            };
        }
    } catch (err) {
        console.warn('[economic-calendar] feature flag check failed, proceeding with gates ON', err);
    }

    return {
        ladderingPause: isInLadderingPauseWindow(now, events),
        closeWindow: getCloseWindowEvents(now, events, 4),
    };
}

/**
 * Fetch upcoming events from Firestore ordered by schedule ascending.
 */
export async function fetchUpcomingEvents(lookAheadHours: number): Promise<IEconomicEvent[]> {
    const cutoff = new Date(Date.now() + lookAheadHours * 3_600_000);
    const snap = await admin.firestore()
        .collection('economicEvents')
        .where('country', '==', 'US')
        .where('scheduledUtc', '>=', new Date())
        .where('scheduledUtc', '<=', cutoff)
        .orderBy('scheduledUtc', 'asc')
        .get();
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            eventType: data.eventType,
            name: data.name,
            country: data.country,
            impact: data.impact,
            scheduledUtc: data.scheduledUtc.toDate(),
            scheduledEtString: data.scheduledEtString,
            scheduledEestString: data.scheduledEestString,
            gatesLadderingPause: data.gatesLadderingPause,
            gatesPreEventClose: data.gatesPreEventClose,
            previousValue: data.previousValue ?? null,
            forecastValue: data.forecastValue ?? null,
            actualValue: data.actualValue ?? null,
            source: data.source,
            sourceUrl: data.sourceUrl,
            seededAt: data.seededAt?.toDate() ?? new Date(),
            seededBy: data.seededBy,
            verifiedAt: data.verifiedAt?.toDate() ?? null,
        } as IEconomicEvent;
    });
}

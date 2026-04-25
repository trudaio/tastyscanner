import type { Timestamp } from 'firebase/firestore';

export type EventType =
    | 'FOMC_DECISION'
    | 'FOMC_PRESS_CONF'
    | 'FOMC_MINUTES'
    | 'CPI'
    | 'PPI'
    | 'NFP'
    | 'GDP'
    | 'RETAIL_SALES'
    | 'ISM_MANUFACTURING'
    | 'ISM_SERVICES'
    | 'JOBLESS_CLAIMS'
    | 'CONSUMER_CONFIDENCE'
    | 'DURABLE_GOODS'
    | 'FED_SPEECH'
    | 'OTHER';

export type Impact = 'critical' | 'major' | 'medium' | 'low';

export type EventSource =
    | 'bls' | 'fed' | 'bea' | 'census' | 'ism' | 'conf_board' | 'dol' | 'manual';

export interface IEconomicEvent {
    id: string;
    eventType: EventType;
    name: string;
    country: string;
    impact: Impact;

    // Timing
    scheduledUtc: Date | Timestamp;     // Date in code, Timestamp from Firestore
    scheduledEtString: string;          // "08:30 ET"
    scheduledEestString: string;        // "15:30 EEST"

    // Gating flags
    gatesLadderingPause: boolean;
    gatesPreEventClose: boolean;

    // Release data
    previousValue: string | null;
    forecastValue: string | null;
    actualValue: string | null;

    // Provenance
    source: EventSource;
    sourceUrl: string;
    seededAt: Date | Timestamp;
    seededBy: string;
    verifiedAt: Date | Timestamp | null;
}

export interface IEconomicEventSeed {
    type: EventType;
    date: string;           // "2026-04-16"
    timeET: string;         // "08:30"
    period?: string;        // "March 2026"
    sourceUrl?: string;     // override default source URL
    hasPressConf?: boolean; // FOMC only
    speakerName?: string;   // FED_SPEECH only
}

export interface ISystemAlert {
    id: string;
    type: 'calendar_seed_low' | 'calendar_reconcile_mismatch' | 'calendar_fomc_reschedule';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    relatedEventId: string | null;
    createdAt: Date | Timestamp;
    acknowledgedAt: Date | Timestamp | null;
    acknowledgedBy: string | null;
}

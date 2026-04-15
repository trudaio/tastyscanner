// This file mirrors src/models/economic-event.model.ts.
// Functions cannot import from ../src — they compile independently.
// Keep these two files in sync.

export type EventType =
    | 'FOMC_DECISION' | 'FOMC_PRESS_CONF' | 'FOMC_MINUTES'
    | 'CPI' | 'PPI' | 'NFP' | 'GDP' | 'RETAIL_SALES'
    | 'ISM_MANUFACTURING' | 'ISM_SERVICES'
    | 'JOBLESS_CLAIMS' | 'CONSUMER_CONFIDENCE' | 'DURABLE_GOODS'
    | 'FED_SPEECH' | 'OTHER';

export type Impact = 'critical' | 'major' | 'medium' | 'low';

export type EventSource =
    | 'bls' | 'fed' | 'bea' | 'census' | 'ism' | 'conf_board' | 'dol' | 'manual';

export interface IEconomicEvent {
    id: string;
    eventType: EventType;
    name: string;
    country: string;
    impact: Impact;
    scheduledUtc: Date;              // functions use Date, not Timestamp
    scheduledEtString: string;
    scheduledEestString: string;
    gatesLadderingPause: boolean;
    gatesPreEventClose: boolean;
    previousValue: string | null;
    forecastValue: string | null;
    actualValue: string | null;
    source: EventSource;
    sourceUrl: string;
    seededAt: Date;
    seededBy: string;
    verifiedAt: Date | null;
}

export interface IEconomicEventSeed {
    type: EventType;
    date: string;
    timeET: string;
    period?: string;
    sourceUrl?: string;
    hasPressConf?: boolean;
    speakerName?: string;
}

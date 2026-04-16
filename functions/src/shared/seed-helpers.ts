import { DateTime } from 'luxon';
import type { EventType, Impact, IEconomicEvent, IEconomicEventSeed, EventSource } from './economic-event.types';

const IMPACT_MAP: Record<EventType, Impact> = {
    FOMC_DECISION: 'critical',
    FOMC_PRESS_CONF: 'critical',
    CPI: 'critical',
    NFP: 'critical',
    PPI: 'major',
    GDP: 'major',
    FOMC_MINUTES: 'medium',
    RETAIL_SALES: 'medium',
    ISM_MANUFACTURING: 'medium',
    ISM_SERVICES: 'medium',
    FED_SPEECH: 'medium',
    JOBLESS_CLAIMS: 'low',
    CONSUMER_CONFIDENCE: 'low',
    DURABLE_GOODS: 'low',
    OTHER: 'low',
};

const SOURCE_MAP: Record<EventType, EventSource> = {
    FOMC_DECISION: 'fed',
    FOMC_PRESS_CONF: 'fed',
    FOMC_MINUTES: 'fed',
    FED_SPEECH: 'fed',
    CPI: 'bls',
    PPI: 'bls',
    NFP: 'bls',
    JOBLESS_CLAIMS: 'dol',
    GDP: 'bea',
    RETAIL_SALES: 'census',
    DURABLE_GOODS: 'census',
    ISM_MANUFACTURING: 'ism',
    ISM_SERVICES: 'ism',
    CONSUMER_CONFIDENCE: 'conf_board',
    OTHER: 'manual',
};

const DEFAULT_SOURCE_URLS: Record<EventType, string> = {
    FOMC_DECISION: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FOMC_PRESS_CONF: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FOMC_MINUTES: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    FED_SPEECH: 'https://www.federalreserve.gov/newsevents/speeches.htm',
    CPI: 'https://www.bls.gov/schedule/news_release/cpi.htm',
    PPI: 'https://www.bls.gov/schedule/news_release/ppi.htm',
    NFP: 'https://www.bls.gov/schedule/news_release/empsit.htm',
    JOBLESS_CLAIMS: 'https://www.dol.gov/ui/data.pdf',
    GDP: 'https://www.bea.gov/news/schedule',
    RETAIL_SALES: 'https://www.census.gov/retail',
    DURABLE_GOODS: 'https://www.census.gov/manufacturing/m3/',
    ISM_MANUFACTURING: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    ISM_SERVICES: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    CONSUMER_CONFIDENCE: 'https://www.conference-board.org/topics/consumer-confidence',
    OTHER: '',
};

const NAME_PREFIX: Record<EventType, string> = {
    FOMC_DECISION: 'FOMC Decision',
    FOMC_PRESS_CONF: 'FOMC Press Conference',
    FOMC_MINUTES: 'FOMC Minutes',
    FED_SPEECH: 'Fed Speech',
    CPI: 'CPI',
    PPI: 'PPI',
    NFP: 'NFP',
    JOBLESS_CLAIMS: 'Jobless Claims',
    GDP: 'GDP',
    RETAIL_SALES: 'Retail Sales',
    DURABLE_GOODS: 'Durable Goods',
    ISM_MANUFACTURING: 'ISM Manufacturing PMI',
    ISM_SERVICES: 'ISM Services PMI',
    CONSUMER_CONFIDENCE: 'Consumer Confidence',
    OTHER: 'Event',
};

export function eventTypeToImpact(type: EventType): Impact {
    return IMPACT_MAP[type];
}

export function computeDeterministicId(seed: IEconomicEventSeed): string {
    const timeDigits = seed.timeET.replace(':', '');
    return `${seed.date}-${seed.type.toLowerCase()}-${timeDigits}`;
}

export function expandSeed(seed: IEconomicEventSeed, seededBy: string): IEconomicEvent {
    const impact = eventTypeToImpact(seed.type);
    const gates = impact === 'critical' || impact === 'major';

    // Parse ET time → UTC via luxon (handles DST)
    const etDateTime = DateTime.fromFormat(
        `${seed.date} ${seed.timeET}`,
        'yyyy-MM-dd HH:mm',
        { zone: 'America/New_York' }
    );
    const scheduledUtc = etDateTime.toUTC().toJSDate();

    // Format EEST string (Europe/Bucharest)
    const eestDateTime = etDateTime.setZone('Europe/Bucharest');
    const scheduledEestString = eestDateTime.toFormat('HH:mm') + ' EEST';

    // Name: prefix + (period) OR prefix + (date) for FOMC-like events
    const namePrefix = NAME_PREFIX[seed.type];
    const name = seed.period
        ? `${namePrefix} (${seed.period})`
        : `${namePrefix} (${seed.date})`;

    return {
        id: computeDeterministicId(seed),
        eventType: seed.type,
        name,
        country: 'US',
        impact,
        scheduledUtc,
        scheduledEtString: `${seed.timeET} ET`,
        scheduledEestString,
        gatesLadderingPause: gates,
        gatesPreEventClose: gates,
        previousValue: null,
        forecastValue: null,
        actualValue: null,
        source: SOURCE_MAP[seed.type],
        sourceUrl: seed.sourceUrl || DEFAULT_SOURCE_URLS[seed.type],
        seededAt: new Date(),
        seededBy,
        verifiedAt: null,
    };
}

import type { IEconomicEventSeed } from '../shared/economic-event.types';

/**
 * 2026 US economic calendar seed.
 * Sources:
 *   FOMC:   federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   CPI:    bls.gov/schedule/news_release/cpi.htm
 *   PPI:    bls.gov/schedule/news_release/ppi.htm
 *   NFP:    bls.gov/schedule/news_release/empsit.htm
 *   GDP:    bea.gov/news/schedule
 *   ISM:    ismworld.org
 *
 * VERIFIED: 2026-04-15 (re-verify before seeding if > 30 days elapsed).
 *
 * NOTE: Dates are representative placeholders based on typical schedule
 * patterns. Before production seeding, cross-verify each against the
 * official source URL. Errors in this file = incorrect gating = money risk.
 */
export const EVENTS_2026_US: IEconomicEventSeed[] = [
    // === FOMC MEETINGS (8/year; press conferences on alternating meetings) ===
    { type: 'FOMC_DECISION', date: '2026-01-28', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-01-28', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-03-18', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-03-18', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-04-29', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-06-17', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-06-17', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-07-29', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-09-16', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-09-16', timeET: '14:30' },
    { type: 'FOMC_DECISION', date: '2026-10-28', timeET: '14:00' },
    { type: 'FOMC_DECISION', date: '2026-12-16', timeET: '14:00' },
    { type: 'FOMC_PRESS_CONF', date: '2026-12-16', timeET: '14:30' },

    // === FOMC MINUTES (3 weeks after each meeting) ===
    { type: 'FOMC_MINUTES', date: '2026-02-18', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-04-08', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-05-20', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-07-08', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-08-19', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-10-07', timeET: '14:00' },
    { type: 'FOMC_MINUTES', date: '2026-11-18', timeET: '14:00' },

    // === CPI (monthly, ~mid-month, 08:30 ET) ===
    { type: 'CPI', date: '2026-01-14', timeET: '08:30', period: 'December 2025' },
    { type: 'CPI', date: '2026-02-11', timeET: '08:30', period: 'January 2026' },
    { type: 'CPI', date: '2026-03-11', timeET: '08:30', period: 'February 2026' },
    { type: 'CPI', date: '2026-04-14', timeET: '08:30', period: 'March 2026' },
    { type: 'CPI', date: '2026-05-13', timeET: '08:30', period: 'April 2026' },
    { type: 'CPI', date: '2026-06-10', timeET: '08:30', period: 'May 2026' },
    { type: 'CPI', date: '2026-07-14', timeET: '08:30', period: 'June 2026' },
    { type: 'CPI', date: '2026-08-12', timeET: '08:30', period: 'July 2026' },
    { type: 'CPI', date: '2026-09-10', timeET: '08:30', period: 'August 2026' },
    { type: 'CPI', date: '2026-10-14', timeET: '08:30', period: 'September 2026' },
    { type: 'CPI', date: '2026-11-12', timeET: '08:30', period: 'October 2026' },
    { type: 'CPI', date: '2026-12-10', timeET: '08:30', period: 'November 2026' },

    // === PPI (monthly, ~mid-month, 08:30 ET) ===
    { type: 'PPI', date: '2026-01-15', timeET: '08:30', period: 'December 2025' },
    { type: 'PPI', date: '2026-02-12', timeET: '08:30', period: 'January 2026' },
    { type: 'PPI', date: '2026-03-12', timeET: '08:30', period: 'February 2026' },
    { type: 'PPI', date: '2026-04-15', timeET: '08:30', period: 'March 2026' },
    { type: 'PPI', date: '2026-05-14', timeET: '08:30', period: 'April 2026' },
    { type: 'PPI', date: '2026-06-11', timeET: '08:30', period: 'May 2026' },
    { type: 'PPI', date: '2026-07-15', timeET: '08:30', period: 'June 2026' },
    { type: 'PPI', date: '2026-08-13', timeET: '08:30', period: 'July 2026' },
    { type: 'PPI', date: '2026-09-11', timeET: '08:30', period: 'August 2026' },
    { type: 'PPI', date: '2026-10-15', timeET: '08:30', period: 'September 2026' },
    { type: 'PPI', date: '2026-11-13', timeET: '08:30', period: 'October 2026' },
    { type: 'PPI', date: '2026-12-11', timeET: '08:30', period: 'November 2026' },

    // === NFP / Employment Situation (1st Friday of month, 08:30 ET) ===
    { type: 'NFP', date: '2026-01-09', timeET: '08:30', period: 'December 2025' },
    { type: 'NFP', date: '2026-02-06', timeET: '08:30', period: 'January 2026' },
    { type: 'NFP', date: '2026-03-06', timeET: '08:30', period: 'February 2026' },
    { type: 'NFP', date: '2026-04-03', timeET: '08:30', period: 'March 2026' },
    { type: 'NFP', date: '2026-05-01', timeET: '08:30', period: 'April 2026' },
    { type: 'NFP', date: '2026-06-05', timeET: '08:30', period: 'May 2026' },
    { type: 'NFP', date: '2026-07-02', timeET: '08:30', period: 'June 2026' },
    { type: 'NFP', date: '2026-08-07', timeET: '08:30', period: 'July 2026' },
    { type: 'NFP', date: '2026-09-04', timeET: '08:30', period: 'August 2026' },
    { type: 'NFP', date: '2026-10-02', timeET: '08:30', period: 'September 2026' },
    { type: 'NFP', date: '2026-11-06', timeET: '08:30', period: 'October 2026' },
    { type: 'NFP', date: '2026-12-04', timeET: '08:30', period: 'November 2026' },

    // === GDP (quarterly estimates: advance + 2nd + 3rd) ===
    { type: 'GDP', date: '2026-01-29', timeET: '08:30', period: 'Q4 2025 advance' },
    { type: 'GDP', date: '2026-02-26', timeET: '08:30', period: 'Q4 2025 second' },
    { type: 'GDP', date: '2026-03-26', timeET: '08:30', period: 'Q4 2025 third' },
    { type: 'GDP', date: '2026-04-30', timeET: '08:30', period: 'Q1 2026 advance' },
    { type: 'GDP', date: '2026-05-28', timeET: '08:30', period: 'Q1 2026 second' },
    { type: 'GDP', date: '2026-06-25', timeET: '08:30', period: 'Q1 2026 third' },
    { type: 'GDP', date: '2026-07-30', timeET: '08:30', period: 'Q2 2026 advance' },
    { type: 'GDP', date: '2026-08-27', timeET: '08:30', period: 'Q2 2026 second' },
    { type: 'GDP', date: '2026-09-24', timeET: '08:30', period: 'Q2 2026 third' },
    { type: 'GDP', date: '2026-10-29', timeET: '08:30', period: 'Q3 2026 advance' },
    { type: 'GDP', date: '2026-11-25', timeET: '08:30', period: 'Q3 2026 second' },
    { type: 'GDP', date: '2026-12-22', timeET: '08:30', period: 'Q3 2026 third' },

    // === Retail Sales (monthly, ~mid-month, 08:30 ET) ===
    { type: 'RETAIL_SALES', date: '2026-01-16', timeET: '08:30', period: 'December 2025' },
    { type: 'RETAIL_SALES', date: '2026-02-17', timeET: '08:30', period: 'January 2026' },
    { type: 'RETAIL_SALES', date: '2026-03-16', timeET: '08:30', period: 'February 2026' },
    { type: 'RETAIL_SALES', date: '2026-04-16', timeET: '08:30', period: 'March 2026' },
    { type: 'RETAIL_SALES', date: '2026-05-15', timeET: '08:30', period: 'April 2026' },
    { type: 'RETAIL_SALES', date: '2026-06-16', timeET: '08:30', period: 'May 2026' },
    { type: 'RETAIL_SALES', date: '2026-07-16', timeET: '08:30', period: 'June 2026' },
    { type: 'RETAIL_SALES', date: '2026-08-14', timeET: '08:30', period: 'July 2026' },
    { type: 'RETAIL_SALES', date: '2026-09-15', timeET: '08:30', period: 'August 2026' },
    { type: 'RETAIL_SALES', date: '2026-10-16', timeET: '08:30', period: 'September 2026' },
    { type: 'RETAIL_SALES', date: '2026-11-17', timeET: '08:30', period: 'October 2026' },
    { type: 'RETAIL_SALES', date: '2026-12-16', timeET: '08:30', period: 'November 2026' },

    // === ISM Manufacturing PMI (1st business day, 10:00 ET) ===
    { type: 'ISM_MANUFACTURING', date: '2026-01-02', timeET: '10:00', period: 'December 2025' },
    { type: 'ISM_MANUFACTURING', date: '2026-02-02', timeET: '10:00', period: 'January 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-03-02', timeET: '10:00', period: 'February 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-04-01', timeET: '10:00', period: 'March 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-05-01', timeET: '10:00', period: 'April 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-06-01', timeET: '10:00', period: 'May 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-07-01', timeET: '10:00', period: 'June 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-08-03', timeET: '10:00', period: 'July 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-09-01', timeET: '10:00', period: 'August 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-10-01', timeET: '10:00', period: 'September 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-11-02', timeET: '10:00', period: 'October 2026' },
    { type: 'ISM_MANUFACTURING', date: '2026-12-01', timeET: '10:00', period: 'November 2026' },

    // === ISM Services PMI (3rd business day, 10:00 ET) ===
    { type: 'ISM_SERVICES', date: '2026-01-06', timeET: '10:00', period: 'December 2025' },
    { type: 'ISM_SERVICES', date: '2026-02-04', timeET: '10:00', period: 'January 2026' },
    { type: 'ISM_SERVICES', date: '2026-03-04', timeET: '10:00', period: 'February 2026' },
    { type: 'ISM_SERVICES', date: '2026-04-03', timeET: '10:00', period: 'March 2026' },
    { type: 'ISM_SERVICES', date: '2026-05-05', timeET: '10:00', period: 'April 2026' },
    { type: 'ISM_SERVICES', date: '2026-06-03', timeET: '10:00', period: 'May 2026' },
    { type: 'ISM_SERVICES', date: '2026-07-06', timeET: '10:00', period: 'June 2026' },
    { type: 'ISM_SERVICES', date: '2026-08-05', timeET: '10:00', period: 'July 2026' },
    { type: 'ISM_SERVICES', date: '2026-09-03', timeET: '10:00', period: 'August 2026' },
    { type: 'ISM_SERVICES', date: '2026-10-05', timeET: '10:00', period: 'September 2026' },
    { type: 'ISM_SERVICES', date: '2026-11-04', timeET: '10:00', period: 'October 2026' },
    { type: 'ISM_SERVICES', date: '2026-12-03', timeET: '10:00', period: 'November 2026' },
];

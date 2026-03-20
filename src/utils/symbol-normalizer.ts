/**
 * Broker-agnostic symbol normalization utilities.
 *
 * Each broker uses its own symbol format. This module parses broker-specific
 * formats into a canonical internal representation so higher-level services
 * (analytics, P&L) are decoupled from broker quirks.
 */

export interface IParsedOptionSymbol {
    /** Normalized underlying (e.g. "SPX" instead of "SPXW") */
    underlying: string;
    /** ISO date string: "YYYY-MM-DD" */
    expirationDate: string;
    optionType: 'C' | 'P';
    strikePrice: number;
}

/** Maps weekly/variant underlyings to their canonical form. */
const UNDERLYING_MAP: Record<string, string> = {
    SPXW: 'SPX',
};

export function normalizeUnderlying(raw: string): string {
    const trimmed = raw.trim().toUpperCase();
    return UNDERLYING_MAP[trimmed] ?? trimmed;
}

/**
 * Parse a TastyTrade option symbol.
 * Format: `UNDERLYING  YYMMDDCP00STRIKE000`
 * Examples:
 *   `SPY   260212P00580000` → { underlying: 'SPY', expirationDate: '2026-02-12', optionType: 'P', strikePrice: 580 }
 *   `SPXW  260219C05850000` → { underlying: 'SPX', expirationDate: '2026-02-19', optionType: 'C', strikePrice: 5850 }
 */
export function parseTastyTradeSymbol(symbol: string): IParsedOptionSymbol | null {
    const match = symbol.match(/^(\w+)\s*(\d{6})([CP])(\d+)$/);
    if (!match) return null;

    const [, rawUnderlying, dateStr, optionType, strikeStr] = match;
    const year = '20' + dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);

    return {
        underlying: normalizeUnderlying(rawUnderlying),
        expirationDate: `${year}-${month}-${day}`,
        optionType: optionType as 'C' | 'P',
        strikePrice: parseFloat(strikeStr) / 1000,
    };
}

/**
 * Parse a dxFeed / DxLink streamer symbol.
 * Format: `.UNDERLYING YYMMDDCP STRIKE`
 * Example: `.QQQ260227C665` → { underlying: 'QQQ', expirationDate: '2026-02-27', optionType: 'C', strikePrice: 665 }
 */
export function parseDxFeedSymbol(symbol: string): IParsedOptionSymbol | null {
    // Remove leading dot
    const raw = symbol.startsWith('.') ? symbol.slice(1) : symbol;
    const match = raw.match(/^([A-Z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/i);
    if (!match) return null;

    const [, rawUnderlying, dateStr, optionType, strikeStr] = match;
    const year = '20' + dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);

    return {
        underlying: normalizeUnderlying(rawUnderlying),
        expirationDate: `${year}-${month}-${day}`,
        optionType: optionType.toUpperCase() as 'C' | 'P',
        strikePrice: parseFloat(strikeStr),
    };
}

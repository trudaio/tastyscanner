import { Router, Request, Response } from 'express';
import { tastyClient, PositionData } from '../client.js';

export const positionsRouter = Router();

/**
 * GET /api/positions
 * Returns all open option positions, grouped by underlying symbol.
 */
positionsRouter.get('/', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const positions = await tastyClient.getPositions();

            // Group by underlying
            const grouped = new Map<string, PositionData[]>();
            for (const pos of positions) {
                if (!grouped.has(pos.underlyingSymbol)) grouped.set(pos.underlyingSymbol, []);
                grouped.get(pos.underlyingSymbol)!.push(pos);
            }

            const result = Array.from(grouped.entries()).map(([underlying, legs]) => ({
                underlying,
                legs: legs.map(leg => ({
                    symbol: leg.symbol,
                    streamer_symbol: leg.streamerSymbol,
                    quantity: leg.quantity,
                    direction: leg.quantityDirection,
                    strike_price: leg.strikePrice,
                    option_type: leg.optionType,
                    expiration_date: leg.expirationDate,
                    dte: calcDTE(leg.expirationDate),
                })),
            }));

            res.json({
                account_number: tastyClient.accountNumber,
                total_positions: positions.length,
                underlyings: result.length,
                positions: result,
            });
        } catch (err) {
            console.error('[Route /positions]', err);
            res.status(500).json({ error: 'Failed to fetch positions', details: String(err) });
        }
    })();
});

/**
 * GET /api/positions/greeks
 * Returns portfolio-level Greeks (delta, theta, gamma, vega).
 * NOTE: DxLink WebSocket streaming is not available in REST-only mode (Node.js 22 compatible).
 * All greek values are 0. A streaming upgrade path can be added later via a separate process.
 */
positionsRouter.get('/greeks', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const positions = await tastyClient.getPositions();

            res.json({
                account_number: tastyClient.accountNumber,
                streaming_available: false,
                note: 'DxLink WebSocket streaming disabled — REST-only mode for Node.js 22 compatibility. Greeks are all 0.',
                delta: 0,
                theta: 0,
                gamma: 0,
                vega: 0,
                positions_with_greeks: 0,
                total_positions: positions.length,
            });
        } catch (err) {
            console.error('[Route /positions/greeks]', err);
            res.status(500).json({ error: 'Failed to fetch portfolio greeks', details: String(err) });
        }
    })();
});

function calcDTE(expirationDate: string): number {
    if (!expirationDate) return 0;
    const exp = new Date(expirationDate + 'T21:00:00Z'); // ~4pm ET close
    return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
}

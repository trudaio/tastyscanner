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
 * Returns portfolio-level Greeks (delta, theta, gamma, vega) aggregated across all open positions.
 * Requires DxLink WebSocket data — waits up to 6s for initial stream.
 */
positionsRouter.get('/greeks', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const positions = await tastyClient.getPositions();

            if (positions.length === 0) {
                res.json({
                    account_number: tastyClient.accountNumber,
                    delta: 0, theta: 0, gamma: 0, vega: 0,
                    positions_with_greeks: 0,
                    total_positions: 0,
                });
                return;
            }

            // CRITICAL: Use streamer-symbol (dxFeed format) for WebSocket subscriptions
            const symbols = positions.map(p => p.streamerSymbol);
            await tastyClient.subscribeAndWaitForGreeks(symbols, 6000);

            let totalDelta = 0, totalTheta = 0, totalGamma = 0, totalVega = 0;
            let positionsWithGreeks = 0;

            for (const pos of positions) {
                const g = tastyClient.greeks[pos.streamerSymbol];
                if (!g) continue;

                // quantityDirection is "Long" | "Short" string — NEVER parseFloat()
                const dir = pos.quantityDirection === 'Short' ? -1 : 1;
                const multiplier = pos.quantity * dir * 100; // options contract multiplier

                totalDelta += (g.delta ?? 0) * multiplier;
                totalTheta += (g.theta ?? 0) * multiplier;
                totalGamma += (g.gamma ?? 0) * multiplier;
                totalVega += (g.vega ?? 0) * multiplier;
                positionsWithGreeks++;
            }

            res.json({
                account_number: tastyClient.accountNumber,
                delta: parseFloat(totalDelta.toFixed(2)),
                theta: parseFloat(totalTheta.toFixed(2)),
                gamma: parseFloat(totalGamma.toFixed(4)),
                vega: parseFloat(totalVega.toFixed(2)),
                positions_with_greeks: positionsWithGreeks,
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

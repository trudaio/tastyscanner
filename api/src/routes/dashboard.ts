/**
 * Trading Dashboard — ported from TradingDashboardService (no MobX/Firebase)
 *
 * Logic mirrors src/services/trading-dashboard/trading-dashboard.service.ts
 */
import { Router, Request, Response } from 'express';
import { tastyClient, TransactionData } from '../client.js';

export const dashboardRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerPL {
    ticker: string;
    realized_gain: number;
    commissions: number;
    fees: number;
    pl_ytd_with_fees: number;
    trades_count: number;
    winners_count: number;
    losers_count: number;
    win_rate: number;
}

interface NetLiqPoint {
    date: string;
    cumulative_pl: number;
    day_pl: number;
}

// ─── Logic ────────────────────────────────────────────────────────────────────

function extractUnderlying(symbol: string): string {
    if (!symbol) return '';
    const m = symbol.match(/^([A-Z/]+)/);
    return m ? m[1].replace('/', '') : symbol;
}

function calcDashboard(transactions: TransactionData[], startDate: Date, endDate: Date) {
    const tickerData = new Map<string, {
        realizedGain: number;
        commissions: number;
        fees: number;
        tradesCount: number;
        winnersCount: number;
        losersCount: number;
    }>();

    const dailyPL = new Map<string, number>();

    for (const tx of transactions) {
        if (tx['transaction-type'] !== 'Trade') continue;

        const underlying = tx['underlying-symbol'] || extractUnderlying(tx['symbol']);
        if (!underlying) continue;

        if (!tickerData.has(underlying)) {
            tickerData.set(underlying, { realizedGain: 0, commissions: 0, fees: 0, tradesCount: 0, winnersCount: 0, losersCount: 0 });
        }
        const data = tickerData.get(underlying)!;

        const clearingFees = parseFloat(tx['clearing-fees'] ?? '0') || 0;
        const regulatoryFees = parseFloat(tx['regulatory-fees'] ?? '0') || 0;
        const indexOptionFees = parseFloat(tx['proprietary-index-option-fees'] ?? '0') || 0;
        const commission = parseFloat(tx['commission'] ?? '0') || 0;

        data.fees += clearingFees + regulatoryFees + indexOptionFees;
        data.commissions += commission;

        const value = parseFloat(tx['value'] ?? '0');
        const effect = tx['value-effect'];
        const signedValue = effect === 'Credit' ? value : -value;
        const dateKey = tx['executed-at'].split('T')[0];

        data.realizedGain += signedValue;
        data.tradesCount++;

        if (signedValue > 0) data.winnersCount++;
        else if (signedValue < 0) data.losersCount++;

        dailyPL.set(dateKey, (dailyPL.get(dateKey) ?? 0) + signedValue);
    }

    // Aggregate
    let totalRealizedGain = 0;
    let totalCommissions = 0;
    let totalFees = 0;
    let totalTrades = 0;
    let totalWinners = 0;
    let totalLosers = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let largestWin = 0;
    let largestLoss = 0;
    const plByTicker: TickerPL[] = [];

    for (const [ticker, data] of tickerData) {
        totalRealizedGain += data.realizedGain;
        totalCommissions += data.commissions;
        totalFees += data.fees;
        totalTrades += data.tradesCount;
        totalWinners += data.winnersCount;
        totalLosers += data.losersCount;

        // Track wins/losses for profit factor
        if (data.realizedGain > 0) totalWins += data.realizedGain;
        else totalLosses += Math.abs(data.realizedGain);

        if (data.realizedGain > largestWin) largestWin = data.realizedGain;
        if (data.realizedGain < largestLoss) largestLoss = data.realizedGain;

        const yearGain = data.realizedGain;
        const plYTDWithFees = yearGain + data.commissions + data.fees;

        plByTicker.push({
            ticker,
            realized_gain: parseFloat(data.realizedGain.toFixed(2)),
            commissions: parseFloat(data.commissions.toFixed(2)),
            fees: parseFloat(data.fees.toFixed(2)),
            pl_ytd_with_fees: parseFloat(plYTDWithFees.toFixed(2)),
            trades_count: data.tradesCount,
            winners_count: data.winnersCount,
            losers_count: data.losersCount,
            win_rate: parseFloat(
                (data.tradesCount > 0 ? (data.winnersCount / data.tradesCount) * 100 : 0).toFixed(1)
            ),
        });
    }

    plByTicker.sort((a, b) => b.realized_gain - a.realized_gain);

    // Net liquidity history (cumulative P&L as proxy)
    const sortedDates = Array.from(dailyPL.keys()).sort();
    let cumulativePL = 0;
    const netLiqHistory: NetLiqPoint[] = [
        { date: startDate.toISOString().split('T')[0], cumulative_pl: 0, day_pl: 0 },
    ];
    for (const dateKey of sortedDates) {
        const dayPL = dailyPL.get(dateKey) ?? 0;
        cumulativePL += dayPL;
        netLiqHistory.push({
            date: dateKey,
            cumulative_pl: parseFloat(cumulativePL.toFixed(2)),
            day_pl: parseFloat(dayPL.toFixed(2)),
        });
    }
    const lastDate = netLiqHistory[netLiqHistory.length - 1];
    if (lastDate && lastDate.date < endDate.toISOString().split('T')[0]) {
        netLiqHistory.push({
            date: endDate.toISOString().split('T')[0],
            cumulative_pl: parseFloat(cumulativePL.toFixed(2)),
            day_pl: 0,
        });
    }

    return {
        total_trades: totalTrades,
        winners_count: totalWinners,
        losers_count: totalLosers,
        win_rate: parseFloat((totalTrades > 0 ? (totalWinners / totalTrades) * 100 : 0).toFixed(1)),
        realized_gain: parseFloat(totalRealizedGain.toFixed(2)),
        commissions: parseFloat(totalCommissions.toFixed(2)),
        fees: parseFloat(totalFees.toFixed(2)),
        pl_ytd_with_fees: parseFloat((totalRealizedGain + totalCommissions + totalFees).toFixed(2)),
        avg_win: parseFloat((totalWinners > 0 ? totalWins / totalWinners : 0).toFixed(2)),
        avg_loss: parseFloat((totalLosers > 0 ? -totalLosses / totalLosers : 0).toFixed(2)),
        largest_win: parseFloat(largestWin.toFixed(2)),
        largest_loss: parseFloat(largestLoss.toFixed(2)),
        profit_factor: parseFloat((totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0).toFixed(2)),
        pl_by_ticker: plByTicker,
        net_liq_history: netLiqHistory,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
    };
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard
 * Returns everything shown on the Dashboard: P&L summary, net liquidity history,
 * open position summary, profit by ticker.
 *
 * Query params:
 *   start_date  (YYYY-MM-DD, default: Jan 1 current year)
 *   end_date    (YYYY-MM-DD, default: today)
 */
dashboardRouter.get('/dashboard', (req: Request, res: Response): void => {
    void (async () => {
        try {
            const now = new Date();
            const startDate = req.query['start_date']
                ? new Date(String(req.query['start_date']))
                : new Date(now.getFullYear(), 0, 1);
            const endDate = req.query['end_date']
                ? new Date(String(req.query['end_date']))
                : now;

            // Fetch all data in parallel
            const [positions, balances, transactions] = await Promise.all([
                tastyClient.getPositions(),
                tastyClient.getAccountBalances(),
                tastyClient.getAllTransactions(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                ),
            ]);

            const dashData = calcDashboard(transactions, startDate, endDate);

            // Subscribe to open positions for live greeks
            const symbols = positions.map(p => p.streamerSymbol);
            if (symbols.length > 0) {
                await tastyClient.subscribeAndWaitForGreeks(symbols, 4000);
            }

            // Aggregate portfolio greeks
            let totalDelta = 0, totalTheta = 0, totalGamma = 0, totalVega = 0;
            for (const pos of positions) {
                const g = tastyClient.greeks[pos.streamerSymbol];
                if (!g) continue;
                const dir = pos.quantityDirection === 'Short' ? -1 : 1;
                const mult = pos.quantity * dir * 100;
                totalDelta += (g.delta ?? 0) * mult;
                totalTheta += (g.theta ?? 0) * mult;
                totalGamma += (g.gamma ?? 0) * mult;
                totalVega += (g.vega ?? 0) * mult;
            }

            // Group positions by underlying
            const grouped = new Map<string, typeof positions>();
            for (const p of positions) {
                if (!grouped.has(p.underlyingSymbol)) grouped.set(p.underlyingSymbol, []);
                grouped.get(p.underlyingSymbol)!.push(p);
            }

            res.json({
                account_number: tastyClient.accountNumber,
                account: {
                    net_liquidating_value: parseFloat(balances.netLiquidity.toFixed(2)),
                    buying_power: parseFloat(balances.optionBuyingPower.toFixed(2)),
                    cash_balance: parseFloat(balances.cashBalance.toFixed(2)),
                },
                portfolio_greeks: {
                    delta: parseFloat(totalDelta.toFixed(2)),
                    theta: parseFloat(totalTheta.toFixed(2)),
                    gamma: parseFloat(totalGamma.toFixed(4)),
                    vega: parseFloat(totalVega.toFixed(2)),
                },
                open_positions: {
                    total_legs: positions.length,
                    underlyings: grouped.size,
                    positions: Array.from(grouped.entries()).map(([und, legs]) => ({
                        underlying: und,
                        leg_count: legs.length,
                    })),
                },
                performance: dashData,
            });
        } catch (err) {
            console.error('[Route /dashboard]', err);
            res.status(500).json({ error: 'Failed to fetch dashboard', details: String(err) });
        }
    })();
});

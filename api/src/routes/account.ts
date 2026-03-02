import { Router, Request, Response } from 'express';
import { tastyClient } from '../client.js';

export const accountRouter = Router();

/**
 * GET /api/account-summary
 * Returns account balances: net_liquidating_value, buying_power, cash_balance, account_number
 */
accountRouter.get('/account-summary', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const balances = await tastyClient.getAccountBalances();
            res.json({
                account_number: tastyClient.accountNumber,
                net_liquidating_value: parseFloat(balances.netLiquidity.toFixed(2)),
                buying_power: parseFloat(balances.optionBuyingPower.toFixed(2)),
                stock_buying_power: parseFloat(balances.stockBuyingPower.toFixed(2)),
                cash_balance: parseFloat(balances.cashBalance.toFixed(2)),
                pending_cash: parseFloat(balances.pendingCash.toFixed(2)),
                day_trading_buying_power: parseFloat(balances.dayTradingBuyingPower.toFixed(2)),
                maintenance_requirement: parseFloat(balances.maintenanceRequirement.toFixed(2)),
            });
        } catch (err) {
            console.error('[Route /account-summary]', err);
            res.status(500).json({ error: 'Failed to fetch account summary', details: String(err) });
        }
    })();
});

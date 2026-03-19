import { Router, Request, Response } from 'express';
import { tastyClient } from '../client.js';

export const transactionsRouter = Router();

/**
 * GET /api/transactions/today
 * Returns today's trades with realized P&L.
 */
transactionsRouter.get('/today', (_req: Request, res: Response): void => {
    void (async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const transactions = await tastyClient.getTransactions({ 'start-date': today });

            const tradeTx = transactions.filter(tx => tx['transaction-type'] === 'Trade');

            let realizedPL = 0;
            let totalCredit = 0;
            let totalDebit = 0;

            const processed = tradeTx.map(tx => {
                const value = parseFloat(tx['value'] ?? '0');
                const effect = tx['value-effect'];
                const signedValue = effect === 'Credit' ? value : -value;

                const fees =
                    parseFloat(tx['clearing-fees'] ?? '0') +
                    parseFloat(tx['regulatory-fees'] ?? '0') +
                    parseFloat(tx['proprietary-index-option-fees'] ?? '0') +
                    parseFloat(tx['commission'] ?? '0');

                const action = tx['transaction-sub-type'] || tx['action'];
                const isClosing = action.includes('Close');
                const isOpening = action.includes('Open');

                if (isClosing) realizedPL += signedValue;
                if (effect === 'Credit') totalCredit += value;
                else if (effect === 'Debit') totalDebit += value;

                return {
                    id: tx['id'],
                    executed_at: tx['executed-at'],
                    action,
                    symbol: tx['symbol'],
                    underlying: tx['underlying-symbol'],
                    quantity: parseInt(tx['quantity'] ?? '1'),
                    price: parseFloat(tx['price'] ?? '0').toFixed(2),
                    value: signedValue.toFixed(2),
                    value_effect: effect,
                    fees: fees.toFixed(2),
                    is_opening: isOpening,
                    is_closing: isClosing,
                };
            });

            res.json({
                date: today,
                realized_pl: parseFloat(realizedPL.toFixed(2)),
                total_credit: parseFloat(totalCredit.toFixed(2)),
                total_debit: parseFloat(totalDebit.toFixed(2)),
                trade_count: processed.length,
                transactions: processed,
            });
        } catch (err) {
            console.error('[Route /transactions/today]', err);
            res.status(500).json({ error: 'Failed to fetch today transactions', details: String(err) });
        }
    })();
});

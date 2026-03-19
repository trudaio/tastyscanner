/**
 * TastyScanner API Server — Express + TypeScript
 *
 * Run: cd api && npm run dev    (port 3001)
 * Docs: See README.md or GET /health for endpoint list
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { tastyClient } from './client.js';
import { authMiddleware } from './middleware/auth.js';
import { accountRouter } from './routes/account.js';
import { positionsRouter } from './routes/positions.js';
import { ironCondorsRouter } from './routes/iron-condors.js';
import { transactionsRouter } from './routes/transactions.js';
import { analyticsRouter } from './routes/analytics.js';
import { dashboardRouter } from './routes/dashboard.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allows frontend (localhost:5173), Discord bots, and CT101 to call the API
const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173,http://localhost:3000').split(',');

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (Postman, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    },
    methods: ['GET'],
    allowedHeaders: ['X-API-Key', 'Content-Type'],
}));

app.use(express.json());

// ─── Health check (no auth) ───────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        account: tastyClient.accountNumber || 'not initialized',
        uptime_s: Math.floor(process.uptime()),
        endpoints: [
            'GET /health',
            'GET /api/account-summary',
            'GET /api/positions',
            'GET /api/positions/greeks',
            'GET /api/iron-condors',
            'GET /api/transactions/today',
            'GET /api/analytics/summary',
            'GET /api/dashboard',
            'GET /api/dashboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD',
        ],
    });
});

// ─── API routes (require X-API-Key header) ────────────────────────────────────
app.use('/api', authMiddleware);
app.use('/api', accountRouter);
app.use('/api/positions', positionsRouter);
app.use('/api', ironCondorsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api', analyticsRouter);
app.use('/api', dashboardRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found — check GET /health for available endpoints' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    console.log('[API] Starting TastyScanner API...');

    try {
        await tastyClient.initialize();
    } catch (err) {
        console.error('[API] Failed to connect to TastyTrade:', err);
        console.error('[API] Check that TASTY_CLIENT_SECRET and TASTY_REFRESH_TOKEN are set in api/.env');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`\n[API] TastyScanner API running on http://localhost:${PORT}`);
        console.log('[API] Endpoints:');
        console.log(`  GET http://localhost:${PORT}/health`);
        console.log(`  GET http://localhost:${PORT}/api/account-summary`);
        console.log(`  GET http://localhost:${PORT}/api/positions`);
        console.log(`  GET http://localhost:${PORT}/api/positions/greeks`);
        console.log(`  GET http://localhost:${PORT}/api/iron-condors`);
        console.log(`  GET http://localhost:${PORT}/api/transactions/today`);
        console.log(`  GET http://localhost:${PORT}/api/analytics/summary`);
        console.log(`  GET http://localhost:${PORT}/api/dashboard`);
        console.log('\n[API] All /api/* requests require X-API-Key header\n');
    });
}

void main();

import { Request, Response, NextFunction } from 'express';

/**
 * API Key middleware — checks the X-API-Key header.
 * In production, fails closed if API_KEY is not set.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const expectedKey = process.env.API_KEY;

    if (!expectedKey) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[Auth] FATAL: API_KEY not set in production — rejecting all requests');
            res.status(503).json({ error: 'Service unavailable' });
            return;
        }
        // Open mode — only in dev
        console.warn('[Auth] API_KEY not set — running in open mode (dev only)');
        next();
        return;
    }

    const provided = req.headers['x-api-key'];
    if (provided !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    next();
}

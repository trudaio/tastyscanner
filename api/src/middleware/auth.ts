import { Request, Response, NextFunction } from 'express';

/**
 * API Key middleware — checks the X-API-Key header.
 * If API_KEY env var is not set, all requests pass (dev mode).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const expectedKey = process.env.API_KEY;

    if (!expectedKey) {
        // Open mode — useful during local dev before you set up an API key
        console.warn('[Auth] API_KEY not set — running in open mode');
        next();
        return;
    }

    const provided = req.headers['x-api-key'];
    if (provided !== expectedKey) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Provide a valid X-API-Key header',
        });
        return;
    }

    next();
}

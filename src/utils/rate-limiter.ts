/**
 * Token-bucket rate limiter for IBKR API (10 req/sec limit).
 * Queues requests exceeding the limit and drains them as capacity becomes available.
 */
export class RateLimiter {
    private _tokens: number;
    private _lastRefill: number;
    private _queue: Array<() => void> = [];
    private _drainTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly _maxTokens: number = 10,
        private readonly _refillIntervalMs: number = 1000,
    ) {
        this._tokens = _maxTokens;
        this._lastRefill = Date.now();
    }

    /**
     * Wraps an async function call with rate limiting.
     * If capacity is available, executes immediately. Otherwise queues until a slot opens.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        await this._acquire();
        return fn();
    }

    private _acquire(): Promise<void> {
        this._refill();
        if (this._tokens > 0) {
            this._tokens--;
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            this._queue.push(resolve);
            this._scheduleDrain();
        });
    }

    private _refill(): void {
        const now = Date.now();
        const elapsed = now - this._lastRefill;
        if (elapsed >= this._refillIntervalMs) {
            const intervals = Math.floor(elapsed / this._refillIntervalMs);
            this._tokens = Math.min(this._maxTokens, this._tokens + intervals * this._maxTokens);
            this._lastRefill += intervals * this._refillIntervalMs;
        }
    }

    private _scheduleDrain(): void {
        if (this._drainTimer) return;
        this._drainTimer = setTimeout(() => {
            this._drainTimer = null;
            this._refill();
            while (this._tokens > 0 && this._queue.length > 0) {
                this._tokens--;
                this._queue.shift()!();
            }
            if (this._queue.length > 0) {
                this._scheduleDrain();
            }
        }, this._refillIntervalMs);
    }
}

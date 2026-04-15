# Trade Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a 10-field snapshot (Δ, Θ, Γ, V, IV, IV Rank, VIX, underlying price, POP, DTE) at the moment any Iron Condor order is sent, persist it under `users/{uid}/tradeJournal/{tradeId}`, and surface 4 key fields plus a detail drawer in Guvid History.

**Architecture:** Single frontend service `TradeJournalService` writes to Firestore via the existing user-scoped client SDK. Triggers are the `IronCondorModel.sendOrder()` call (pending entry) and `PositionsService.loadPositions()` (promotion to confirmed, orphan after 24h). A backend twin under `functions/src/shared/trade-journal.ts` handles the Guvid Agent's autonomous send-order path. UI changes are additive in `guvid-history.component.tsx` (4 columns + row-click drawer).

**Tech Stack:** TypeScript strict, React 19 + Ionic 8, MobX 6 (observer + runInAction), Vite, Vitest (jsdom env), Firebase client SDK (firestore), Firebase Admin SDK (backend), existing `IronCondorModel` + `WatchlistDataService` + `PositionsService`.

**Spec:** `docs/superpowers/specs/2026-04-15-trade-journal-design.md`

**Branch:** `feat/trade-journal`

---

## File Structure

**Create:**
- `src/services/trade-journal/trade-journal.service.interface.ts` — types (ITradeJournalEntry, ITradeJournalService)
- `src/services/trade-journal/trade-journal.service.ts` — client-side service
- `src/services/trade-journal/trade-journal.service.test.ts` — unit tests (Vitest)
- `src/components/guvid-history/journal-drawer.component.tsx` — detail drawer modal

**NOT needed:** backend twin. Investigation confirms `functions/` has no `sendOrder` path — the Guvid Agent (`aiDailySubmit`) writes picks to Firestore and the user places actual orders through the frontend, which Task 7 already covers.

**Modify:**
- `src/models/iron-condor.model.ts` — add `netDelta`/`netTheta`/`netGamma`/`netVega`/`avgShortIV` getters; hook `captureEntry` into `sendOrder`
- `src/models/iron-condor.model.test.ts` — new unit tests for the getters
- `src/services/service-factory.interface.ts` — register `tradeJournal: ITradeJournalService`
- `src/services/service-factory.ts` — instantiate `TradeJournalService`
- `src/services/positions/positions.service.ts` — call `promotePending()` at end of `loadPositions()`
- `src/components/guvid-history/guvid-history.component.tsx` — 4 new columns, fetch journal entries, row click opens drawer

---

## Task 1: Define the Journal types

**Files:**
- Create: `src/services/trade-journal/trade-journal.service.interface.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// src/services/trade-journal/trade-journal.service.interface.ts
import type { Timestamp } from 'firebase/firestore';
import type { IronCondorModel } from '../../models/iron-condor.model';
import type { IPositionViewModel } from '../positions/positions.service.interface';

export type TradeJournalStatus = 'pending' | 'confirmed' | 'orphan';

export interface ITradeJournalStrikes {
    putLong: number;
    putShort: number;
    callShort: number;
    callLong: number;
}

export interface ITradeJournalEntrySnapshot {
    delta: number;            // Net IC delta (2 decimals)
    theta: number;            // Net IC theta (2 decimals; > 0 for short IC)
    gamma: number;            // Net IC gamma (4 decimals)
    vega: number;             // Net IC vega (2 decimals)
    iv: number;               // Mean of putShort.iv and callShort.iv (%)
    ivRank: number;           // Ticker IV Rank at entry (%)
    vix: number | null;       // Spot VIX (null if unavailable)
    underlyingPrice: number;  // Underlying spot at entry
    pop: number;              // POP % from IronCondorModel
    dte: number;              // Integer days to expiration
}

export interface ITradeJournalEntry {
    tradeId: string;                       // UUID, doc ID in Firestore
    status: TradeJournalStatus;
    createdAt: Timestamp;
    confirmedAt: Timestamp | null;
    ticker: string;
    expirationDate: string;                // YYYY-MM-DD
    strikes: ITradeJournalStrikes;
    entry: ITradeJournalEntrySnapshot;
}

export interface ITradeJournalService {
    captureEntry(ic: IronCondorModel, ticker: string, tradeId: string): Promise<void>;
    markOrphan(tradeId: string): Promise<void>;
    promotePending(positions: IPositionViewModel[]): Promise<void>;
    getAll(): Promise<ITradeJournalEntry[]>;
}
```

- [ ] **Step 2: Verify TSC**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS (types compile; nothing references them yet, but file itself must type-check).

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git add src/services/trade-journal/trade-journal.service.interface.ts
git commit -m "feat(trade-journal): define service interface and entry types"
```

---

## Task 2: Add net-Greeks getters to IronCondorModel

**Files:**
- Modify: `src/models/iron-condor.model.ts` (add 5 getters after line 52 after the existing `pop` getter)
- Create: `src/models/iron-condor.model.test.ts`

**Sign convention:** For a short IC (sell premium), net Greeks are measured from the trader's position perspective. Short-leg position delta = −option.delta, long-leg position delta = +option.delta. The computation below yields what a platform would show as net position Greeks.

- [ ] **Step 1: Write the failing test**

```typescript
// src/models/iron-condor.model.test.ts
import { describe, it, expect } from 'vitest';
import { IronCondorModel } from './iron-condor.model';

// Minimal mock of OptionModel — just enough for the getters under test.
function mockOption(delta: number, theta: number, gamma: number, vega: number, iv: number) {
    return {
        greeksData: { delta, theta, gamma, vega, iv },
        get delta() { return delta; },
        get theta() { return theta; },
        get gamma() { return gamma; },
        get vega() { return vega; },
        get iv() { return iv; },
    } as unknown as import('./option.model').OptionModel;
}

describe('IronCondorModel net Greeks', () => {
    // Typical short IC at entry:
    //   btoPut  (long put,  delta -0.05)
    //   stoPut  (short put, delta -0.16)
    //   stoCall (short call, delta +0.16)
    //   btoCall (long call, delta +0.05)
    // Net position delta = btoPut.delta + btoCall.delta - stoPut.delta - stoCall.delta
    //                    = -0.05 + 0.05 - (-0.16) - 0.16 = 0.00

    const btoPut  = mockOption(-0.05, -0.02, 0.0010, 0.05, 0.18);
    const stoPut  = mockOption(-0.16, +0.08, 0.0030, 0.12, 0.20);
    const stoCall = mockOption(+0.16, +0.08, 0.0030, 0.12, 0.22);
    const btoCall = mockOption(+0.05, -0.02, 0.0010, 0.05, 0.19);

    const ic = new IronCondorModel(10, btoPut, stoPut, stoCall, btoCall, {} as never);

    it('netDelta is 0 for a symmetric IC', () => {
        expect(ic.netDelta).toBe(0);
    });

    it('netTheta is positive for short IC (theta collected)', () => {
        // -(-0.02) + -(-0.02) + +0.08 + +0.08 = 0.20
        expect(ic.netTheta).toBeCloseTo(0.20, 4);
    });

    it('netGamma is negative for short IC', () => {
        // +0.0010 + +0.0010 - 0.0030 - 0.0030 = -0.0040
        expect(ic.netGamma).toBeCloseTo(-0.0040, 6);
    });

    it('netVega is negative for short IC', () => {
        // +0.05 + +0.05 - 0.12 - 0.12 = -0.14
        expect(ic.netVega).toBeCloseTo(-0.14, 4);
    });

    it('avgShortIV is mean of stoPut.iv and stoCall.iv', () => {
        // (0.20 + 0.22) / 2 = 0.21
        expect(ic.avgShortIV).toBeCloseTo(0.21, 4);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/models/iron-condor.model.test.ts`
Expected: FAIL — the 5 getters don't exist on `IronCondorModel`.

- [ ] **Step 3: Add the getters to IronCondorModel**

In `src/models/iron-condor.model.ts`, directly after the existing `pop` getter (ending at line 52), add:

```typescript
    /**
     * Net position delta for a short IC.
     * Short leg contributes -option.delta; long leg contributes +option.delta.
     */
    get netDelta(): number {
        return this.btoPut.delta + this.btoCall.delta - this.stoPut.delta - this.stoCall.delta;
    }

    /** Net position theta (positive for short IC — premium decays in our favor). */
    get netTheta(): number {
        return -this.btoPut.theta - this.btoCall.theta + this.stoPut.theta + this.stoCall.theta;
    }

    /** Net position gamma (negative for short IC — we're short gamma). */
    get netGamma(): number {
        return this.btoPut.gamma + this.btoCall.gamma - this.stoPut.gamma - this.stoCall.gamma;
    }

    /** Net position vega (negative for short IC — we benefit from IV crush). */
    get netVega(): number {
        return this.btoPut.vega + this.btoCall.vega - this.stoPut.vega - this.stoCall.vega;
    }

    /** Mean of IV across the two short strikes (the ones that define the credit). */
    get avgShortIV(): number {
        return (this.stoPut.iv + this.stoCall.iv) / 2;
    }
```

**Note on `iv` getter:** `OptionModel` exposes `this.greeksData?.iv`. If the `iv` getter doesn't already exist on `OptionModel`, stop and add it:

```typescript
// src/models/option.model.ts — add next to the existing delta/theta/gamma/vega getters
get iv(): number {
    return this.greeksData?.iv ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/models/iron-condor.model.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Type check whole codebase**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS (zero errors).

- [ ] **Step 6: Commit**

```bash
git add src/models/iron-condor.model.ts src/models/iron-condor.model.test.ts
# Only add option.model.ts if you had to touch it
git add src/models/option.model.ts 2>/dev/null || true
git commit -m "feat(iron-condor): add net Greeks + avgShortIV getters

Needed for Trade Journal entry snapshot. Sign convention follows short-IC
position perspective (short-leg delta negated, long-leg kept)."
```

---

## Task 3: TradeJournalService.captureEntry()

**Files:**
- Create: `src/services/trade-journal/trade-journal.service.ts`
- Create: `src/services/trade-journal/trade-journal.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/trade-journal/trade-journal.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeJournalService } from './trade-journal.service';

const setDocMock = vi.fn();
const docMock = vi.fn(() => ({ id: 'mock-doc' }));
const collectionMock = vi.fn();
const getDocsMock = vi.fn();
const updateDocMock = vi.fn();
const serverTimestampMock = vi.fn(() => 'SERVER_TS');

vi.mock('firebase/firestore', () => ({
    doc: (...a: unknown[]) => docMock(...a),
    setDoc: (...a: unknown[]) => setDocMock(...a),
    collection: (...a: unknown[]) => collectionMock(...a),
    getDocs: (...a: unknown[]) => getDocsMock(...a),
    updateDoc: (...a: unknown[]) => updateDocMock(...a),
    serverTimestamp: () => serverTimestampMock(),
    Timestamp: { now: () => ({ toMillis: () => 1_700_000_000_000 }) },
}));

vi.mock('../../firebase', () => ({
    db: {} as unknown,
    auth: { currentUser: { uid: 'user-1' } },
}));

function mockIC() {
    return {
        wingsWidth: 10,
        netDelta: 0.02,
        netTheta: 0.20,
        netGamma: -0.004,
        netVega: -0.14,
        avgShortIV: 0.21,
        pop: 82.5,
        btoPut:  { strikePrice: 6365, strike: { expiration: { expirationDate: '2026-05-15' } } },
        stoPut:  { strikePrice: 6375 },
        stoCall: { strikePrice: 7140 },
        btoCall: { strikePrice: 7150 },
        underlyingPrice: 6780,
    } as never;
}

function mockServices(opts: { vix: number | null; ivRank: number; today?: Date } = { vix: 17.4, ivRank: 42 }) {
    return {
        watchlistData: {
            getTickerData: (ticker: string) => {
                if (ticker === 'VIX') return opts.vix === null ? null : { currentPrice: opts.vix };
                return { ivRank: opts.ivRank };
            },
        },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never;
}

describe('TradeJournalService.captureEntry', () => {
    beforeEach(() => {
        setDocMock.mockReset();
        docMock.mockReset().mockImplementation(() => ({ id: 'mock-doc' }));
    });

    it('writes a full pending entry with all 10 snapshot fields', async () => {
        const today = new Date('2026-04-15T10:30:00Z'); // DTE from 2026-05-15 = 30
        vi.setSystemTime(today);
        const service = new TradeJournalService(mockServices({ vix: 17.4, ivRank: 42 }));

        await service.captureEntry(mockIC(), 'SPX', 'uuid-1');

        expect(setDocMock).toHaveBeenCalledOnce();
        const [, payload] = setDocMock.mock.calls[0];
        expect(payload).toMatchObject({
            tradeId: 'uuid-1',
            status: 'pending',
            confirmedAt: null,
            ticker: 'SPX',
            expirationDate: '2026-05-15',
            strikes: { putLong: 6365, putShort: 6375, callShort: 7140, callLong: 7150 },
            entry: {
                delta: 0.02,
                theta: 0.20,
                gamma: -0.004,
                vega: -0.14,
                iv: 0.21,
                ivRank: 42,
                vix: 17.4,
                underlyingPrice: 6780,
                pop: 82.5,
                dte: 30,
            },
        });
    });

    it('stores vix: null when watchlistData returns null for VIX', async () => {
        vi.setSystemTime(new Date('2026-04-15T10:30:00Z'));
        const service = new TradeJournalService(mockServices({ vix: null, ivRank: 42 }));

        await service.captureEntry(mockIC(), 'SPX', 'uuid-2');

        const [, payload] = setDocMock.mock.calls[0];
        expect(payload.entry.vix).toBeNull();
    });

    it('does not throw if Firestore write fails (best-effort)', async () => {
        setDocMock.mockRejectedValueOnce(new Error('offline'));
        const service = new TradeJournalService(mockServices());

        // Must resolve without throwing so sendOrder isn't blocked
        await expect(service.captureEntry(mockIC(), 'SPX', 'uuid-3')).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: FAIL — `TradeJournalService` doesn't exist yet.

- [ ] **Step 3: Implement the service**

```typescript
// src/services/trade-journal/trade-journal.service.ts
import { doc, setDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { IronCondorModel } from '../../models/iron-condor.model';
import type { IPositionViewModel } from '../positions/positions.service.interface';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    ITradeJournalEntry,
    ITradeJournalService,
    ITradeJournalEntrySnapshot,
} from './trade-journal.service.interface';

const ORPHAN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class TradeJournalService implements ITradeJournalService {
    constructor(private readonly services: IServiceFactory) {}

    async captureEntry(ic: IronCondorModel, ticker: string, tradeId: string): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            const vixData = this.services.watchlistData.getTickerData('VIX');
            const tickerData = this.services.watchlistData.getTickerData(ticker);

            const expirationDate = ic.btoPut.strike.expiration.expirationDate; // YYYY-MM-DD
            const dte = Math.max(0, Math.round(
                (new Date(expirationDate + 'T00:00:00Z').getTime() - Date.now()) / (24 * 3600 * 1000)
            ));

            const snapshot: ITradeJournalEntrySnapshot = {
                delta: round(ic.netDelta, 2),
                theta: round(ic.netTheta, 2),
                gamma: round(ic.netGamma, 4),
                vega: round(ic.netVega, 2),
                iv: round(ic.avgShortIV, 4),
                ivRank: tickerData?.ivRank ?? 0,
                vix: vixData?.currentPrice ?? null,
                underlyingPrice: ic.underlyingPrice,
                pop: round(ic.pop, 2),
                dte,
            };

            const entry: Omit<ITradeJournalEntry, 'createdAt'> & { createdAt: unknown } = {
                tradeId,
                status: 'pending',
                createdAt: serverTimestamp(),
                confirmedAt: null,
                ticker,
                expirationDate,
                strikes: {
                    putLong: ic.btoPut.strikePrice,
                    putShort: ic.stoPut.strikePrice,
                    callShort: ic.stoCall.strikePrice,
                    callLong: ic.btoCall.strikePrice,
                },
                entry: snapshot,
            };

            const ref = doc(db, 'users', uid, 'tradeJournal', tradeId);
            await setDoc(ref, entry);
        } catch (err) {
            // Best-effort: never block the order send.
            this.services.logger?.warn?.('[TradeJournal] captureEntry failed', err);
        }
    }

    async markOrphan(tradeId: string): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            await updateDoc(doc(db, 'users', uid, 'tradeJournal', tradeId), { status: 'orphan' });
        } catch (err) {
            this.services.logger?.warn?.('[TradeJournal] markOrphan failed', err);
        }
    }

    async promotePending(_positions: IPositionViewModel[]): Promise<void> {
        // Implemented in Task 5.
    }

    async getAll(): Promise<ITradeJournalEntry[]> {
        // Implemented in Task 4.
        return [];
    }
}

function round(n: number, decimals: number): number {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/services/trade-journal/trade-journal.service.ts src/services/trade-journal/trade-journal.service.test.ts
git commit -m "feat(trade-journal): implement captureEntry with 10-field snapshot

Best-effort write — never throws; sendOrder is never blocked by journal
failures."
```

---

## Task 4: getAll() + markOrphan() tests

**Files:**
- Modify: `src/services/trade-journal/trade-journal.service.ts` (implement `getAll`)
- Modify: `src/services/trade-journal/trade-journal.service.test.ts` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `trade-journal.service.test.ts`:

```typescript
describe('TradeJournalService.getAll', () => {
    it('returns all entries for the current user', async () => {
        getDocsMock.mockResolvedValueOnce({
            docs: [
                { data: () => ({ tradeId: 't1', status: 'confirmed', ticker: 'SPX' }) },
                { data: () => ({ tradeId: 't2', status: 'pending', ticker: 'QQQ' }) },
            ],
        });
        const service = new TradeJournalService(mockServices());

        const entries = await service.getAll();

        expect(entries).toHaveLength(2);
        expect(entries[0].tradeId).toBe('t1');
        expect(entries[1].tradeId).toBe('t2');
    });

    it('returns [] when user is not authenticated', async () => {
        const authMock = await import('../../firebase');
        const original = authMock.auth.currentUser;
        (authMock.auth as unknown as { currentUser: null }).currentUser = null;

        const service = new TradeJournalService(mockServices());
        const entries = await service.getAll();
        expect(entries).toEqual([]);

        (authMock.auth as unknown as { currentUser: typeof original }).currentUser = original;
    });
});

describe('TradeJournalService.markOrphan', () => {
    it('updates status to orphan', async () => {
        updateDocMock.mockResolvedValueOnce(undefined);
        const service = new TradeJournalService(mockServices());

        await service.markOrphan('uuid-x');

        expect(updateDocMock).toHaveBeenCalledOnce();
        const [, payload] = updateDocMock.mock.calls[0];
        expect(payload).toEqual({ status: 'orphan' });
    });
});
```

- [ ] **Step 2: Run tests — 3 new tests fail**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: FAIL on the 2 `getAll` tests (`markOrphan` should pass since it was already written in Task 3).

- [ ] **Step 3: Implement getAll()**

Replace the `getAll` stub in `trade-journal.service.ts`:

```typescript
    async getAll(): Promise<ITradeJournalEntry[]> {
        const uid = auth.currentUser?.uid;
        if (!uid) return [];
        const snap = await getDocs(collection(db, 'users', uid, 'tradeJournal'));
        return snap.docs.map(d => d.data() as ITradeJournalEntry);
    }
```

- [ ] **Step 4: Run tests — all pass**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: PASS (all 6 tests now).

- [ ] **Step 5: Commit**

```bash
git add src/services/trade-journal/trade-journal.service.ts src/services/trade-journal/trade-journal.service.test.ts
git commit -m "feat(trade-journal): implement getAll and test markOrphan"
```

---

## Task 5: promotePending() with 24h orphan timeout

**Files:**
- Modify: `src/services/trade-journal/trade-journal.service.ts`
- Modify: `src/services/trade-journal/trade-journal.service.test.ts`

**Match rule:** a pending journal entry is promoted to `confirmed` when the current `positions[]` contains AT LEAST one position with `(underlyingSymbol === entry.ticker) && (expirationDate === entry.expirationDate) && strikePrice matches one of the 4 entry strikes`. Rationale: a filled IC creates 4 positions, but we only need to verify presence — seeing one leg means the order landed. We do NOT attempt multi-leg reconciliation in the MVP.

- [ ] **Step 1: Add failing tests**

Append to `trade-journal.service.test.ts`:

```typescript
describe('TradeJournalService.promotePending', () => {
    const pendingEntry = {
        tradeId: 'uuid-pending',
        status: 'pending' as const,
        createdAt: { toMillis: () => Date.now() - 60_000 }, // 1 min ago
        confirmedAt: null,
        ticker: 'SPX',
        expirationDate: '2026-05-15',
        strikes: { putLong: 6365, putShort: 6375, callShort: 7140, callLong: 7150 },
        entry: {} as ITradeJournalEntrySnapshot,
    };

    const orphanCandidate = {
        ...pendingEntry,
        tradeId: 'uuid-old',
        createdAt: { toMillis: () => Date.now() - 25 * 60 * 60 * 1000 }, // 25h ago
    };

    beforeEach(() => {
        getDocsMock.mockReset();
        updateDocMock.mockReset();
    });

    it('promotes a pending entry when a matching position is found', async () => {
        getDocsMock.mockResolvedValueOnce({ docs: [{ data: () => pendingEntry }] });
        const service = new TradeJournalService(mockServices());

        const positions = [{
            symbol: 'SPX   260515P06375000', underlyingSymbol: 'SPX',
            expirationDate: '2026-05-15', strikePrice: 6375, optionType: 'put',
            quantity: 1, quantityDirection: 'Short',
        }] as IPositionViewModel[];

        await service.promotePending(positions);

        expect(updateDocMock).toHaveBeenCalledOnce();
        const [, payload] = updateDocMock.mock.calls[0];
        expect(payload).toMatchObject({ status: 'confirmed' });
        expect(payload.confirmedAt).toBe('SERVER_TS');
    });

    it('does nothing for a pending entry with no matching position (and within 24h)', async () => {
        getDocsMock.mockResolvedValueOnce({ docs: [{ data: () => pendingEntry }] });
        const service = new TradeJournalService(mockServices());

        await service.promotePending([] as IPositionViewModel[]);

        expect(updateDocMock).not.toHaveBeenCalled();
    });

    it('marks a pending entry as orphan after 24h with no matching position', async () => {
        getDocsMock.mockResolvedValueOnce({ docs: [{ data: () => orphanCandidate }] });
        const service = new TradeJournalService(mockServices());

        await service.promotePending([] as IPositionViewModel[]);

        expect(updateDocMock).toHaveBeenCalledOnce();
        const [, payload] = updateDocMock.mock.calls[0];
        expect(payload).toEqual({ status: 'orphan' });
    });

    it('ignores non-pending entries', async () => {
        getDocsMock.mockResolvedValueOnce({
            docs: [{ data: () => ({ ...pendingEntry, status: 'confirmed' }) }],
        });
        const service = new TradeJournalService(mockServices());

        await service.promotePending([] as IPositionViewModel[]);

        expect(updateDocMock).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests — 4 new tests fail**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: FAIL on all 4 `promotePending` tests (method is a stub).

- [ ] **Step 3: Implement promotePending()**

Replace the `promotePending` stub in `trade-journal.service.ts`:

```typescript
    async promotePending(positions: IPositionViewModel[]): Promise<void> {
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            const snap = await getDocs(collection(db, 'users', uid, 'tradeJournal'));
            const now = Date.now();

            for (const d of snap.docs) {
                const entry = d.data() as ITradeJournalEntry;
                if (entry.status !== 'pending') continue;

                const hasMatch = positions.some(p =>
                    p.underlyingSymbol === entry.ticker &&
                    p.expirationDate === entry.expirationDate &&
                    (p.strikePrice === entry.strikes.putLong
                     || p.strikePrice === entry.strikes.putShort
                     || p.strikePrice === entry.strikes.callShort
                     || p.strikePrice === entry.strikes.callLong)
                );

                if (hasMatch) {
                    await updateDoc(doc(db, 'users', uid, 'tradeJournal', entry.tradeId), {
                        status: 'confirmed',
                        confirmedAt: serverTimestamp(),
                    });
                    continue;
                }

                const ageMs = now - (entry.createdAt?.toMillis?.() ?? now);
                if (ageMs > ORPHAN_TIMEOUT_MS) {
                    await updateDoc(doc(db, 'users', uid, 'tradeJournal', entry.tradeId), {
                        status: 'orphan',
                    });
                }
            }
        } catch (err) {
            this.services.logger?.warn?.('[TradeJournal] promotePending failed', err);
        }
    }
```

- [ ] **Step 4: Run tests — all pass**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run src/services/trade-journal/trade-journal.service.test.ts`
Expected: PASS (all 10 tests now).

- [ ] **Step 5: Commit**

```bash
git add src/services/trade-journal/trade-journal.service.ts src/services/trade-journal/trade-journal.service.test.ts
git commit -m "feat(trade-journal): promotePending with 24h orphan timeout

A pending entry is promoted to confirmed when any leg of its 4 strikes
appears in current positions at the matching expiration. After 24h with
no match it becomes orphan."
```

---

## Task 6: Wire TradeJournalService into service factory

**Files:**
- Modify: `src/services/service-factory.interface.ts`
- Modify: `src/services/service-factory.ts`

- [ ] **Step 1: Extend the interface**

In `src/services/service-factory.interface.ts`, add near the other service imports:

```typescript
import type { ITradeJournalService } from './trade-journal/trade-journal.service.interface';
```

And add a property to the `IServiceFactory` interface:

```typescript
tradeJournal: ITradeJournalService;
```

- [ ] **Step 2: Instantiate in factory**

In `src/services/service-factory.ts`, add the import and lazy getter following the existing pattern (mirror how `watchlistData` or `positions` are registered):

```typescript
import { TradeJournalService } from './trade-journal/trade-journal.service';

// inside ServiceFactory class:
private _tradeJournal: ITradeJournalService | null = null;
get tradeJournal(): ITradeJournalService {
    return this._tradeJournal ??= new TradeJournalService(this);
}
```

(Match the exact pattern the existing file uses — `??=`, explicit `new`, whatever the convention is. Inspect a neighbor service registration and follow it.)

- [ ] **Step 3: TSC**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/service-factory.interface.ts src/services/service-factory.ts
git commit -m "feat(trade-journal): register in service factory"
```

---

## Task 7: Hook captureEntry into IronCondorModel.sendOrder

**Files:**
- Modify: `src/models/iron-condor.model.ts`

**Behavior:**
- Before calling `account.sendOrder(...)`, generate a UUID and call `services.tradeJournal.captureEntry(this, ticker, tradeId)`.
- If `account.sendOrder` throws, call `services.tradeJournal.markOrphan(tradeId)` and re-throw the original error.
- The ticker must be passed through `IOptionsStrategySendOrderParams`. Add an optional field there.

- [ ] **Step 1: Extend the order params type**

In `src/models/options-strategy.view-model.interface.ts` (the file that defines `IOptionsStrategySendOrderParams`), add an optional field:

```typescript
export interface IOptionsStrategySendOrderParams {
    // ... existing fields ...
    /** Ticker used for Trade Journal snapshot (optional; journal skipped if absent). */
    ticker?: string;
}
```

- [ ] **Step 2: Modify IronCondorModel.sendOrder**

Replace the existing `sendOrder` method:

```typescript
    async sendOrder(orderParams: IOptionsStrategySendOrderParams): Promise<void> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) return;

        const tradeId = crypto.randomUUID();
        if (orderParams.ticker) {
            await this.services.tradeJournal.captureEntry(this, orderParams.ticker, tradeId);
        }

        try {
            await account.sendOrder({
                price: orderParams.price ?? this.credit,
                priceEffect: "Credit",
                timeInForce: orderParams.timeInForce,
                orderType: orderParams.orderType,
                legs: [
                    { instrumentType: "Equity Option", action: "Buy to Open",  quantity: orderParams.quantity, symbol: this.btoPut.id  },
                    { instrumentType: "Equity Option", action: "Sell to Open", quantity: orderParams.quantity, symbol: this.stoPut.id  },
                    { instrumentType: "Equity Option", action: "Sell to Open", quantity: orderParams.quantity, symbol: this.stoCall.id },
                    { instrumentType: "Equity Option", action: "Buy to Open",  quantity: orderParams.quantity, symbol: this.btoCall.id },
                ],
            });
        } catch (err) {
            if (orderParams.ticker) {
                await this.services.tradeJournal.markOrphan(tradeId);
            }
            throw err;
        }
    }
```

- [ ] **Step 3: Update callers to pass ticker**

Find call sites that invoke `ic.sendOrder(...)` on an `IronCondorModel`:

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
grep -rn "\.sendOrder(" src/components src/services --include="*.ts" --include="*.tsx" | grep -v test
```

Expected call sites:
- `src/components/strategies/send-order-dialog.component.tsx` — `props.strategy.sendOrder(orderParams)` — the dialog receives a `strategy`; it already constructs `orderParams`. Add `ticker` to the `orderParams` object using the ticker the dialog already has access to (likely via props or a parent context — inspect the component).
- `src/components/iron-condor-savior/iron-condor-savior.component.tsx` — `ic.sendOrder(1)` — this is a degenerate call. Change to `ic.sendOrder({ quantity: 1, ticker: <savior-ticker> })`. Inspect how the savior component knows the ticker (probably a prop on the row).

For each call site, pass the ticker. If the ticker isn't readily available, pull it from the nearest parent source (usually `this.services.tickers.currentTicker.symbol` or a prop). Don't fabricate — if you can't find one, leave a comment `// TODO ticker unavailable here` and the journal will simply be skipped.

- [ ] **Step 4: Type check**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Rerun all unit tests**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx vitest run`
Expected: PASS (15+ tests across model and service).

- [ ] **Step 6: Commit**

```bash
git add src/models/iron-condor.model.ts src/models/options-strategy.view-model.interface.ts src/components/strategies/send-order-dialog.component.tsx src/components/iron-condor-savior/iron-condor-savior.component.tsx
git commit -m "feat(trade-journal): capture entry on IC sendOrder

Pre-API write with status=pending. On API error, mark orphan. Journal is
a no-op if ticker isn't supplied, preserving backward-compat for callers
that don't have ticker context."
```

---

## Task 8: Hook promotePending into PositionsService

**Files:**
- Modify: `src/services/positions/positions.service.ts`

- [ ] **Step 1: Call promotePending at end of loadPositions**

In `src/services/positions/positions.service.ts`, at the end of `loadPositions()` after the `runInAction` that sets positions but before `isLoading` is cleared, add:

```typescript
            // Reconcile any pending journal entries against the freshly-loaded positions.
            void this.services.tradeJournal.promotePending(this.positions);
```

The `void` explicitly ignores the returned promise so position-loading isn't blocked by journal reconciliation. Full method body for reference:

```typescript
    async loadPositions(underlyingSymbol: string): Promise<void> {
        const account = this.services.brokerAccount.currentAccount;
        if (!account) return;

        runInAction(() => { this.isLoading = true; });

        try {
            const rawPositions = await this.services.marketDataProvider.getPositions(
                account.accountNumber,
                underlyingSymbol
            );

            runInAction(() => {
                this.positions = rawPositions.map(pos => ({
                    symbol: pos.symbol,
                    underlyingSymbol: pos.underlyingSymbol,
                    quantity: pos.quantity,
                    quantityDirection: pos.quantityDirection,
                    strikePrice: pos.strikePrice,
                    optionType: pos.optionType,
                    expirationDate: pos.expirationDate
                }));
            });

            void this.services.tradeJournal.promotePending(this.positions);
        } catch (error) {
            console.error('Failed to load positions:', error);
            runInAction(() => { this.positions = []; });
        } finally {
            runInAction(() => { this.isLoading = false; });
        }
    }
```

- [ ] **Step 2: Type check**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/positions/positions.service.ts
git commit -m "feat(trade-journal): reconcile pending entries on positions refresh"
```

---

## Task 9: Guvid History UI — 4 columns + detail drawer

**Files:**
- Create: `src/components/guvid-history/journal-drawer.component.tsx`
- Modify: `src/components/guvid-history/guvid-history.component.tsx`

- [ ] **Step 1: Create the JournalDrawer component**

```tsx
// src/components/guvid-history/journal-drawer.component.tsx
import React from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonButton, IonButtons, IonContent } from '@ionic/react';
import styled from 'styled-components';
import type { ITradeJournalEntry } from '../../services/trade-journal/trade-journal.service.interface';

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 24px;
    padding: 16px;
`;

const Row = styled.div`
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #1a1a2e;
    padding: 6px 0;
`;

const Label = styled.div`color: #8888aa; font-size: 0.85rem;`;
const Value = styled.div<{ $positive?: boolean; $negative?: boolean }>`
    font-weight: 600;
    color: ${p => p.$positive ? '#4dff91' : p.$negative ? '#ff4d6d' : '#e8e8ee'};
`;
const StatusChip = styled.span<{ $status: 'pending' | 'confirmed' | 'orphan' }>`
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
    background: ${p => p.$status === 'confirmed' ? '#1a5e3a' : p.$status === 'pending' ? '#4a3a1a' : '#5e1a1a'};
    color: ${p => p.$status === 'confirmed' ? '#4dff91' : p.$status === 'pending' ? '#ffcc4d' : '#ff8888'};
`;

interface Props {
    entry: ITradeJournalEntry | null;
    isOpen: boolean;
    onClose: () => void;
}

export const JournalDrawer: React.FC<Props> = ({ entry, isOpen, onClose }) => {
    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose}>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Trade Journal — Entry Snapshot</IonTitle>
                    <IonButtons slot="end"><IonButton onClick={onClose}>Close</IonButton></IonButtons>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                {!entry ? (
                    <div style={{ padding: 24, color: '#8888aa' }}>No journal entry available for this trade.</div>
                ) : (
                    <>
                        <div style={{ padding: 16 }}>
                            <StatusChip $status={entry.status}>{entry.status.toUpperCase()}</StatusChip>
                            <span style={{ marginLeft: 12, color: '#8888aa' }}>
                                {entry.ticker} · exp {entry.expirationDate}
                            </span>
                        </div>
                        <Grid>
                            <Row><Label>Delta (Δ)</Label><Value>{entry.entry.delta.toFixed(2)}</Value></Row>
                            <Row><Label>Theta (Θ)</Label><Value $positive={entry.entry.theta > 0}>{entry.entry.theta.toFixed(2)}</Value></Row>
                            <Row><Label>Gamma (Γ)</Label><Value>{entry.entry.gamma.toFixed(4)}</Value></Row>
                            <Row><Label>Vega (V)</Label><Value>{entry.entry.vega.toFixed(2)}</Value></Row>
                            <Row><Label>IV (short avg)</Label><Value>{(entry.entry.iv * 100).toFixed(1)}%</Value></Row>
                            <Row><Label>IV Rank</Label><Value>{entry.entry.ivRank.toFixed(1)}%</Value></Row>
                            <Row><Label>VIX</Label><Value>{entry.entry.vix == null ? '—' : entry.entry.vix.toFixed(2)}</Value></Row>
                            <Row><Label>Underlying</Label><Value>{entry.entry.underlyingPrice.toFixed(2)}</Value></Row>
                            <Row><Label>POP</Label><Value $positive={entry.entry.pop >= 70}>{entry.entry.pop.toFixed(1)}%</Value></Row>
                            <Row><Label>DTE</Label><Value>{entry.entry.dte}</Value></Row>
                        </Grid>
                    </>
                )}
            </IonContent>
        </IonModal>
    );
};
```

- [ ] **Step 2: Integrate into GuvidHistory**

Open `src/components/guvid-history/guvid-history.component.tsx` and make these surgical edits (the file is 865 lines — don't restructure, only patch in):

1. **Near the top imports:**

```tsx
import { JournalDrawer } from './journal-drawer.component';
import type { ITradeJournalEntry } from '../../services/trade-journal/trade-journal.service.interface';
```

2. **Inside the component, add state and effect (near the other `useState` hooks):**

```tsx
const [journalEntries, setJournalEntries] = useState<ITradeJournalEntry[]>([]);
const [selectedEntry, setSelectedEntry] = useState<ITradeJournalEntry | null>(null);
const [drawerOpen, setDrawerOpen] = useState(false);

useEffect(() => {
    services.tradeJournal.getAll().then(setJournalEntries).catch(() => setJournalEntries([]));
}, [services.tradeJournal]);
```

3. **Add a lookup helper (above the return, after any other helpers):**

```tsx
const findJournalForTrade = (t: IIronCondorTrade): ITradeJournalEntry | null => {
    return journalEntries.find(e =>
        e.ticker === t.ticker &&
        e.expirationDate === t.expirationDate &&
        e.strikes.putLong === t.putBuyStrike &&
        e.strikes.putShort === t.putSellStrike &&
        e.strikes.callShort === t.callSellStrike &&
        e.strikes.callLong === t.callBuyStrike
    ) ?? null;
};
```

4. **In the trades table, add 4 new column headers after `Credit`:**

```tsx
<th>Δ</th>
<th>IV Rank</th>
<th>VIX</th>
<th>DTE</th>
```

5. **In the row rendering, after the `Credit` cell, add 4 new cells and wire click:**

```tsx
{(() => {
    const j = findJournalForTrade(trade);
    const placeholder = <span style={{ color: '#444' }}>—</span>;
    return (
        <>
            <td onClick={() => { if (j) { setSelectedEntry(j); setDrawerOpen(true); } }}
                style={{ cursor: j ? 'pointer' : 'default' }}>
                {j ? j.entry.delta.toFixed(2) : placeholder}
            </td>
            <td>{j ? `${j.entry.ivRank.toFixed(0)}%` : placeholder}</td>
            <td>{j ? (j.entry.vix == null ? placeholder : j.entry.vix.toFixed(1)) : placeholder}</td>
            <td>{j ? j.entry.dte : placeholder}</td>
        </>
    );
})()}
```

6. **Before the closing JSX, render the drawer:**

```tsx
<JournalDrawer
    entry={selectedEntry}
    isOpen={drawerOpen}
    onClose={() => setDrawerOpen(false)}
/>
```

- [ ] **Step 3: Type check**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Build verification**

Run: `cd ~/Downloads/ai-projects/projects/tastyscanner && npm run build 2>&1 | tail -20`
Expected: `✓ built in ...`

- [ ] **Step 5: Commit**

```bash
git add src/components/guvid-history/journal-drawer.component.tsx src/components/guvid-history/guvid-history.component.tsx
git commit -m "feat(trade-journal): 4 new columns + detail drawer in Guvid History

Δ / IV Rank / VIX / DTE inline. Click on Δ cell opens a modal showing the
full 10-field snapshot with status chip (pending / confirmed / orphan)."
```

---

## Task 10: Ship it — preview deploy, PR, verify

**Files:** none — deploy + verify + PR

- [ ] **Step 1: Final full check**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
npx tsc --noEmit
npx vitest run
npm run build
```
All three must pass.

- [ ] **Step 2: Preview deploy**

```bash
firebase hosting:channel:deploy preview-journal --expires 7d
```

Note the preview URL — you'll share it with Catalin. No functions deploy needed (no backend changes).

- [ ] **Step 3: Manual smoke test on preview**

Walk through on the preview URL:
1. Log in, go to IC Builder. Select SPX. Build an IC. Click Send Order (it's OK to cancel at the TastyTrade confirmation if you don't want a real fill — the journal entry is written BEFORE the broker API call).
2. Open Firestore console → `users/{your-uid}/tradeJournal/` → confirm a `pending` doc exists with all 10 fields populated.
3. If the order actually filled, navigate to Positions → this triggers `loadPositions` → journal entry should promote to `confirmed` within a refresh.
4. Open Guvid History → the new trade should show Δ/IV Rank/VIX/DTE populated; historical rows should show `—`.
5. Click the Δ cell on a row with data → drawer opens with all 10 fields + green `CONFIRMED` chip.

- [ ] **Step 4: Push branch and open PR**

```bash
cd ~/Downloads/ai-projects/projects/tastyscanner
git push -u origin feat/trade-journal

gh pr create --base master --head feat/trade-journal \
  --title "feat: Trade Journal — Greeks snapshot at entry" \
  --body "$(cat <<'EOF'
## Summary

First Trade Journal iteration (scope "B" per design doc). Captures a 10-field snapshot (Δ, Θ, Γ, V, IV, IV Rank, VIX, underlying, POP, DTE) at Send Order time and surfaces 4 key fields plus a detail drawer in Guvid History.

**Design:** `docs/superpowers/specs/2026-04-15-trade-journal-design.md`
**Plan:** `docs/superpowers/plans/2026-04-15-trade-journal.md`

## Changes

- New service `TradeJournalService` (client-side) with `captureEntry`, `markOrphan`, `promotePending`, `getAll`
- `IronCondorModel` gains net-Greeks and `avgShortIV` getters
- `IronCondorModel.sendOrder` writes pending entry before API call, marks orphan on API error
- `PositionsService.loadPositions` reconciles pending entries against fresh positions (promote match, orphan after 24h)
- `GuvidHistoryComponent` — 4 new columns (Δ, IV Rank, VIX, DTE) + row-click drawer

## Non-scope

- Notes and tags (next iteration, "scope A")
- Per-trade detail page with P&L evolution chart (scope C)
- Backfill for historical trades

## Test plan

- [x] \`npx tsc --noEmit\` — zero errors (root + functions)
- [x] \`npx vitest run\` — all tests pass
- [x] \`npm run build\` — successful
- [x] Preview deploy — manual smoke test walked through (see comment below)
- [ ] Reviewer verifies Firestore doc structure matches spec

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Final commit (if any manual tweaks)**

If smoke test revealed cosmetic issues, fix and amend or add a new commit. Don't amend pushed commits.

---

## Self-Review Checklist (Spec Coverage)

Before declaring the plan complete, verify:

| Spec requirement | Plan task |
|---|---|
| 10-field entry snapshot | Task 1 (types), Task 3 (capture) |
| Firestore path `users/{uid}/tradeJournal/{tradeId}` | Task 3 |
| Trigger on Send Order | Task 7 |
| Promotion on positions.refresh | Task 8 |
| 24h orphan timeout | Task 5 |
| Backend twin for Guvid Agent | N/A — confirmed no backend sendOrder path exists (investigated during planning) |
| 4 UI columns | Task 9 |
| Detail drawer with all 10 fields | Task 9 |
| Historical trades show `—` | Task 9 (findJournalForTrade returns null → placeholder) |
| VIX null handling | Tasks 3, 9 (drawer renders `—`) |
| Tests for each public service method | Tasks 2, 3, 4, 5 |
| TSC clean at every commit | Steps within each task |
| Firestore security rule already covers path | Design doc §Security — no rule changes needed |

All requirements mapped to tasks ✓.

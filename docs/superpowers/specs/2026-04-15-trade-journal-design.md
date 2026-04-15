# Trade Journal — Greeks Snapshot at Entry

**Status:** Design approved 2026-04-15
**Scope:** MVP "B" — Greeks snapshot at entry only (no notes, no tags, no P&L evolution chart yet)
**Branch:** `feat/trade-journal`

## Problem

Catalin can see historical trade P&L via Guvid History, but has no record of *what the trade looked like at entry* — no delta, theta, gamma, vega, IV, IV Rank, VIX, underlying price, POP, or DTE captured at the moment an order was sent. This blocks retrospective analysis like "what delta did my losing trades have at entry?" or "did my winning trades cluster around high IV Rank?".

## Goal

Capture and persist a 10-field snapshot of market + position state at the moment any Iron Condor order is sent (by user or by Guvid Agent), and surface key fields in the Guvid History table with a detail drawer for the full snapshot.

## Non-Goals

- Notes per trade (deferred — scope "A")
- Tags (deferred — scope "A")
- Per-trade detail page with P&L evolution chart (deferred — scope "C")
- Intermediate snapshots during trade lifecycle (deferred)
- Exit snapshot (deferred — data model is extensible to `exit: {...}` later)
- Backfill for historical trades (deferred — new trades only)

## Data Model

**Firestore path:** `users/{uid}/tradeJournal/{tradeId}`

The `{tradeId}` is a UUID generated at Send Order time, written into the order's client-order-id metadata so the subsequent fill can be correlated back. If client-order-id is not supported, we fall back to matching on `(ticker, expiration, strikes)`.

```typescript
interface ITradeJournalEntry {
    tradeId: string;              // UUID generated at Send Order — doc ID in Firestore
    status: 'pending' | 'confirmed' | 'orphan';
    createdAt: Timestamp;         // Set at Send Order click
    confirmedAt: Timestamp | null; // Set when fill detected
    ticker: string;               // e.g. "SPX", "QQQ"
    expirationDate: string;       // YYYY-MM-DD
    strikes: {                    // Needed to correlate with IIronCondorTrade at render time
        putLong: number;
        putShort: number;
        callShort: number;
        callLong: number;
    };
    entry: {
        delta: number;            // Net IC delta (2 decimals per project rule)
        theta: number;            // Net IC theta (2 decimals; positive for short IC)
        gamma: number;            // Net IC gamma (4 decimals per project rule)
        vega: number;             // Net IC vega (2 decimals)
        iv: number;               // Mean of put-short IV and call-short IV (%), from streamer greeks
        ivRank: number;           // Ticker IV Rank from watchlistData (%)
        vix: number | null;       // Spot VIX from watchlistData.getTickerData('VIX'); null if unavailable
        underlyingPrice: number;  // Spot price of the underlying from IronCondorModel
        pop: number;              // Probability of Profit (%) from IronCondorModel
        dte: number;              // Integer days to expiration
    };
}
```

**Correlation with `IIronCondorTrade`:** `IIronCondorTrade.id` is broker-derived (from order IDs). The journal's `tradeId` is our UUID and does NOT equal `IIronCondorTrade.id`. At render time in Guvid History, we match journal entries to trades by `(ticker, expirationDate, strikes)`. The `strikes` block on the journal entry makes this match O(1).

**Rationale for `entry: {...}` wrapper:** keeps the schema extensible to `exit: {...}` later without a migration.

## Trigger — Hybrid Flow (Option 4)

```
Send Order clicked (IC Builder / IC Savior / Guvid Agent backend)
    │
    ├─ Generate UUID → tradeId
    │
    ├─ TradeJournalService.captureEntry(ic, ticker, tradeId)
    │     ├─ Read netDelta/netTheta/netGamma/netVega from IronCondorModel
    │     ├─ Compute iv = mean(putShort.iv, callShort.iv) from streamer greeks
    │     ├─ Read ivRank from watchlistData.getTickerData(ticker).ivRank
    │     ├─ Read vix from watchlistData.getTickerData('VIX') (single source)
    │     ├─ Read underlyingPrice from ic.underlyingPrice
    │     ├─ Read pop from ic.pop (IronCondorModel computed)
    │     ├─ Compute dte = daysBetween(today, ic.expirationDate)
    │     └─ Firestore write: status='pending', createdAt=serverTimestamp()
    │
    ├─ Send order via TastyTrade API (with tradeId in client-order-id if possible)
    │
    └─ If API throws → TradeJournalService.markOrphan(tradeId)
       (order wasn't even placed; cleanup)

Later — reconciliation on positions.refresh():
    │
    ├─ For each journal entry with status='pending':
    │     ├─ Match against currently-open positions by (ticker + expiration + strikes)
    │     ├─ If match found → status='confirmed', confirmedAt=serverTimestamp()
    │     └─ If createdAt older than 24h without match → status='orphan'
```

## Components

### Frontend (`src/services/trade-journal/`)

- **`trade-journal.interface.ts`** — `ITradeJournalEntry`, `ITradeJournalService`
- **`trade-journal.service.ts`** — implementation:
  - `captureEntry(ic: IronCondorModel, ticker: string, tradeId: string): Promise<void>`
  - `markOrphan(tradeId: string): Promise<void>`
  - `promotePending(openPositions: IPosition[]): Promise<void>`
  - `getForTrade(tradeId: string): Promise<ITradeJournalEntry | null>`
  - `getAll(): Promise<ITradeJournalEntry[]>`

Service wired into `service-factory.ts` with lazy init (per existing pattern).

### Backend (`functions/src/shared/trade-journal.ts`)

Twin implementation for Guvid Agent. Same interface, same field semantics, Firebase Admin SDK instead of client SDK. The Guvid Agent writes to `users/{targetUid}/tradeJournal/...` using the authenticated user's UID.

### Integration Points

- **Central IC-send path** — in `IronCondorModel.sendOrder()` if centralized; otherwise wrap all callers (IC Builder, IC Savior, Guvid competition "Add to Guvid") to route through a single `ic-order.service.ts`. During planning phase, identify the actual dispatch point and pick one of: (a) modify existing central method, (b) introduce a new central service and migrate callers. Add `await tradeJournal.captureEntry(this, ticker, tradeId)` before the TastyTrade API call at that point.
- **`positions.service.ts#refresh()`** — at the end, call `await tradeJournal.promotePending(this.openPositions)`.
- **Backend Guvid Agent send-order path** in `functions/src/index.ts` — add equivalent capture call via backend twin.

### UI (`src/components/guvid-history/`)

- Extend `guvid-history.component.tsx`:
  - Fetch journal entries in parallel with IC trades (one read per user per page load)
  - Match each IC trade row with its journal entry by `tradeId`
  - Add 4 new table columns after "Credit": **Δ**, **IV Rank**, **VIX**, **DTE**
  - Trades without a journal entry (historical): render `—` in the 4 new cells
  - Row click → open **Journal Drawer** (Ionic modal / side sheet) with:
    - All 10 snapshot fields in a 2-column grid
    - Status chip: pending / confirmed / orphan
    - (Reserved space for future: notes, tags)

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Streamer not connected when Send Order fires | Skip capture; log warning; order proceeds normally |
| Firestore write fails | Log error; order proceeds (journal is best-effort, never blocking) |
| User sends 2 identical orders rapidly | 2 separate entries with distinct UUIDs — correct behavior |
| Positions refresh finds no match for a pending entry | After 24h → mark 'orphan' |
| Backend agent + user dispatch same IC simultaneously | 2 entries — each promoted or orphaned independently |
| VIX unavailable from watchlistData | Write `vix: null`; UI shows `—` |
| `expirationDate` format mismatch during promotion match | Normalize both sides to `YYYY-MM-DD` before compare |
| User deletes a position from broker before next refresh | Journal entry stays 'pending' → 'orphan' after 24h |

## Security

Firestore rule already allows `users/{uid}/{subcollection=**}` for authenticated users matching their own UID. No new rule required. Superadmin read access via existing `/credentials?uid=` pattern is NOT extended to journal — user-private.

## Testing

- **Unit** — `TradeJournalService.captureEntry()` with a mock `IronCondorModel` → verify the exact 10-field entry structure is written.
- **Unit** — `promotePending()` with fixture positions → verify correct matches and 24h orphan timeout.
- **Integration (Cypress)** — full Send Order flow in IC Builder against Firestore emulator → verify journal entry lands.
- **Manual QA** — trigger Guvid Agent in dev mode with a staging account → verify backend twin writes entries.
- **TSC** — `npx tsc --noEmit` passes on both root and `functions/`.

## Out of Scope / Future Iterations

- Scope A (notes, tags) — next PR
- Scope C (per-trade detail page, P&L evolution chart) — after A+B have accumulated sufficient data
- Exit snapshot + `exit: {...}` field additions
- Backfill script to reconstruct historical entry snapshots from transaction history + Polygon API

## Acceptance Criteria

1. Opening an IC via IC Builder creates a Firestore entry under `users/{uid}/tradeJournal/{tradeId}` with status='pending' and all 10 entry fields populated.
2. On the next positions refresh after fill, the entry transitions to status='confirmed' with `confirmedAt` set.
3. Guvid History page shows the 4 new columns (Δ, IV Rank, VIX, DTE) populated for trades with journal data, `—` otherwise.
4. Clicking a row with journal data opens a drawer showing all 10 snapshot fields.
5. `npx tsc --noEmit` passes at both root and `functions/`.
6. No regressions in existing Guvid History functionality.

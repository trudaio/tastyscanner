import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeJournalService } from './trade-journal.service';
import type { ITradeJournalEntrySnapshot } from './trade-journal.service.interface';
import type { IPositionViewModel } from '../positions/positions.service.interface';

const mocks = vi.hoisted(() => ({
    setDoc: vi.fn(),
    doc: vi.fn(() => ({ id: 'mock-doc' })),
    collection: vi.fn(),
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

const setDocMock = mocks.setDoc;
const docMock = mocks.doc;
const getDocsMock = mocks.getDocs;
const updateDocMock = mocks.updateDoc;

vi.mock('firebase/firestore', () => ({
    doc: mocks.doc,
    setDoc: mocks.setDoc,
    collection: mocks.collection,
    getDocs: mocks.getDocs,
    updateDoc: mocks.updateDoc,
    serverTimestamp: () => mocks.serverTimestamp(),
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

function mockServices(opts: { vix: number | null; ivRank: number } = { vix: 17.4, ivRank: 42 }) {
    return {
        watchlistData: {
            getTickerData: (ticker: string) => {
                if (ticker === 'VIX') return opts.vix === null ? null : { lastPrice: opts.vix };
                return { ivRank: opts.ivRank };
            },
        },
        logger: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
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

describe('TradeJournalService.getAll', () => {
    beforeEach(() => {
        getDocsMock.mockReset();
    });

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
    beforeEach(() => {
        updateDocMock.mockReset();
    });

    it('updates status to orphan', async () => {
        updateDocMock.mockResolvedValueOnce(undefined);
        const service = new TradeJournalService(mockServices());

        await service.markOrphan('uuid-x');

        expect(updateDocMock).toHaveBeenCalledOnce();
        const [, payload] = updateDocMock.mock.calls[0];
        expect(payload).toEqual({ status: 'orphan' });
    });
});

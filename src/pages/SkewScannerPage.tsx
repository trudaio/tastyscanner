import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
    IonModal,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled, { createGlobalStyle } from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import type { IScannerRow, ScannerRowStatus } from '../services/skew-scanner/skew-scanner.service.interface';

const C = {
    bgPage: '#0a0a0f',
    bgCard: '#12121a',
    bgCardElevated: '#1a1a24',
    border: '#2a2a3a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    accent1: '#3b82f6',
    accent2: '#8b5cf6',
    success: '#22c55e',
    warning: '#facc15',
    danger: '#ef4444',
    info: '#38bdf8',
} as const;

const ScannerPageBackground = createGlobalStyle`
  ion-page.skew-scanner-page ion-content::part(background) {
    background: ${C.bgPage};
  }
`;

const PageBox = styled.div`
  padding: 24px 20px;
  display: grid;
  gap: 20px;
  max-width: 1500px;
  margin: 0 auto;
  color: ${C.text};
`;

const TitleRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const GradientTitle = styled.h1`
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, ${C.accent1}, ${C.accent2});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
`;

const SubTitle = styled.p`
  font-size: 13px;
  color: ${C.textDim};
  margin: 0;
`;

const Card = styled.div`
  background: ${C.bgCard};
  border: 1px solid ${C.border};
  border-radius: 12px;
  padding: 16px 18px;
`;

const ControlsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: ${C.textMuted};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const NumberInput = styled.input`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  width: 90px;
  &:focus { outline: 2px solid ${C.accent1}; outline-offset: -2px; }
`;

const PrimaryButton = styled.button<{ $danger?: boolean }>`
  background: ${(p) => (p.$danger
        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
        : `linear-gradient(135deg, ${C.accent1}, ${C.accent2})`)};
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.15s, transform 0.15s;
  &:hover:not(:disabled) { opacity: 0.92; }
  &:active:not(:disabled) { transform: translateY(1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &:hover { border-color: ${C.accent1}; }
`;

const ProgressBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${C.textDim};
`;

const ProgressTrack = styled.div`
  width: 220px;
  height: 8px;
  background: ${C.bgCardElevated};
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid ${C.border};
`;

const ProgressFill = styled.div<{ $pct: number }>`
  width: ${(p) => `${Math.min(100, Math.max(0, p.$pct))}%`};
  height: 100%;
  background: linear-gradient(90deg, ${C.accent1}, ${C.accent2});
  transition: width 0.3s;
`;

const Scroll = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  color: ${C.text};

  th {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 11px;
    color: ${C.textMuted};
    padding: 10px 12px;
    text-align: right;
    background: ${C.bgCard};
    border-bottom: 1px solid ${C.border};
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    &:hover { color: ${C.text}; }
  }
  th:first-child, td:first-child { text-align: left; }
  th.sorted { color: ${C.accent1}; }

  td {
    padding: 8px 12px;
    text-align: right;
    border-bottom: 1px solid ${C.bgCardElevated};
    white-space: nowrap;
  }
  tr:hover td { background: rgba(255, 255, 255, 0.02); }
`;

const StatusPill = styled.span<{ $status: ScannerRowStatus }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: white;
  background: ${(p) => {
    switch (p.$status) {
        case 'pending': return C.textMuted;
        case 'scanning': return C.accent1;
        case 'done': return C.success;
        case 'error': return C.danger;
        case 'rateLimited': return C.warning;
        default: return C.textMuted;
    }
}};
`;

const Interp = styled.div`
  margin-bottom: 12px;
  padding: 10px 14px;
  background: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #cfd5e0;

  strong { color: #38bdf8; }
`;

// ── Modal ────────────────────────────────────────────────────────────
const ModalShell = styled.div`
  background: ${C.bgPage};
  color: ${C.text};
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid ${C.border};
`;

const ModalTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const ModalBody = styled.div`
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
`;

const ModalFooter = styled.div`
  padding: 12px 20px;
  border-top: 1px solid ${C.border};
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const TickerChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  background: ${C.bgCardElevated};
  border: 1px solid ${C.border};
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: ${C.text};
`;

const ChipDelete = styled.button`
  background: transparent;
  color: ${C.textDim};
  border: none;
  cursor: pointer;
  font-size: 14px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  &:hover { background: ${C.danger}; color: white; }
`;

const AddRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
`;

const TextInput = styled.input`
  flex: 1;
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  text-transform: uppercase;
  font-weight: 700;
  &:focus { outline: 2px solid ${C.accent1}; outline-offset: -2px; }
`;

// ── Helpers ──────────────────────────────────────────────────────────
function fmtPct(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function fmtMoney(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '–';
    return `$${v.toFixed(2)}`;
}

function fmtAge(ms: number | null | undefined): string {
    if (ms == null) return '–';
    const seconds = Math.round((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

function shortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

type SortKey = 'ticker' | 'price' | 'ivRank' | 'avgSkew' | 'lastUpdate';
type SortDir = 'asc' | 'desc';

// ── Page ─────────────────────────────────────────────────────────────
export const SkewScannerPage: React.FC = observer(() => {
    const services = useServices();
    const watchlist = services.skewWatchlist;
    const scanner = services.skewScanner;

    const [delaySec, setDelaySec] = useState<number>(Math.round(scanner.delayMs / 1000));
    const [modalOpen, setModalOpen] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('avgSkew');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        if (watchlist.tickers.length === 0 && !watchlist.isLoading) {
            void watchlist.load();
        }
    }, [watchlist]);

    useEffect(() => {
        scanner.setDelayMs(delaySec * 1000);
    }, [delaySec, scanner]);

    const handleStart = useCallback(() => {
        if (watchlist.tickers.length === 0) return;
        void scanner.start([...watchlist.tickers]);
    }, [scanner, watchlist.tickers]);

    const handleStop = useCallback(() => {
        scanner.stop();
    }, [scanner]);

    const rows = useMemo(() => Array.from(scanner.rows.values()), [scanner.rows]);
    const monthlies = scanner.monthlies;
    const progress = scanner.progress;
    const progressPct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

    const sorted = useMemo(() => {
        const arr = [...rows];
        const dir = sortDir === 'asc' ? 1 : -1;
        arr.sort((a, b) => {
            const av = sortValue(a, sortKey);
            const bv = sortValue(b, sortKey);
            if (av == null && bv == null) return 0;
            if (av == null) return 1; // nulls last
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
        return arr;
    }, [rows, sortKey, sortDir]);

    const handleSort = (key: SortKey): void => {
        if (sortKey === key) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'ticker' ? 'asc' : 'desc');
        }
    };

    const interp = buildScannerInterp(rows);

    return (
        <IonPage className="skew-scanner-page">
            <ScannerPageBackground />
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Skew Scanner</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <PageBox>
                    <TitleRow>
                        <GradientTitle>Skew Scanner</GradientTitle>
                        <SubTitle>
                            25Δ premium skew across the next 3 monthly expirations for your watchlist — Polygon.io chains + TastyTrade IV rank.
                        </SubTitle>
                    </TitleRow>

                    <Card>
                        <ControlsRow>
                            {!scanner.isRunning ? (
                                <PrimaryButton onClick={handleStart} disabled={watchlist.tickers.length === 0}>
                                    ▶ Start Scan ({watchlist.tickers.length})
                                </PrimaryButton>
                            ) : (
                                <PrimaryButton $danger onClick={handleStop}>■ Stop</PrimaryButton>
                            )}
                            <Field>
                                Delay (seconds)
                                <NumberInput
                                    type="number"
                                    min={0}
                                    max={60}
                                    value={delaySec}
                                    onChange={(e) => setDelaySec(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
                                    disabled={scanner.isRunning}
                                />
                            </Field>
                            <ProgressBar>
                                <ProgressTrack><ProgressFill $pct={progressPct} /></ProgressTrack>
                                <span>{progress.done}/{progress.total}</span>
                            </ProgressBar>
                            <span style={{ flex: 1 }} />
                            <SecondaryButton onClick={() => setModalOpen(true)}>
                                Edit Watchlist ({watchlist.tickers.length})
                            </SecondaryButton>
                        </ControlsRow>
                        {monthlies.length > 0 && (
                            <div style={{ marginTop: 12, fontSize: 12, color: C.textDim }}>
                                Scanning monthlies: {monthlies.map((m) => shortDate(m)).join(' • ')}
                            </div>
                        )}
                        {watchlist.error && (
                            <div style={{ marginTop: 8, color: C.danger, fontSize: 12 }}>
                                Watchlist error: {watchlist.error}
                            </div>
                        )}
                    </Card>

                    {rows.length > 0 && <Interp dangerouslySetInnerHTML={{ __html: interp }} />}

                    <Card style={{ padding: 0 }}>
                        <Scroll>
                            <Table>
                                <thead>
                                    <tr>
                                        <th
                                            className={sortKey === 'ticker' ? 'sorted' : ''}
                                            onClick={() => handleSort('ticker')}
                                        >
                                            Ticker {sortKey === 'ticker' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            className={sortKey === 'price' ? 'sorted' : ''}
                                            onClick={() => handleSort('price')}
                                        >
                                            Price {sortKey === 'price' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            className={sortKey === 'ivRank' ? 'sorted' : ''}
                                            onClick={() => handleSort('ivRank')}
                                        >
                                            IV Rank {sortKey === 'ivRank' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        {monthlies.map((m) => (
                                            <th key={`h-${m}`}>25Δ Skew — {shortDate(m)}</th>
                                        ))}
                                        <th
                                            className={sortKey === 'avgSkew' ? 'sorted' : ''}
                                            onClick={() => handleSort('avgSkew')}
                                        >
                                            Avg Skew {sortKey === 'avgSkew' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            className={sortKey === 'lastUpdate' ? 'sorted' : ''}
                                            onClick={() => handleSort('lastUpdate')}
                                        >
                                            Updated {sortKey === 'lastUpdate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.length === 0 ? (
                                        <tr>
                                            <td colSpan={6 + monthlies.length} style={{ textAlign: 'center', color: C.textMuted, padding: 30 }}>
                                                No scan yet — click Start Scan to populate.
                                            </td>
                                        </tr>
                                    ) : sorted.map((r) => (
                                        <tr key={r.ticker}>
                                            <td style={{ fontWeight: 700, color: C.text }}>{r.ticker}</td>
                                            <td>{fmtMoney(r.price)}</td>
                                            <td style={{ color: ivRankColor(r.ivRank) }}>{r.ivRank == null ? '–' : r.ivRank}</td>
                                            {monthlies.map((m) => (
                                                <td key={`r-${r.ticker}-${m}`} style={{ color: skewColor(r.skewByMonth[m] ?? null) }}>
                                                    {fmtPct(r.skewByMonth[m] ?? null)}
                                                </td>
                                            ))}
                                            <td style={{ color: skewColor(r.avgSkewPct), fontWeight: 700 }}>{fmtPct(r.avgSkewPct)}</td>
                                            <td style={{ color: C.textDim, fontSize: 11 }}>{fmtAge(r.lastUpdate)}</td>
                                            <td>
                                                <StatusPill $status={r.status}>{r.status}</StatusPill>
                                                {r.errorMessage && (
                                                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{r.errorMessage}</div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </Scroll>
                    </Card>
                </PageBox>

                <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
                    <ModalShell>
                        <WatchlistEditor onClose={() => setModalOpen(false)} />
                    </ModalShell>
                </IonModal>
            </IonContent>
        </IonPage>
    );
});

const WatchlistEditor: React.FC<{ onClose: () => void }> = observer(({ onClose }) => {
    const services = useServices();
    const watchlist = services.skewWatchlist;
    const [input, setInput] = useState('');

    const handleAdd = useCallback(async () => {
        const v = input.trim().toUpperCase();
        if (!v) return;
        await watchlist.add(v);
        setInput('');
    }, [input, watchlist]);

    return (
        <>
            <ModalHeader>
                <ModalTitle>Edit Watchlist ({watchlist.tickers.length})</ModalTitle>
                <SecondaryButton onClick={onClose}>Close</SecondaryButton>
            </ModalHeader>
            <ModalBody>
                <TickerChipRow>
                    {watchlist.tickers.map((t) => (
                        <Chip key={t}>
                            {t}
                            <ChipDelete onClick={() => void watchlist.remove(t)} aria-label={`Remove ${t}`}>×</ChipDelete>
                        </Chip>
                    ))}
                    {watchlist.tickers.length === 0 && (
                        <span style={{ color: C.textMuted, fontSize: 13 }}>No tickers — use Reset to load defaults or add below.</span>
                    )}
                </TickerChipRow>

                <AddRow>
                    <TextInput
                        value={input}
                        onChange={(e) => setInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                        placeholder="ADD TICKER (e.g. AAPL)"
                        maxLength={6}
                    />
                    <PrimaryButton onClick={() => void handleAdd()}>Add</PrimaryButton>
                </AddRow>

                {watchlist.error && (
                    <div style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>
                        Error: {watchlist.error}
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                <SecondaryButton onClick={() => void watchlist.reset()}>Reset to default 100</SecondaryButton>
                <PrimaryButton onClick={onClose}>Done</PrimaryButton>
            </ModalFooter>
        </>
    );
});

// ── helpers below ────────────────────────────────────────────────────
function sortValue(r: IScannerRow, key: SortKey): number | string | null {
    switch (key) {
        case 'ticker': return r.ticker;
        case 'price': return r.price;
        case 'ivRank': return r.ivRank;
        case 'avgSkew': return r.avgSkewPct;
        case 'lastUpdate': return r.lastUpdate;
        default: return null;
    }
}

function ivRankColor(v: number | null): string {
    if (v == null) return C.textMuted;
    if (v >= 50) return C.success;
    if (v >= 30) return C.warning;
    return C.danger;
}

function skewColor(v: number | null): string {
    if (v == null) return C.textMuted;
    if (v > 30) return C.danger;
    if (v > 5) return C.warning;
    if (v < -5) return C.success;
    return C.text;
}

function buildScannerInterp(rows: IScannerRow[]): string {
    const done = rows.filter((r) => r.status === 'done' && r.avgSkewPct != null);
    if (done.length === 0) return '<strong>Scan in progress.</strong> Once tickers complete, this row summarises which names are showing the highest fear premium and which look bullish (calls richer than puts).';
    const sortedDesc = [...done].sort((a, b) => (b.avgSkewPct ?? 0) - (a.avgSkewPct ?? 0));
    const top3 = sortedDesc.slice(0, 3);
    const bot3 = sortedDesc.slice(-3).reverse();
    const high = top3.map((r) => `<strong>${r.ticker}</strong> (${fmtPct(r.avgSkewPct)})`).join(', ');
    const low = bot3.map((r) => `<strong>${r.ticker}</strong> (${fmtPct(r.avgSkewPct)})`).join(', ');
    const avgIvr = (() => {
        const ivrs = done.map((r) => r.ivRank).filter((v): v is number => v != null);
        return ivrs.length ? Math.round(ivrs.reduce((a, b) => a + b, 0) / ivrs.length) : null;
    })();
    return (
        `<strong>Scan summary (${done.length} of ${rows.length}):</strong> ` +
        `Highest put skew (most fear / hedging): ${high}. ` +
        `Lowest put skew / call-led (most bullish): ${low}. ` +
        (avgIvr != null ? `Average IV rank across the watchlist is <strong>${avgIvr}</strong>. ` : '') +
        `Sort by Avg Skew or any column header to drill in. Names with positive skew &gt; 20% are typical IC short-strike candidates if IV rank is also elevated.`
    );
}

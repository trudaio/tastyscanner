import React, { useState, useCallback, useMemo } from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
    IonSpinner,
    IonNote,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled, { createGlobalStyle } from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import type { ISkewSnapshot, SuggestionLevel } from '../services/skew-analysis/skew-analysis.service.interface';
import SkewErrorBoundary from '../components/skew/skew-error-boundary.component';
import { SkewChartComponent } from '../components/skew/skew-chart.component';
import { SkewStatsRow } from '../components/skew/skew-stats-row.component';
import { SkewPremiumSkewChart } from '../components/skew/skew-premium-skew-chart.component';
import { SkewScatterChart } from '../components/skew/skew-scatter.component';
import { SkewDeltaTable } from '../components/skew/skew-delta-table.component';
import { SkewByDistanceTable } from '../components/skew/skew-by-distance-table.component';
import { SkewOiByStrikes } from '../components/skew/skew-oi-by-strikes.component';

// ── v13-inspired palette ────────────────────────────────────────────────
const C = {
    bgPage: '#0a0a0f',
    bgCard: '#12121a',
    bgCardElevated: '#1a1a24',
    border: '#2a2a3a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    accent1: '#3b82f6', // blue (10Δ)
    accent2: '#8b5cf6', // purple (20Δ)
    accent3: '#06b6d4', // cyan (30Δ)
    accent4: '#f59e0b', // orange (40Δ)
    success: '#22c55e',
    warning: '#facc15',
    danger: '#ef4444',
    info: '#38bdf8',
} as const;

const TOP_ETFS: readonly string[] = ['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'DIA', 'VTI', 'VOO', 'EEM', 'XLF'];

// Override Ionic content background only on this page (scoped by IonPage class).
const SkewPageBackground = createGlobalStyle`
  ion-page.skew-analysis-page ion-content::part(background) {
    background: ${C.bgPage};
  }
`;

const PageBox = styled.div`
  padding: 24px 20px;
  display: grid;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
  color: ${C.text};
`;

const PageTitleRow = styled.div`
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
  padding: 18px 20px;
`;

const CardTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${C.textDim};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
`;

const SectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`;

const ControlsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 140px;
`;

const Label = styled.label`
  font-size: 11px;
  color: ${C.textMuted};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-bottom: 6px;
`;

const DateInput = styled.input`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color-scheme: dark;
  &:focus { outline: 2px solid ${C.accent1}; outline-offset: -2px; }
`;

const TextInput = styled.input`
  background: ${C.bgCardElevated};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.04em;
  &:focus { outline: 2px solid ${C.accent1}; outline-offset: -2px; }
`;

const PrimaryButton = styled.button`
  background: linear-gradient(135deg, ${C.accent1}, ${C.accent2});
  color: white;
  border: none;
  border-radius: 8px;
  padding: 11px 22px;
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

const EtfRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`;

const EtfButton = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? C.accent1 : C.bgCardElevated)};
  color: ${(p) => (p.$active ? 'white' : C.text)};
  border: 1px solid ${(p) => (p.$active ? C.accent1 : C.border)};
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${(p) => (p.$active ? C.accent1 : '#22222e')}; border-color: ${C.accent1}; }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
`;

const MetricCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MetricValue = styled.div`
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
  color: ${C.text};
`;

const MetricSub = styled.div`
  font-size: 12px;
  color: ${C.textDim};
`;

const StatusBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: ${C.textDim};
`;

const StatusPill = styled.span<{ $tone: 'good' | 'warn' | 'bad' | 'neutral' }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: white;
  background: ${(p) => {
    if (p.$tone === 'good') return C.success;
    if (p.$tone === 'warn') return C.warning;
    if (p.$tone === 'bad') return C.danger;
    return C.textMuted;
}};
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  @media (max-width: 980px) { grid-template-columns: 1fr; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: ${C.text};

  th, td {
    padding: 10px 12px;
    text-align: right;
    border-bottom: 1px solid ${C.border};
  }
  th:first-child, td:first-child { text-align: left; }
  th {
    font-weight: 700;
    color: ${C.textMuted};
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid ${C.border};
  }
  tr:last-child td { border-bottom: none; }
`;

const KvRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
  &:not(:last-child) { border-bottom: 1px solid ${C.border}; }
`;

const KvLabel = styled.span`
  color: ${C.textDim};
`;

const KvValue = styled.span`
  color: ${C.text};
  font-weight: 600;
`;

const InsightRow = styled.div<{ $tone: SuggestionLevel }>`
  padding: 10px 14px;
  border-radius: 8px;
  background: ${(p) => {
    if (p.$tone === 'success') return 'rgba(34, 197, 94, 0.10)';
    if (p.$tone === 'warning') return 'rgba(250, 204, 21, 0.10)';
    if (p.$tone === 'info') return 'rgba(56, 189, 248, 0.10)';
    return 'rgba(160, 160, 176, 0.08)';
}};
  border-left: 3px solid ${(p) => {
    if (p.$tone === 'success') return C.success;
    if (p.$tone === 'warning') return C.warning;
    if (p.$tone === 'info') return C.info;
    return C.textMuted;
}};
  font-size: 13px;
  margin-bottom: 8px;
  &:last-child { margin-bottom: 0; }
`;

const ASSESSMENT_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
    'Bullish': 'good',
    'Balanced': 'neutral',
    'Normal': 'neutral',
    'Elevated Fear': 'bad',
    'Unknown': 'neutral',
};

function isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function defaultDateRange(): { from: string; to: string } {
    const today = new Date();
    const ninety = new Date();
    ninety.setDate(ninety.getDate() + 90);
    return { from: isoDate(today), to: isoDate(ninety) };
}

function toNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function fmtNum(v: unknown, digits = 2): string {
    const n = toNum(v);
    return n == null ? '–' : n.toFixed(digits);
}

function fmtPct(v: unknown, digits = 1): string {
    const n = toNum(v);
    if (n == null) return '–';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function fmtMoney(v: unknown): string {
    const n = toNum(v);
    return n == null ? '–' : `$${n.toFixed(2)}`;
}

export const SkewAnalysisPage: React.FC = observer(() => {
    const services = useServices();
    const skew = services.skewAnalysis;

    const [ticker, setTicker] = useState('SPY');
    const initialRange = useMemo(defaultDateRange, []);
    const [fromDate, setFromDate] = useState(initialRange.from);
    const [toDate, setToDate] = useState(initialRange.to);

    const symbol = ticker.toUpperCase();
    const snapshot = skew.getSnapshot(symbol);
    const isLoading = skew.isLoading(symbol);
    const error = skew.getError(symbol);

    const handleLoad = useCallback(() => {
        if (!ticker.trim()) return;
        void skew.loadSnapshot(ticker.trim().toUpperCase(), fromDate, toDate);
    }, [skew, ticker, fromDate, toDate]);

    const handleEtfClick = useCallback((etf: string) => {
        setTicker(etf);
        void skew.loadSnapshot(etf, fromDate, toDate);
    }, [skew, fromDate, toDate]);

    return (
        <IonPage className="skew-analysis-page">
            <SkewPageBackground />
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Skew Analysis</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <PageBox>
                    <PageTitleRow>
                        <GradientTitle>Skew Analysis</GradientTitle>
                        <SubTitle>Implied volatility skew across delta levels — Polygon.io chains + TastyTrade IV metrics</SubTitle>
                    </PageTitleRow>

                    <Card>
                        <ControlsRow>
                            <Field>
                                <Label>Ticker</Label>
                                <TextInput
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="SPY"
                                    maxLength={6}
                                />
                            </Field>
                            <Field>
                                <Label>From</Label>
                                <DateInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                            </Field>
                            <Field>
                                <Label>To</Label>
                                <DateInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                            </Field>
                            <PrimaryButton onClick={handleLoad} disabled={isLoading}>
                                {isLoading ? <IonSpinner name="dots" style={{ height: 16 }} /> : 'Load Skew'}
                            </PrimaryButton>
                            <StatusBar style={{ marginLeft: 'auto' }}>
                                <span>Polygon</span>
                                <StatusPill $tone={skew.hasPolygonKey ? 'good' : 'bad'}>
                                    {skew.hasPolygonKey ? 'configured' : 'missing'}
                                </StatusPill>
                                <span>FMP</span>
                                <StatusPill $tone={skew.hasFmpKey ? 'good' : 'neutral'}>
                                    {skew.hasFmpKey ? 'configured' : 'fallback'}
                                </StatusPill>
                            </StatusBar>
                        </ControlsRow>

                        <EtfRow>
                            {TOP_ETFS.map((etf) => (
                                <EtfButton
                                    key={etf}
                                    $active={ticker === etf}
                                    onClick={() => handleEtfClick(etf)}
                                    disabled={isLoading}
                                >
                                    {etf}
                                </EtfButton>
                            ))}
                        </EtfRow>
                    </Card>

                    {error && (
                        <Card style={{ borderColor: C.danger, color: C.danger }}>
                            <strong>Error:</strong> {error}
                        </Card>
                    )}

                    {snapshot && <SnapshotView snapshot={snapshot} />}

                    {!snapshot && !isLoading && !error && (
                        <Card>
                            <CardTitle>Ready</CardTitle>
                            <div style={{ color: C.textDim, fontSize: 14 }}>
                                Pick a ticker above (or type one) and click <strong style={{ color: C.text }}>Load Skew</strong> to populate the chart, IV metrics, max pain, expected move, P/C ratio, basic technicals, suggested trades, and strike-by-distance.
                            </div>
                        </Card>
                    )}
                </PageBox>
            </IonContent>
        </IonPage>
    );
});

const SnapshotView: React.FC<{ snapshot: ISkewSnapshot }> = ({ snapshot }) => {
    const { ivMetrics, basicTechnicals, suggestedTrades } = snapshot;
    const tone = ASSESSMENT_TONE[suggestedTrades.assessment] ?? 'neutral';

    const expirationOptions = snapshot.expirationDetails.map((d) => ({
        expiration: d.expiration,
        label: `${d.expiration} (${d.isMonthly ? 'May' : 'wk'})`.replace(/\(.*\)/, () => {
            const dt = new Date(d.expiration + 'T00:00:00');
            return `(${dt.toLocaleDateString('en-US', { month: 'short' })})`;
        }),
        isMonthly: d.isMonthly,
    }));
    const defaultMonthly = snapshot.expirationDetails.find((d) => d.isMonthly)?.expiration;

    return (
        <>
            <SkewStatsRow ticker={snapshot.ticker} summary={snapshot.summary} />

            <Card>
                <SectionHeading>
                    <div>
                        <CardTitle>{snapshot.ticker} — Premium Skew (%)</CardTitle>
                        <MetricSub>4 lines (10/20/30/40Δ) + put/call volume bars per expiration</MetricSub>
                    </div>
                </SectionHeading>
                <SkewErrorBoundary fallbackTitle="Premium skew chart">
                    <SkewPremiumSkewChart
                        chartData={snapshot.chartData}
                        expirationDetails={snapshot.expirationDetails}
                    />
                </SkewErrorBoundary>
            </Card>

            <Card>
                <SectionHeading>
                    <div>
                        <CardTitle>{snapshot.ticker} — Skew Chart (IV by delta level)</CardTitle>
                        <MetricSub>
                            {snapshot.chartData.length} expirations • range {snapshot.fromDate} → {snapshot.toDate}
                        </MetricSub>
                    </div>
                </SectionHeading>
                <SkewErrorBoundary fallbackTitle="IV skew chart">
                    <SkewChartComponent data={snapshot.chartData.slice()} />
                </SkewErrorBoundary>
            </Card>

            <Card>
                <SkewErrorBoundary fallbackTitle="Bell curve">
                    <SkewScatterChart
                        mode="bell"
                        strikesByExpiration={snapshot.strikesByExpiration}
                        expirations={expirationOptions}
                        defaultExpiration={defaultMonthly}
                        stockPrice={snapshot.stockPrice}
                    />
                </SkewErrorBoundary>
            </Card>

            <Card>
                <SkewErrorBoundary fallbackTitle="Volatility smile">
                    <SkewScatterChart
                        mode="smile"
                        strikesByExpiration={snapshot.strikesByExpiration}
                        expirations={expirationOptions}
                        defaultExpiration={defaultMonthly}
                        stockPrice={snapshot.stockPrice}
                    />
                </SkewErrorBoundary>
            </Card>

            <Card>
                <SkewErrorBoundary fallbackTitle="Open Interest by Strikes">
                    <SkewOiByStrikes
                        ticker={snapshot.ticker}
                        stockPrice={snapshot.stockPrice}
                        strikesByExpiration={snapshot.strikesByExpiration}
                        expirations={expirationOptions}
                    />
                </SkewErrorBoundary>
            </Card>

            <SkewErrorBoundary fallbackTitle="Delta table">
                <SkewDeltaTable
                    ticker={snapshot.ticker}
                    stockPrice={snapshot.stockPrice}
                    expirationDetails={snapshot.expirationDetails}
                />
            </SkewErrorBoundary>

            <MetricGrid>
                <MetricCard>
                    <CardTitle>IV Metrics</CardTitle>
                    <MetricValue>{ivMetrics.ivRank == null ? '–' : ivMetrics.ivRank}</MetricValue>
                    <MetricSub>IV Rank</MetricSub>
                    <KvRow><KvLabel>IV Percentile</KvLabel><KvValue>{ivMetrics.ivPercentile == null ? '–' : ivMetrics.ivPercentile}</KvValue></KvRow>
                    <KvRow><KvLabel>IV Index</KvLabel><KvValue>{fmtPct(ivMetrics.ivIndex, 1)}</KvValue></KvRow>
                    <KvRow><KvLabel>Beta</KvLabel><KvValue>{fmtNum(ivMetrics.beta, 2)}</KvValue></KvRow>
                </MetricCard>
            </MetricGrid>

            <TwoCol>
                <Card>
                    <CardTitle>Basic Technicals (Polygon)</CardTitle>
                    <Table>
                        <tbody>
                            <tr><td>RSI(14)</td><td>{fmtNum(basicTechnicals.rsi14, 2)}</td></tr>
                            <tr><td>ATR(14)</td><td>{fmtNum(basicTechnicals.atr14, 2)}</td></tr>
                            <tr><td>Historical Vol (30d)</td><td>{fmtPct(basicTechnicals.historicalVolatility30, 1)}</td></tr>
                            <tr><td>52W High</td><td>{fmtMoney(basicTechnicals.week52High)}</td></tr>
                            <tr><td>52W Low</td><td>{fmtMoney(basicTechnicals.week52Low)}</td></tr>
                            <tr><td>52W Position</td><td>{fmtNum(basicTechnicals.week52RangePct, 0)}%</td></tr>
                            <tr><td>YTD Return</td><td>{fmtPct(basicTechnicals.ytdReturnPct, 1)}</td></tr>
                            <tr><td>QTD Return</td><td>{fmtPct(basicTechnicals.qtdReturnPct, 1)}</td></tr>
                        </tbody>
                    </Table>
                    <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted }}>
                        Add VITE_FMP_API_KEY for P/E, EPS, market cap, dividend, beta, and ratios.
                    </div>
                </Card>

                <Card>
                    <SectionHeading>
                        <CardTitle>Suggested Trades</CardTitle>
                        <StatusPill $tone={tone}>{suggestedTrades.assessment}</StatusPill>
                    </SectionHeading>
                    {suggestedTrades.insights.length === 0 ? (
                        <MetricSub>No insights available.</MetricSub>
                    ) : (
                        suggestedTrades.insights.map((ins, i) => (
                            <InsightRow key={i} $tone={ins.level}>{ins.text}</InsightRow>
                        ))
                    )}
                </Card>
            </TwoCol>

            <SkewErrorBoundary fallbackTitle="Strike by distance">
                <SkewByDistanceTable
                    ticker={snapshot.ticker}
                    stockPrice={snapshot.stockPrice}
                    strikesByExpiration={snapshot.strikesByExpiration}
                    expirations={expirationOptions}
                />
            </SkewErrorBoundary>

            {!skew_hasFmpKeyHint() && (
                <IonNote color="medium" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
                    Tip: add VITE_FMP_API_KEY to .env.local to populate the full fundamentals row when you need it.
                </IonNote>
            )}
        </>
    );
};

// Tiny helper just so the ".env" hint above renders without requiring the
// service handle in SnapshotView.
function skew_hasFmpKeyHint(): boolean {
    return Boolean((import.meta.env as Record<string, string | undefined>).VITE_FMP_API_KEY);
}

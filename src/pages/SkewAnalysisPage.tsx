import React, { useState, useCallback, useMemo, Suspense } from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonInput,
    IonButton,
    IonSpinner,
    IonChip,
    IonLabel,
    IonNote,
    IonText,
    IonGrid,
    IonRow,
    IonCol,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import type { ISkewSnapshot, SuggestionLevel } from '../services/skew-analysis/skew-analysis.service.interface';
import SkewErrorBoundary from '../components/skew/skew-error-boundary.component';

// Lazy-load the chart so any runtime issue inside Recharts can't break the
// page during eager module evaluation.
const SkewChartComponent = React.lazy(() => import('../components/skew/skew-chart.component'));

const PageBox = styled.div`
  padding: 16px;
  display: grid;
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
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
  ion-input { background: var(--ion-color-light); border-radius: 8px; --padding-start: 10px; }
`;

const Label = styled.label`
  font-size: 12px;
  color: var(--ion-color-medium);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-left: 4px;
  padding-bottom: 4px;
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
`;

const Big = styled.div`
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

interface PillProps { $tone: 'good' | 'warn' | 'bad' | 'neutral'; }
const Pill = styled.span<PillProps>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: white;
  background: ${(p) => {
    if (p.$tone === 'good') return 'var(--ion-color-success)';
    if (p.$tone === 'bad') return 'var(--ion-color-danger)';
    if (p.$tone === 'warn') return 'var(--ion-color-warning)';
    return 'var(--ion-color-medium)';
}};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    padding: 8px 10px;
    text-align: right;
    border-bottom: 1px solid var(--ion-color-light-shade);
  }
  th:first-child, td:first-child { text-align: left; }
  th { font-weight: 600; color: var(--ion-color-medium); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
`;

interface InsightRowProps { $tone: SuggestionLevel; }
const InsightRow = styled.div<InsightRowProps>`
  padding: 10px 12px;
  border-radius: 8px;
  background: ${(p) => {
    if (p.$tone === 'success') return 'rgba(45, 211, 111, 0.12)';
    if (p.$tone === 'warning') return 'rgba(255, 196, 9, 0.12)';
    if (p.$tone === 'info') return 'rgba(56, 128, 255, 0.12)';
    return 'rgba(146, 148, 156, 0.12)';
}};
  border-left: 3px solid ${(p) => {
    if (p.$tone === 'success') return 'var(--ion-color-success)';
    if (p.$tone === 'warning') return 'var(--ion-color-warning)';
    if (p.$tone === 'info') return 'var(--ion-color-primary)';
    return 'var(--ion-color-medium)';
}};
  font-size: 14px;
  margin-bottom: 8px;
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

function fmtNum(v: number | null | undefined, digits = 2): string {
    return v == null ? '–' : v.toFixed(digits);
}

function fmtPct(v: number | null | undefined, digits = 1): string {
    return v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function fmtMoney(v: number | null | undefined): string {
    return v == null ? '–' : `$${v.toFixed(2)}`;
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

    return (
        <IonPage>
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
                    <IonCard>
                        <IonCardContent>
                            <ControlsRow>
                                <Field>
                                    <Label>Ticker</Label>
                                    <IonInput
                                        value={ticker}
                                        onIonInput={(e) => setTicker(((e.detail.value ?? '') as string).toUpperCase())}
                                        placeholder="SPY"
                                    />
                                </Field>
                                <Field>
                                    <Label>From</Label>
                                    <IonInput type="date" value={fromDate} onIonInput={(e) => setFromDate((e.detail.value ?? '') as string)} />
                                </Field>
                                <Field>
                                    <Label>To</Label>
                                    <IonInput type="date" value={toDate} onIonInput={(e) => setToDate((e.detail.value ?? '') as string)} />
                                </Field>
                                <IonButton onClick={handleLoad} disabled={isLoading}>
                                    {isLoading ? <IonSpinner name="dots" /> : 'Load Skew'}
                                </IonButton>
                                {!skew.hasPolygonKey && (
                                    <IonNote color="danger" style={{ alignSelf: 'center' }}>
                                        Polygon API key missing
                                    </IonNote>
                                )}
                                {!skew.hasFmpKey && (
                                    <IonNote color="medium" style={{ alignSelf: 'center' }}>
                                        FMP key missing — fundamentals fallback
                                    </IonNote>
                                )}
                            </ControlsRow>
                        </IonCardContent>
                    </IonCard>

                    {error && (
                        <IonCard color="danger">
                            <IonCardContent>
                                <strong>Error:</strong> {error}
                            </IonCardContent>
                        </IonCard>
                    )}

                    {snapshot && <SnapshotView snapshot={snapshot} />}

                    {!snapshot && !isLoading && !error && (
                        <IonCard>
                            <IonCardHeader>
                                <IonCardSubtitle>Ready</IonCardSubtitle>
                                <IonCardTitle>Pick a ticker and click Load Skew</IonCardTitle>
                            </IonCardHeader>
                            <IonCardContent>
                                <IonText color="medium">
                                    Default range covers the next 90 days of expirations. The page will
                                    populate the skew chart, IV metrics, max pain, expected move, P/C
                                    ratio, basic technicals, suggested trades and strike-by-distance.
                                </IonText>
                            </IonCardContent>
                        </IonCard>
                    )}
                </PageBox>
            </IonContent>
        </IonPage>
    );
});

const SnapshotView: React.FC<{ snapshot: ISkewSnapshot }> = ({ snapshot }) => {
    const { ivMetrics, maxPain, expectedMove, putCallRatio, basicTechnicals, suggestedTrades } = snapshot;
    const tone = ASSESSMENT_TONE[suggestedTrades.assessment] ?? 'neutral';

    return (
        <>
            <IonCard>
                <IonCardHeader>
                    <IonCardSubtitle>{snapshot.ticker} • last close {fmtMoney(snapshot.stockPrice)}</IonCardSubtitle>
                    <IonCardTitle>Skew Chart — IV by delta level</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                    <SkewErrorBoundary fallbackTitle="Skew chart">
                        <Suspense fallback={<div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IonSpinner name="dots" /></div>}>
                            <SkewChartComponent data={snapshot.chartData} />
                        </Suspense>
                    </SkewErrorBoundary>
                </IonCardContent>
            </IonCard>

            <MetricGrid>
                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>IV Metrics</IonCardSubtitle>
                        <IonCardTitle>
                            <Big>{ivMetrics.ivRank == null ? '–' : ivMetrics.ivRank}</Big>
                            <span style={{ fontSize: 14, color: 'var(--ion-color-medium)', fontWeight: 400 }}> IV Rank</span>
                        </IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <IonGrid>
                            <IonRow>
                                <IonCol>IV Percentile</IonCol>
                                <IonCol style={{ textAlign: 'right' }}>{ivMetrics.ivPercentile == null ? '–' : `${ivMetrics.ivPercentile}`}</IonCol>
                            </IonRow>
                            <IonRow>
                                <IonCol>IV Index</IonCol>
                                <IonCol style={{ textAlign: 'right' }}>{ivMetrics.ivIndex == null ? '–' : `${ivMetrics.ivIndex.toFixed(1)}%`}</IonCol>
                            </IonRow>
                            <IonRow>
                                <IonCol>Beta</IonCol>
                                <IonCol style={{ textAlign: 'right' }}>{fmtNum(ivMetrics.beta, 2)}</IonCol>
                            </IonRow>
                        </IonGrid>
                    </IonCardContent>
                </IonCard>

                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>Max Pain</IonCardSubtitle>
                        <IonCardTitle>
                            <Big>{maxPain == null ? '–' : `$${maxPain}`}</Big>
                        </IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <IonText color="medium">
                            Strike where aggregate option holder losses are maximised across the
                            front-monthly chain. Used as a magnet level into expiration.
                        </IonText>
                    </IonCardContent>
                </IonCard>

                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>Expected Move</IonCardSubtitle>
                        <IonCardTitle>
                            <Big>{expectedMove == null ? '–' : `±$${expectedMove.dollars.toFixed(2)}`}</Big>
                            <span style={{ fontSize: 14, color: 'var(--ion-color-medium)', fontWeight: 400 }}>
                                {expectedMove == null ? '' : ` ${expectedMove.percent.toFixed(2)}%`}
                            </span>
                        </IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        {expectedMove ? (
                            <IonText>
                                Range: ${expectedMove.lowerBound.toFixed(2)} → ${expectedMove.upperBound.toFixed(2)}
                            </IonText>
                        ) : (
                            <IonText color="medium">No ATM straddle data.</IonText>
                        )}
                    </IonCardContent>
                </IonCard>

                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>P/C Ratio (60d volume)</IonCardSubtitle>
                        <IonCardTitle>
                            <Big>{putCallRatio == null ? '–' : putCallRatio.ratio.toFixed(2)}</Big>
                        </IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        {putCallRatio ? (
                            <IonText color="medium">
                                Puts: {putCallRatio.putVolume.toLocaleString()} • Calls: {putCallRatio.callVolume.toLocaleString()}
                            </IonText>
                        ) : (
                            <IonText color="medium">No volume data.</IonText>
                        )}
                    </IonCardContent>
                </IonCard>
            </MetricGrid>

            <TwoCol>
                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>Basic Technicals (Polygon)</IonCardSubtitle>
                        <IonCardTitle>Fundamentals</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <Table>
                            <tbody>
                                <tr><td>RSI(14)</td><td>{fmtNum(basicTechnicals.rsi14)}</td></tr>
                                <tr><td>ATR(14)</td><td>{fmtNum(basicTechnicals.atr14)}</td></tr>
                                <tr><td>Historical Vol (30d)</td><td>{fmtPct(basicTechnicals.historicalVolatility30, 1)}</td></tr>
                                <tr><td>52W High</td><td>{fmtMoney(basicTechnicals.week52High)}</td></tr>
                                <tr><td>52W Low</td><td>{fmtMoney(basicTechnicals.week52Low)}</td></tr>
                                <tr><td>52W Position</td><td>{fmtNum(basicTechnicals.week52RangePct, 0)}%</td></tr>
                                <tr><td>YTD Return</td><td>{fmtPct(basicTechnicals.ytdReturnPct, 1)}</td></tr>
                                <tr><td>QTD Return</td><td>{fmtPct(basicTechnicals.qtdReturnPct, 1)}</td></tr>
                            </tbody>
                        </Table>
                        <IonNote color="medium" style={{ display: 'block', marginTop: 8 }}>
                            Add VITE_FMP_API_KEY for P/E, EPS, market cap, dividend, beta and more.
                        </IonNote>
                    </IonCardContent>
                </IonCard>

                <IonCard>
                    <IonCardHeader>
                        <IonCardSubtitle>
                            Assessment <Pill $tone={tone}>{suggestedTrades.assessment}</Pill>
                        </IonCardSubtitle>
                        <IonCardTitle>Suggested Trades</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        {suggestedTrades.insights.length === 0 ? (
                            <IonText color="medium">No insights available.</IonText>
                        ) : (
                            suggestedTrades.insights.map((ins, i) => (
                                <InsightRow key={i} $tone={ins.level}>{ins.text}</InsightRow>
                            ))
                        )}
                    </IonCardContent>
                </IonCard>
            </TwoCol>

            <IonCard>
                <IonCardHeader>
                    <IonCardSubtitle>Front monthly expiration</IonCardSubtitle>
                    <IonCardTitle>Strike by Distance</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                    <Table>
                        <thead>
                            <tr>
                                <th>Distance</th>
                                <th>Put Strike</th>
                                <th>Put Δ</th>
                                <th>Put Premium</th>
                                <th>Put Volume</th>
                                <th>Call Strike</th>
                                <th>Call Δ</th>
                                <th>Call Premium</th>
                                <th>Call Volume</th>
                            </tr>
                        </thead>
                        <tbody>
                            {snapshot.byDistance.map((row) => (
                                <tr key={row.distancePct}>
                                    <td><IonChip color="primary"><IonLabel>±{row.distancePct}%</IonLabel></IonChip></td>
                                    <td>{row.put ? fmtMoney(row.put.strike) : '–'}</td>
                                    <td>{row.put?.delta == null ? '–' : row.put.delta.toFixed(2)}</td>
                                    <td>{row.put ? fmtMoney(row.put.premium) : '–'}</td>
                                    <td>{row.put ? row.put.volume.toLocaleString() : '–'}</td>
                                    <td>{row.call ? fmtMoney(row.call.strike) : '–'}</td>
                                    <td>{row.call?.delta == null ? '–' : row.call.delta.toFixed(2)}</td>
                                    <td>{row.call ? fmtMoney(row.call.premium) : '–'}</td>
                                    <td>{row.call ? row.call.volume.toLocaleString() : '–'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </IonCardContent>
            </IonCard>
        </>
    );
};

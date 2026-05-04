import React, { useState, useCallback, useMemo } from 'react';
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
    IonNote,
    IonText,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import type { ISkewSnapshot } from '../services/skew-analysis/skew-analysis.service.interface';

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

const Big = styled.div`
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
`;

const Pre = styled.pre`
  background: var(--ion-color-light);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow: auto;
`;

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
                                    Diagnostic build — the chart is temporarily disabled while we
                                    isolate a runtime crash. Data fetch + processing still runs end to end.
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
    return (
        <>
            <IonCard>
                <IonCardHeader>
                    <IonCardSubtitle>{snapshot.ticker} • last close {fmtMoney(snapshot.stockPrice)}</IonCardSubtitle>
                    <IonCardTitle>Snapshot loaded — {snapshot.chartData.length} expirations</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                    <MetricGrid>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>IV Rank</div>
                            <Big>{ivMetrics.ivRank == null ? '–' : ivMetrics.ivRank}</Big>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Max Pain</div>
                            <Big>{maxPain == null ? '–' : `$${maxPain}`}</Big>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Expected Move</div>
                            <Big>{expectedMove == null ? '–' : `±$${expectedMove.dollars.toFixed(2)}`}</Big>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>P/C Ratio</div>
                            <Big>{putCallRatio == null ? '–' : putCallRatio.ratio.toFixed(2)}</Big>
                        </div>
                    </MetricGrid>
                </IonCardContent>
            </IonCard>

            <IonCard>
                <IonCardHeader>
                    <IonCardTitle>Diagnostic JSON</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                    <Pre>{JSON.stringify({
                        firstChartPoint: snapshot.chartData[0] ?? null,
                        ivMetrics,
                        maxPain,
                        expectedMove,
                        putCallRatio,
                        basicTechnicals,
                        suggestedTrades,
                        byDistance: snapshot.byDistance,
                    }, null, 2)}</Pre>
                </IonCardContent>
            </IonCard>
        </>
    );
};

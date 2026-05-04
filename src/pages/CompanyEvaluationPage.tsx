import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonSpinner,
    IonTitle,
    IonToolbar,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled, { createGlobalStyle } from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import { SkewWatchlistSidebar } from '../components/skew/skew-watchlist-sidebar.component';
import { SkewCompanyEvaluation } from '../components/skew/skew-company-evaluation.component';
import { SkewFundamentalsChart } from '../components/skew/skew-fundamentals-chart.component';
import SkewErrorBoundary from '../components/skew/skew-error-boundary.component';

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
    danger: '#ef4444',
} as const;

const PageBackground = createGlobalStyle`
  ion-page.company-evaluation-page ion-content::part(background) {
    background: ${C.bgPage};
  }
`;

const PageBox = styled.div`
  padding: 24px 20px;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  max-width: 1600px;
  margin: 0 auto;
  color: ${C.text};
  align-items: start;
  @media (max-width: 980px) { grid-template-columns: 1fr; }
`;

const MainContent = styled.div`
  display: grid;
  gap: 20px;
  min-width: 0;
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
  padding: 18px 20px;
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

export const CompanyEvaluationPage: React.FC = observer(() => {
    const services = useServices();
    const skew = services.skewAnalysis;

    const [ticker, setTicker] = useState('AAPL');
    const symbol = ticker.toUpperCase();
    const range = useMemo(defaultDateRange, []);

    const snapshot = skew.getSnapshot(symbol);
    const isLoading = skew.isLoading(symbol);
    const error = skew.getError(symbol);

    const handleLoad = useCallback((t?: string) => {
        const target = (t ?? ticker).trim().toUpperCase();
        if (!target) return;
        setTicker(target);
        void skew.loadSnapshot(target, range.from, range.to);
    }, [skew, ticker, range.from, range.to]);

    // Auto-load default ticker on mount if we don't have a snapshot yet
    useEffect(() => {
        if (!snapshot && !isLoading && !error) {
            void skew.loadSnapshot(symbol, range.from, range.to);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePick = useCallback((t: string) => {
        handleLoad(t);
    }, [handleLoad]);

    return (
        <IonPage className="company-evaluation-page">
            <PageBackground />
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Company Evaluation</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <PageBox>
                    <SkewWatchlistSidebar
                        activeTicker={symbol}
                        onPick={handlePick}
                        isLoading={isLoading}
                        isTickerLoading={(t) => skew.isLoading(t)}
                    />

                    <MainContent>
                        <TitleRow>
                            <GradientTitle>Company Evaluation</GradientTitle>
                            <SubTitle>Finviz-style fundamentals overview, plus quarterly price vs EPS — Financial Modeling Prep + Polygon.io.</SubTitle>
                        </TitleRow>

                        <Card>
                            <ControlsRow>
                                <Field>
                                    <Label>Ticker</Label>
                                    <TextInput
                                        value={ticker}
                                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                        placeholder="AAPL"
                                        maxLength={6}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(); }}
                                    />
                                </Field>
                                <PrimaryButton onClick={() => handleLoad()} disabled={isLoading}>
                                    {isLoading ? <IonSpinner name="dots" style={{ height: 16 }} /> : 'Load Company'}
                                </PrimaryButton>
                            </ControlsRow>
                        </Card>

                        {error && (
                            <Card style={{ borderColor: C.danger, color: C.danger }}>
                                <strong>Error:</strong> {error}
                            </Card>
                        )}

                        {snapshot && (
                            <>
                                <SkewErrorBoundary fallbackTitle="Company Evaluation">
                                    <SkewCompanyEvaluation
                                        ticker={snapshot.ticker}
                                        stockPrice={snapshot.stockPrice}
                                        fmp={snapshot.fmpFundamentals}
                                        technicals={snapshot.basicTechnicals}
                                    />
                                </SkewErrorBoundary>

                                <Card>
                                    <SkewErrorBoundary fallbackTitle="Stock price vs EPS">
                                        <SkewFundamentalsChart
                                            ticker={snapshot.ticker}
                                            points={snapshot.fundamentalsTimeSeries}
                                        />
                                    </SkewErrorBoundary>
                                </Card>
                            </>
                        )}

                        {!snapshot && !isLoading && !error && (
                            <Card>
                                <div style={{ color: C.textDim, fontSize: 14 }}>
                                    Pick a company from the watchlist on the left, or type a ticker above.
                                </div>
                            </Card>
                        )}
                    </MainContent>
                </PageBox>
            </IonContent>
        </IonPage>
    );
});

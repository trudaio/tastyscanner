import React from 'react';
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
    IonText,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';

const PageBox = styled.div`
  padding: 16px;
  display: grid;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
`;

const Pill = styled.span<{ ok: boolean }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: ${(p) => (p.ok ? 'var(--ion-color-success)' : 'var(--ion-color-medium)')};
  color: white;
`;

export const SkewAnalysisPage: React.FC = observer(() => {
    const services = useServices();
    const skew = services.skewAnalysis;

    // F1 placeholder. F2 will replace this with the full per-ticker page:
    // ticker input + date range + skew chart + IV metrics + max pain +
    // expected move + P/C ratio + fundamentals + suggested trades + strike
    // by distance.
    const polygonOk = (skew as unknown as { hasPolygonKey?: boolean }).hasPolygonKey === true;
    const fmpOk = (skew as unknown as { hasFmpKey?: boolean }).hasFmpKey === true;

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
                        <IonCardHeader>
                            <IonCardSubtitle>Phase 1 — Foundation</IonCardSubtitle>
                            <IonCardTitle>Skew Analysis (coming soon)</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <IonText>
                                <p>
                                    Per-ticker IV skew dashboard. Phase 2 brings the skew chart,
                                    IV metrics (rank, percentile, 5-day change), max pain, expected
                                    move, P/C ratio, fundamentals, suggested trades, and strike-by-distance.
                                </p>
                            </IonText>
                        </IonCardContent>
                    </IonCard>

                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>Service status</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <StatusGrid>
                                <div>
                                    <strong>Polygon.io</strong> <Pill ok={polygonOk}>{polygonOk ? 'configured' : 'missing key'}</Pill>
                                    <div style={{ fontSize: 12, color: 'var(--ion-color-medium)', marginTop: 4 }}>
                                        Options chains, history, snapshots
                                    </div>
                                </div>
                                <div>
                                    <strong>FMP</strong> <Pill ok={fmpOk}>{fmpOk ? 'configured' : 'fallback mode'}</Pill>
                                    <div style={{ fontSize: 12, color: 'var(--ion-color-medium)', marginTop: 4 }}>
                                        Fundamentals (P/E, EPS, market cap…)
                                    </div>
                                </div>
                                <div>
                                    <strong>TastyTrade</strong> <Pill ok={true}>shared session</Pill>
                                    <div style={{ fontSize: 12, color: 'var(--ion-color-medium)', marginTop: 4 }}>
                                        IV rank/percentile via existing OAuth
                                    </div>
                                </div>
                            </StatusGrid>
                        </IonCardContent>
                    </IonCard>
                </PageBox>
            </IonContent>
        </IonPage>
    );
});

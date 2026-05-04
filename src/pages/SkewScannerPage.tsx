import React, { useEffect } from 'react';
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
    IonChip,
    IonLabel,
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

const TickerCloud = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const SkewScannerPage: React.FC = observer(() => {
    const services = useServices();
    const watchlist = services.skewWatchlist;

    useEffect(() => {
        if (watchlist.tickers.length === 0) {
            void watchlist.load();
        }
    }, [watchlist]);

    return (
        <IonPage>
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
                    <IonCard>
                        <IonCardHeader>
                            <IonCardSubtitle>Phase 1 — Foundation</IonCardSubtitle>
                            <IonCardTitle>Skew Scanner (coming soon)</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <IonText>
                                <p>
                                    Multi-ticker scanner over your editable watchlist. Phase 3
                                    brings the scan controls (start/stop, delay, progress), the
                                    sortable rows table (IV rank, skew %, last update), the
                                    add/remove modal, and Firestore persistence.
                                </p>
                            </IonText>
                        </IonCardContent>
                    </IonCard>

                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>Default watchlist preview</IonCardTitle>
                            <IonCardSubtitle>{watchlist.tickers.length} tickers loaded (in-memory only — Firestore wiring lands in Phase 3)</IonCardSubtitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <TickerCloud>
                                {watchlist.tickers.slice(0, 30).map((t) => (
                                    <IonChip key={t} color="medium">
                                        <IonLabel>{t}</IonLabel>
                                    </IonChip>
                                ))}
                                {watchlist.tickers.length > 30 && (
                                    <IonChip color="light">
                                        <IonLabel>+ {watchlist.tickers.length - 30} more</IonLabel>
                                    </IonChip>
                                )}
                            </TickerCloud>
                        </IonCardContent>
                    </IonCard>
                </PageBox>
            </IonContent>
        </IonPage>
    );
});

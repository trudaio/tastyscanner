import React from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
} from '@ionic/react';
import { RiskExposerComponent } from '../components/risk-exposer/risk-exposer.component';

export const RiskExposerPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Risk Exposer</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <RiskExposerComponent />
            </IonContent>
        </IonPage>
    );
};

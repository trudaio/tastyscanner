import React from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar
} from '@ionic/react';
import { DeltaAlertComponent } from '../components/delta-alert/delta-alert.component';

export const DeltaAlertPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Delta Alert</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <DeltaAlertComponent />
            </IonContent>
        </IonPage>
    );
};

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
import { PositionMonitorComponent } from '../components/position-monitor/position-monitor.component';

export const PositionMonitorPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Position Monitor</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <PositionMonitorComponent />
            </IonContent>
        </IonPage>
    );
};

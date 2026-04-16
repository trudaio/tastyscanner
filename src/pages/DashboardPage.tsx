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
import { DashboardComponent } from '../components/dashboard/dashboard.component';
import { EventBanner } from '../components/event-banner/event-banner.component';

export const DashboardPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Dashboard</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <EventBanner />
                <DashboardComponent />
            </IonContent>
        </IonPage>
    );
};

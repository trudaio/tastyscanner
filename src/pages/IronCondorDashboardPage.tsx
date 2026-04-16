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
import { IronCondorDashboardComponent } from '../components/iron-condor-dashboard/iron-condor-dashboard.component';
import { EventBanner } from '../components/event-banner/event-banner.component';

export const IronCondorDashboardPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Iron Condor Analytics</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen>
                <EventBanner />
                <IronCondorDashboardComponent />
            </IonContent>
        </IonPage>
    );
};

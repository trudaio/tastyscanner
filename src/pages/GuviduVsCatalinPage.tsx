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
import { GuviduVsCatalinComponent } from '../components/guvid-vs-catalin/guvid-vs-catalin.component';
import { EventBanner } from '../components/event-banner/event-banner.component';

export const GuviduVsCatalinPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvidul vs You</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <EventBanner />
                <GuviduVsCatalinComponent />
            </IonContent>
        </IonPage>
    );
};

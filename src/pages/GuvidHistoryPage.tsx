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
import { GuvidHistoryComponent } from '../components/guvid-history/guvid-history.component';

export const GuvidHistoryPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvid History</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <GuvidHistoryComponent />
            </IonContent>
        </IonPage>
    );
};

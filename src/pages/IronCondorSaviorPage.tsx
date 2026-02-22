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
import { IronCondorSaviorComponent } from '../components/iron-condor-savior/iron-condor-savior.component';

export const IronCondorSaviorPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>🛟 Iron Condor Savior</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <IronCondorSaviorComponent />
            </IonContent>
        </IonPage>
    );
};

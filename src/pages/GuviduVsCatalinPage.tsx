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
import { GuvidVsCatalinComponent } from '../components/guvid-vs-catalin/guvid-vs-catalin.component';

export const GuviduVsCatalinPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvidul vs Catalin</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <GuvidVsCatalinComponent />
            </IonContent>
        </IonPage>
    );
};

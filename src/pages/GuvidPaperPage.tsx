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
import { GuvidPaperComponent } from '../components/guvid-paper/guvid-paper.component';

export const GuvidPaperPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvid Paper Trading</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <GuvidPaperComponent />
            </IonContent>
        </IonPage>
    );
};

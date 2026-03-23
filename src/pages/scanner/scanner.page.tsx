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
import { ScannerComponent } from '../../components/scanner/scanner.component';

export const ScannerPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Scanner Bot</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <ScannerComponent />
            </IonContent>
        </IonPage>
    );
};

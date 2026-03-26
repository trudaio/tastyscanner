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
import {DteAnalyzerComponent} from '../components/dte-analyzer/dte-analyzer.component';

export const DteAnalyzerPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>DTE Analyzer</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <DteAnalyzerComponent />
            </IonContent>
        </IonPage>
    );
};

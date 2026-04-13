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
import { GuviduVisualizationComponent } from '../components/guvid-visualization/guvid-visualization.component';

export const GuviduVisualizationPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvid Visualization</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <GuviduVisualizationComponent />
            </IonContent>
        </IonPage>
    );
};

import React from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonMenuButton } from '@ionic/react';
import { ScenarioStudyComponent } from '../components/scenario-study/scenario-study.component';

export const ScenarioStudyPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Position Outcome Scenarios</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <ScenarioStudyComponent />
            </IonContent>
        </IonPage>
    );
};

import React from 'react';
import {IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar} from '@ionic/react';
import { BacktestComponent } from '../components/backtest/backtest.component';

const BacktestPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Backtest</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <BacktestComponent />
            </IonContent>
        </IonPage>
    );
};

export default BacktestPage;

import React from 'react';
import {IonContent, IonHeader, IonPage, IonTitle, IonToolbar} from '@ionic/react';
import {DteStrategySimulatorComponent} from '../components/dte-analyzer/dte-strategy-simulator.component';

export const StrategySimulatorPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Strategy Simulator</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <DteStrategySimulatorComponent/>
            </IonContent>
        </IonPage>
    );
};

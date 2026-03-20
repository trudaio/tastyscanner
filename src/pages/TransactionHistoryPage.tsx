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
import { TransactionHistoryComponent } from '../components/transaction-history/transaction-history.component';

export const TransactionHistoryPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Istoric Tranzactii</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <TransactionHistoryComponent />
            </IonContent>
        </IonPage>
    );
};

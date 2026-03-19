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
import { SuperAdminComponent } from '../components/super-admin/super-admin.component';

export const SuperAdminPage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>SuperAdmin</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen>
                <SuperAdminComponent />
            </IonContent>
        </IonPage>
    );
};

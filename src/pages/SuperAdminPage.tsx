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
import { auth } from '../firebase';
import { SuperAdminComponent } from '../components/super-admin/super-admin.component';

const ALLOWED_EMAIL = 'macovei17@gmail.com';

export const SuperAdminPage: React.FC = () => {
    const email = auth.currentUser?.email;
    if (email !== ALLOWED_EMAIL) {
        return (
            <IonPage>
                <IonContent fullscreen>
                    <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Access denied.</div>
                </IonContent>
            </IonPage>
        );
    }

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

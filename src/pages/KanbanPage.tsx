import React from 'react';
import {observer} from 'mobx-react-lite';
import {IonContent, IonHeader, IonPage, IonTitle, IonToolbar} from '@ionic/react';
import {KanbanBoardComponent} from '../components/kanban/kanban-board.component';

export const KanbanPage: React.FC = observer(() => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>🗂 Dev Board</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <KanbanBoardComponent />
            </IonContent>
        </IonPage>
    );
});

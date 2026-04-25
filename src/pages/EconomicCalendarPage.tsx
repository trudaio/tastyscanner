import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonMenuButton, IonButtons, IonSpinner,
} from '@ionic/react';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import { DaySection } from '../components/economic-calendar/DaySection';
import { FilterChips } from '../components/economic-calendar/FilterChips';
import { EmptyState } from '../components/economic-calendar/EmptyState';
import { matchesFilter } from '../services/economic-calendar/event-formatting';
import type { FilterMode } from '../services/economic-calendar/event-formatting';
import type { IEconomicEvent } from '../models/economic-event.model';

const Container = styled.div`
    max-width: 900px;
    margin: 0 auto;
    padding: 0 8px;

    @media (min-width: 768px) { padding: 0 24px; }
`;

const AlertBanner = styled.div<{ $severity: string }>`
    padding: 12px 16px;
    background: ${p => p.$severity === 'warning' ? '#fff3cd' : '#d1ecf1'};
    border-left: 4px solid ${p => p.$severity === 'warning' ? '#ffc107' : '#17a2b8'};
    margin: 12px 0;
    font-size: 14px;
    color: #333;
`;

const LoadingWrap = styled.div`
    padding: 60px 16px;
    text-align: center;
`;

export const EconomicCalendarPage = observer(() => {
    const { economicCalendar } = useServices();
    const [filter, setFilter] = useState<FilterMode>('criticalMajor');

    const filteredGrouped = new Map<string, IEconomicEvent[]>();
    for (const [day, events] of economicCalendar.groupedByDay) {
        const filtered = events.filter(e => matchesFilter(e, filter));
        filteredGrouped.set(day, filtered);
    }

    const hasAny = Array.from(filteredGrouped.values()).some(list => list.length > 0);

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Economic Calendar</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <Container>
                    {economicCalendar.systemAlerts.map(alert => (
                        <AlertBanner key={alert.id} $severity={alert.severity}>
                            <strong>{alert.type}:</strong> {alert.message}
                        </AlertBanner>
                    ))}

                    <FilterChips mode={filter} onChange={setFilter} />

                    {economicCalendar.isLoading ? (
                        <LoadingWrap><IonSpinner /></LoadingWrap>
                    ) : !hasAny ? (
                        <EmptyState maxDate={economicCalendar.maxScheduledDate} />
                    ) : (
                        Array.from(filteredGrouped.entries()).map(([day, events]) => (
                            <DaySection key={day} day={day} events={events} />
                        ))
                    )}
                </Container>
            </IonContent>
        </IonPage>
    );
});

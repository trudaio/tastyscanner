import type { IEconomicEvent, ISystemAlert } from '../../models/economic-event.model';

export interface IActivePauseState {
    paused: boolean;
    reason: string;
    blockingEvents: IEconomicEvent[];
}

export interface IEconomicCalendarService {
    readonly events: IEconomicEvent[];
    readonly isLoading: boolean;
    readonly systemAlerts: ISystemAlert[];

    // computed-style accessors
    readonly todaysEvents: IEconomicEvent[];
    readonly tomorrowsEvents: IEconomicEvent[];
    readonly groupedByDay: Map<string, IEconomicEvent[]>;  // YYYY-MM-DD (ET) → events
    readonly activePauseState: IActivePauseState;
    readonly nextCloseWindowEvent: IEconomicEvent | null;
    readonly maxScheduledDate: Date | null;

    init(): void;
    dispose(): void;
    acknowledgeSystemAlert(alertId: string): Promise<void>;
    seedYear(year: number): Promise<{ seeded: number; year: number }>;
}

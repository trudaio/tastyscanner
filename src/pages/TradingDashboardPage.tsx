import React from 'react';
import { TradingDashboardComponent } from '../components/trading-dashboard/trading-dashboard.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const TradingDashboardPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Trading"
            title="Trading dashboard"
            subtitle="Panou de comanda pentru monitorizarea deciziilor, fluxurilor si semnalelor active."
        >
            <TradingDashboardComponent />
        </AppPageShell>
    );
};

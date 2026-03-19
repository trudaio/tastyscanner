import React from 'react';
import { IronCondorDashboardComponent } from '../components/iron-condor-dashboard/iron-condor-dashboard.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const IronCondorDashboardPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Analytics"
            title="Iron Condor analytics"
            subtitle="Citire rapida a structurii, expunerii si performantelor pentru strategiile Iron Condor."
        >
            <IronCondorDashboardComponent />
        </AppPageShell>
    );
};

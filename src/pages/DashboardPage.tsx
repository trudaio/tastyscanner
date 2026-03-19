import React from 'react';
import { DashboardComponent } from '../components/dashboard/dashboard.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const DashboardPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Workspace"
            title="Management pozitii"
            subtitle="Monitorizare, context si ajustari pentru expunerea activa din portofoliu."
        >
            <DashboardComponent />
        </AppPageShell>
    );
};

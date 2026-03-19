import React from 'react';
import { GuvidHistoryComponent } from '../components/guvid-history/guvid-history.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const GuvidHistoryPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Review"
            title="Istoric Guvid"
            subtitle="Istoric operational, rezultate zilnice si context de executie pentru sesiunile inchise."
        >
            <GuvidHistoryComponent />
        </AppPageShell>
    );
};

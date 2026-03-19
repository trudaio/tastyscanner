import React from 'react';
import { IronCondorSaviorComponent } from '../components/iron-condor-savior/iron-condor-savior.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const IronCondorSaviorPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Risk"
            title="Iron Condor Savior"
            subtitle="Scenarii de aparare si optiuni de reactie atunci cand structura iese din parametrii planificati."
        >
            <IronCondorSaviorComponent />
        </AppPageShell>
    );
};

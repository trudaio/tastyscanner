import React from 'react';
import { SuperAdminComponent } from '../components/super-admin/super-admin.component';
import { AppPageShell } from '../components/ui/app-page-shell';

export const SuperAdminPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Administration"
            title="SuperAdmin"
            subtitle="Control operational asupra datelor, utilizatorilor si setarilor sensibile ale platformei."
        >
            <SuperAdminComponent />
        </AppPageShell>
    );
};

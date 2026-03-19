import React from 'react';
import { BacktestComponent } from '../components/backtest/backtest.component';
import { AppPageShell } from '../components/ui/app-page-shell';

const BacktestPage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Research"
            title="Backtest strategii"
            subtitle="Testeaza ipoteze, compara rezultate si rafineaza regulile inainte de executie live."
        >
            <BacktestComponent />
        </AppPageShell>
    );
};

export default BacktestPage;

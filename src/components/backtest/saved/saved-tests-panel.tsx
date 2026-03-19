/**
 * Saved Tests Panel — MobX observer component
 *
 * Loads and displays all saved backtest summaries with load/delete actions.
 */

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../../hooks/use-services.hook';
import { SectionTitle, SavedTestsGrid } from '../backtest-styled';
import { SavedTestCardComponent } from './saved-test-card';
import type { IBacktestParams, IBacktestResults } from '../../../services/backtest/backtest-engine.interface';

interface Props {
    onLoadTest: (params: IBacktestParams, results: IBacktestResults) => void;
}

export const SavedTestsPanelComponent: React.FC<Props> = observer(({ onLoadTest }) => {
    const services = useServices();
    const bt = services.backtest;

    useEffect(() => {
        void bt.loadSavedTestsList();
    }, [bt]);

    const handleLoad = async (id: string) => {
        const saved = await bt.loadSavedTest(id);
        onLoadTest(saved.params, saved.results);
    };

    const handleDelete = async (id: string) => {
        await bt.deleteSavedTest(id);
    };

    return (
        <>
            <SectionTitle>Saved Tests</SectionTitle>

            {bt.isLoadingSavedTests && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <IonSpinner name="dots" />
                </div>
            )}

            {!bt.isLoadingSavedTests && bt.savedTests.length === 0 && (
                <div style={{ color: '#666', fontSize: '13px', padding: '12px 0' }}>
                    No saved tests yet
                </div>
            )}

            {!bt.isLoadingSavedTests && bt.savedTests.length > 0 && (
                <SavedTestsGrid>
                    {bt.savedTests.map(test => (
                        <SavedTestCardComponent
                            key={test.id}
                            test={test}
                            onLoad={handleLoad}
                            onDelete={handleDelete}
                        />
                    ))}
                </SavedTestsGrid>
            )}
        </>
    );
});

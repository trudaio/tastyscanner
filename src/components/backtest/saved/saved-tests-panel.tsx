/**
 * Saved Tests Panel — MobX observer component
 *
 * Loads and displays all saved backtest summaries with load/delete actions.
 */

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../../hooks/use-services.hook';
import {
    PanelEmptyState,
    PanelEmptyText,
    PanelEmptyTitle,
    PanelHint,
    PanelHintRow,
    SavedTestsGrid,
    SectionLead,
    SectionTitle,
} from '../backtest-styled';
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
            <SectionLead>Salveaza scenariile bune si reincarca rapid un setup complet cu rezultate incluse.</SectionLead>

            {bt.isLoadingSavedTests && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <IonSpinner name="dots" />
                </div>
            )}

            {!bt.isLoadingSavedTests && bt.savedTests.length === 0 && (
                <PanelEmptyState>
                    <PanelEmptyTitle>Nu ai teste salvate inca</PanelEmptyTitle>
                    <PanelEmptyText>
                        Dupa primul run reusit, poti salva parametrii si rezultatele ca sa compari iteratii diferite fara sa reconstruiesti setup-ul manual.
                    </PanelEmptyText>
                    <PanelHintRow>
                        <PanelHint>Salvezi dupa rulare</PanelHint>
                        <PanelHint>Reincarci parametrii complet</PanelHint>
                        <PanelHint>Compara iteratii mai rapid</PanelHint>
                    </PanelHintRow>
                </PanelEmptyState>
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

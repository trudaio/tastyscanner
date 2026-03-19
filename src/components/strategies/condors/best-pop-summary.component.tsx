import React from 'react';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import { ITickerViewModel } from '../../../models/ticker.view-model.interface';
import { IOptionsStrategyViewModel } from '../../../models/options-strategy.view-model.interface';
import { OptionsStrategyComponent } from '../options-strategy.component';

/* ─── Styled ──────────────────────────────────────────────── */

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px;
`;

const ExpirationBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ExpirationLabel = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: var(--ion-color-medium);
    padding: 6px 12px;
    background: var(--ion-color-light);
    border-radius: 6px;
`;

const CardWrapper = styled.div`
    max-width: 400px;
`;

const EmptyMessage = styled.div`
    color: var(--ion-color-medium);
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
`;

/* ─── Component ───────────────────────────────────────────── */

interface BestPopSummaryProps {
    ticker: ITickerViewModel;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
}

export const BestPopSummaryComponent: React.FC<BestPopSummaryProps> = observer((props) => {
    const expirations = props.ticker.getExpirationsWithIronCondors();

    if (expirations.length === 0) {
        return <EmptyMessage>No iron condors available</EmptyMessage>;
    }

    // Collect best-POP IC from each expiration
    const bestPerExpiration: { label: string; best: IOptionsStrategyViewModel; allBestPop: number; allBestRR: number }[] = [];

    for (const exp of expirations) {
        const ics = exp.ironCondors;
        if (ics.length === 0) continue;

        // Find best POP in this expiration
        let best = ics[0];
        for (let i = 1; i < ics.length; i++) {
            if (ics[i].pop > best.pop) best = ics[i];
        }

        // Compute best values for highlighting
        const allBestPop = Math.max(...ics.map(ic => ic.pop));
        const allBestRR = Math.min(...ics.map(ic => ic.riskRewardRatio));

        let label = `${exp.expirationDate} (${exp.daysToExpiration} days) - ${exp.expirationType}`;
        if (exp.settlementType === 'AM') {
            label += ` [${exp.settlementType}]`;
        }

        bestPerExpiration.push({ label, best, allBestPop, allBestRR });
    }

    if (bestPerExpiration.length === 0) {
        return <EmptyMessage>No iron condors with POP data</EmptyMessage>;
    }

    return (
        <Container>
            {bestPerExpiration.map((entry) => (
                <ExpirationBlock key={entry.label}>
                    <ExpirationLabel>{entry.label}</ExpirationLabel>
                    <CardWrapper>
                        <OptionsStrategyComponent
                            strategy={entry.best}
                            bestPop={entry.allBestPop}
                            bestRiskReward={entry.allBestRR}
                            onOpenTradeModal={props.onTrade}
                        />
                    </CardWrapper>
                </ExpirationBlock>
            ))}
        </Container>
    );
});

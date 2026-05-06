import React from 'react';
import type { IGradeChange, IGradesConsensus, IInsiderTrade } from '../../services/api-clients/fmp.client';
import { SectionGrid, TwoColRow } from './analyst-insider-styled';
import { WallStRatingsCard } from './wall-st-ratings-card';
import { AnalystsBreakdownDonut } from './analysts-breakdown-donut';
import { RatingChangesTable } from './rating-changes-table';
import { InsiderTradingTable } from './insider-trading-table';

interface IProps {
    consensus: IGradesConsensus | null;
    history: IGradeChange[];
    insiderTrades: IInsiderTrade[];
}

export const AnalystInsiderSection: React.FC<IProps> = ({ consensus, history, insiderTrades }) => {
    // Hide the entire section for tickers without meaningful coverage (indexes
    // like SPX, ETFs without insiders). FMP's grades-news endpoint sometimes
    // returns one stale headline even for indexes, so we gate on the two
    // reliable signals: a current consensus or any insider transactions.
    const hasMeaningfulCoverage = consensus !== null || insiderTrades.length > 0;
    if (!hasMeaningfulCoverage) return null;

    return (
        <SectionGrid>
            <TwoColRow>
                <WallStRatingsCard consensus={consensus} />
                <AnalystsBreakdownDonut history={history} />
            </TwoColRow>
            <RatingChangesTable rows={history} />
            <InsiderTradingTable rows={insiderTrades} />
        </SectionGrid>
    );
};

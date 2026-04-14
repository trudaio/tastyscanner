import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { IonButton, IonSpinner } from '@ionic/react';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { ScenarioStudySummaryComponent } from './scenario-study-summary.component';
import type { ITradeScenarioResult, ScenarioLabel } from '../../services/scenario-study/scenario-study.interface';

const PageWrap = styled.div`
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
`;

const TopBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
`;

const Title = styled.h1`
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
`;

const Subtitle = styled.p`
    color: #888;
    font-size: 0.85rem;
    margin: 4px 0 16px;
`;

const SpinnerBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px;
    color: #888;
`;

const ErrorBox = styled.div`
    padding: 24px;
    text-align: center;
    color: var(--ion-color-danger);
`;

const EmptyBox = styled.div`
    padding: 40px;
    text-align: center;
    color: #888;
    font-size: 0.95rem;
`;

// ── Trade table ──────────────────────────────────────────────────────────

const TableWrap = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
`;

const Th = styled.th<{ $sortable?: boolean }>`
    padding: 8px 10px;
    background: #2a2a3e;
    color: #888;
    font-size: 0.7rem;
    text-transform: uppercase;
    text-align: right;
    white-space: nowrap;
    cursor: ${(p) => p.$sortable ? 'pointer' : 'default'};
    user-select: none;
    &:first-child { text-align: left; }
    &:hover { ${(p) => p.$sortable ? 'color: #ccc;' : ''} }
`;

const Td = styled.td<{ $positive?: boolean; $best?: boolean }>`
    padding: 8px 10px;
    border-bottom: 1px solid #1e1e32;
    text-align: right;
    color: ${(p) => p.$best ? '#4dff91' : p.$positive === undefined ? '#ccc' : p.$positive ? '#4dff91' : '#ff6b6b'};
    font-weight: ${(p) => p.$best ? 700 : 400};
    white-space: nowrap;
    &:first-child { text-align: left; color: #fff; }
`;

const BestBadge = styled.span`
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    background: rgba(77, 255, 145, 0.15);
    color: #4dff91;
`;

const FilterRow = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
`;

const FilterPill = styled.button<{ $active: boolean }>`
    padding: 4px 14px;
    border-radius: 16px;
    border: 1px solid ${(p) => p.$active ? '#4a9eff' : '#333'};
    background: ${(p) => p.$active ? 'rgba(74,158,255,0.15)' : 'transparent'};
    color: ${(p) => p.$active ? '#4a9eff' : '#888'};
    font-size: 0.82rem;
    cursor: pointer;
`;

const LABELS: Record<ScenarioLabel, string> = {
    actual: 'Actual',
    target75: '75%',
    target50: '50%',
    target25: '25%',
    expire: 'Expire',
};

function fmt$(v: number): string { return v >= 0 ? `$${v.toFixed(0)}` : `-$${Math.abs(v).toFixed(0)}`; }

type SortKey = 'ticker' | 'exp' | 'credit' | 'actual' | 't75' | 't50' | 't25' | 'expire' | 'best';
type SortDir = 'asc' | 'desc';

function sortResults(results: ITradeScenarioResult[], key: SortKey, dir: SortDir): ITradeScenarioResult[] {
    const sorted = [...results];
    const m = dir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        switch (key) {
            case 'ticker': return a.trade.ticker.localeCompare(b.trade.ticker) * m;
            case 'exp': return a.trade.expirationDate.localeCompare(b.trade.expirationDate) * m;
            case 'credit': return (a.trade.openCredit - b.trade.openCredit) * m;
            case 'actual': return (a.scenarios.actual.profit - b.scenarios.actual.profit) * m;
            case 't75': return (a.scenarios.target75.profit - b.scenarios.target75.profit) * m;
            case 't50': return (a.scenarios.target50.profit - b.scenarios.target50.profit) * m;
            case 't25': return (a.scenarios.target25.profit - b.scenarios.target25.profit) * m;
            case 'expire': return (a.scenarios.expire.profit - b.scenarios.expire.profit) * m;
            case 'best': return a.bestStrategy.localeCompare(b.bestStrategy) * m;
            default: return 0;
        }
    });
    return sorted;
}

export const ScenarioStudyComponent: React.FC = observer(() => {
    const services = useServices();
    const ss = services.scenarioStudy;
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('exp');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        if (ss.results.length === 0 && !ss.isLoading) {
            void ss.compute();
        }
    }, [ss]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const tickers = [...new Set(ss.results.map((r) => r.trade.ticker))];
    const filtered = tickerFilter
        ? ss.results.filter((r) => r.trade.ticker === tickerFilter)
        : ss.results;
    const sorted = sortResults(filtered, sortKey, sortDir);

    return (
        <PageWrap>
            <TopBar>
                <div>
                    <Title>Position Outcome Scenarios</Title>
                    <Subtitle>
                        What if you closed at 75%, 50%, 25% profit or let them expire?
                        Compared to your actual exits across {ss.results.length} closed trades.
                    </Subtitle>
                </div>
                <IonButton fill="outline" size="small" onClick={() => void ss.compute()} disabled={ss.isLoading}>
                    {ss.isLoading ? 'Computing…' : 'Refresh'}
                </IonButton>
            </TopBar>

            {ss.isLoading && (
                <SpinnerBox>
                    <IonSpinner name="dots" />
                    <span>Analyzing {ss.results.length > 0 ? ss.results.length : ''} trades…</span>
                </SpinnerBox>
            )}

            {ss.error && <ErrorBox>{ss.error}</ErrorBox>}

            {!ss.isLoading && ss.summary && (
                <>
                    <ScenarioStudySummaryComponent summary={ss.summary} />

                    <FilterRow>
                        <FilterPill $active={tickerFilter === null} onClick={() => setTickerFilter(null)}>All</FilterPill>
                        {tickers.map((t) => (
                            <FilterPill key={t} $active={tickerFilter === t} onClick={() => setTickerFilter(t)}>{t}</FilterPill>
                        ))}
                    </FilterRow>

                    <TableWrap>
                        <Table>
                            <thead>
                                <tr>
                                    <Th $sortable onClick={() => handleSort('ticker')}>Ticker</Th>
                                    <Th $sortable onClick={() => handleSort('exp')}>Exp</Th>
                                    <Th $sortable onClick={() => handleSort('credit')}>Credit</Th>
                                    <Th>Wings</Th>
                                    <Th $sortable onClick={() => handleSort('actual')}>Actual</Th>
                                    <Th $sortable onClick={() => handleSort('t75')}>75% TP</Th>
                                    <Th $sortable onClick={() => handleSort('t50')}>50% TP</Th>
                                    <Th $sortable onClick={() => handleSort('t25')}>25% TP</Th>
                                    <Th $sortable onClick={() => handleSort('expire')}>Expire</Th>
                                    <Th $sortable onClick={() => handleSort('best')}>Best</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((r) => {
                                    const { actual, target75, target50, target25, expire } = r.scenarios;
                                    const profits = [actual.profit, target75.profit, target50.profit, target25.profit, expire.profit];
                                    const maxP = Math.max(...profits);
                                    return (
                                        <tr key={r.trade.id}>
                                            <Td>{r.trade.ticker}</Td>
                                            <Td>{r.trade.expirationDate}</Td>
                                            <Td>${r.trade.openCredit.toFixed(0)}</Td>
                                            <Td>${r.wings}</Td>
                                            <Td $positive={actual.profit >= 0} $best={actual.profit === maxP}>{fmt$(actual.profit)}</Td>
                                            <Td $positive={target75.profit >= 0} $best={target75.profit === maxP}>
                                                {target75.targetReached ? fmt$(target75.profit) : <span style={{ color: '#555' }}>—</span>}
                                            </Td>
                                            <Td $positive={target50.profit >= 0} $best={target50.profit === maxP}>
                                                {target50.targetReached ? fmt$(target50.profit) : <span style={{ color: '#555' }}>—</span>}
                                            </Td>
                                            <Td $positive={target25.profit >= 0} $best={target25.profit === maxP}>
                                                {target25.targetReached ? fmt$(target25.profit) : <span style={{ color: '#555' }}>—</span>}
                                            </Td>
                                            <Td $positive={expire.profit >= 0} $best={expire.profit === maxP}>{fmt$(expire.profit)}</Td>
                                            <Td><BestBadge>{LABELS[r.bestStrategy]}</BestBadge></Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableWrap>
                </>
            )}

            {!ss.isLoading && !ss.error && ss.results.length === 0 && (
                <EmptyBox>No closed trades found. Complete some IC trades to see scenario analysis.</EmptyBox>
            )}
        </PageWrap>
    );
});

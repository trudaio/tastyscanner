import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonSpinner,
    IonBadge
} from '@ionic/react';
import { refreshOutline, downloadOutline, trendingUpOutline, trendingDownOutline } from 'ionicons/icons';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorSummary, IIronCondorTrade } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';

const DashboardContainer = styled.div`
    padding: 20px;
    background-color: #0d0d1a;
    min-height: 100%;

    @media (max-width: 480px) {
        padding: 12px;
    }
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }
`;

const Title = styled.h1`
    color: #fff;
    margin: 0;
    font-size: 24px;

    @media (max-width: 480px) {
        font-size: 18px;
    }
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 12px;
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-bottom: 24px;

    @media (max-width: 480px) {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
    }
`;

const StatCard = styled(IonCard)<{ $variant?: 'success' | 'danger' | 'neutral' }>`
    margin: 0;
    --background: ${props => {
        switch (props.$variant) {
            case 'success': return 'linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%)';
            case 'danger': return 'linear-gradient(135deg, #4a1a1a 0%, #5a2d2d 100%)';
            default: return 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%)';
        }
    }};
`;

const StatValue = styled.div`
    font-size: 32px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;

    @media (max-width: 480px) {
        font-size: 22px;
    }
`;

const StatLabel = styled.div`
    font-size: 14px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 1px;
`;

const StatSubtext = styled.div`
    font-size: 12px;
    color: #888;
    margin-top: 8px;
`;

const SectionTitle = styled.h2`
    color: #fff;
    font-size: 18px;
    margin: 24px 0 16px 0;
`;

const TableContainer = styled.div`
    overflow-x: auto;
    background: #1a1a2e;
    border-radius: 8px;
    margin-bottom: 24px;
`;

const Table = styled.table`
    width: 100%;
    min-width: 480px;
    border-collapse: collapse;
    font-size: 14px;
`;

const Th = styled.th<{ $align?: string }>`
    text-align: ${props => props.$align || 'left'};
    padding: 12px 16px;
    background: #2d2d4a;
    color: #aaa;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 1px;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 12px 16px;
    border-bottom: 1px solid #2d2d4a;
    color: #fff;
    text-align: ${props => props.$align || 'left'};
`;

const ProfitCell = styled(Td)<{ $profit: number }>`
    color: ${props => props.$profit >= 0 ? '#4dff91' : '#ff4d6d'};
    font-weight: 600;
`;

// DTE colour: >30 green, 21-30 yellow, <21 red
const getDteColor = (dte: number): string => {
    if (dte > 30) return '#4dff91';
    if (dte >= 21) return '#ffaa00';
    return '#ff4d6d';
};

const DteCell = styled(Td)<{ $dte: number }>`
    color: ${p => getDteColor(p.$dte)};
    font-weight: 600;
    white-space: nowrap;
`;

const CloseBadge = styled.span`
    display: inline-block;
    background: #ff4d6d;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
`;

const TargetBadge = styled.span`
    display: inline-block;
    background: rgba(77, 255, 145, 0.15);
    border: 1px solid #4dff91;
    color: #4dff91;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
`;

const TargetCell = styled(Td)`
    white-space: nowrap;
    color: #aaa;
    font-size: 12px;
`;

const WinRateBar = styled.div<{ $rate: number }>`
    width: 100%;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 4px;

    &::after {
        content: '';
        display: block;
        width: ${props => props.$rate}%;
        height: 100%;
        background: ${props => props.$rate >= 50 ? '#4dff91' : '#ff4d6d'};
        border-radius: 4px;
    }
`;

const StatusBadge = styled(IonBadge)<{ $status: string }>`
    --background: ${props => {
        switch (props.$status) {
            case 'closed': return '#4dff91';
            case 'expired': return '#ffd93d';
            case 'open': return '#4a9eff';
            default: return '#888';
        }
    }};
    --color: #000;
`;

const LoadingContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px;
    color: #aaa;
    gap: 16px;
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 60px;
    color: #666;
`;

export const IronCondorDashboardComponent: React.FC = observer(() => {
    const services = useServices();
    const analyticsService = services.ironCondorAnalytics;
    const [summary, setSummary] = useState<IIronCondorSummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await analyticsService.getSummary();
            setSummary(data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async () => {
        const filename = `ytd-${new Date().toISOString().split('T')[0]}`;
        await analyticsService.exportToFile(filename);
        alert(`Data exported! Check console for details.`);
    };

    useEffect(() => {
        // Auto-fetch on mount if we have an account
        if (services.brokerAccount.currentAccount) {
            fetchData();
        }
    }, [services.brokerAccount.currentAccount]);

    const formatCurrency = (value: number) => {
        const prefix = value >= 0 ? '+$' : '-$';
        return `${prefix}${Math.abs(value).toFixed(2)}`;
    };

    const formatPercent = (value: number) => `${value.toFixed(1)}%`;

    if (isLoading) {
        return (
            <DashboardContainer>
                <LoadingContainer>
                    <IonSpinner name="crescent" />
                    <span>Loading Iron Condor Analytics...</span>
                </LoadingContainer>
            </DashboardContainer>
        );
    }

    if (!services.brokerAccount.currentAccount) {
        return (
            <DashboardContainer>
                <EmptyState>
                    <h2>No Account Selected</h2>
                    <p>Please select a trading account to view analytics.</p>
                </EmptyState>
            </DashboardContainer>
        );
    }

    return (
        <DashboardContainer>
            <Header>
                <Title>🦅 Iron Condor Dashboard - YTD {new Date().getFullYear()}</Title>
                <ButtonGroup>
                    <IonButton onClick={fetchData} disabled={isLoading}>
                        <IonIcon slot="start" icon={refreshOutline} />
                        Refresh
                    </IonButton>
                    <IonButton onClick={handleExport} disabled={!summary || isLoading}>
                        <IonIcon slot="start" icon={downloadOutline} />
                        Export
                    </IonButton>
                </ButtonGroup>
            </Header>

            {!summary ? (
                <EmptyState>
                    <h2>No Data Yet</h2>
                    <p>Click "Refresh" to load your iron condor trade history.</p>
                </EmptyState>
            ) : (
                <>
                    {/* Summary Stats */}
                    <StatsGrid>
                        <StatCard>
                            <IonCardContent>
                                <StatValue>{summary.yearToDate.totalTrades}</StatValue>
                                <StatLabel>Total Trades</StatLabel>
                                <StatSubtext>
                                    {summary.yearToDate.openTrades} open • {summary.yearToDate.closedTrades} closed
                                </StatSubtext>
                            </IonCardContent>
                        </StatCard>

                        <StatCard $variant={summary.yearToDate.totalProfit >= 0 ? 'success' : 'danger'}>
                            <IonCardContent>
                                <StatValue>{formatCurrency(summary.yearToDate.totalProfit)}</StatValue>
                                <StatLabel>Total P&L</StatLabel>
                                <StatSubtext>
                                    Avg: {formatCurrency(summary.yearToDate.averageProfit)} per trade
                                </StatSubtext>
                            </IonCardContent>
                        </StatCard>

                        <StatCard $variant={summary.yearToDate.winRate >= 50 ? 'success' : 'danger'}>
                            <IonCardContent>
                                <StatValue>{formatPercent(summary.yearToDate.winRate)}</StatValue>
                                <StatLabel>Win Rate</StatLabel>
                                <WinRateBar $rate={summary.yearToDate.winRate} />
                                <StatSubtext>
                                    {summary.yearToDate.profitableTrades}W / {summary.yearToDate.losingTrades}L
                                </StatSubtext>
                            </IonCardContent>
                        </StatCard>

                        <StatCard $variant="success">
                            <IonCardContent>
                                <StatValue>{formatCurrency(summary.yearToDate.totalWins)}</StatValue>
                                <StatLabel>Total Wins</StatLabel>
                                <StatSubtext>
                                    Best: {formatCurrency(summary.yearToDate.largestWin)}
                                </StatSubtext>
                            </IonCardContent>
                        </StatCard>

                        <StatCard $variant="danger">
                            <IonCardContent>
                                <StatValue>{formatCurrency(summary.yearToDate.totalLosses)}</StatValue>
                                <StatLabel>Total Losses</StatLabel>
                                <StatSubtext>
                                    Worst: {formatCurrency(summary.yearToDate.largestLoss)}
                                </StatSubtext>
                            </IonCardContent>
                        </StatCard>
                    </StatsGrid>

                    {/* By Ticker */}
                    <SectionTitle>Performance by Ticker</SectionTitle>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Ticker</Th>
                                    <Th $align="center">Trades</Th>
                                    <Th $align="center">Win Rate</Th>
                                    <Th $align="right">P&L</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(summary.byTicker.values())
                                    .sort((a, b) => b.totalProfit - a.totalProfit)
                                    .map(ticker => (
                                        <tr key={ticker.ticker}>
                                            <Td><strong>{ticker.ticker}</strong></Td>
                                            <Td $align="center">{ticker.totalTrades}</Td>
                                            <Td $align="center">
                                                {formatPercent(ticker.winRate)}
                                                <WinRateBar $rate={ticker.winRate} />
                                            </Td>
                                            <ProfitCell $profit={ticker.totalProfit} $align="right">
                                                {formatCurrency(ticker.totalProfit)}
                                            </ProfitCell>
                                        </tr>
                                    ))}
                            </tbody>
                        </Table>
                    </TableContainer>

                    {/* By Month */}
                    <SectionTitle>Performance by Month</SectionTitle>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Month</Th>
                                    <Th $align="center">Trades</Th>
                                    <Th $align="center">Win Rate</Th>
                                    <Th $align="right">P&L</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(summary.byMonth.values())
                                    .sort((a, b) => a.month.localeCompare(b.month))
                                    .map(month => (
                                        <tr key={month.month}>
                                            <Td><strong>{month.month}</strong></Td>
                                            <Td $align="center">{month.totalTrades}</Td>
                                            <Td $align="center">
                                                {formatPercent(month.winRate)}
                                                <WinRateBar $rate={month.winRate} />
                                            </Td>
                                            <ProfitCell $profit={month.totalProfit} $align="right">
                                                {formatCurrency(month.totalProfit)}
                                            </ProfitCell>
                                        </tr>
                                    ))}
                            </tbody>
                        </Table>
                    </TableContainer>

                    {/* Open Trades */}
                    <SectionTitle>Open Trades ({summary.trades.filter(t => t.status === 'open').length})</SectionTitle>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Ticker</Th>
                                    <Th>Expiration</Th>
                                    <Th>Put Spread</Th>
                                    <Th>Call Spread</Th>
                                    <Th $align="center">Qty</Th>
                                    <Th $align="center">DTE</Th>
                                    <Th $align="right">Credit</Th>
                                    <Th $align="right">Max Profit</Th>
                                    <Th $align="right">75% Target</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.trades
                                    .filter(t => t.status === 'open')
                                    .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime())
                                    .map(trade => {
                                        const dte = Math.ceil((new Date(trade.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                        return (
                                            <tr key={trade.id}>
                                                <Td><strong>{trade.ticker}</strong></Td>
                                                <Td>{trade.expirationDate}</Td>
                                                <Td>{trade.putBuyStrike}/{trade.putSellStrike}</Td>
                                                <Td>{trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                                <Td $align="center">{trade.quantity}</Td>
                                                <DteCell $dte={dte} $align="center">
                                                    {dte}d
                                                    {dte < 21 && <CloseBadge>Close Now</CloseBadge>}
                                                </DteCell>
                                                <Td $align="right">${trade.openCredit.toFixed(2)}</Td>
                                                <ProfitCell $profit={trade.openCredit} $align="right">
                                                    {formatCurrency(trade.openCredit)}
                                                </ProfitCell>
                                                <TargetCell $align="right">
                                                    ${(trade.openCredit * 0.25).toFixed(2)}
                                                    <TargetBadge>75%</TargetBadge>
                                                </TargetCell>
                                            </tr>
                                        );
                                    })}
                                {summary.trades.filter(t => t.status === 'open').length === 0 && (
                                    <tr>
                                        <Td colSpan={9} $align="center" style={{ color: '#666', padding: '24px' }}>
                                            No open trades
                                        </Td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </TableContainer>

                    {/* Closed/Expired Trades */}
                    <SectionTitle>Closed & Expired Trades ({summary.trades.filter(t => t.status !== 'open').length})</SectionTitle>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Ticker</Th>
                                    <Th>Expiration</Th>
                                    <Th>Put Spread</Th>
                                    <Th>Call Spread</Th>
                                    <Th $align="center">Qty</Th>
                                    <Th $align="center">Status</Th>
                                    <Th $align="right">Credit</Th>
                                    <Th $align="right">Debit</Th>
                                    <Th $align="right">Realized P&L</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.trades
                                    .filter(t => t.status !== 'open')
                                    .sort((a, b) => new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime())
                                    .map(trade => (
                                        <tr key={trade.id}>
                                            <Td><strong>{trade.ticker}</strong></Td>
                                            <Td>{trade.expirationDate}</Td>
                                            <Td>{trade.putBuyStrike}/{trade.putSellStrike}</Td>
                                            <Td>{trade.callSellStrike}/{trade.callBuyStrike}</Td>
                                            <Td $align="center">{trade.quantity}</Td>
                                            <Td $align="center">
                                                <StatusBadge $status={trade.status}>
                                                    {trade.status.toUpperCase()}
                                                </StatusBadge>
                                            </Td>
                                            <Td $align="right">${trade.openCredit.toFixed(2)}</Td>
                                            <Td $align="right">${trade.closeDebit.toFixed(2)}</Td>
                                            <ProfitCell $profit={trade.profit} $align="right">
                                                {formatCurrency(trade.profit)}
                                                {trade.isProfitable ?
                                                    <IonIcon icon={trendingUpOutline} style={{ marginLeft: 4 }} /> :
                                                    <IonIcon icon={trendingDownOutline} style={{ marginLeft: 4 }} />
                                                }
                                            </ProfitCell>
                                        </tr>
                                    ))}
                                {summary.trades.filter(t => t.status !== 'open').length === 0 && (
                                    <tr>
                                        <Td colSpan={9} $align="center" style={{ color: '#666', padding: '24px' }}>
                                            No closed or expired trades yet
                                        </Td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </TableContainer>
                </>
            )}
        </DashboardContainer>
    );
});

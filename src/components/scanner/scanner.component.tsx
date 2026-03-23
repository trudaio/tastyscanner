import React from 'react';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonIcon,
    IonLabel,
    IonSpinner,
    IonToggle,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { scanOutline, checkmarkCircleOutline, closeCircleOutline, timeOutline } from 'ionicons/icons';
import { useServices } from '../../hooks/use-services.hook';
import type { IOpportunity } from '../../services/scanner/scanner.service.interface';

// ── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const PageTitle = styled.h1`
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: #e0e0e0;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const LastScanLabel = styled.span`
    font-size: 0.78rem;
    color: #8888aa;
    display: flex;
    align-items: center;
    gap: 4px;
`;

const ScanButton = styled(IonButton)`
    --background: #4fc3f7;
    --color: #0d0d1a;
    --border-radius: 8px;
    font-weight: 600;
`;

const AutoScanRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 20px;
`;

const AutoScanLabel = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const AutoScanTitle = styled.span`
    font-size: 0.9rem;
    font-weight: 600;
    color: #e0e0e0;
`;

const AutoScanSub = styled.span`
    font-size: 0.75rem;
    color: #8888aa;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 16px;
    color: #8888aa;
    text-align: center;
`;

const EmptyIcon = styled(IonIcon)`
    font-size: 3rem;
    color: #2a2a3e;
`;

const EmptyText = styled.p`
    margin: 0;
    font-size: 1rem;
`;

const OpCard = styled(IonCard)<{ $approved: boolean }>`
    --background: #1a1a2e;
    border: 1px solid ${({ $approved }) => ($approved ? '#66bb6a' : '#2a2a3e')};
    border-radius: 12px;
    margin: 0 0 14px 0;
    transition: border-color 0.2s ease;
`;

const CardTop = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
`;

const TickerGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const TickerSymbol = styled.span`
    font-size: 1.25rem;
    font-weight: 700;
    color: #e0e0e0;
`;

const IvBadge = styled.span<{ $level: 'high' | 'mid' | 'low' }>`
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    background: ${({ $level }) =>
        $level === 'high' ? 'rgba(102,187,106,0.18)' :
        $level === 'mid' ? 'rgba(255,213,79,0.18)' :
        'rgba(136,136,170,0.15)'};
    color: ${({ $level }) =>
        $level === 'high' ? '#66bb6a' :
        $level === 'mid' ? '#ffd54f' :
        '#8888aa'};
    border: 1px solid ${({ $level }) =>
        $level === 'high' ? 'rgba(102,187,106,0.4)' :
        $level === 'mid' ? 'rgba(255,213,79,0.4)' :
        'rgba(136,136,170,0.3)'};
`;

const StrikeSummary = styled.div`
    font-size: 0.82rem;
    color: #8888aa;
    font-family: monospace;
`;

const MetricsRow = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;

    @media (max-width: 480px) {
        grid-template-columns: repeat(2, 1fr);
    }
`;

const Metric = styled.div`
    background: #0d0d1a;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const MetricLabel = styled.span`
    font-size: 0.7rem;
    color: #8888aa;
    text-transform: uppercase;
    letter-spacing: 0.04em;
`;

const MetricValue = styled.span<{ $color?: string }>`
    font-size: 0.95rem;
    font-weight: 600;
    font-family: monospace;
    color: ${({ $color }) => $color ?? '#e0e0e0'};
`;

const CardFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
`;

const ExpiryLabel = styled.span`
    font-size: 0.78rem;
    color: #8888aa;
`;

const ActionButtons = styled.div`
    display: flex;
    gap: 8px;
`;

const ApproveBtn = styled(IonButton)`
    --background: rgba(102,187,106,0.15);
    --color: #66bb6a;
    --border-radius: 8px;
    --border-color: rgba(102,187,106,0.4);
    --border-width: 1px;
    --border-style: solid;
    font-size: 0.85rem;
    height: 36px;
`;

const RejectBtn = styled(IonButton)`
    --background: rgba(239,83,80,0.12);
    --color: #ef5350;
    --border-radius: 8px;
    --border-color: rgba(239,83,80,0.3);
    --border-width: 1px;
    --border-style: solid;
    font-size: 0.85rem;
    height: 36px;
`;

const ApprovedBadge = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    color: #66bb6a;
    font-size: 0.85rem;
    font-weight: 600;
`;

// ── Helper ───────────────────────────────────────────────────────────────────

function ivLevel(ivRank: number): 'high' | 'mid' | 'low' {
    if (ivRank >= 50) return 'high';
    if (ivRank >= 30) return 'mid';
    return 'low';
}

function formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── OpportunityCard ──────────────────────────────────────────────────────────

interface OpportunityCardProps {
    opportunity: IOpportunity;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

const OpportunityCard: React.FC<OpportunityCardProps> = observer(({ opportunity, onApprove, onReject }) => {
    const opp = opportunity;
    const approved = opp.status === 'approved';

    return (
        <OpCard $approved={approved}>
            <IonCardContent>
                <CardTop>
                    <TickerGroup>
                        <TickerSymbol>{opp.ticker}</TickerSymbol>
                        <IvBadge $level={ivLevel(opp.ivRank)}>IV Rank {opp.ivRank.toFixed(0)}</IvBadge>
                    </TickerGroup>
                    <StrikeSummary>
                        {opp.putSpread.longStrike}/{opp.putSpread.shortStrike} P ·{' '}
                        {opp.callSpread.shortStrike}/{opp.callSpread.longStrike} C
                    </StrikeSummary>
                </CardTop>

                <MetricsRow>
                    <Metric>
                        <MetricLabel>Credit</MetricLabel>
                        <MetricValue $color="#66bb6a">${opp.credit.toFixed(2)}</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>Max Risk</MetricLabel>
                        <MetricValue $color="#ef5350">${opp.maxRisk.toFixed(2)}</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>POP</MetricLabel>
                        <MetricValue>{opp.pop.toFixed(1)}%</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>Score</MetricLabel>
                        <MetricValue $color="#4fc3f7">{opp.score.toFixed(1)}</MetricValue>
                    </Metric>
                </MetricsRow>

                <CardFooter>
                    <ExpiryLabel>
                        {opp.expiration} · {opp.dte} DTE
                    </ExpiryLabel>
                    {approved ? (
                        <ApprovedBadge>
                            <IonIcon icon={checkmarkCircleOutline} />
                            Pending order
                        </ApprovedBadge>
                    ) : (
                        <ActionButtons>
                            <ApproveBtn
                                fill="outline"
                                size="small"
                                onClick={() => onApprove(opp.id)}
                            >
                                <IonIcon slot="start" icon={checkmarkCircleOutline} />
                                Approve
                            </ApproveBtn>
                            <RejectBtn
                                fill="outline"
                                size="small"
                                onClick={() => onReject(opp.id)}
                            >
                                <IonIcon slot="start" icon={closeCircleOutline} />
                                Reject
                            </RejectBtn>
                        </ActionButtons>
                    )}
                </CardFooter>
            </IonCardContent>
        </OpCard>
    );
});

// ── ScannerComponent ─────────────────────────────────────────────────────────

export const ScannerComponent: React.FC = observer(() => {
    const services = useServices();
    const scanner = services.scanner;

    const handleApprove = async (id: string) => {
        await scanner.approveOpportunity(id);
    };

    const handleReject = (id: string) => {
        scanner.rejectOpportunity(id);
    };

    return (
        <Container>
            {/* Header */}
            <HeaderRow>
                <HeaderLeft>
                    <PageTitle>
                        <IonIcon icon={scanOutline} />
                        Scanner Bot
                    </PageTitle>
                    {scanner.lastScanTime && (
                        <LastScanLabel>
                            <IonIcon icon={timeOutline} />
                            Last scan: {formatTime(scanner.lastScanTime)}
                        </LastScanLabel>
                    )}
                </HeaderLeft>
                <ScanButton
                    onClick={() => void scanner.runScan()}
                    disabled={scanner.isScanning}
                >
                    {scanner.isScanning ? (
                        <>
                            <IonSpinner name="crescent" style={{ width: 16, height: 16, marginRight: 8 }} />
                            Scanning…
                        </>
                    ) : (
                        'Scan Now'
                    )}
                </ScanButton>
            </HeaderRow>

            {/* Auto-scan toggle */}
            <AutoScanRow>
                <AutoScanLabel>
                    <AutoScanTitle>Auto-scan at market open</AutoScanTitle>
                    <AutoScanSub>Runs automatically at 09:31 ET on trading days</AutoScanSub>
                </AutoScanLabel>
                <IonToggle
                    checked={scanner.autoScanEnabled}
                    onIonChange={(e) => scanner.setAutoScanEnabled(e.detail.checked)}
                />
            </AutoScanRow>

            {/* Opportunity cards */}
            {scanner.opportunities.length === 0 ? (
                <EmptyState>
                    <EmptyIcon icon={scanOutline} />
                    <EmptyText>No opportunities found. Run a scan to start.</EmptyText>
                    {scanner.isScanning && <IonLabel color="medium">Scanning markets…</IonLabel>}
                </EmptyState>
            ) : (
                scanner.opportunities.map((opp) => (
                    <OpportunityCard
                        key={opp.id}
                        opportunity={opp}
                        onApprove={(id) => void handleApprove(id)}
                        onReject={handleReject}
                    />
                ))
            )}
        </Container>
    );
});

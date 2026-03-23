/**
 * GUV-93: Proposal lifecycle badges — status chips + filter tabs
 *
 * Displays TradeProposals from TradeProposalService with:
 *  - Color-coded status chips (pending/approved/executed/rejected/expired)
 *  - Filter tabs: All | Pending | Approved | Rejected
 *  - Expiry countdown for pending proposals
 *  - Empty state per tab
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonIcon,
    IonLabel,
} from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import {
    scanOutline,
    checkmarkCircleOutline,
    closeCircleOutline,
    timeOutline,
    checkmarkDoneCircleOutline,
    banOutline,
    hourglassOutline,
} from 'ionicons/icons';
import { useServices } from '../../hooks/use-services.hook';
import type { ITradeProposal, TradeProposalStatus } from '../../services/trade-proposals/trade-proposal.interface';

// ── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
];

// ── Status config ────────────────────────────────────────────────────────────

interface IStatusConfig {
    color: string;
    bg: string;
    border: string;
    icon: string;
    label: string;
}

const STATUS_CONFIG: Record<TradeProposalStatus, IStatusConfig> = {
    pending: {
        color: '#4fc3f7',
        bg: 'rgba(79,195,247,0.12)',
        border: 'rgba(79,195,247,0.35)',
        icon: hourglassOutline,
        label: 'Pending',
    },
    approved: {
        color: '#66bb6a',
        bg: 'rgba(102,187,106,0.12)',
        border: 'rgba(102,187,106,0.35)',
        icon: checkmarkCircleOutline,
        label: 'Approved',
    },
    executed: {
        color: '#66bb6a',
        bg: 'rgba(102,187,106,0.18)',
        border: 'rgba(102,187,106,0.5)',
        icon: checkmarkDoneCircleOutline,
        label: 'Executed',
    },
    rejected: {
        color: '#ef5350',
        bg: 'rgba(239,83,80,0.10)',
        border: 'rgba(239,83,80,0.3)',
        icon: closeCircleOutline,
        label: 'Rejected',
    },
    expired: {
        color: '#8888aa',
        bg: 'rgba(136,136,170,0.10)',
        border: 'rgba(136,136,170,0.25)',
        icon: banOutline,
        label: 'Expired',
    },
};

// ── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
`;

const PageTitle = styled.h1`
    margin: 0 0 20px 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: #e0e0e0;
    display: flex;
    align-items: center;
    gap: 8px;
`;

// ── Filter tabs ──────────────────────────────────────────────────────────────

const TabRow = styled.div`
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
    flex-wrap: wrap;
`;

const Tab = styled.button<{ $active: boolean }>`
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid ${({ $active }) => ($active ? '#4fc3f7' : '#2a2a3e')};
    background: ${({ $active }) => ($active ? 'rgba(79,195,247,0.12)' : 'transparent')};
    color: ${({ $active }) => ($active ? '#4fc3f7' : '#8888aa')};
    font-size: 0.83rem;
    font-weight: ${({ $active }) => ($active ? '600' : '400')};
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;

    &:hover {
        border-color: #4fc3f7;
        color: #4fc3f7;
    }
`;

const TabCount = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: rgba(79,195,247,0.18);
    font-size: 0.7rem;
    font-weight: 700;
    margin-left: 5px;
`;

// ── Status chip ──────────────────────────────────────────────────────────────

const StatusChip = styled.span<{ $status: TradeProposalStatus }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 12px;
    background: ${({ $status }) => STATUS_CONFIG[$status].bg};
    color: ${({ $status }) => STATUS_CONFIG[$status].color};
    border: 1px solid ${({ $status }) => STATUS_CONFIG[$status].border};
    font-size: 0.72rem;
    font-weight: 600;
`;

const StatusIcon = styled(IonIcon)`
    font-size: 0.85rem;
`;

// ── Expiry countdown ─────────────────────────────────────────────────────────

const ExpiryCountdown = styled.span<{ $urgent: boolean }>`
    font-size: 0.75rem;
    font-weight: 600;
    color: ${({ $urgent }) => ($urgent ? '#ffd54f' : '#8888aa')};
    display: flex;
    align-items: center;
    gap: 4px;
`;

// ── Empty state ──────────────────────────────────────────────────────────────

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 12px;
    text-align: center;
`;

const EmptyIcon = styled(IonIcon)`
    font-size: 3rem;
    color: #2a2a3e;
`;

const EmptyText = styled.p`
    margin: 0;
    font-size: 1rem;
    color: #8888aa;
`;

const EmptySub = styled.p`
    margin: 0;
    font-size: 0.82rem;
    color: #555577;
`;

// ── Proposal card ────────────────────────────────────────────────────────────

const ProposalCard = styled(IonCard)<{ $status: TradeProposalStatus }>`
    --background: #1a1a2e;
    border: 1px solid ${({ $status }) =>
        $status === 'approved' || $status === 'executed' ? 'rgba(102,187,106,0.4)' :
        $status === 'rejected' || $status === 'expired' ? 'rgba(136,136,170,0.18)' :
        '#2a2a3e'};
    border-radius: 12px;
    margin: 0 0 14px 0;
    opacity: ${({ $status }) => ($status === 'rejected' || $status === 'expired') ? '0.62' : '1'};
    transition: border-color 0.2s ease, opacity 0.2s ease;
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
    gap: 8px;
    flex-wrap: wrap;
`;

const TickerSymbol = styled.span`
    font-size: 1.25rem;
    font-weight: 700;
    color: #e0e0e0;
`;

const PopBadge = styled.span<{ $level: 'high' | 'mid' | 'low' }>`
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

const FooterLeft = styled.div`
    display: flex;
    align-items: center;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function popLevel(pop: number): 'high' | 'mid' | 'low' {
    if (pop >= 70) return 'high';
    if (pop >= 55) return 'mid';
    return 'low';
}

function useCountdown(expiresAt: Date): { label: string; urgent: boolean } {
    const [now, setNow] = useState(() => Date.now());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        intervalRef.current = setInterval(() => setNow(Date.now()), 10_000);
        return () => {
            if (intervalRef.current !== null) clearInterval(intervalRef.current);
        };
    }, []);

    const diffMs = expiresAt.getTime() - now;
    if (diffMs <= 0) return { label: 'expired', urgent: true };

    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return { label: `expires in ${diffMin}m`, urgent: diffMin < 15 };

    const diffHr = Math.floor(diffMin / 60);
    return { label: `expires in ${diffHr}h`, urgent: false };
}

function filterProposals(proposals: ITradeProposal[], tab: FilterTab): ITradeProposal[] {
    switch (tab) {
        case 'pending':  return proposals.filter(p => p.status === 'pending');
        case 'approved': return proposals.filter(p => p.status === 'approved' || p.status === 'executed');
        case 'rejected': return proposals.filter(p => p.status === 'rejected' || p.status === 'expired');
        default:         return proposals;
    }
}

const EMPTY_STATE: Record<FilterTab, { text: string; sub: string }> = {
    all:      { text: 'No proposals yet.',      sub: 'Run the scanner to find iron condor candidates.' },
    pending:  { text: 'No pending proposals.',  sub: 'Run scanner to find new opportunities.' },
    approved: { text: 'No approved proposals.', sub: 'Approve a pending opportunity to send an order.' },
    rejected: { text: 'No rejected proposals.', sub: '' },
};

// ── Countdown component ──────────────────────────────────────────────────────

const CountdownDisplay: React.FC<{ expiresAt: Date }> = ({ expiresAt }) => {
    const cd = useCountdown(expiresAt);
    return (
        <ExpiryCountdown $urgent={cd.urgent}>
            <IonIcon icon={timeOutline} style={{ fontSize: '0.8rem' }} />
            {cd.label}
        </ExpiryCountdown>
    );
};

// ── ProposalCard ─────────────────────────────────────────────────────────────

interface ProposalCardProps {
    proposal: ITradeProposal;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

const ProposalCardItem: React.FC<ProposalCardProps> = observer(({ proposal, onApprove, onReject }) => {
    const cfg = STATUS_CONFIG[proposal.status];
    const ic = proposal.ironCondor;

    const strikeDisplay = ic
        ? `${ic.btoPut.strikePrice}/${ic.stoPut.strikePrice} P · ${ic.stoCall.strikePrice}/${ic.btoCall.strikePrice} C`
        : '—';

    const expirationDisplay = ic
        ? `${ic.stoCall.expirationDate} · ${ic.stoCall.daysToExpiration} DTE`
        : null;

    const maxRisk = ic ? (ic.maxLoss / 100).toFixed(2) : '—';

    return (
        <ProposalCard $status={proposal.status}>
            <IonCardContent>
                <CardTop>
                    <TickerGroup>
                        <TickerSymbol>{proposal.ticker}</TickerSymbol>
                        <PopBadge $level={popLevel(proposal.scores.pop)}>
                            POP {proposal.scores.pop.toFixed(0)}%
                        </PopBadge>
                        <StatusChip $status={proposal.status}>
                            <StatusIcon icon={cfg.icon} />
                            {cfg.label}
                        </StatusChip>
                    </TickerGroup>
                    <StrikeSummary>{strikeDisplay}</StrikeSummary>
                </CardTop>

                <MetricsRow>
                    <Metric>
                        <MetricLabel>Credit</MetricLabel>
                        <MetricValue $color="#66bb6a">${proposal.scores.credit.toFixed(2)}</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>Max Risk</MetricLabel>
                        <MetricValue $color="#ef5350">{maxRisk !== '—' ? `$${maxRisk}` : '—'}</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>POP</MetricLabel>
                        <MetricValue>{proposal.scores.pop.toFixed(1)}%</MetricValue>
                    </Metric>
                    <Metric>
                        <MetricLabel>Alpha</MetricLabel>
                        <MetricValue $color="#4fc3f7">{proposal.scores.alpha.toFixed(1)}</MetricValue>
                    </Metric>
                </MetricsRow>

                <CardFooter>
                    <FooterLeft>
                        {expirationDisplay && (
                            <ExpiryLabel>{expirationDisplay}</ExpiryLabel>
                        )}
                        {proposal.status === 'pending' && (
                            <CountdownDisplay expiresAt={proposal.expiresAt} />
                        )}
                    </FooterLeft>

                    {proposal.status === 'pending' && (
                        <ActionButtons>
                            <ApproveBtn
                                fill="outline"
                                size="small"
                                onClick={() => onApprove(proposal.id)}
                            >
                                <IonIcon slot="start" icon={checkmarkCircleOutline} />
                                Approve
                            </ApproveBtn>
                            <RejectBtn
                                fill="outline"
                                size="small"
                                onClick={() => onReject(proposal.id)}
                            >
                                <IonIcon slot="start" icon={closeCircleOutline} />
                                Reject
                            </RejectBtn>
                        </ActionButtons>
                    )}
                </CardFooter>
            </IonCardContent>
        </ProposalCard>
    );
});

// ── ScannerComponent ─────────────────────────────────────────────────────────

export const ScannerComponent: React.FC = observer(() => {
    const services = useServices();
    const tp = services.tradeProposals;
    const [activeTab, setActiveTab] = useState<FilterTab>('all');

    const filtered = filterProposals(tp.proposals, activeTab);
    const emptyMsg = EMPTY_STATE[activeTab];

    return (
        <Container>
            <PageTitle>
                <IonIcon icon={scanOutline} />
                Scanner Bot
            </PageTitle>

            {/* Filter tabs */}
            <TabRow>
                {FILTER_TABS.map(({ key, label }) => {
                    const count = filterProposals(tp.proposals, key).length;
                    return (
                        <Tab
                            key={key}
                            $active={activeTab === key}
                            onClick={() => setActiveTab(key)}
                        >
                            {label}
                            {count > 0 && <TabCount>{count}</TabCount>}
                        </Tab>
                    );
                })}
            </TabRow>

            {/* Proposals or empty state */}
            {filtered.length === 0 ? (
                <EmptyState>
                    <EmptyIcon icon={scanOutline} />
                    <EmptyText>{emptyMsg.text}</EmptyText>
                    {emptyMsg.sub && <EmptySub>{emptyMsg.sub}</EmptySub>}
                    {!services.isInitialized && (
                        <IonLabel color="medium" style={{ fontSize: '0.8rem' }}>
                            Connect a broker account to enable scanning.
                        </IonLabel>
                    )}
                </EmptyState>
            ) : (
                filtered.map((proposal) => (
                    <ProposalCardItem
                        key={proposal.id}
                        proposal={proposal}
                        onApprove={(id) => void tp.approveProposal(id)}
                        onReject={(id) => tp.rejectProposal(id)}
                    />
                ))
            )}
        </Container>
    );
});

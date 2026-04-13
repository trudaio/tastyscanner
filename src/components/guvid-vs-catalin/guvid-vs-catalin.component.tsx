import React, { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
    IonSpinner, IonSegment, IonSegmentButton, IonLabel,
    IonModal, IonButton, IonInput, IonItem, IonIcon,
} from '@ionic/react';
import { trophyOutline, lockClosedOutline, eyeOutline, flashOutline, sparklesOutline, closeCircleOutline } from 'ionicons/icons';
import {
    subscribeRoundsV2, submitUserPick, calculateDeadline, computeLeaderboard,
    setApproval, submitFeedback,
    type ICompetitionRoundV2, type ICompetitionTradeV2,
} from '../../services/competition/competition-v2.service';
import { auth } from '../../firebase';

/* ═══ Animations ═══════════════════════════════════════════ */

const pulse = keyframes`
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
`;

const shimmer = keyframes`
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
`;

/* ═══ Styled ═══════════════════════════════════════════════ */

const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    min-height: 100%;
    color: #fff;
    @media (max-width: 480px) { padding: 12px; }
`;

const Hero = styled.div`
    text-align: center;
    padding: 24px 20px;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%);
    border-radius: 12px;
    border: 1px solid #2a2a3e;
    position: relative;
    overflow: hidden;
`;

const HeroTitle = styled.h1`
    font-size: 28px;
    font-weight: 800;
    margin: 0 0 6px 0;
    background: linear-gradient(90deg, #4a9eff, #4dff91, #ffaa00, #4a9eff);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: ${shimmer} 4s linear infinite;
    @media (max-width: 480px) { font-size: 22px; }
`;

const HeroSub = styled.p`
    color: #888;
    font-size: 13px;
    margin: 0 0 16px 0;
`;

const Countdown = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    background: rgba(74, 158, 255, 0.1);
    border: 1px solid #4a9eff;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
`;

const CountdownDays = styled.span`
    font-size: 18px;
    color: #4a9eff;
    font-weight: 800;
`;

/* Leaderboard */

const LeaderboardRow = styled.div`
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    margin-bottom: 20px;
    @media (max-width: 480px) {
        grid-template-columns: 1fr;
    }
`;

const ScorePanel = styled.div<{ $color: string; $leading?: boolean }>`
    background: ${p => p.$leading ? `linear-gradient(135deg, ${p.$color}22, ${p.$color}44)` : '#1a1a2e'};
    border: 2px solid ${p => p.$leading ? p.$color : '#2a2a3e'};
    border-radius: 12px;
    padding: 18px 20px;
    transition: all 0.3s;
    position: relative;
`;

const ScoreLabel = styled.div<{ $color: string }>`
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 700;
    color: ${p => p.$color};
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
`;

const ScoreName = styled.div`
    font-size: 20px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 12px;
`;

const ScoreMetric = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #888;
    padding: 4px 0;

    span.value { color: #fff; font-weight: 600; }
    span.positive { color: #4dff91; font-weight: 700; }
    span.negative { color: #ff4d6d; font-weight: 700; }
`;

const LeadBadge = styled.div<{ $color: string }>`
    position: absolute;
    top: -10px;
    right: 12px;
    background: ${p => p.$color};
    color: #0d0d1a;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 10px;
    text-transform: uppercase;
`;

const VsDivider = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 900;
    color: #555;
    @media (max-width: 480px) {
        padding: 8px 0;
    }
`;

/* Rounds */

const SectionTitle = styled.h2`
    font-size: 16px;
    color: #ddd;
    margin: 28px 0 14px 0;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const FilterRow = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
`;

const FilterPill = styled.button<{ $active?: boolean }>`
    padding: 6px 14px;
    background: ${p => p.$active ? '#4a9eff' : '#1a1a2e'};
    border: 1px solid ${p => p.$active ? '#4a9eff' : '#333'};
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-weight: ${p => p.$active ? 600 : 400};
    cursor: pointer;
    &:hover { background: ${p => p.$active ? '#4a9eff' : '#2a2a3e'}; }
`;

const RoundCard = styled.div<{ $status: 'pending' | 'decided' | 'ghost' }>`
    background: ${p => p.$status === 'ghost' ? 'rgba(255,170,0,0.04)' : '#1a1a2e'};
    border: 1px solid ${p => p.$status === 'ghost' ? 'rgba(255,170,0,0.3)' : '#2a2a3e'};
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 12px;
`;

const RoundHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
`;

const RoundMeta = styled.div`
    font-size: 12px;
    color: #888;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
`;

const TickerBadge = styled.span<{ $ticker: string }>`
    background: ${p => p.$ticker === 'SPX' ? 'rgba(74,158,255,0.15)' : 'rgba(77,255,145,0.15)'};
    color: ${p => p.$ticker === 'SPX' ? '#4a9eff' : '#4dff91'};
    padding: 2px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 11px;
`;

const StatusBadge = styled.span<{ $kind: 'pending' | 'user' | 'ai' | 'draw' | 'ghost' }>`
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    ${p => {
        switch (p.$kind) {
            case 'pending': return 'background: rgba(255,170,0,0.15); border: 1px solid #ffaa00; color: #ffaa00;';
            case 'user': return 'background: rgba(77,255,145,0.15); border: 1px solid #4dff91; color: #4dff91;';
            case 'ai': return 'background: rgba(74,158,255,0.15); border: 1px solid #4a9eff; color: #4a9eff;';
            case 'draw': return 'background: rgba(136,136,136,0.15); border: 1px solid #888; color: #888;';
            case 'ghost': return 'background: rgba(255,170,0,0.1); border: 1px solid #ffaa00; color: #ffaa00;';
        }
    }}
`;

const RoundBody = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const Side = styled.div<{ $side: 'user' | 'ai' }>`
    border: 1px solid ${p => p.$side === 'user' ? 'rgba(77,255,145,0.3)' : 'rgba(74,158,255,0.3)'};
    border-radius: 8px;
    padding: 12px;
    background: ${p => p.$side === 'user' ? 'rgba(77,255,145,0.03)' : 'rgba(74,158,255,0.03)'};
`;

const SideLabel = styled.div<{ $color: string }>`
    color: ${p => p.$color};
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const Strategy = styled.div`
    font-size: 13px;
    color: #fff;
    font-weight: 700;
    margin-bottom: 8px;
`;

const MetricRow = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #888;
    padding: 2px 0;
    span.val { color: #ddd; font-weight: 600; }
    span.pos { color: #4dff91; font-weight: 700; }
    span.neg { color: #ff4d6d; font-weight: 700; }
`;

const LockedPlaceholder = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    padding: 32px 16px;
    color: #666;
    font-size: 12px;
    animation: ${pulse} 2s ease-in-out infinite;
`;

const Rationale = styled.div`
    font-size: 11px;
    color: #aaa;
    font-style: italic;
    padding: 8px 10px;
    background: rgba(74,158,255,0.05);
    border-left: 2px solid #4a9eff;
    border-radius: 0 4px 4px 0;
    margin: 8px 0;
    line-height: 1.4;
`;

const ConfidenceBar = styled.div`
    margin: 8px 0;
    font-size: 10px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ConfidenceTrack = styled.div`
    flex: 1;
    height: 4px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
`;

const ConfidenceFill = styled.div<{ $pct: number }>`
    height: 100%;
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, #ff4d6d 0%, #ffaa00 50%, #4dff91 100%);
`;

const RuleBadges = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
`;

const RuleBadge = styled.span`
    font-size: 9px;
    background: #222;
    border: 1px solid #333;
    color: #888;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 40px 20px;
    color: #666;
    font-size: 13px;
`;

const SubmitBtn = styled.button`
    background: #4a9eff;
    border: none;
    color: #fff;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    &:hover { background: #3a8eef; }
    &:disabled { background: #333; cursor: not-allowed; }
`;

const ModalBody = styled.div`
    padding: 20px;
    background: #0d0d1a;
    color: #fff;
    min-height: 400px;
`;

const FormRow = styled.div`
    margin-bottom: 14px;
`;

const FormLabel = styled.label`
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
    font-weight: 600;
`;

const PostMortem = styled.div`
    margin-top: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.03);
    border-left: 3px solid #4dff91;
    border-radius: 0 6px 6px 0;
    font-size: 11px;
    color: #ddd;
    line-height: 1.5;
`;

const ApprovalBanner = styled.div`
    background: linear-gradient(90deg, rgba(255,170,0,0.15), rgba(255,170,0,0.25));
    border: 2px solid #ffaa00;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ApprovalActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: 4px;
`;

const ApprovalBtn = styled.button<{ $variant: 'approve' | 'reject' }>`
    flex: 1;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    background: ${p => p.$variant === 'approve' ? '#4dff91' : '#ff4d6d'};
    color: #0d0d1a;
    &:hover { opacity: 0.9; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const FeedbackBtn = styled.button`
    background: transparent;
    border: 1px solid #4a9eff;
    color: #4a9eff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 8px;
    &:hover { background: rgba(74,158,255,0.1); }
`;

const StarRow = styled.div`
    display: flex;
    gap: 4px;
    margin-top: 4px;
`;

const StarBtn = styled.button<{ $filled: boolean }>`
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 24px;
    color: ${p => p.$filled ? '#ffaa00' : '#444'};
    padding: 0;
    &:hover { color: #ffaa00; }
`;

const FeedbackBadge = styled.div`
    margin-top: 8px;
    padding: 6px 10px;
    background: rgba(74,158,255,0.05);
    border-left: 2px solid #4a9eff;
    border-radius: 0 4px 4px 0;
    font-size: 11px;
    color: #aaa;
`;

const WinnerBanner = styled.div<{ $winner: string }>`
    padding: 8px 12px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    border-radius: 6px;
    margin-bottom: 10px;
    background: ${p => {
        if (p.$winner === 'User') return 'rgba(77,255,145,0.15)';
        if (p.$winner === 'AI') return 'rgba(74,158,255,0.15)';
        if (p.$winner === 'Draw') return 'rgba(136,136,136,0.15)';
        return 'rgba(255,170,0,0.1)';
    }};
    color: ${p => {
        if (p.$winner === 'User') return '#4dff91';
        if (p.$winner === 'AI') return '#4a9eff';
        if (p.$winner === 'Draw') return '#888';
        return '#ffaa00';
    }};
`;

/* ═══ Helpers ══════════════════════════════════════════════ */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const fmtScore = (v: number | null): string => {
    if (v === null) return '—';
    return (v * 100).toFixed(1) + '%';
};

function isRoundLocked(round: ICompetitionRoundV2): boolean {
    if (round.revealedAt) return false;
    if (round.ghost) return false;
    const now = new Date();
    const et1100 = new Date(round.date + 'T15:00:00Z'); // 11 AM ET ≈ 15 UTC (EDT) or 16 UTC (EST)
    return now < et1100;
}

/* ═══ Component ════════════════════════════════════════════ */

export const GuviduVsCatalinComponent: React.FC = () => {
    const [rounds, setRounds] = useState<ICompetitionRoundV2[]>([]);
    const [loading, setLoading] = useState(true);
    const [tickerFilter, setTickerFilter] = useState<'ALL' | 'SPX' | 'QQQ'>('ALL');
    const [showSubmit, setShowSubmit] = useState(false);

    useEffect(() => {
        if (!auth.currentUser) return;
        const unsub = subscribeRoundsV2((r) => {
            setRounds(r);
            setLoading(false);
        });
        return () => { unsub(); };
    }, []);

    const deadline = useMemo(() => calculateDeadline(), []);
    const leaderboard = useMemo(() => computeLeaderboard(rounds), [rounds]);

    const filteredRounds = useMemo(() => {
        if (tickerFilter === 'ALL') return rounds;
        return rounds.filter((r) => r.ticker === tickerFilter);
    }, [rounds, tickerFilter]);

    const userLeading = leaderboard.userCumulativeScore > leaderboard.aiCumulativeScore;
    const aiLeading = leaderboard.aiCumulativeScore > leaderboard.userCumulativeScore;

    if (loading) {
        return (
            <Container>
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                    <IonSpinner name="crescent" />
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <Hero>
                <HeroTitle>Guvidul vs Catalin</HeroTitle>
                <HeroSub>Autonomous AI competition • Daily picks at 10:30 AM ET • Reveal at 11:00 AM</HeroSub>
                <Countdown>
                    <IonIcon icon={trophyOutline} style={{ fontSize: 18, color: '#4a9eff' }} />
                    <span>Winner declared in</span>
                    <CountdownDays>{deadline.daysRemaining}</CountdownDays>
                    <span>days</span>
                </Countdown>
            </Hero>

            <LeaderboardRow>
                <ScorePanel $color="#4dff91" $leading={userLeading}>
                    {userLeading && <LeadBadge $color="#4dff91">🏆 Leading</LeadBadge>}
                    <ScoreLabel $color="#4dff91">
                        <IonIcon icon={eyeOutline} /> You
                    </ScoreLabel>
                    <ScoreName>Catalin</ScoreName>
                    <ScoreMetric>
                        <span>Wins</span><span className="positive">{leaderboard.userWins}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Losses</span><span className="negative">{leaderboard.aiWins}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Draws</span><span className="value">{leaderboard.draws}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Risk-adj P&L</span>
                        <span className={leaderboard.userCumulativeScore >= 0 ? 'positive' : 'negative'}>
                            {fmtScore(leaderboard.userCumulativeScore)}
                        </span>
                    </ScoreMetric>
                </ScorePanel>

                <VsDivider>VS</VsDivider>

                <ScorePanel $color="#4a9eff" $leading={aiLeading}>
                    {aiLeading && <LeadBadge $color="#4a9eff">🤖 Leading</LeadBadge>}
                    <ScoreLabel $color="#4a9eff">
                        <IonIcon icon={sparklesOutline} /> AI
                    </ScoreLabel>
                    <ScoreName>Guvidul</ScoreName>
                    <ScoreMetric>
                        <span>Wins</span><span className="positive">{leaderboard.aiWins}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Losses</span><span className="negative">{leaderboard.userWins}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Draws</span><span className="value">{leaderboard.draws}</span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Risk-adj P&L</span>
                        <span className={leaderboard.aiCumulativeScore >= 0 ? 'positive' : 'negative'}>
                            {fmtScore(leaderboard.aiCumulativeScore)}
                        </span>
                    </ScoreMetric>
                    <ScoreMetric>
                        <span>Ghost rounds</span><span className="value">{leaderboard.ghostRounds}</span>
                    </ScoreMetric>
                </ScorePanel>
            </LeaderboardRow>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                <SectionTitle style={{ margin: 0 }}>
                    <IonIcon icon={flashOutline} /> Rounds
                </SectionTitle>
                <SubmitBtn onClick={() => setShowSubmit(true)}>
                    + Submit your pick
                </SubmitBtn>
            </div>

            <FilterRow>
                <FilterPill $active={tickerFilter === 'ALL'} onClick={() => setTickerFilter('ALL')}>
                    ALL ({rounds.length})
                </FilterPill>
                <FilterPill $active={tickerFilter === 'SPX'} onClick={() => setTickerFilter('SPX')}>
                    SPX ({rounds.filter((r) => r.ticker === 'SPX').length})
                </FilterPill>
                <FilterPill $active={tickerFilter === 'QQQ'} onClick={() => setTickerFilter('QQQ')}>
                    QQQ ({rounds.filter((r) => r.ticker === 'QQQ').length})
                </FilterPill>
            </FilterRow>

            {filteredRounds.length === 0 ? (
                <EmptyState>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🎲</div>
                    <div>No rounds yet. Submit your first pick above — the AI will respond at 10:30 AM ET on the next weekday.</div>
                </EmptyState>
            ) : (
                filteredRounds.map((r) => <RoundCardComponent key={r.id} round={r} />)
            )}

            <SubmitModal
                isOpen={showSubmit}
                onClose={() => setShowSubmit(false)}
                onSubmitted={() => setShowSubmit(false)}
            />
        </Container>
    );
};

/* ═══ Round Card ═══════════════════════════════════════════ */

const RoundCardComponent: React.FC<{ round: ICompetitionRoundV2 }> = ({ round }) => {
    const locked = isRoundLocked(round);
    const status: 'pending' | 'decided' | 'ghost' =
        round.ghost ? 'ghost' : (round.winner === 'Pending' ? 'pending' : 'decided');

    const badge = round.ghost ? 'ghost' :
        round.winner === 'Pending' ? 'pending' :
        round.winner === 'User' ? 'user' :
        round.winner === 'AI' ? 'ai' : 'draw';

    const ai = round.aiTrade;
    const needsApproval = ai.requiresApproval && ai.approvalStatus === 'pending';
    const isClosed = round.winner !== 'Pending' && round.winner !== 'GhostOnly';
    const hasFeedback = !!round.userFeedback;
    const [showFeedback, setShowFeedback] = React.useState(false);
    const [approving, setApproving] = React.useState(false);

    const handleApproval = async (action: 'approved' | 'rejected') => {
        if (!round.id) return;
        setApproving(true);
        try { await setApproval(round.id, action); }
        catch (e) { console.error('Approval error:', e); }
        finally { setApproving(false); }
    };

    return (
        <RoundCard $status={status}>
            <RoundHeader>
                <RoundMeta>
                    <TickerBadge $ticker={round.ticker}>{round.ticker}</TickerBadge>
                    <span>Exp: {round.expirationDate}</span>
                    <span>Date: {round.date}</span>
                    {round.marketContext && <span>VIX: {round.marketContext.vix.toFixed(1)}</span>}
                </RoundMeta>
                <StatusBadge $kind={badge as 'pending' | 'user' | 'ai' | 'draw' | 'ghost'}>
                    {round.ghost ? '👻 Ghost' :
                        round.winner === 'Pending' ? '⏳ Pending' :
                        round.winner === 'User' ? '🏆 You won' :
                        round.winner === 'AI' ? '🤖 AI won' :
                        round.winner === 'Draw' ? '🤝 Draw' : round.winner}
                </StatusBadge>
            </RoundHeader>

            {needsApproval && !locked && (
                <ApprovalBanner>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ffaa00' }}>
                        ⚠️ AI deviates from rules — your approval needed
                    </div>
                    {ai.deviationReason && (
                        <div style={{ fontSize: 11, color: '#ddd', fontStyle: 'italic' }}>
                            "{ai.deviationReason}"
                        </div>
                    )}
                    <ApprovalActions>
                        <ApprovalBtn $variant="approve" onClick={() => handleApproval('approved')} disabled={approving}>
                            ✓ Approve
                        </ApprovalBtn>
                        <ApprovalBtn $variant="reject" onClick={() => handleApproval('rejected')} disabled={approving}>
                            ✗ Reject (becomes ghost)
                        </ApprovalBtn>
                    </ApprovalActions>
                </ApprovalBanner>
            )}

            {ai.approvalStatus === 'approved' && (
                <div style={{ fontSize: 11, color: '#4dff91', marginBottom: 8 }}>✓ You approved this deviation</div>
            )}
            {ai.approvalStatus === 'rejected' && (
                <div style={{ fontSize: 11, color: '#ff4d6d', marginBottom: 8 }}>✗ Rejected — converted to ghost</div>
            )}

            {round.winner && round.winner !== 'Pending' && !round.ghost && (
                <WinnerBanner $winner={round.winner}>
                    {round.winner === 'User' ? '🏆 Catalin won this round' :
                     round.winner === 'AI' ? '🤖 Guvidul won this round' :
                     '🤝 Draw'}
                    {' • User: '}{fmtScore(round.userScore)}{' vs AI: '}{fmtScore(round.aiScore)}
                </WinnerBanner>
            )}

            <RoundBody>
                {/* User side */}
                {round.userTrade && !round.ghost ? (
                    <UserSide trade={round.userTrade} />
                ) : round.ghost ? (
                    <Side $side="user">
                        <SideLabel $color="#888">You · Did not play</SideLabel>
                        <LockedPlaceholder>
                            <IonIcon icon={closeCircleOutline} style={{ fontSize: 28 }} />
                            <span>Ghost round (AI solo)</span>
                        </LockedPlaceholder>
                    </Side>
                ) : null}

                {/* AI side */}
                {locked ? (
                    <Side $side="ai">
                        <SideLabel $color="#4a9eff">
                            <span>AI · Guvidul</span>
                            <IonIcon icon={lockClosedOutline} />
                        </SideLabel>
                        <LockedPlaceholder>
                            <div style={{ fontSize: 42 }}>🂠</div>
                            <span>Locked until 11:00 AM ET</span>
                        </LockedPlaceholder>
                    </Side>
                ) : (
                    <AiSide trade={round.aiTrade} />
                )}
            </RoundBody>

            {/* Feedback */}
            {isClosed && !round.ghost && !hasFeedback && (
                <FeedbackBtn onClick={() => setShowFeedback(true)}>
                    📝 Give feedback on this round
                </FeedbackBtn>
            )}
            {hasFeedback && round.userFeedback && (
                <FeedbackBadge>
                    <div>Your feedback: pick {'⭐'.repeat(round.userFeedback.pickRating)} · rationale {'⭐'.repeat(round.userFeedback.rationaleRating)}</div>
                    {round.userFeedback.comment && <div style={{ marginTop: 4, fontStyle: 'italic' }}>"{round.userFeedback.comment}"</div>}
                </FeedbackBadge>
            )}

            <FeedbackModal
                isOpen={showFeedback}
                roundId={round.id ?? ''}
                onClose={() => setShowFeedback(false)}
            />
        </RoundCard>
    );
};

/* ═══ Feedback Modal ═════════════════════════════════════════ */

const FeedbackModal: React.FC<{ isOpen: boolean; roundId: string; onClose: () => void }> = ({ isOpen, roundId, onClose }) => {
    const [pickRating, setPickRating] = useState(0);
    const [rationaleRating, setRationaleRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (pickRating === 0 || rationaleRating === 0) return;
        setSubmitting(true);
        try {
            await submitFeedback(roundId, { pickRating, rationaleRating, comment: comment.trim() });
            onClose();
            setPickRating(0); setRationaleRating(0); setComment('');
        } catch (e) { console.error('Feedback error:', e); }
        finally { setSubmitting(false); }
    };

    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose}>
            <ModalBody>
                <h2 style={{ margin: '0 0 16px 0' }}>Rate AI's pick</h2>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>
                    Your feedback shapes next week's strategy memo and AI reasoning.
                </p>

                <FormRow>
                    <FormLabel>Pick quality (was the IC choice good?)</FormLabel>
                    <StarRow>
                        {[1, 2, 3, 4, 5].map((n) => (
                            <StarBtn key={n} $filled={n <= pickRating} onClick={() => setPickRating(n)}>★</StarBtn>
                        ))}
                    </StarRow>
                </FormRow>

                <FormRow>
                    <FormLabel>Rationale quality (was the explanation insightful?)</FormLabel>
                    <StarRow>
                        {[1, 2, 3, 4, 5].map((n) => (
                            <StarBtn key={n} $filled={n <= rationaleRating} onClick={() => setRationaleRating(n)}>★</StarBtn>
                        ))}
                    </StarRow>
                </FormRow>

                <FormRow>
                    <FormLabel>Comment (optional)</FormLabel>
                    <IonItem>
                        <IonInput value={comment} onIonInput={(e) => setComment(e.detail.value ?? '')} placeholder="What did AI get right/wrong? Anything to remember?" />
                    </IonItem>
                </FormRow>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                    <IonButton fill="outline" onClick={onClose}>Cancel</IonButton>
                    <IonButton onClick={handleSubmit} disabled={submitting || pickRating === 0 || rationaleRating === 0}>
                        {submitting ? 'Saving…' : 'Submit feedback'}
                    </IonButton>
                </div>
            </ModalBody>
        </IonModal>
    );
};

const UserSide: React.FC<{ trade: ICompetitionTradeV2 }> = ({ trade }) => {
    const pl = trade.exitPl;
    return (
        <Side $side="user">
            <SideLabel $color="#4dff91">Catalin</SideLabel>
            <Strategy>{trade.strategy}</Strategy>
            <MetricRow><span>Credit</span><span className="val">{fmtCur(trade.credit)}</span></MetricRow>
            <MetricRow><span>Qty</span><span className="val">{trade.quantity}</span></MetricRow>
            <MetricRow><span>POP</span><span className="val">{trade.pop.toFixed(1)}%</span></MetricRow>
            <MetricRow><span>R/R</span><span className="val">{trade.rr.toFixed(2)}:1</span></MetricRow>
            {pl !== null && (
                <MetricRow>
                    <span>Exit P&L</span>
                    <span className={pl >= 0 ? 'pos' : 'neg'}>{fmtCur(pl)}</span>
                </MetricRow>
            )}
            <MetricRow><span>Status</span><span className="val">{trade.status}</span></MetricRow>
        </Side>
    );
};

const AiSide: React.FC<{ trade: import('../../services/competition/competition-v2.service').IAiCompetitionTrade }> = ({ trade }) => {
    const pl = trade.exitPl;
    const isPlaceholder = trade.strategy === 'PENDING';

    if (isPlaceholder) {
        return (
            <Side $side="ai">
                <SideLabel $color="#4a9eff">AI · Guvidul</SideLabel>
                <LockedPlaceholder>
                    <div style={{ fontSize: 32 }}>⏳</div>
                    <span>Waiting for 10:30 AM ET submit window</span>
                </LockedPlaceholder>
            </Side>
        );
    }

    return (
        <Side $side="ai">
            <SideLabel $color="#4a9eff">
                <span>AI · Guvidul</span>
                {trade.experimentVariant && <span style={{ fontSize: 9, color: '#ffaa00' }}>🧪 EXPERIMENT</span>}
            </SideLabel>
            <Strategy>{trade.strategy}</Strategy>
            <MetricRow><span>Credit</span><span className="val">{fmtCur(trade.credit)}</span></MetricRow>
            <MetricRow><span>Qty</span><span className="val">{trade.quantity}</span></MetricRow>
            <MetricRow><span>Wings</span><span className="val">${trade.wings}</span></MetricRow>
            <MetricRow><span>POP</span><span className="val">{trade.pop.toFixed(1)}%</span></MetricRow>
            <MetricRow><span>R/R</span><span className="val">{trade.rr.toFixed(2)}:1</span></MetricRow>
            {pl !== null && (
                <MetricRow>
                    <span>Exit P&L</span>
                    <span className={pl >= 0 ? 'pos' : 'neg'}>{fmtCur(pl)}</span>
                </MetricRow>
            )}
            {trade.closedBy && (
                <MetricRow>
                    <span>Closed by</span><span className="val">{trade.closedBy}</span>
                </MetricRow>
            )}

            {trade.rationale && trade.rationale !== 'AI has not picked yet — will be submitted at 10:30 AM ET' && (
                <Rationale>💡 {trade.rationale}</Rationale>
            )}

            {trade.confidenceScore > 0 && (
                <ConfidenceBar>
                    <span>Confidence:</span>
                    <ConfidenceTrack><ConfidenceFill $pct={trade.confidenceScore} /></ConfidenceTrack>
                    <span style={{ fontWeight: 700, color: '#ddd' }}>{trade.confidenceScore}%</span>
                </ConfidenceBar>
            )}

            {trade.rulesApplied && trade.rulesApplied.length > 0 && (
                <RuleBadges>
                    {trade.rulesApplied.slice(0, 6).map((r) => (
                        <RuleBadge key={r}>{r}</RuleBadge>
                    ))}
                </RuleBadges>
            )}
        </Side>
    );
};

/* ═══ Submit Modal ═════════════════════════════════════════ */

const SubmitModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmitted: () => void;
}> = ({ isOpen, onClose, onSubmitted }) => {
    const [ticker, setTicker] = useState<'SPX' | 'QQQ'>('SPX');
    const [expirationDate, setExpirationDate] = useState('');
    const [strategy, setStrategy] = useState('');
    const [credit, setCredit] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [wings, setWings] = useState('10');
    const [putBuy, setPutBuy] = useState('');
    const [putSell, setPutSell] = useState('');
    const [callSell, setCallSell] = useState('');
    const [callBuy, setCallBuy] = useState('');
    const [pop, setPop] = useState('70');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setError(null);
        setSubmitting(true);
        try {
            if (!auth.currentUser) throw new Error('Not authenticated');
            if (!expirationDate || !putBuy || !putSell || !callSell || !callBuy) {
                throw new Error('Fill in all strikes and expiration');
            }
            const creditNum = parseFloat(credit);
            const qtyNum = parseInt(quantity, 10);
            const wingsNum = parseFloat(wings);
            const popNum = parseFloat(pop);
            if (isNaN(creditNum) || creditNum <= 0) throw new Error('Invalid credit');

            const legs = [
                { type: 'BTO', optionType: 'P', strike: parseFloat(putBuy) },
                { type: 'STO', optionType: 'P', strike: parseFloat(putSell) },
                { type: 'STO', optionType: 'C', strike: parseFloat(callSell) },
                { type: 'BTO', optionType: 'C', strike: parseFloat(callBuy) },
            ];
            const strategyStr = strategy || `IC ${putBuy}/${putSell}p ${callSell}/${callBuy}c`;

            const maxProfit = creditNum * 100 * qtyNum;
            const maxLoss = (wingsNum - creditNum) * 100 * qtyNum;
            const ev = (popNum / 100) * maxProfit - (1 - popNum / 100) * maxLoss;

            const userTrade: ICompetitionTradeV2 = {
                ticker, strategy: strategyStr, expiration: expirationDate, legs,
                credit: creditNum, quantity: qtyNum, wings: wingsNum,
                maxProfit, maxLoss,
                pop: popNum, ev, alpha: maxLoss > 0 ? (ev / maxLoss) * 100 : 0, rr: wingsNum / creditNum,
                delta: 0, theta: 0,
                exitPl: null, exitDate: null, closedBy: null, status: 'open',
            };

            const date = new Date().toISOString().split('T')[0];

            await submitUserPick({
                roundNumber: 0,
                date, expirationDate, ticker,
                userEmail: auth.currentUser.email ?? '',
                userTrade,
                winner: 'Pending',
                ghost: false,
                marketContext: { underlyingPrice: 0, vix: 0, ivRank: 0 },
                userScore: null, aiScore: null, winnerDecidedAt: null,
            });

            onSubmitted();
            // Reset
            setExpirationDate(''); setStrategy(''); setCredit('');
            setPutBuy(''); setPutSell(''); setCallSell(''); setCallBuy('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose}>
            <ModalBody>
                <h2 style={{ margin: '0 0 16px 0' }}>Submit your IC pick</h2>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>
                    AI will respond on the same expiration at 10:30 AM ET on the next weekday.
                </p>

                <FormRow>
                    <FormLabel>Ticker</FormLabel>
                    <IonSegment value={ticker} onIonChange={(e) => setTicker(e.detail.value as 'SPX' | 'QQQ')}>
                        <IonSegmentButton value="SPX"><IonLabel>SPX</IonLabel></IonSegmentButton>
                        <IonSegmentButton value="QQQ"><IonLabel>QQQ</IonLabel></IonSegmentButton>
                    </IonSegment>
                </FormRow>

                <FormRow>
                    <FormLabel>Expiration Date (YYYY-MM-DD)</FormLabel>
                    <IonItem><IonInput value={expirationDate} onIonInput={(e) => setExpirationDate(e.detail.value ?? '')} placeholder="2026-05-15" /></IonItem>
                </FormRow>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <FormRow>
                        <FormLabel>Long Put</FormLabel>
                        <IonItem><IonInput type="number" value={putBuy} onIonInput={(e) => setPutBuy(e.detail.value ?? '')} placeholder="6200" /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>Short Put</FormLabel>
                        <IonItem><IonInput type="number" value={putSell} onIonInput={(e) => setPutSell(e.detail.value ?? '')} placeholder="6210" /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>Short Call</FormLabel>
                        <IonItem><IonInput type="number" value={callSell} onIonInput={(e) => setCallSell(e.detail.value ?? '')} placeholder="7100" /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>Long Call</FormLabel>
                        <IonItem><IonInput type="number" value={callBuy} onIonInput={(e) => setCallBuy(e.detail.value ?? '')} placeholder="7110" /></IonItem>
                    </FormRow>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <FormRow>
                        <FormLabel>Credit ($)</FormLabel>
                        <IonItem><IonInput type="number" value={credit} onIonInput={(e) => setCredit(e.detail.value ?? '')} placeholder="2.50" /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>Qty</FormLabel>
                        <IonItem><IonInput type="number" value={quantity} onIonInput={(e) => setQuantity(e.detail.value ?? '')} /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>Wings ($)</FormLabel>
                        <IonItem><IonInput type="number" value={wings} onIonInput={(e) => setWings(e.detail.value ?? '')} /></IonItem>
                    </FormRow>
                    <FormRow>
                        <FormLabel>POP (%)</FormLabel>
                        <IonItem><IonInput type="number" value={pop} onIonInput={(e) => setPop(e.detail.value ?? '')} /></IonItem>
                    </FormRow>
                </div>

                {error && (
                    <div style={{ color: '#ff4d6d', fontSize: 12, padding: 10, background: 'rgba(255,77,109,0.1)', borderRadius: 6, marginBottom: 12 }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                    <IonButton fill="outline" onClick={onClose}>Cancel</IonButton>
                    <IonButton onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit Pick'}
                    </IonButton>
                </div>
            </ModalBody>
        </IonModal>
    );
};

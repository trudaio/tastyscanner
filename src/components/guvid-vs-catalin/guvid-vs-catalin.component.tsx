import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { auth } from '../../firebase';
import { getCompetitionRounds, ICompetitionRound } from '../../services/competition/competition.service';

/* ─── Types ───────────────────────────────────── */

export interface IChallengeTrade {
    id: number;
    date: string;
    player: 'Guvidul' | 'Catalin';
    ticker: string;
    strategy: string;
    entry: number;
    exit: number | null;
    pl: number | null;
    status: 'open' | 'won' | 'lost' | 'draw';
    notes?: string;
}

interface IRound {
    round: number;
    date: string;
    guvidTrade: IChallengeTrade;
    catalinTrade: IChallengeTrade;
    winner: 'Guvidul' | 'Catalin' | 'Draw' | 'Pending';
}

/* ─── Styled Components ───────────────────────── */

const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    min-height: 100%;
    @media (max-width: 480px) { padding: 12px; }
`;

const HeroSection = styled.div`
    text-align: center;
    padding: 32px 20px;
    margin-bottom: 24px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%);
    border-radius: 12px;
    border: 1px solid #2a2a3e;
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(74, 158, 255, 0.03) 0%, transparent 70%);
        animation: pulse 4s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.05); opacity: 1; }
    }
`;

const VsTitle = styled.h1`
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 8px 0;
    position: relative;

    @media (max-width: 480px) { font-size: 1.4rem; }
`;

const VsGuvid = styled.span`
    color: #4a9eff;
`;

const VsText = styled.span`
    color: #888;
    font-size: 1.4rem;
    margin: 0 12px;
    font-weight: 400;
    @media (max-width: 480px) {
        font-size: 1rem;
        margin: 0 8px;
    }
`;

const VsCatalin = styled.span`
    color: #ffaa00;
`;

const Subtitle = styled.p`
    color: #888;
    font-size: 0.9rem;
    margin: 0;
    position: relative;
`;

const ScoreboardGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    margin-bottom: 24px;
    align-items: stretch;

    @media (max-width: 600px) {
        grid-template-columns: 1fr;
        gap: 12px;
    }
`;

const PlayerCard = styled.div<{ $color: string }>`
    background: #1a1a2e;
    border-radius: 10px;
    padding: 24px;
    border-top: 3px solid ${p => p.$color};
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
`;

const PlayerAvatar = styled.div<{ $color: string }>`
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: ${p => p.$color}22;
    border: 2px solid ${p => p.$color};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    overflow: hidden;
`;

const AvatarImg = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
`;

const PlayerName = styled.div<{ $color: string }>`
    font-size: 1.1rem;
    font-weight: 700;
    color: ${p => p.$color};
`;

const PlayerStats = styled.div`
    display: flex;
    gap: 20px;
    margin-top: 4px;
`;

const StatItem = styled.div`
    text-align: center;
`;

const StatValue = styled.div<{ $color?: string }>`
    font-size: 1.5rem;
    font-weight: 700;
    color: ${p => p.$color || '#fff'};
`;

const StatLabel = styled.div`
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const VsDivider = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;

    @media (max-width: 600px) { display: none; }
`;

const VsBadge = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #2a2a3e;
    border: 2px solid #4a9eff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 800;
    color: #4a9eff;
`;

const PLRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;

    @media (max-width: 480px) { gap: 10px; }
`;

const PLCard = styled.div<{ $color: string }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 16px;
    border-left: 4px solid ${p => p.$color};
    text-align: center;
`;

const PLLabel = styled.div`
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 4px;
`;

const PLValue = styled.div<{ $value: number }>`
    font-size: 1.3rem;
    font-weight: 700;
    color: ${p => p.$value > 0 ? '#4dff91' : p.$value < 0 ? '#ff4d6d' : '#888'};
`;

const SectionTitle = styled.h2`
    font-size: 1rem;
    font-weight: 600;
    color: #ccc;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const TableWrap = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 24px;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    min-width: 700px;
`;

const Th = styled.th<{ $align?: string }>`
    padding: 10px 14px;
    background: #2a2a3e;
    color: #888;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    text-align: ${p => p.$align ?? 'left'};
    letter-spacing: 0.5px;
    white-space: nowrap;
`;

const Td = styled.td<{ $align?: string }>`
    padding: 10px 14px;
    font-size: 13px;
    color: #ddd;
    text-align: ${p => p.$align ?? 'left'};
    border-bottom: 1px solid #1e1e32;
`;

const PlayerBadge = styled.span<{ $player: 'Guvidul' | 'Catalin' }>`
    display: inline-block;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 4px;
    font-weight: 600;
    ${p => p.$player === 'Guvidul'
        ? 'background: rgba(74,158,255,0.15); border: 1px solid #4a9eff; color: #4a9eff;'
        : 'background: rgba(255,170,0,0.15); border: 1px solid #ffaa00; color: #ffaa00;'
    }
`;

const WinnerBadge = styled.span<{ $winner: string }>`
    display: inline-block;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 4px;
    font-weight: 600;
    ${p => {
        switch (p.$winner) {
            case 'Guvidul': return 'background: rgba(74,158,255,0.15); border: 1px solid #4a9eff; color: #4a9eff;';
            case 'Catalin': return 'background: rgba(255,170,0,0.15); border: 1px solid #ffaa00; color: #ffaa00;';
            case 'Draw': return 'background: rgba(136,136,136,0.15); border: 1px solid #888; color: #888;';
            default: return 'background: rgba(77,255,145,0.1); border: 1px solid #333; color: #666;';
        }
    }}
`;

const StatusBadge = styled.span<{ $status: string }>`
    display: inline-block;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    ${p => {
        switch (p.$status) {
            case 'open': return 'background: rgba(74,158,255,0.15); border: 1px solid #4a9eff; color: #4a9eff;';
            case 'won': return 'background: rgba(77,255,145,0.15); border: 1px solid #4dff91; color: #4dff91;';
            case 'lost': return 'background: rgba(255,77,109,0.15); border: 1px solid #ff4d6d; color: #ff4d6d;';
            case 'draw': return 'background: rgba(136,136,136,0.15); border: 1px solid #888; color: #888;';
            default: return 'background: #2a2a3e; color: #888;';
        }
    }}
`;

const TdPL = styled.td<{ $value: number | null; $align?: string }>`
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 600;
    text-align: ${p => p.$align ?? 'right'};
    border-bottom: 1px solid #1e1e32;
    color: ${p => p.$value === null ? '#666' : p.$value > 0 ? '#4dff91' : p.$value < 0 ? '#ff4d6d' : '#888'};
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 48px 20px;
    background: #1a1a2e;
    border-radius: 8px;
    border: 1px dashed #2a2a3e;
`;

const EmptyIcon = styled.div`
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.6;
`;

const EmptyText = styled.div`
    color: #888;
    font-size: 0.9rem;
    margin-bottom: 4px;
`;

const EmptySubtext = styled.div`
    color: #555;
    font-size: 0.8rem;
`;

const RulesCard = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4a9eff;
`;

const RulesTitle = styled.h3`
    font-size: 0.9rem;
    font-weight: 600;
    color: #4a9eff;
    margin: 0 0 12px 0;
`;

const RulesList = styled.ul`
    margin: 0;
    padding-left: 20px;
    list-style: none;
`;

const RuleItem = styled.li`
    color: #aaa;
    font-size: 0.82rem;
    line-height: 1.7;
    position: relative;
    padding-left: 4px;

    &::before {
        content: '>';
        position: absolute;
        left: -16px;
        color: #4a9eff;
        font-weight: 700;
    }
`;

/* ─── Sugestia Guvidului ──────────────────────── */

import { StrategyProfileType, STRATEGY_PROFILES } from '../../models/strategy-profile';

const SuggestionSection = styled.div`
    margin-bottom: 24px;
`;

const TickerTabBar = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
`;

const TickerTab = styled.button<{ $active: boolean }>`
    padding: 8px 24px;
    border-radius: 6px;
    border: 1.5px solid ${p => p.$active ? '#4a9eff' : '#2a2a3e'};
    background: ${p => p.$active ? 'rgba(74, 158, 255, 0.15)' : '#1a1a2e'};
    color: ${p => p.$active ? '#4a9eff' : '#888'};
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { border-color: #4a9eff; color: #4a9eff; }
`;

const StrategyBlock = styled.div<{ $color: string }>`
    margin-bottom: 20px;
    border-left: 3px solid ${p => p.$color};
    padding-left: 16px;
`;

const StrategyBlockHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
`;

const StrategyBadge = styled.span<{ $color: string }>`
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 4px;
    background: ${p => p.$color}22;
    border: 1px solid ${p => p.$color};
    color: ${p => p.$color};
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const ExitLabel = styled.span`
    font-size: 11px;
    color: #666;
`;

const SuggestionGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 10px;
    @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const SuggestionCard = styled.div<{ $color: string; $isFirst: boolean }>`
    background: #1a1a2e;
    border-radius: 8px;
    padding: 14px;
    border-left: 4px solid ${p => p.$isFirst ? p.$color : '#3a3a5e'};
    position: relative;
    ${p => p.$isFirst ? `box-shadow: 0 0 15px ${p.$color}22;` : ''}
`;

const SuggestionExpDate = styled.div`
    font-size: 0.72rem;
    color: #888;
    margin-bottom: 4px;
`;

const SuggestionIC = styled.div`
    font-size: 0.9rem;
    font-weight: 700;
    color: #ddd;
    margin-bottom: 8px;
    font-family: monospace;
`;

const SuggestionMetrics = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
`;

const SuggestionMetric = styled.div`
    text-align: center;
`;

const SuggestionMetricValue = styled.div<{ $color?: string }>`
    font-size: 0.82rem;
    font-weight: 700;
    color: ${p => p.$color || '#ccc'};
`;

const SuggestionMetricLabel = styled.div`
    font-size: 0.58rem;
    color: #666;
    text-transform: uppercase;
`;

const BestBadge = styled.span<{ $color: string }>`
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    background: ${p => p.$color}33;
    color: ${p => p.$color};
    letter-spacing: 0.5px;
`;

const EmptyProfileState = styled.div`
    color: #555;
    font-size: 0.8rem;
    padding: 12px 0;
`;

interface ISuggestion {
    expDate: string;
    dte: number;
    label: string;
    ic: string;
    pop: number;
    ev: number;
    alpha: number;
    credit: number;
    rr: number;
    delta: string;
    score: number;
    wings: number;
}

type TickerSuggestions = Record<StrategyProfileType, ISuggestion[]>;

const GUVID_SUGGESTIONS: Record<string, TickerSuggestions> = {
    SPX: {
        conservative: [
            { expDate: '2026-05-15', dte: 35, label: 'Weekly', ic: '6370/6380p 7140/7150c', pop: 86, ev: 125, alpha: 17.01, credit: 265, rr: 3.77, delta: '15/15', score: 63.20, wings: 10 },
            { expDate: '2026-05-15', dte: 35, label: 'Regular [AM]', ic: '6375/6385p 7130/7140c', pop: 86, ev: 125, alpha: 17.01, credit: 265, rr: 3.77, delta: '15/15', score: 63.20, wings: 10 },
        ],
        neutral: [
            { expDate: '2026-04-30', dte: 20, label: 'End-Of-Month', ic: '6465/6475p 7065/7075c', pop: 87, ev: 120, alpha: 16, credit: 250, rr: 4, delta: '14/14', score: 56.20, wings: 10 },
            { expDate: '2026-05-15', dte: 35, label: 'Weekly', ic: '6370/6380p 7140/7150c', pop: 86, ev: 125, alpha: 17.01, credit: 265, rr: 3.77, delta: '15/15', score: 55.60, wings: 10 },
            { expDate: '2026-05-15', dte: 35, label: 'Regular [AM]', ic: '6375/6385p 7140/7150c', pop: 86, ev: 110, alpha: 14.67, credit: 250, rr: 4, delta: '15/14', score: 55.60, wings: 10 },
            { expDate: '2026-05-01', dte: 21, label: 'Weekly', ic: '6495/6505p 7080/7090c', pop: 85, ev: 110, alpha: 14.86, credit: 260, rr: 3.85, delta: '16/14', score: 55.00, wings: 10 },
            { expDate: '2026-04-29', dte: 19, label: 'Weekly', ic: '6630/6640p 6990/7000c', pop: 77, ev: 210, alpha: 37.5, credit: 440, rr: 2.27, delta: '24/24', score: 50.20, wings: 10 },
        ],
        aggressive: [
            { expDate: '2026-04-30', dte: 20, label: 'End-Of-Month', ic: '6545/6550p 7035/7040c', pop: 83, ev: 85, alpha: 25.76, credit: 170, rr: 2.94, delta: '18/18', score: 27.65, wings: 5 },
            { expDate: '2026-05-01', dte: 21, label: 'Weekly', ic: '6595/6600p 7025/7030c', pop: 79, ev: 100, alpha: 33.9, credit: 205, rr: 2.44, delta: '22/21', score: 27.25, wings: 5 },
        ],
    },
    QQQ: {
        conservative: [],
        neutral: [
            { expDate: '2026-05-15', dte: 35, label: 'Regular [PM]', ic: '565/575p 645/655c', pop: 81, ev: 71, alpha: 9.61, credit: 261, rr: 3.83, delta: '20/16', score: 51.82, wings: 10 },
        ],
        aggressive: [],
    },
};

/* ─── Helpers ─────────────────────────────────── */

const fmtCur = (v: number | null): string => {
    if (v === null) return '—';
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

/* ─── Round Data ──────────────────────────────── */

const INITIAL_ROUNDS: IRound[] = [
    {
        round: 1,
        date: '2026-04-10',
        guvidTrade: {
            id: 1,
            date: '2026-04-10',
            player: 'Guvidul',
            ticker: 'SPX',
            strategy: 'IC 6365/6375p 7140/7150c (05-15 Weekly)',
            entry: 2.55,
            exit: null,
            pl: null,
            status: 'open',
            notes: 'POP 86% | EV $115 | Alpha 15.44% | R/R 3.92 | Delta 15/14'
        },
        catalinTrade: {
            id: 2,
            date: '2026-04-10',
            player: 'Catalin',
            ticker: 'SPX',
            strategy: 'IC 6375/6385p 7140/7150c (05-15 Weekly)',
            entry: 2.55,
            exit: null,
            pl: null,
            status: 'open',
            notes: 'POP 85% | EV $105 | Alpha 14.09% | R/R 3.92 | Delta -0.51'
        },
        winner: 'Pending'
    }
];

/* ─── Component ───────────────────────────────── */

export const GuvidVsCatalinComponent: React.FC = () => {
    const [rounds, setRounds] = useState<IRound[]>(INITIAL_ROUNDS);
    const [firestoreRounds, setFirestoreRounds] = useState<ICompetitionRound[]>([]);
    const [selectedTicker, setSelectedTicker] = useState<'SPX' | 'QQQ'>('SPX');
    const userEmail = auth.currentUser?.email || 'User';
    const userName = userEmail.split('@')[0];

    useEffect(() => {
        getCompetitionRounds().then(setFirestoreRounds).catch(() => {});
    }, []);

    // Merge hardcoded rounds with Firestore rounds
    const allRounds = useMemo(() => {
        const fromFirestore: IRound[] = firestoreRounds.map(fr => ({
            round: fr.round + INITIAL_ROUNDS.length,
            date: fr.date,
            guvidTrade: {
                id: fr.round * 10,
                date: fr.date,
                player: 'Guvidul' as const,
                ticker: fr.guvidTrade.ticker,
                strategy: fr.guvidTrade.strategy,
                entry: fr.guvidTrade.credit,
                exit: fr.guvidTrade.exitPl !== null ? fr.guvidTrade.exitPl : null,
                pl: fr.guvidTrade.exitPl,
                status: fr.guvidTrade.status,
                notes: `POP ${fr.guvidTrade.pop}% | EV $${fr.guvidTrade.ev} | Alpha ${fr.guvidTrade.alpha}% | R/R ${fr.guvidTrade.rr}`
            },
            catalinTrade: {
                id: fr.round * 10 + 1,
                date: fr.date,
                player: 'Catalin' as const,
                ticker: fr.userTrade.ticker,
                strategy: fr.userTrade.strategy,
                entry: fr.userTrade.credit,
                exit: fr.userTrade.exitPl !== null ? fr.userTrade.exitPl : null,
                pl: fr.userTrade.exitPl,
                status: fr.userTrade.status,
                notes: `POP ${fr.userTrade.pop}% | EV $${fr.userTrade.ev} | Alpha ${fr.userTrade.alpha}% | R/R ${fr.userTrade.rr}`
            },
            winner: fr.winner === 'User' ? 'Catalin' as const : fr.winner as any
        }));
        return [...INITIAL_ROUNDS, ...fromFirestore];
    }, [firestoreRounds]);

    const scores = useMemo(() => {
        let guvid = 0;
        let catalin = 0;
        let draws = 0;
        let guvidPL = 0;
        let catalinPL = 0;

        for (const r of allRounds) {
            if (r.winner === 'Guvidul') guvid++;
            else if (r.winner === 'Catalin') catalin++;
            else if (r.winner === 'Draw') draws++;

            if (r.guvidTrade.pl !== null) guvidPL += r.guvidTrade.pl;
            if (r.catalinTrade.pl !== null) catalinPL += r.catalinTrade.pl;
        }

        return { guvid, catalin, draws, guvidPL, catalinPL, totalRounds: allRounds.length };
    }, [allRounds]);

    return (
        <Container>
            {/* Hero */}
            <HeroSection>
                <VsTitle>
                    <VsGuvid>Guvidul</VsGuvid>
                    <VsText>vs</VsText>
                    <VsCatalin>{userName}</VsCatalin>
                </VsTitle>
                <Subtitle>Cine alege pozitiile mai bune? Apasa Challenge pe orice IC si Guvidul alege automat cel mai bun IC pe aceeasi expirare.</Subtitle>
            </HeroSection>

            {/* Scoreboard */}
            <ScoreboardGrid>
                <PlayerCard $color="#4a9eff">
                    <PlayerAvatar $color="#4a9eff">
                        <AvatarImg src="/guvid-robot.svg" alt="Guvidul Robot" />
                    </PlayerAvatar>
                    <PlayerName $color="#4a9eff">Guvidul</PlayerName>
                    <PlayerStats>
                        <StatItem>
                            <StatValue $color="#4dff91">{scores.guvid}</StatValue>
                            <StatLabel>Wins</StatLabel>
                        </StatItem>
                        <StatItem>
                            <StatValue $color="#ff4d6d">{scores.totalRounds - scores.guvid - scores.draws}</StatValue>
                            <StatLabel>Losses</StatLabel>
                        </StatItem>
                        <StatItem>
                            <StatValue>{scores.draws}</StatValue>
                            <StatLabel>Draws</StatLabel>
                        </StatItem>
                    </PlayerStats>
                </PlayerCard>

                <VsDivider>
                    <VsBadge>VS</VsBadge>
                </VsDivider>

                <PlayerCard $color="#ffaa00">
                    <PlayerAvatar $color="#ffaa00">{userName.charAt(0).toUpperCase()}</PlayerAvatar>
                    <PlayerName $color="#ffaa00">{userName}</PlayerName>
                    <PlayerStats>
                        <StatItem>
                            <StatValue $color="#4dff91">{scores.catalin}</StatValue>
                            <StatLabel>Wins</StatLabel>
                        </StatItem>
                        <StatItem>
                            <StatValue $color="#ff4d6d">{scores.totalRounds - scores.catalin - scores.draws}</StatValue>
                            <StatLabel>Losses</StatLabel>
                        </StatItem>
                        <StatItem>
                            <StatValue>{scores.draws}</StatValue>
                            <StatLabel>Draws</StatLabel>
                        </StatItem>
                    </PlayerStats>
                </PlayerCard>
            </ScoreboardGrid>

            {/* Total P&L */}
            <PLRow>
                <PLCard $color="#4a9eff">
                    <PLLabel>Guvidul Total P&L</PLLabel>
                    <PLValue $value={scores.guvidPL}>{fmtCur(scores.guvidPL)}</PLValue>
                </PLCard>
                <PLCard $color="#ffaa00">
                    <PLLabel>{userName} Total P&L</PLLabel>
                    <PLValue $value={scores.catalinPL}>{fmtCur(scores.catalinPL)}</PLValue>
                </PLCard>
            </PLRow>

            {/* Sugestia Guvidului */}
            <SuggestionSection>
                <TickerTabBar>
                    <TickerTab $active={selectedTicker === 'SPX'} onClick={() => setSelectedTicker('SPX')}>SPX</TickerTab>
                    <TickerTab $active={selectedTicker === 'QQQ'} onClick={() => setSelectedTicker('QQQ')}>QQQ</TickerTab>
                </TickerTabBar>

                {(['conservative', 'neutral', 'aggressive'] as StrategyProfileType[]).map(profileType => {
                    const profile = STRATEGY_PROFILES[profileType];
                    const suggestions = GUVID_SUGGESTIONS[selectedTicker]?.[profileType] || [];
                    return (
                        <StrategyBlock key={profileType} $color={profile.color}>
                            <StrategyBlockHeader>
                                <StrategyBadge $color={profile.color}>{profile.name}</StrategyBadge>
                                <ExitLabel>Exit: {profile.exitProfitPercent}% profit | Wings ${profile.wings[0]} | Delta {profile.minDelta}-{profile.maxDelta}</ExitLabel>
                            </StrategyBlockHeader>
                            {suggestions.length === 0 ? (
                                <EmptyProfileState>Nu exista IC-uri pentru {profile.name} pe {selectedTicker}</EmptyProfileState>
                            ) : (
                                <SuggestionGrid>
                                    {suggestions.map((s, i) => (
                                        <SuggestionCard key={s.expDate + s.label} $color={profile.color} $isFirst={i === 0}>
                                            {i === 0 && <BestBadge $color={profile.color}>Top Pick</BestBadge>}
                                            <SuggestionExpDate>{s.expDate} ({s.dte}d) — {s.label}</SuggestionExpDate>
                                            <SuggestionIC>{s.ic}</SuggestionIC>
                                            <SuggestionMetrics>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue $color={i === 0 ? profile.color : undefined}>{s.pop}%</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>POP</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue>${s.ev}</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>EV</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue>{s.alpha}%</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>Alpha</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue>${s.credit}</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>Credit</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue>{s.rr}</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>R/R</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                                <SuggestionMetric>
                                                    <SuggestionMetricValue>{s.delta}</SuggestionMetricValue>
                                                    <SuggestionMetricLabel>Delta</SuggestionMetricLabel>
                                                </SuggestionMetric>
                                            </SuggestionMetrics>
                                        </SuggestionCard>
                                    ))}
                                </SuggestionGrid>
                            )}
                        </StrategyBlock>
                    );
                })}
            </SuggestionSection>

            {/* Rounds Table */}
            <SectionTitle>Runde</SectionTitle>
            {allRounds.length === 0 ? (
                <EmptyState>
                    <EmptyIcon>&#9876;</EmptyIcon>
                    <EmptyText>Nicio runda inca</EmptyText>
                    <EmptySubtext>Prima runda incepe cand ambii jucatori aleg o pozitie</EmptySubtext>
                </EmptyState>
            ) : (
                <TableWrap>
                    <Table>
                        <thead>
                            <tr>
                                <Th>#</Th>
                                <Th>Data</Th>
                                <Th>Jucator</Th>
                                <Th>Ticker</Th>
                                <Th>Strategie</Th>
                                <Th $align="right">Entry</Th>
                                <Th $align="right">Exit</Th>
                                <Th $align="right">P&L</Th>
                                <Th $align="center">Status</Th>
                                <Th $align="center">Castigator</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {allRounds.map(r => (
                                <React.Fragment key={r.round}>
                                    <tr>
                                        <Td rowSpan={2}>{r.round}</Td>
                                        <Td rowSpan={2}>{r.date}</Td>
                                        <Td><PlayerBadge $player="Guvidul">Guvidul</PlayerBadge></Td>
                                        <Td>{r.guvidTrade.ticker}</Td>
                                        <Td>{r.guvidTrade.strategy}</Td>
                                        <Td $align="right">{fmtCur(r.guvidTrade.entry)}</Td>
                                        <Td $align="right">{fmtCur(r.guvidTrade.exit)}</Td>
                                        <TdPL $value={r.guvidTrade.pl} $align="right">{fmtCur(r.guvidTrade.pl)}</TdPL>
                                        <Td $align="center"><StatusBadge $status={r.guvidTrade.status}>{r.guvidTrade.status}</StatusBadge></Td>
                                        <Td $align="center" rowSpan={2}><WinnerBadge $winner={r.winner}>{r.winner}</WinnerBadge></Td>
                                    </tr>
                                    <tr>
                                        <Td><PlayerBadge $player="Catalin">Catalin</PlayerBadge></Td>
                                        <Td>{r.catalinTrade.ticker}</Td>
                                        <Td>{r.catalinTrade.strategy}</Td>
                                        <Td $align="right">{fmtCur(r.catalinTrade.entry)}</Td>
                                        <Td $align="right">{fmtCur(r.catalinTrade.exit)}</Td>
                                        <TdPL $value={r.catalinTrade.pl} $align="right">{fmtCur(r.catalinTrade.pl)}</TdPL>
                                        <Td $align="center"><StatusBadge $status={r.catalinTrade.status}>{r.catalinTrade.status}</StatusBadge></Td>
                                    </tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                    </Table>
                </TableWrap>
            )}

            {/* Rules */}
            <RulesCard>
                <RulesTitle>Regulile Competitiei</RulesTitle>
                <RulesList>
                    <RuleItem>Fiecare runda, ambii jucatori aleg cate o pozitie (Iron Condor, Credit Spread, etc.)</RuleItem>
                    <RuleItem>Pozitiile se deschid in acelasi timp pe acelasi underlying sau pe underlyings diferite</RuleItem>
                    <RuleItem>Castigatorul rundei e cel cu P&L mai mare la inchidere</RuleItem>
                    <RuleItem>Draw daca diferenta de P&L e sub $5</RuleItem>
                    <RuleItem>Scorul final: cel cu cele mai multe runde castigate</RuleItem>
                </RulesList>
            </RulesCard>
        </Container>
    );
};

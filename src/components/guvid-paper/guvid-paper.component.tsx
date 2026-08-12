import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
    subscribePaperAccount, subscribePaperTrades, subscribePaperEquity,
} from '../../services/guvid-paper/guvid-paper.service';
import type {
    IPaperAccount, IPaperTrade, IEquityPoint,
} from '../../services/guvid-paper/guvid-paper.service.interface';
import { formatUsd as fmt } from '../../utils/format';

/* ─── layout ─────────────────────────────────────────────── */
const PageBox = styled.div`
    padding: 16px;
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #0d1117;
    min-height: 100%;

    @media (max-width: 480px) {
        padding: 10px;
        gap: 12px;
    }
`;

const HeroCard = styled.div`
    background: linear-gradient(135deg, #131a2e 0%, #0f1424 100%);
    border: 1px solid #26304d;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
`;

const HeroTitle = styled.h1`
    margin: 0;
    font-size: 1.6rem;
    font-weight: 800;
    color: #f0b90b;
`;

const HeroSubtitle = styled.div`
    color: #8b95ad;
    font-size: 0.85rem;
    margin-top: 6px;
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 20px;
`;

const StatCard = styled.div`
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid #222b45;
    border-radius: 8px;
    padding: 12px;
`;

const StatLabel = styled.div`
    color: #8b95ad;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
`;

const StatValue = styled.div<{ $positive?: boolean; $negative?: boolean }>`
    font-size: 1.25rem;
    font-weight: 700;
    color: ${p => p.$positive ? '#4dff91' : p.$negative ? '#ff4d6d' : '#fff'};
`;

const StatDetail = styled.div`
    color: #667; font-size: 10px; margin-top: 4px;
`;

const SectionCard = styled.div`
    background: #101527;
    border: 1px solid #222b45;
    border-radius: 12px;
    padding: 16px;

    @media (max-width: 480px) {
        padding: 10px;
    }
`;

const SectionTitle = styled.h2`
    margin: 0 0 12px 0;
    font-size: 1rem;
    font-weight: 700;
    color: #e6e9f0;
    display: flex;
    align-items: center;
    gap: 8px;
`;

/* ─── trade cards ────────────────────────────────────────── */
const TradesGrid = styled.div`
    display: grid;
    /* min(100%, 300px): the track can never exceed the container, so cards
       don't overflow on narrow phones (375px minus paddings < 320px) */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 12px;
`;

const TradeCard = styled.div<{ $closed?: boolean; $correct?: boolean | null }>`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid ${p =>
        p.$closed
            ? (p.$correct ? 'rgba(77,255,145,0.35)' : 'rgba(255,77,109,0.35)')
            : '#2a3556'};
    border-radius: 10px;
    padding: 12px 14px;
`;

const TradeHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
`;

const TickerChip = styled.span`
    background: #1d2a4d;
    color: #7fb2ff;
    font-size: 0.7rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.5px;
`;

const StrategyText = styled.div`
    color: #fff;
    font-weight: 700;
    font-size: 0.95rem;
    margin-bottom: 8px;
`;

const TradeRow = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: #8b95ad;
    padding: 2.5px 0;

    span:last-child {
        color: #d8dce8;
        font-weight: 600;
    }
`;

const PlValue = styled.span<{ $v: number | null }>`
    color: ${p => p.$v === null ? '#888' : p.$v >= 0 ? '#4dff91' : '#ff4d6d'} !important;
`;

const CorrectBadge = styled.span<{ $correct: boolean }>`
    background: ${p => p.$correct ? 'rgba(77,255,145,0.15)' : 'rgba(255,77,109,0.15)'};
    color: ${p => p.$correct ? '#4dff91' : '#ff4d6d'};
    border: 1px solid ${p => p.$correct ? 'rgba(77,255,145,0.4)' : 'rgba(255,77,109,0.4)'};
    font-size: 0.65rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
`;

const OpenBadge = styled.span`
    background: rgba(240,185,11,0.12);
    color: #f0b90b;
    border: 1px solid rgba(240,185,11,0.35);
    font-size: 0.65rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
`;

const RationaleToggle = styled.button`
    background: none;
    border: none;
    color: #5b7fd4;
    font-size: 0.72rem;
    cursor: pointer;
    padding: 6px 0 0 0;
    text-align: left;
`;

const RationaleBox = styled.div`
    margin-top: 8px;
    padding: 10px;
    background: rgba(91, 127, 212, 0.06);
    border-left: 2px solid #5b7fd4;
    border-radius: 4px;
    color: #a8b2c8;
    font-size: 0.75rem;
    line-height: 1.5;
    white-space: pre-wrap;
`;

const EmptyBox = styled.div`
    color: #667;
    text-align: center;
    padding: 32px 16px;
    font-size: 0.85rem;
    line-height: 1.6;
`;

const CLOSED_BY_LABEL: Record<string, string> = {
    target: '50% target',
    stop: '2× stop',
    dte: '14 DTE exit',
    stress: 'stress rule',
    kill: 'kill switch',
    user: 'manual',
};

/* ─── trade card ─────────────────────────────────────────── */
const PaperTradeCard: React.FC<{ trade: IPaperTrade }> = ({ trade }) => {
    const [showRationale, setShowRationale] = useState(false);
    const isClosed = trade.status === 'closed';
    // Calendar days in the ET trading calendar — DST-safe (a hardcoded -05:00
    // offset drifts one day during EDT and disagrees with the backend's rule)
    const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dte = Math.max(0, Math.round((Date.parse(trade.expiration) - Date.parse(todayEt)) / 86_400_000));

    return (
        <TradeCard $closed={isClosed} $correct={trade.correct}>
            <TradeHeader>
                <TickerChip>{trade.ticker}</TickerChip>
                {isClosed
                    ? <CorrectBadge $correct={!!trade.correct}>{trade.correct ? '✓ Correct' : '✗ Wrong'}</CorrectBadge>
                    : <OpenBadge>Open</OpenBadge>}
            </TradeHeader>
            <StrategyText>{trade.strategy} ×{trade.quantity}</StrategyText>
            <TradeRow><span>Opened</span><span>{trade.openDate} ({trade.dteAtEntry} DTE)</span></TradeRow>
            <TradeRow><span>Expiration</span><span>{trade.expiration}{!isClosed ? ` (${dte} DTE)` : ''}</span></TradeRow>
            {trade.structure && (
                <TradeRow>
                    <span>Structure</span>
                    <span>
                        {trade.structure}
                        {trade.putWing !== undefined && trade.callWing !== undefined ? ` ($${trade.putWing}p/$${trade.callWing}c)` : ''}
                        {trade.skewPts !== undefined && trade.skewPts !== null ? ` • skew ${trade.skewPts >= 0 ? '+' : ''}${trade.skewPts.toFixed(1)}pts` : ''}
                    </span>
                </TradeRow>
            )}
            <TradeRow><span>Credit</span><span>${trade.credit.toFixed(2)}</span></TradeRow>
            <TradeRow><span>Max profit / loss</span><span>{fmt(trade.maxProfit)} / {fmt(trade.maxLoss)}</span></TradeRow>
            <TradeRow><span>POP</span><span>{trade.pop.toFixed(1)}%</span></TradeRow>
            {isClosed ? (
                <>
                    <TradeRow><span>Closed</span><span>{trade.exitDate} ({CLOSED_BY_LABEL[trade.closedBy ?? 'user'] ?? trade.closedBy})</span></TradeRow>
                    <TradeRow><span>P&L</span><PlValue $v={trade.exitPl}>{trade.exitPl !== null ? fmt(trade.exitPl) : '—'}</PlValue></TradeRow>
                </>
            ) : (
                <>
                    <TradeRow><span>Profit captured</span><span>{trade.profitPct !== null ? `${trade.profitPct.toFixed(1)}%` : '—'}</span></TradeRow>
                    <TradeRow><span>Unrealized P&L</span><PlValue $v={trade.unrealizedPl}>{trade.unrealizedPl !== null ? fmt(trade.unrealizedPl) : 'awaiting first check'}</PlValue></TradeRow>
                </>
            )}
            {trade.rationale && (
                <>
                    <RationaleToggle onClick={() => setShowRationale(!showRationale)}>
                        {showRationale ? '▾ Hide Guvid\'s reasoning' : '▸ Why Guvid took this trade'}
                    </RationaleToggle>
                    {showRationale && <RationaleBox>{trade.rationale}</RationaleBox>}
                </>
            )}
        </TradeCard>
    );
};

/* ─── main component ─────────────────────────────────────── */
export const GuvidPaperComponent: React.FC = () => {
    const [account, setAccount] = useState<IPaperAccount | null>(null);
    const [trades, setTrades] = useState<IPaperTrade[]>([]);
    const [equity, setEquity] = useState<IEquityPoint[]>([]);

    useEffect(() => {
        const subs = [
            subscribePaperAccount(setAccount),
            subscribePaperTrades(setTrades),
            subscribePaperEquity(setEquity),
        ];
        return () => subs.forEach(u => u());
    }, []);

    const { openTrades, closedTrades, unrealized } = useMemo(() => {
        const open = trades.filter(t => t.status === 'open');
        return {
            openTrades: open,
            closedTrades: trades.filter(t => t.status === 'closed'),
            unrealized: open.reduce((s, t) => s + (t.unrealizedPl ?? 0), 0),
        };
    }, [trades]);
    const startingCapital = account?.startingCapital ?? 0;
    const realizedPl = account?.realizedPl ?? 0;
    const currentEquity = startingCapital + realizedPl + unrealized;
    const totalPl = realizedPl + unrealized;
    const totalPlPct = startingCapital > 0 ? (totalPl / startingCapital) * 100 : 0;
    const winRate = account && account.tradesClosed > 0 ? (account.wins / account.tradesClosed) * 100 : null;

    return (
        <PageBox>
            <HeroCard>
                <HeroTitle>Guvidul — Paper Trading</HeroTitle>
                <HeroSubtitle>
                    Guvidelul ladder book • Virtual account seeded with your net liq
                    {account ? ` (${fmt(startingCapital)} on ${account.createdAt.split('T')[0]})` : ''} •
                    Rungs daily 10:30 ET (IVR≥30, 2σ gate, 21-45 DTE) •
                    Managed 15:00 ET: stop 2× → TP 50% → exit 14 DTE
                </HeroSubtitle>

                <StatsGrid>
                    <StatCard>
                        <StatLabel>Account value</StatLabel>
                        <StatValue>{account ? fmt(currentEquity) : '—'}</StatValue>
                        <StatDetail>start: {account ? fmt(startingCapital) : '—'}</StatDetail>
                    </StatCard>
                    <StatCard>
                        <StatLabel>Total P&L</StatLabel>
                        <StatValue $positive={totalPl > 0} $negative={totalPl < 0}>
                            {account ? `${fmt(totalPl)}` : '—'}
                        </StatValue>
                        <StatDetail>{account ? `${totalPlPct >= 0 ? '+' : ''}${totalPlPct.toFixed(2)}% • realized ${fmt(realizedPl)}` : ''}</StatDetail>
                    </StatCard>
                    <StatCard>
                        <StatLabel>Win rate</StatLabel>
                        <StatValue $positive={winRate !== null && winRate >= 60} $negative={winRate !== null && winRate < 50}>
                            {winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
                        </StatValue>
                        <StatDetail>{account ? `${account.wins}W / ${account.losses}L` : ''}</StatDetail>
                    </StatCard>
                    <StatCard>
                        <StatLabel>Correct positions</StatLabel>
                        <StatValue>{account ? `${account.wins} / ${account.tradesClosed}` : '—'}</StatValue>
                        <StatDetail>closed profitable</StatDetail>
                    </StatCard>
                    <StatCard>
                        <StatLabel>Open positions</StatLabel>
                        <StatValue>{openTrades.length}</StatValue>
                        <StatDetail>unrealized {fmt(unrealized)}</StatDetail>
                    </StatCard>
                </StatsGrid>
            </HeroCard>

            {!account && (
                <SectionCard>
                    <EmptyBox>
                        The virtual account is not initialized yet.<br />
                        It seeds itself automatically with the real account&apos;s net liq
                        at the first scheduled run (weekdays, 10:30 AM ET).
                    </EmptyBox>
                </SectionCard>
            )}

            {equity.length >= 2 && (
                <SectionCard>
                    <SectionTitle>📈 Equity curve</SectionTitle>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={equity} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                            <defs>
                                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#4dff91" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#4dff91" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" stroke="#556" fontSize={10} tickLine={false} />
                            <YAxis stroke="#556" fontSize={10} tickLine={false} domain={['auto', 'auto']}
                                   tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                            <Tooltip
                                contentStyle={{ background: '#131a2e', border: '1px solid #26304d', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#8b95ad' }}
                                formatter={(value) => [fmt(Number(value ?? 0)), 'Equity']}
                            />
                            <ReferenceLine y={startingCapital} stroke="#556" strokeDasharray="4 4" />
                            <Area type="monotone" dataKey="equity" stroke="#4dff91" strokeWidth={2} fill="url(#equityFill)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </SectionCard>
            )}

            <SectionCard>
                <SectionTitle>🟡 Open positions ({openTrades.length})</SectionTitle>
                {openTrades.length === 0 ? (
                    <EmptyBox>
                        No open rungs.<br />
                        Guvidelul lays ladder rungs on QQQ + SPX every weekday at 10:30 AM ET —
                        one IC per expiration in the 21-45 DTE window — when IVR ≥ 30 and
                        the tape is calm (no &gt;2σ moves).
                    </EmptyBox>
                ) : (
                    <TradesGrid>
                        {openTrades.map(t => <PaperTradeCard key={t.id} trade={t} />)}
                    </TradesGrid>
                )}
            </SectionCard>

            <SectionCard>
                <SectionTitle>📋 Closed trades ({closedTrades.length})</SectionTitle>
                {closedTrades.length === 0 ? (
                    <EmptyBox>No closed trades yet.</EmptyBox>
                ) : (
                    <TradesGrid>
                        {closedTrades.map(t => <PaperTradeCard key={t.id} trade={t} />)}
                    </TradesGrid>
                )}
            </SectionCard>
        </PageBox>
    );
};

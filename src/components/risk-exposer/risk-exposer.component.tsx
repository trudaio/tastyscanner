import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorTrade } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';

type SortKey = 'ticker' | 'expirationDate' | 'dte' | 'wingsWidth' | 'maxWin' | 'maxLoss' | 'ratio' | 'quantity';
type SortDir = 'asc' | 'desc';

/* ── Layout ─────────────────────────────────────────────────── */

const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    min-height: 100%;
    @media (max-width: 480px) { padding: 12px; }
`;

const TopBar = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 20px;
`;

const Title = styled.h1`
    color: #fff;
    font-size: 22px;
    margin: 0;
    flex: 1;
`;

const RefreshBtn = styled.button`
    padding: 7px 20px;
    background: #4a9eff;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    &:hover { background: #3a8eef; }
    &:disabled { background: #333; cursor: not-allowed; }
`;

/* ── Summary cards ───────────────────────────────────────────── */

const CardsRow = styled.div`
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const Card = styled.div<{ $color: string }>`
    background: #1a1a2e;
    border-radius: 10px;
    padding: 16px 20px;
    flex: 1;
    min-width: 140px;
    border-left: 4px solid ${p => p.$color};
`;

const CardLabel = styled.div`
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
`;

const CardValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || '#fff'};
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
`;

const CardSub = styled.div`
    color: #555;
    font-size: 11px;
    margin-top: 4px;
`;

/* ── Risk bar ───────────────────────────────────────────────── */

const RiskBarSection = styled.div`
    background: #1a1a2e;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 24px;
`;

const RiskBarTitle = styled.div`
    color: #aaa;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
`;

const BarTrack = styled.div`
    height: 28px;
    background: #0d0d1a;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    position: relative;
`;

const BarWin = styled.div<{ $pct: number }>`
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, #1a7a3a, #4dff91);
    display: flex;
    align-items: center;
    padding-left: 10px;
    font-size: 12px;
    font-weight: 700;
    color: #000;
    white-space: nowrap;
    transition: width 0.5s ease;
    min-width: ${p => p.$pct > 0 ? '40px' : '0'};
`;

const BarLoss = styled.div<{ $pct: number }>`
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, #ff4d6d, #7a1a28);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 10px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    transition: width 0.5s ease;
    min-width: ${p => p.$pct > 0 ? '50px' : '0'};
`;

const BarLabels = styled.div`
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
`;

const BarLabel = styled.span<{ $color: string }>`
    font-size: 12px;
    color: ${p => p.$color};
    font-weight: 600;
`;

const RatioText = styled.div`
    text-align: center;
    margin-top: 12px;
    font-size: 13px;
    color: #888;
`;

/* ── Section ────────────────────────────────────────────────── */

const SectionTitle = styled.h2`
    color: #fff;
    font-size: 16px;
    margin: 28px 0 12px;
    font-weight: 600;
`;

/* ── Pagination ─────────────────────────────────────────────── */

const PAGE_SIZE = 20;

const PaginationRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1a1a2e;
    border-top: 1px solid #2a2a3e;
    border-radius: 0 0 8px 8px;
`;

const PageInfo = styled.span`
    font-size: 12px;
    color: #888;
`;

const PageBtns = styled.div`
    display: flex;
    gap: 6px;
`;

const PageBtn = styled.button<{ $active?: boolean }>`
    padding: 5px 14px;
    background: ${p => p.$active ? '#4a9eff' : '#2a2a3e'};
    border: 1px solid ${p => p.$active ? '#4a9eff' : '#333'};
    border-radius: 6px;
    color: ${p => p.$active ? '#fff' : '#aaa'};
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:disabled { opacity: 0.3; cursor: not-allowed; }
    &:not(:disabled):hover { background: ${p => p.$active ? '#4a9eff' : '#3a3a4e'}; }
`;

/* ── Table ──────────────────────────────────────────────────── */

const TableWrap = styled.div`
    background: #1a1a2e;
    border-radius: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const Th = styled.th<{ $align?: string }>`
    padding: 10px 14px;
    background: #2a2a3e;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 500;
    text-align: ${p => p.$align ?? 'left'};
    white-space: nowrap;
`;

const SortableTh = styled(Th)<{ $active?: boolean }>`
    cursor: pointer;
    user-select: none;
    color: ${p => p.$active ? '#4a9eff' : '#888'};
    &:hover { color: #fff; background: #333350; }
`;

const Td = styled.td<{ $align?: string }>`
    padding: 10px 14px;
    border-bottom: 1px solid #1e1e32;
    color: #fff;
    font-size: 13px;
    text-align: ${p => p.$align ?? 'left'};
`;

const WinTd = styled(Td)`
    color: #4dff91;
    font-weight: 700;
`;

const LossTd = styled(Td)`
    color: #ff4d6d;
    font-weight: 700;
`;

const RatioBadge = styled.span<{ $ratio: number }>`
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: ${p => p.$ratio >= 0.3 ? 'rgba(77,255,145,0.12)' : p.$ratio >= 0.15 ? 'rgba(255,170,0,0.12)' : 'rgba(255,77,109,0.12)'};
    color: ${p => p.$ratio >= 0.3 ? '#4dff91' : p.$ratio >= 0.15 ? '#ffaa00' : '#ff4d6d'};
    border: 1px solid ${p => p.$ratio >= 0.3 ? 'rgba(77,255,145,0.3)' : p.$ratio >= 0.15 ? 'rgba(255,170,0,0.3)' : 'rgba(255,77,109,0.3)'};
`;

const BreakevenCell = styled(Td)`
    font-size: 12px;
    color: #aaa;
`;

const DteBadge = styled.span<{ $dte: number }>`
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: ${p => p.$dte <= 21 ? 'rgba(255,170,0,0.12)' : 'rgba(74,158,255,0.1)'};
    color: ${p => p.$dte <= 21 ? '#ffaa00' : '#4a9eff'};
    border: 1px solid ${p => p.$dte <= 21 ? 'rgba(255,170,0,0.3)' : 'rgba(74,158,255,0.2)'};
`;

const EmptyState = styled.div`
    color: #444;
    text-align: center;
    padding: 48px 24px;
    font-size: 14px;
`;

/* ── Helpers ────────────────────────────────────────────────── */

const fmtCur = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${abs}` : `-$${abs}`;
};

const getDTE = (expirationDate: string): number => {
    const exp = new Date(expirationDate);
    const now = new Date();
    return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
};

interface RiskRow {
    trade: IIronCondorTrade;
    maxWin: number;
    maxLoss: number;
    ratio: number;           // maxWin / (maxWin + maxLoss)
    wingsWidth: number;
    creditPerShare: number;
    lowerBreakeven: number;
    upperBreakeven: number;
    dte: number;
}

const calcRiskRow = (trade: IIronCondorTrade): RiskRow => {
    const putWings = trade.putSellStrike - trade.putBuyStrike;
    const callWings = trade.callBuyStrike - trade.callSellStrike;
    const wingsWidth = Math.max(putWings, callWings);
    const multiplier = 100;
    const qty = trade.quantity || 1;

    const maxWin = trade.openCredit;
    const maxLoss = Math.max(0, wingsWidth * multiplier * qty - trade.openCredit);
    const ratio = (maxWin + maxLoss) > 0 ? maxWin / (maxWin + maxLoss) : 0;

    const creditPerShare = qty > 0 ? trade.openCredit / (multiplier * qty) : 0;
    const lowerBreakeven = trade.putSellStrike - creditPerShare;
    const upperBreakeven = trade.callSellStrike + creditPerShare;

    return {
        trade,
        maxWin,
        maxLoss,
        ratio,
        wingsWidth,
        creditPerShare,
        lowerBreakeven,
        upperBreakeven,
        dte: getDTE(trade.expirationDate),
    };
};

/* ── Component ──────────────────────────────────────────────── */

export const RiskExposerComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;

    const [openTrades, setOpenTrades] = useState<IIronCondorTrade[]>([]);
    const [loading, setLoading] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('dte');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [page, setPage] = useState(1);

    const toggleSort = useCallback((key: SortKey) => {
        setPage(1);
        setSortKey(prev => {
            if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
            setSortDir('asc');
            return key;
        });
    }, []);

    const load = async () => {
        if (!services.brokerAccount.currentAccount) return;
        setLoading(true);
        try {
            const trades = await services.ironCondorAnalytics.fetchOpenICsFromPositions();
            setOpenTrades(trades);
        } catch (e) {
            console.error('[Risk Exposer] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [account]);

    const rows = useMemo(() => {
        const base = openTrades.map(calcRiskRow);
        const mul = sortDir === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (sortKey) {
                case 'ticker':         return a.trade.ticker.localeCompare(b.trade.ticker) * mul;
                case 'expirationDate': return a.trade.expirationDate.localeCompare(b.trade.expirationDate) * mul;
                case 'dte':            return (a.dte - b.dte) * mul;
                case 'wingsWidth':     return (a.wingsWidth - b.wingsWidth) * mul;
                case 'maxWin':         return (a.maxWin - b.maxWin) * mul;
                case 'maxLoss':        return (a.maxLoss - b.maxLoss) * mul;
                case 'ratio':          return (a.ratio - b.ratio) * mul;
                case 'quantity':       return (a.trade.quantity - b.trade.quantity) * mul;
                default:               return 0;
            }
        });
    }, [openTrades, sortKey, sortDir]);

    const totalMaxWin = useMemo(() => rows.reduce((s, r) => s + r.maxWin, 0), [rows]);
    const totalMaxLoss = useMemo(() => rows.reduce((s, r) => s + r.maxLoss, 0), [rows]);
    const netAtRisk = totalMaxLoss - totalMaxWin;
    const totalExposure = totalMaxWin + totalMaxLoss;
    const winPct = totalExposure > 0 ? (totalMaxWin / totalExposure) * 100 : 0;
    const lossPct = totalExposure > 0 ? (totalMaxLoss / totalExposure) * 100 : 0;
    const overallRatio = totalExposure > 0 ? totalMaxWin / totalMaxLoss : 0;

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const sa = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    if (loading && openTrades.length === 0) {
        return (
            <Container>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: '#666' }}>
                    <IonSpinner name="crescent" />
                    <span>Loading open positions...</span>
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <TopBar>
                <Title>Risk Exposer</Title>
                <RefreshBtn onClick={load} disabled={loading}>
                    {loading ? 'Loading...' : '↻ Refresh'}
                </RefreshBtn>
            </TopBar>

            {openTrades.length === 0 && !loading ? (
                <EmptyState>
                    No open IC positions found.<br />
                    Connect your TastyTrade account and open some iron condors.
                </EmptyState>
            ) : (
                <>
                    {/* ── Summary cards ── */}
                    <CardsRow>
                        <Card $color="#4dff91">
                            <CardLabel>Total Max Win</CardLabel>
                            <CardValue $color="#4dff91">{fmtCur(totalMaxWin)}</CardValue>
                            <CardSub>if all ICs expire worthless</CardSub>
                        </Card>
                        <Card $color="#ff4d6d">
                            <CardLabel>Total Max Loss</CardLabel>
                            <CardValue $color="#ff4d6d">{fmtCur(totalMaxLoss)}</CardValue>
                            <CardSub>if all spreads hit max risk</CardSub>
                        </Card>
                        <Card $color={netAtRisk >= 0 ? '#ff4d6d' : '#4dff91'}>
                            <CardLabel>Net at Risk</CardLabel>
                            <CardValue $color={netAtRisk >= 0 ? '#ff4d6d' : '#4dff91'}>
                                {fmtCur(netAtRisk)}
                            </CardValue>
                            <CardSub>max loss − max win</CardSub>
                        </Card>
                        <Card $color="#4a9eff">
                            <CardLabel>Open Positions</CardLabel>
                            <CardValue>{rows.length}</CardValue>
                            <CardSub>iron condors</CardSub>
                        </Card>
                        <Card $color="#a78bfa">
                            <CardLabel>Win/Loss Ratio</CardLabel>
                            <CardValue $color="#a78bfa">
                                {overallRatio > 0 ? overallRatio.toFixed(2) : '—'}
                            </CardValue>
                            <CardSub>win ÷ loss (higher = better)</CardSub>
                        </Card>
                    </CardsRow>

                    {/* ── Risk bar ── */}
                    <RiskBarSection>
                        <RiskBarTitle>Win / Loss exposure breakdown</RiskBarTitle>
                        <BarTrack>
                            <BarWin $pct={winPct}>
                                {winPct > 8 ? `${winPct.toFixed(0)}%` : ''}
                            </BarWin>
                            <BarLoss $pct={lossPct}>
                                {lossPct > 8 ? `${lossPct.toFixed(0)}%` : ''}
                            </BarLoss>
                        </BarTrack>
                        <BarLabels>
                            <BarLabel $color="#4dff91">▲ Max Win {fmtCur(totalMaxWin)}</BarLabel>
                            <BarLabel $color="#ff4d6d">Max Loss {fmtCur(totalMaxLoss)} ▼</BarLabel>
                        </BarLabels>
                        <RatioText>
                            Pentru fiecare $1 de risc, poti castiga ${overallRatio > 0 ? overallRatio.toFixed(2) : '0.00'}
                        </RatioText>
                    </RiskBarSection>

                    {/* ── Per-position table ── */}
                    <SectionTitle>Pozitii deschise — detaliu risc</SectionTitle>
                    <TableWrap>
                        <Table style={{ minWidth: 900 }}>
                            <thead>
                                <tr>
                                    <SortableTh $active={sortKey === 'ticker'} onClick={() => toggleSort('ticker')}>
                                        Ticker{sa('ticker')}
                                    </SortableTh>
                                    <SortableTh $active={sortKey === 'expirationDate'} onClick={() => toggleSort('expirationDate')}>
                                        Expirare{sa('expirationDate')}
                                    </SortableTh>
                                    <SortableTh $align="center" $active={sortKey === 'dte'} onClick={() => toggleSort('dte')}>
                                        DTE{sa('dte')}
                                    </SortableTh>
                                    <Th>Put Spread</Th>
                                    <Th>Call Spread</Th>
                                    <SortableTh $align="center" $active={sortKey === 'quantity'} onClick={() => toggleSort('quantity')}>
                                        Qty{sa('quantity')}
                                    </SortableTh>
                                    <SortableTh $align="right" $active={sortKey === 'wingsWidth'} onClick={() => toggleSort('wingsWidth')}>
                                        Wings{sa('wingsWidth')}
                                    </SortableTh>
                                    <Th $align="right">Credit</Th>
                                    <SortableTh $align="right" $active={sortKey === 'maxWin'} onClick={() => toggleSort('maxWin')}>
                                        Max Win{sa('maxWin')}
                                    </SortableTh>
                                    <SortableTh $align="right" $active={sortKey === 'maxLoss'} onClick={() => toggleSort('maxLoss')}>
                                        Max Loss{sa('maxLoss')}
                                    </SortableTh>
                                    <SortableTh $align="center" $active={sortKey === 'ratio'} onClick={() => toggleSort('ratio')}>
                                        Ratio W/L{sa('ratio')}
                                    </SortableTh>
                                    <Th $align="center">Breakevenuri</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRows.map(row => (
                                    <tr key={row.trade.id}>
                                        <Td><strong>{row.trade.ticker}</strong></Td>
                                        <Td>{row.trade.expirationDate}</Td>
                                        <Td $align="center">
                                            <DteBadge $dte={row.dte}>{row.dte}d</DteBadge>
                                        </Td>
                                        <Td style={{ color: '#a78bfa' }}>
                                            {row.trade.putBuyStrike}/{row.trade.putSellStrike}
                                        </Td>
                                        <Td style={{ color: '#f59e0b' }}>
                                            {row.trade.callSellStrike}/{row.trade.callBuyStrike}
                                        </Td>
                                        <Td $align="center">{row.trade.quantity}</Td>
                                        <Td $align="right">${row.wingsWidth.toFixed(0)}</Td>
                                        <Td $align="right" style={{ color: '#aaa' }}>
                                            {fmtCur(row.creditPerShare)}/share
                                        </Td>
                                        <WinTd $align="right">{fmtCur(row.maxWin)}</WinTd>
                                        <LossTd $align="right">{fmtCur(row.maxLoss)}</LossTd>
                                        <Td $align="center">
                                            <RatioBadge $ratio={row.ratio}>
                                                {(row.ratio * 100).toFixed(0)}%
                                            </RatioBadge>
                                        </Td>
                                        <BreakevenCell $align="center">
                                            ↓{row.lowerBreakeven.toFixed(2)} / ↑{row.upperBreakeven.toFixed(2)}
                                        </BreakevenCell>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        {totalPages > 1 && (
                            <PaginationRow>
                                <PageInfo>
                                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} din {rows.length} pozitii
                                </PageInfo>
                                <PageBtns>
                                    <PageBtn onClick={() => setPage(1)} disabled={page === 1}>«</PageBtn>
                                    <PageBtn onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</PageBtn>
                                    <PageBtn $active>{page} / {totalPages}</PageBtn>
                                    <PageBtn onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next ›</PageBtn>
                                    <PageBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PageBtn>
                                </PageBtns>
                            </PaginationRow>
                        )}
                    </TableWrap>
                </>
            )}
        </Container>
    );
});

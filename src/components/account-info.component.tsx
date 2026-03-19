import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';

/* ─── containers ─────────────────────────────────────────── */
const AccountInfoContainer = styled.div`
    background: var(--app-panel-surface);
    border-radius: 22px;
    padding: 16px;
    margin: 12px;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
`;

const HeaderText = styled.div`
    display: grid;
    gap: 4px;
`;

const Eyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
`;

const HeaderTitle = styled.div`
    color: var(--app-text);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

const HeaderHint = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    line-height: 1.45;
`;

const CompactAction = styled.button`
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--app-border);
    background: var(--app-subtle-surface);
    color: var(--app-text-soft);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;

    &:hover {
        background: var(--app-hover-surface);
        border-color: var(--app-border-strong);
    }
`;

const SectionTitle = styled.div`
    color: var(--app-text);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin: 12px 0 6px 0;
    padding-top: 10px;
    border-top: 1px solid var(--app-border);
    font-weight: 800;
`;

const InfoRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
`;

/* ─── typography ──────────────────────────────────────────── */
const Label = styled.span`
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
`;

const Value = styled.span<{ $positive?: boolean; $negative?: boolean; $highlight?: boolean }>`
    color: ${props => {
        if (props.$positive) return '#4dff91';
        if (props.$negative) return '#ff4d6d';
        if (props.$highlight) return 'var(--ion-color-primary)';
        return 'var(--app-text)';
    }};
    font-size: 13px;
    font-weight: 600;
`;

const NetLiqValue = styled.div`
    color: #4dff91;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    padding: 10px 0 8px 0;
`;

const NetLiqLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 800;
    text-align: center;
    margin-bottom: 2px;
`;

/* ─── greek value with inline badge ──────────────────────── */
const GreekRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
`;

const GreekValue = styled.span<{ $color: string }>`
    color: ${p => p.$color};
`;

const ThetaPct = styled.span`
    color: var(--app-text-muted);
    font-size: 11px;
    font-weight: 400;
`;

const Badge = styled.span<{ $bg: string }>`
    background: ${p => p.$bg};
    color: var(--ion-color-primary-contrast);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
`;

/* ─── position-sizing rule box ────────────────────────────── */
const SizingRuleBox = styled.div`
    background: rgba(244, 162, 97, 0.1);
    border: 1px solid rgba(244, 162, 97, 0.22);
    border-radius: 16px;
    padding: 10px 12px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--app-text-soft);
    line-height: 1.5;
`;

const SizingHighlight = styled.span`
    color: var(--ion-color-tertiary);
    font-weight: 700;
`;

/* ─── Kelly criterion box ────────────────────────────────── */
const KellyBox = styled.div<{ $color: string }>`
    background: var(--app-subtle-surface);
    border: 1px solid rgba(74, 158, 255, 0.2);
    border-radius: 16px;
    padding: 10px 12px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--app-text-soft);
    line-height: 1.6;
`;

const KellyValue = styled.span<{ $color: string }>`
    color: ${p => p.$color};
    font-weight: 700;
    font-size: 14px;
`;

const KellyDetail = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--app-text-muted);
    margin-top: 4px;
`;

const KellyExplainer = styled.div`
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--app-border);
    font-size: 9.5px;
    color: var(--app-text-muted);
    line-height: 1.5;
`;

const KellyBullet = styled.div`
    margin: 3px 0;
    padding-left: 8px;
    position: relative;
    &::before {
        content: '•';
        position: absolute;
        left: 0;
        color: var(--app-text-muted);
    }
`;

const LoadingText = styled.div`
    color: var(--app-text-muted);
    font-size: 12px;
    text-align: center;
    padding: 10px 4px;
`;

/* ─── helpers ─────────────────────────────────────────────── */
const getDeltaColor = (delta: number): string => {
    if (delta > 50)  return '#4dff91';
    if (delta < -50) return '#ff4d6d';
    if (delta > 0)   return 'rgba(77,255,145,0.6)';
    return 'rgba(255,77,109,0.6)';
};

const getThetaState = (thetaPct: number): { color: string; badge: string | null } => {
    if (thetaPct >= 0.2 && thetaPct <= 0.4) return { color: '#4dff91', badge: null };
    if (thetaPct > 0.4)  return { color: '#ff4d6d', badge: 'OVER-EXPOSED' };
    return { color: '#ff4d6d', badge: 'UNDER-DEPLOYED' };
};


/* ─── Component ───────────────────────────────────────────── */
export const AccountInfoComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;
    const [kellyData, setKellyData] = useState<{
        kelly: number; halfKelly: number; winRate: number; wlRatio: number; maxBet: number;
    } | null>(null);

    useEffect(() => {
        if (account && !account.portfolioGreeks && !account.isLoadingPortfolioGreeks) {
            account.loadPortfolioGreeks();
        }
    }, [account]);

    // Load Kelly data from IC analytics
    useEffect(() => {
        let cancelled = false;
        services.ironCondorAnalytics.getSummary().then(summary => {
            if (cancelled) return;
            const ytd = summary.yearToDate;
            if (ytd.closedTrades === 0 || ytd.profitableTrades === 0 || ytd.losingTrades === 0) return;
            const W = ytd.winRate / 100;
            const avgWin = ytd.totalWins / ytd.profitableTrades;
            const avgLoss = Math.abs(ytd.totalLosses) / ytd.losingTrades;
            if (avgLoss === 0) return;
            const R = avgWin / avgLoss;
            const kelly = W - (1 - W) / R;
            const halfKelly = kelly * 0.5;
            const netLiq = account?.balances?.netLiquidity ?? 0;
            setKellyData({
                kelly: kelly * 100,
                halfKelly: halfKelly * 100,
                winRate: ytd.winRate,
                wlRatio: R,
                maxBet: netLiq > 0 ? netLiq * Math.max(0, halfKelly) : 0,
            });
        }).catch(() => { /* silently ignore if analytics not available */ });
        return () => { cancelled = true; };
    }, [services.ironCondorAnalytics, account]);

    const fmt = (v: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

    if (!account) return null;

    if (account.isLoadingBalances) {
        return <AccountInfoContainer><LoadingText>Se incarca snapshot-ul contului...</LoadingText></AccountInfoContainer>;
    }

    if (!account.balances) return null;

    const balances = account.balances;
    const netLiq  = balances.netLiquidity;
    const maxBP   = netLiq * 0.05;

    const pg         = account.portfolioGreeks;
    const delta      = pg?.delta ?? null;
    const theta      = pg?.theta ?? null;
    const gamma      = pg?.gamma ?? null;
    const vega       = pg?.vega  ?? null;
    const thetaPct   = (theta !== null && netLiq > 0) ? Math.abs(theta) / netLiq * 100 : null;
    const thetaState = thetaPct !== null ? getThetaState(thetaPct) : null;

    return (
        <AccountInfoContainer>
            <HeaderRow>
                <HeaderText>
                    <Eyebrow>Account Snapshot</Eyebrow>
                    <HeaderTitle>Cont activ si risc curent</HeaderTitle>
                    <HeaderHint>Balante, greeks si sizing rule, direct in sidebar.</HeaderHint>
                </HeaderText>
                {pg ? (
                    <CompactAction type="button" onClick={() => account.loadPortfolioGreeks()}>
                        Refresh greeks
                    </CompactAction>
                ) : null}
            </HeaderRow>

            {/* ── Balances ───────────────────────────── */}
            <NetLiqLabel>Net Liquidity</NetLiqLabel>
            <NetLiqValue>{fmt(netLiq)}</NetLiqValue>

            <InfoRow>
                <Label>Option BP</Label>
                <Value $highlight>{fmt(balances.optionBuyingPower)}</Value>
            </InfoRow>
            <InfoRow>
                <Label>Stock BP</Label>
                <Value>{fmt(balances.stockBuyingPower)}</Value>
            </InfoRow>
            <InfoRow>
                <Label>Cash</Label>
                <Value $positive={balances.cashBalance >= 0} $negative={balances.cashBalance < 0}>
                    {fmt(balances.cashBalance)}
                </Value>
            </InfoRow>
            <InfoRow>
                <Label>Maintenance</Label>
                <Value>{fmt(balances.maintenanceRequirement)}</Value>
            </InfoRow>

            {/* ── Portfolio Greeks ───────────────────── */}
            <SectionTitle>Portfolio Greeks</SectionTitle>

            {account.isLoadingPortfolioGreeks ? (
                <LoadingText>Loading greeks…</LoadingText>
            ) : pg ? (
                <>
                    {/* DELTA */}
                    <InfoRow>
                        <Label>Delta (Δ)</Label>
                        <GreekRow>
                            <GreekValue $color={getDeltaColor(delta!)}>
                                {delta! > 0 ? '+' : ''}{delta!.toFixed(2)}
                            </GreekValue>
                        </GreekRow>
                    </InfoRow>

                    {/* THETA */}
                    <InfoRow>
                        <Label>Theta (Θ)</Label>
                        <GreekRow>
                            <GreekValue $color={thetaState?.color ?? 'var(--app-text)'}>
                                {theta!.toFixed(2)}
                            </GreekValue>
                            {thetaPct !== null && (
                                <ThetaPct>({thetaPct.toFixed(2)}%)</ThetaPct>
                            )}
                            {thetaState?.badge && (
                                <Badge $bg={thetaState.color}>{thetaState.badge}</Badge>
                            )}
                        </GreekRow>
                    </InfoRow>

                    {/* GAMMA */}
                    <InfoRow>
                        <Label>Gamma (Γ)</Label>
                        <GreekRow>
                            <GreekValue $color={gamma! < 0 ? '#4dff91' : '#ff4d6d'}>
                                {gamma! > 0 ? '+' : ''}{gamma!.toFixed(4)}
                            </GreekValue>
                        </GreekRow>
                    </InfoRow>

                    {/* VEGA */}
                    <InfoRow>
                        <Label>Vega (V)</Label>
                        <GreekRow>
                            <GreekValue $color={vega! < 0 ? '#4dff91' : '#ff4d6d'}>
                                {vega! > 0 ? '+' : ''}{vega!.toFixed(2)}
                            </GreekValue>
                        </GreekRow>
                    </InfoRow>
                </>
            ) : (
                <CompactAction type="button" onClick={() => account.loadPortfolioGreeks()}>
                    Load greeks
                </CompactAction>
            )}

            {/* ── Position Sizing Rule ───────────────── */}
            <SizingRuleBox>
                Don't make a trade with buying power effect higher than{' '}
                <SizingHighlight>{fmt(maxBP)}</SizingHighlight>
                {' '}(5% of net liq)
            </SizingRuleBox>

            {/* ── Fractional Kelly ─────────────────────── */}
            {kellyData && (
                <KellyBox $color={kellyData.halfKelly > 0 ? '#4dff91' : '#ff4d6d'}>
                    <div style={{ textAlign: 'center', marginBottom: 4 }}>
                        <span style={{ color: 'var(--app-text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Fractional Kelly (½K)
                        </span>
                    </div>
                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                        <KellyValue $color={kellyData.halfKelly > 0 ? '#4dff91' : '#ff4d6d'}>
                            {kellyData.halfKelly.toFixed(1)}%
                        </KellyValue>
                        <span style={{ color: 'var(--app-text-muted)', fontSize: 10, marginLeft: 6 }}>
                            (Full: {kellyData.kelly.toFixed(1)}%)
                        </span>
                    </div>
                    {kellyData.maxBet > 0 && (
                        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--app-text-soft)', marginBottom: 4 }}>
                            Max bet: <span style={{ color: '#4a9eff', fontWeight: 600 }}>{fmt(kellyData.maxBet)}</span>
                        </div>
                    )}
                    <KellyDetail>
                        <span>Win Rate: {kellyData.winRate.toFixed(1)}%</span>
                        <span>W/L Ratio: {kellyData.wlRatio.toFixed(2)}</span>
                    </KellyDetail>
                    <KellyExplainer>
                        <KellyBullet>
                            <strong style={{ color: 'var(--app-text-soft)' }}>½K %</strong> = % din cont alocat per trade (half-Kelly, mai conservator)
                        </KellyBullet>
                        <KellyBullet>
                            <strong style={{ color: 'var(--app-text-soft)' }}>Max bet</strong> = net liq × ½K%. Nu depasi aceasta suma ca BPE per trade
                        </KellyBullet>
                        <KellyBullet>
                            <strong style={{ color: 'var(--app-text-soft)' }}>W/L Ratio</strong> = avg win / avg loss. Sub 1.0 = pierzi mai mult decat castigi per trade, compensat de win rate mare
                        </KellyBullet>
                        <KellyBullet>
                            {kellyData.halfKelly > 20
                                ? <span style={{ color: '#ffaa00' }}>½K {'>'} 20% — edge foarte mare, dar respecta regula 5% max BPE</span>
                                : kellyData.halfKelly > 10
                                ? <span style={{ color: '#4dff91' }}>½K 10-20% — edge solid, poti folosi 5% BPE cu incredere</span>
                                : kellyData.halfKelly > 0
                                ? <span style={{ color: 'var(--app-text-soft)' }}>½K {'<'} 10% — edge modest, size mai mic recomandat</span>
                                : <span style={{ color: '#ff4d6d' }}>½K negativ — nu exista edge, nu tranzactiona</span>
                            }
                        </KellyBullet>
                    </KellyExplainer>
                </KellyBox>
            )}

        </AccountInfoContainer>
    );
});

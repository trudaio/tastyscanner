import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import { BrokerType } from '../services/broker-provider/broker-provider.interface';
import type { IBrokerAccount } from '../services/credentials/broker-credentials.service.interface';
import type { ITastyTradeCredentials } from '../services/broker-provider/broker-provider.interface';

/* ─── containers ─────────────────────────────────────────── */
const AccountInfoContainer = styled.div`
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 8px;
    padding: 12px;
    margin: 12px;
    border: 1px solid #333;
`;

const SectionTitle = styled.div`
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 12px 0 6px 0;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,0.08);
`;

const InfoRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    &:last-child { border-bottom: none; }
`;

/* ─── typography ──────────────────────────────────────────── */
const Label = styled.span`
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
`;

const Value = styled.span<{ $positive?: boolean; $negative?: boolean; $highlight?: boolean }>`
    color: ${props => {
        if (props.$positive) return '#4dff91';
        if (props.$negative) return '#ff4d6d';
        if (props.$highlight) return '#ff6b35';
        return '#fff';
    }};
    font-size: 13px;
    font-weight: 600;
`;

const NetLiqValue = styled.div`
    color: #4dff91;
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    padding: 8px 0 6px 0;
`;

const NetLiqLabel = styled.div`
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
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
    color: #aaa;
    font-size: 11px;
    font-weight: 400;
`;

const Badge = styled.span<{ $bg: string }>`
    background: ${p => p.$bg};
    color: #000;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
`;

/* ─── position-sizing rule box ────────────────────────────── */
const SizingRuleBox = styled.div`
    background: rgba(255, 107, 53, 0.1);
    border: 1px solid rgba(255, 107, 53, 0.3);
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 10px;
    font-size: 11px;
    color: #ccc;
    line-height: 1.5;
`;

const SizingHighlight = styled.span`
    color: #ff6b35;
    font-weight: 700;
`;

/* ─── Kelly criterion box ────────────────────────────────── */
const KellyBox = styled.div<{ $color: string }>`
    background: rgba(74, 158, 255, 0.08);
    border: 1px solid rgba(74, 158, 255, 0.25);
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 10px;
    font-size: 11px;
    color: #ccc;
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
    color: #777;
    margin-top: 2px;
`;

const KellyExplainer = styled.div`
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 9.5px;
    color: #666;
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
        color: #555;
    }
`;

const LoadingText = styled.div`
    color: #666;
    font-size: 12px;
    text-align: center;
    padding: 8px;
`;

/* ── Broker switcher ──────────────────────────────────────────── */
const BrokerSwitcherRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
`;

const BrokerBadge = styled.span<{ $broker: BrokerType }>`
    display: inline-flex;
    align-items: center;
    background: ${p => p.$broker === BrokerType.TastyTrade ? '#ff6b35' : '#dc3545'};
    color: #fff;
    font-size: 0.55rem;
    font-weight: 800;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
`;

const BrokerSelect = styled.select`
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    color: #ccc;
    font-size: 11px;
    padding: 4px 6px;
    flex: 1;
    cursor: pointer;
    outline: none;
    &:hover { border-color: rgba(255,255,255,0.25); }
    option { background: #1a1a2e; color: #ccc; }
`;

const RefreshBtn = styled.button`
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 10px;
    cursor: pointer;
    padding: 3px 8px;
    margin-top: 4px;
    width: 100%;
    &:hover { border-color: #555; color: #ccc; }
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

    // ── Broker switcher ─────────────────────────────────────────
    const [brokerAccounts, setBrokerAccounts] = useState<IBrokerAccount[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    const loadBrokerAccounts = useCallback(async () => {
        try {
            const list = await services.brokerCredentials.listBrokerAccounts();
            setBrokerAccounts(list);
            const active = list.find(a => a.isActive);
            if (active) setActiveAccountId(active.id);
        } catch { /* ignore */ }
    }, [services.brokerCredentials]);

    useEffect(() => { void loadBrokerAccounts(); }, [loadBrokerAccounts]);

    const handleSwitchBroker = async (id: string) => {
        if (id === activeAccountId) return;
        try {
            await services.brokerCredentials.setActiveBrokerAccount(id);
            const selected = brokerAccounts.find(a => a.id === id);
            if (selected?.brokerType === BrokerType.TastyTrade) {
                const creds = selected.credentials as ITastyTradeCredentials;
                services.initialize(creds.clientSecret, creds.refreshToken);
            }
            setActiveAccountId(id);
        } catch { /* ignore */ }
    };

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
        return <AccountInfoContainer><LoadingText>Loading account info…</LoadingText></AccountInfoContainer>;
    }

    if (!account.balances) return null;

    const balances = account.balances;
    const netLiq  = balances.netLiquidity;
    const maxBP   = netLiq * 0.05;

    const pg         = account.portfolioGreeks;
    const delta      = pg?.delta ?? null;
    const betaDelta  = pg?.betaWeightedDelta ?? null;
    const theta      = pg?.theta ?? null;
    const gamma      = pg?.gamma ?? null;
    const vega       = pg?.vega  ?? null;
    const thetaPct   = (theta !== null && netLiq > 0) ? Math.abs(theta) / netLiq * 100 : null;
    const thetaState = thetaPct !== null ? getThetaState(thetaPct) : null;

    const activeBrokerAccount = brokerAccounts.find(a => a.id === activeAccountId);

    return (
        <AccountInfoContainer>

            {/* ── Broker switcher ────────────────────── */}
            {brokerAccounts.length > 0 && (
                <BrokerSwitcherRow>
                    {activeBrokerAccount && (
                        <BrokerBadge $broker={activeBrokerAccount.brokerType}>
                            {activeBrokerAccount.brokerType === BrokerType.TastyTrade ? 'TT' : 'IB'}
                        </BrokerBadge>
                    )}
                    <BrokerSelect
                        value={activeAccountId ?? ''}
                        onChange={e => void handleSwitchBroker(e.target.value)}
                    >
                        {brokerAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                    </BrokerSelect>
                </BrokerSwitcherRow>
            )}

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

                    {/* BETA-WEIGHTED DELTA */}
                    {betaDelta !== null && (
                        <InfoRow>
                            <Label>Delta (Δβ)</Label>
                            <GreekRow>
                                <GreekValue $color={getDeltaColor(betaDelta)}>
                                    {betaDelta > 0 ? '+' : ''}{betaDelta.toFixed(2)}
                                </GreekValue>
                            </GreekRow>
                        </InfoRow>
                    )}

                    {/* THETA */}
                    <InfoRow>
                        <Label>Theta (Θ)</Label>
                        <GreekRow>
                            <GreekValue $color={thetaState?.color ?? '#fff'}>
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
                <RefreshBtn onClick={() => account.loadPortfolioGreeks()}>
                    ↻ Load greeks
                </RefreshBtn>
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
                        <span style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Fractional Kelly (½K)
                        </span>
                    </div>
                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                        <KellyValue $color={kellyData.halfKelly > 0 ? '#4dff91' : '#ff4d6d'}>
                            {kellyData.halfKelly.toFixed(1)}%
                        </KellyValue>
                        <span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>
                            (Full: {kellyData.kelly.toFixed(1)}%)
                        </span>
                    </div>
                    {kellyData.maxBet > 0 && (
                        <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                            Max bet: <span style={{ color: '#4a9eff', fontWeight: 600 }}>{fmt(kellyData.maxBet)}</span>
                        </div>
                    )}
                    <KellyDetail>
                        <span>Win Rate: {kellyData.winRate.toFixed(1)}%</span>
                        <span>W/L Ratio: {kellyData.wlRatio.toFixed(2)}</span>
                    </KellyDetail>
                    <KellyExplainer>
                        <KellyBullet>
                            <strong style={{ color: '#888' }}>½K %</strong> = % din cont alocat per trade (half-Kelly, mai conservator)
                        </KellyBullet>
                        <KellyBullet>
                            <strong style={{ color: '#888' }}>Max bet</strong> = net liq × ½K%. Nu depasi aceasta suma ca BPE per trade
                        </KellyBullet>
                        <KellyBullet>
                            <strong style={{ color: '#888' }}>W/L Ratio</strong> = avg win / avg loss. Sub 1.0 = pierzi mai mult decat castigi per trade, compensat de win rate mare
                        </KellyBullet>
                        <KellyBullet>
                            {kellyData.halfKelly > 20
                                ? <span style={{ color: '#ffaa00' }}>½K {'>'} 20% — edge foarte mare, dar respecta regula 5% max BPE</span>
                                : kellyData.halfKelly > 10
                                ? <span style={{ color: '#4dff91' }}>½K 10-20% — edge solid, poti folosi 5% BPE cu incredere</span>
                                : kellyData.halfKelly > 0
                                ? <span style={{ color: '#aaa' }}>½K {'<'} 10% — edge modest, size mai mic recomandat</span>
                                : <span style={{ color: '#ff4d6d' }}>½K negativ — nu exista edge, nu tranzactiona</span>
                            }
                        </KellyBullet>
                    </KellyExplainer>
                </KellyBox>
            )}

        </AccountInfoContainer>
    );
});

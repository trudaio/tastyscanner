import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';

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

const LoadingText = styled.div`
    color: #666;
    font-size: 12px;
    text-align: center;
    padding: 8px;
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

    useEffect(() => {
        if (account && !account.portfolioGreeks && !account.isLoadingPortfolioGreeks) {
            account.loadPortfolioGreeks();
        }
    }, [account]);

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
    const theta      = pg?.theta ?? null;
    const gamma      = pg?.gamma ?? null;
    const vega       = pg?.vega  ?? null;
    const thetaPct   = (theta !== null && netLiq > 0) ? Math.abs(theta) / netLiq * 100 : null;
    const thetaState = thetaPct !== null ? getThetaState(thetaPct) : null;

    return (
        <AccountInfoContainer>

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

        </AccountInfoContainer>
    );
});

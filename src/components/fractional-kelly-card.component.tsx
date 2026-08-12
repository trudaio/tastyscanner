import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';

/* Dark card matching the sidebar account-info styling so the Kelly box
 * keeps its look now that it lives on the (light) My Account page. */
const KellyCardContainer = styled.div`
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 8px;
    padding: 12px;
    border: 1px solid #333;
`;

const KellyBox = styled.div`
    background: rgba(74, 158, 255, 0.08);
    border: 1px solid rgba(74, 158, 255, 0.25);
    border-radius: 6px;
    padding: 8px 10px;
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

interface KellyData {
    kelly: number;
    halfKelly: number;
    winRate: number;
    wlRatio: number;
    maxBet: number;
}

/** Fractional Kelly (½K) position-sizing card. Computes half-Kelly from the
 *  YTD IC analytics summary and caps the max bet against net liquidity. */
export const FractionalKellyCardComponent: React.FC = observer(() => {
    const services = useServices();
    const account = services.brokerAccount.currentAccount;
    const [kellyData, setKellyData] = useState<KellyData | null>(null);

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

    if (!kellyData) return null;

    const fmt = (v: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

    return (
        <KellyCardContainer>
            <KellyBox>
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
        </KellyCardContainer>
    );
});

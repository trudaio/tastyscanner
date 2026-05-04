import React from 'react';
import styled from 'styled-components';
import type { IFmpFundamentals } from '../../services/api-clients/fmp.client';
import type { IBasicTechnicals } from '../../utils/skew-math';

const C = {
    bgCard: '#12121a',
    bgRow: '#0e0e16',
    bgRowAlt: '#16161f',
    border: '#2a2a3a',
    borderStrong: '#3a3a4a',
    text: '#f0f0f5',
    textDim: '#a0a0b0',
    textMuted: '#606070',
    accent: '#3b82f6',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#facc15',
    info: '#38bdf8',
} as const;

const Wrap = styled.div`
  background: ${C.bgCard};
  border: 1px solid ${C.border};
  border-radius: 12px;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 14px 18px;
  border-bottom: 1px solid ${C.border};
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.06));
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled.div`
  font-size: 15px;
  font-weight: 800;
  color: ${C.text};
`;

const SubTitle = styled.div`
  font-size: 11px;
  color: ${C.textDim};
`;

const Tag = styled.span<{ $kind?: 'sector' | 'industry' }>`
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: ${(p) => (p.$kind === 'sector' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)')};
  color: ${(p) => (p.$kind === 'sector' ? '#93c5fd' : '#c4b5fd')};
  border: 1px solid ${(p) => (p.$kind === 'sector' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(139, 92, 246, 0.3)')};
  margin-right: 6px;
`;

const PriceBlock = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`;

const PriceVal = styled.span`
  font-size: 22px;
  font-weight: 800;
  color: ${C.text};
`;

const ChangeVal = styled.span<{ $pos: boolean }>`
  font-size: 13px;
  font-weight: 700;
  color: ${(p) => (p.$pos ? C.success : C.danger)};
`;

/* Finviz-style 4-column table — labels are subtle, values dominate. */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  font-size: 12px;
  @media (max-width: 980px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;

const Cell = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid ${C.border};
  border-right: 1px solid ${C.border};
  background: ${C.bgRow};
  &:nth-child(8n+1), &:nth-child(8n+2), &:nth-child(8n+3), &:nth-child(8n+4) {
    background: ${C.bgRowAlt};
  }
  &:nth-child(4n) { border-right: none; }
  @media (max-width: 980px) {
    &:nth-child(2n) { border-right: none; }
    &:nth-child(2n+1) { border-right: 1px solid ${C.border}; }
  }
  @media (max-width: 540px) {
    border-right: none !important;
  }
`;

const Lbl = styled.span`
  color: ${C.textMuted};
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
`;

const Val = styled.span<{ $tone?: 'pos' | 'neg' | 'warn' | 'info' | 'mute' }>`
  text-align: right;
  font-weight: 700;
  color: ${(p) => {
        if (p.$tone === 'pos') return C.success;
        if (p.$tone === 'neg') return C.danger;
        if (p.$tone === 'warn') return C.warning;
        if (p.$tone === 'info') return C.info;
        if (p.$tone === 'mute') return C.textDim;
        return C.text;
    }};
  font-variant-numeric: tabular-nums;
  font-size: 13px;
`;

const Footer = styled.div`
  padding: 10px 16px;
  border-top: 1px solid ${C.border};
  font-size: 11px;
  color: ${C.textDim};
  background: ${C.bgRow};
  line-height: 1.5;
`;

interface IProps {
    ticker: string;
    stockPrice: number | null;
    fmp: IFmpFundamentals | null;
    technicals: IBasicTechnicals;
}

function n(v: unknown): number | null {
    if (v == null) return null;
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : null;
}

function fNum(v: unknown, d = 2): string {
    const x = n(v);
    return x == null ? '–' : x.toFixed(d);
}

function fPct(v: unknown, d = 2): string {
    const x = n(v);
    return x == null ? '–' : `${x >= 0 ? '' : ''}${x.toFixed(d)}%`;
}

function fSignedPct(v: unknown, d = 2): string {
    const x = n(v);
    if (x == null) return '–';
    return `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;
}

function fMoney(v: unknown): string {
    const x = n(v);
    return x == null ? '–' : `$${x.toFixed(2)}`;
}

function fCap(v: unknown): string {
    const x = n(v);
    if (x == null) return '–';
    const a = Math.abs(x);
    if (a >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
    return x.toFixed(0);
}

function fVolume(v: unknown): string {
    const x = n(v);
    if (x == null) return '–';
    const a = Math.abs(x);
    if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
    return x.toFixed(0);
}

function toneSigned(v: unknown): 'pos' | 'neg' | 'mute' {
    const x = n(v);
    if (x == null) return 'mute';
    if (x > 0) return 'pos';
    if (x < 0) return 'neg';
    return 'mute';
}

/** Tone for ratios where lower is "better" (P/E, P/B, P/S). */
function toneValuation(v: unknown, lo: number, hi: number): 'pos' | 'warn' | 'neg' | 'mute' {
    const x = n(v);
    if (x == null || x <= 0) return 'mute';
    if (x <= lo) return 'pos';
    if (x >= hi) return 'neg';
    return 'warn';
}

/** Tone for return-style metrics (ROE, ROIC) where higher is better. */
function toneReturn(v: unknown, lo: number, hi: number): 'pos' | 'warn' | 'neg' | 'mute' {
    const x = n(v);
    if (x == null) return 'mute';
    if (x >= hi) return 'pos';
    if (x <= lo) return 'neg';
    return 'warn';
}

function fmtEarnings(iso: string | null): string {
    if (!iso) return '–';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    } catch {
        return iso;
    }
}

export const SkewCompanyEvaluation: React.FC<IProps> = ({ ticker, stockPrice, fmp, technicals }) => {
    const live = n(fmp?.livePrice) ?? n(stockPrice);
    const change = n(fmp?.change);
    const changePct = n(fmp?.changePct);
    const sma50 = n(fmp?.priceAvg50);
    const sma200 = n(fmp?.priceAvg200);

    // SMA distance %
    const distSma50 = live != null && sma50 != null && sma50 !== 0
        ? ((live - sma50) / sma50) * 100 : null;
    const distSma200 = live != null && sma200 != null && sma200 !== 0
        ? ((live - sma200) / sma200) * 100 : null;

    // 52w high/low + position
    const yrHigh = n(fmp?.yearHigh) ?? n(technicals.week52High);
    const yrLow = n(fmp?.yearLow) ?? n(technicals.week52Low);
    const distHigh = live != null && yrHigh != null && yrHigh !== 0
        ? ((live - yrHigh) / yrHigh) * 100 : null;
    const distLow = live != null && yrLow != null && yrLow !== 0
        ? ((live - yrLow) / yrLow) * 100 : null;

    const relVolume = (() => {
        const vol = n(fmp?.volume);
        const avg = n(fmp?.avgVolume);
        if (vol == null || avg == null || avg === 0) return null;
        return vol / avg;
    })();

    const fundamentalsAvailable = !!fmp;

    return (
        <Wrap>
            <Header>
                <TitleBlock>
                    <Title>
                        {ticker} {fmp?.companyName ? `— ${fmp.companyName}` : ''}
                    </Title>
                    <SubTitle>
                        {fmp?.sector && <Tag $kind="sector">{fmp.sector}</Tag>}
                        {fmp?.industry && <Tag $kind="industry">{fmp.industry}</Tag>}
                        {!fmp && 'Company Evaluation — Finviz-style overview'}
                    </SubTitle>
                </TitleBlock>
                <PriceBlock>
                    <PriceVal>{live != null ? `$${live.toFixed(2)}` : '–'}</PriceVal>
                    {change != null && (
                        <ChangeVal $pos={change >= 0}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}
                            {changePct != null ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)` : ''}
                        </ChangeVal>
                    )}
                </PriceBlock>
            </Header>

            <Grid>
                {/* Row 1 — Valuation core */}
                <Cell><Lbl>P/E</Lbl><Val $tone={toneValuation(fmp?.pe, 15, 30)}>{fNum(fmp?.pe, 2)}</Val></Cell>
                <Cell><Lbl>EPS (TTM)</Lbl><Val>{fMoney(fmp?.eps)}</Val></Cell>
                <Cell><Lbl>Market Cap</Lbl><Val>{fCap(fmp?.marketCap)}</Val></Cell>
                <Cell><Lbl>Beta</Lbl><Val $tone={(() => { const x = n(fmp?.beta); return x == null ? 'mute' : x < 1 ? 'pos' : x > 1.5 ? 'warn' : undefined; })()}>{fNum(fmp?.beta, 2)}</Val></Cell>

                {/* Row 2 — Multiples */}
                <Cell><Lbl>P/S</Lbl><Val $tone={toneValuation(fmp?.priceToSales, 2, 8)}>{fNum(fmp?.priceToSales, 2)}</Val></Cell>
                <Cell><Lbl>P/B</Lbl><Val $tone={toneValuation(fmp?.priceToBook, 1.5, 5)}>{fNum(fmp?.priceToBook, 2)}</Val></Cell>
                <Cell><Lbl>PEG</Lbl><Val $tone={toneValuation(fmp?.pegRatio, 1, 2)}>{fNum(fmp?.pegRatio, 2)}</Val></Cell>
                <Cell><Lbl>EV/EBITDA</Lbl><Val $tone={toneValuation(fmp?.enterpriseValueOverEbitda, 10, 20)}>{fNum(fmp?.enterpriseValueOverEbitda, 2)}</Val></Cell>

                {/* Row 3 — Profitability */}
                <Cell><Lbl>ROE</Lbl><Val $tone={toneReturn(fmp?.roe, 0, 15)}>{fPct(fmp?.roe, 1)}</Val></Cell>
                <Cell><Lbl>ROIC</Lbl><Val $tone={toneReturn(fmp?.roic, 0, 15)}>{fPct(fmp?.roic, 1)}</Val></Cell>
                <Cell><Lbl>ROA</Lbl><Val $tone={toneReturn(fmp?.returnOnAssets, 0, 8)}>{fPct(fmp?.returnOnAssets, 1)}</Val></Cell>
                <Cell><Lbl>Profit Margin</Lbl><Val $tone={toneReturn(fmp?.profitMargin, 0, 15)}>{fPct(fmp?.profitMargin, 1)}</Val></Cell>

                {/* Row 4 — Margins + debt */}
                <Cell><Lbl>Op. Margin</Lbl><Val $tone={toneReturn(fmp?.operatingMargin, 0, 15)}>{fPct(fmp?.operatingMargin, 1)}</Val></Cell>
                <Cell><Lbl>Gross Margin</Lbl><Val $tone={toneReturn(fmp?.grossMargin, 20, 40)}>{fPct(fmp?.grossMargin, 1)}</Val></Cell>
                <Cell><Lbl>LT D/E</Lbl><Val $tone={toneValuation(fmp?.longTermDebtToEquity, 0.5, 2)}>{fNum(fmp?.longTermDebtToEquity, 2)}</Val></Cell>
                <Cell><Lbl>Debt/Equity</Lbl><Val $tone={toneValuation(fmp?.debtToEquity, 0.5, 2)}>{fNum(fmp?.debtToEquity, 2)}</Val></Cell>

                {/* Row 5 — Income & shares */}
                <Cell><Lbl>Sales (TTM)</Lbl><Val>{fmp?.revenueTtm != null ? `$${fCap(fmp.revenueTtm)}` : '–'}</Val></Cell>
                <Cell><Lbl>Income (TTM)</Lbl><Val $tone={toneSigned(fmp?.netIncomeTtm)}>{fmp?.netIncomeTtm != null ? `$${fCap(fmp.netIncomeTtm)}` : '–'}</Val></Cell>
                <Cell><Lbl>Book/sh</Lbl><Val>{fMoney(fmp?.bookValuePerShare)}</Val></Cell>
                <Cell><Lbl>Cash/sh</Lbl><Val>{fMoney(fmp?.cashPerShare)}</Val></Cell>

                {/* Row 6 — Dividend / Yield / Earnings yield */}
                <Cell><Lbl>Dividend</Lbl><Val>{fMoney(fmp?.dividend)}</Val></Cell>
                <Cell><Lbl>Div. Yield</Lbl><Val $tone={(() => { const x = n(fmp?.dividendYield); return x == null ? 'mute' : x >= 3 ? 'pos' : undefined; })()}>{fPct(fmp?.dividendYield, 2)}</Val></Cell>
                <Cell><Lbl>Payout</Lbl><Val>{fPct(fmp?.payoutRatio, 1)}</Val></Cell>
                <Cell><Lbl>Earn. Yield</Lbl><Val $tone={toneReturn(fmp?.earningsYield, 0, 5)}>{fPct(fmp?.earningsYield, 2)}</Val></Cell>

                {/* Row 7 — Growth */}
                <Cell><Lbl>EPS Q/Q</Lbl><Val $tone={toneSigned(fmp?.epsGrowthQuarterly)}>{fSignedPct(fmp?.epsGrowthQuarterly, 1)}</Val></Cell>
                <Cell><Lbl>Sales Q/Q</Lbl><Val $tone={toneSigned(fmp?.salesGrowthQuarterly)}>{fSignedPct(fmp?.salesGrowthQuarterly, 1)}</Val></Cell>
                <Cell><Lbl>Shares Out.</Lbl><Val>{fCap(fmp?.sharesOutstanding)}</Val></Cell>
                <Cell><Lbl>Earnings</Lbl><Val $tone="info">{fmtEarnings(fmp?.earningsAnnouncement ?? null)}</Val></Cell>

                {/* Row 8 — Range */}
                <Cell><Lbl>52W High</Lbl><Val>{fMoney(yrHigh)}</Val></Cell>
                <Cell><Lbl>52W Low</Lbl><Val>{fMoney(yrLow)}</Val></Cell>
                <Cell><Lbl>From High</Lbl><Val $tone={toneSigned(distHigh)}>{fSignedPct(distHigh, 1)}</Val></Cell>
                <Cell><Lbl>From Low</Lbl><Val $tone={toneSigned(distLow)}>{fSignedPct(distLow, 1)}</Val></Cell>

                {/* Row 9 — SMAs + range pos */}
                <Cell><Lbl>SMA 50</Lbl><Val>{fMoney(sma50)}</Val></Cell>
                <Cell><Lbl>vs SMA 50</Lbl><Val $tone={toneSigned(distSma50)}>{fSignedPct(distSma50, 1)}</Val></Cell>
                <Cell><Lbl>SMA 200</Lbl><Val>{fMoney(sma200)}</Val></Cell>
                <Cell><Lbl>vs SMA 200</Lbl><Val $tone={toneSigned(distSma200)}>{fSignedPct(distSma200, 1)}</Val></Cell>

                {/* Row 10 — Day + volume + technicals */}
                <Cell><Lbl>Day H/L</Lbl><Val>{fmp?.dayHigh != null && fmp.dayLow != null ? `${fmp.dayLow.toFixed(2)} – ${fmp.dayHigh.toFixed(2)}` : '–'}</Val></Cell>
                <Cell><Lbl>Volume</Lbl><Val>{fVolume(fmp?.volume)}</Val></Cell>
                <Cell><Lbl>Avg Volume</Lbl><Val>{fVolume(fmp?.avgVolume)}</Val></Cell>
                <Cell><Lbl>Rel. Volume</Lbl><Val $tone={(() => { const x = n(relVolume); return x == null ? 'mute' : x > 1.5 ? 'warn' : x < 0.7 ? 'mute' : undefined; })()}>{fNum(relVolume, 2)}</Val></Cell>

                {/* Row 11 — Technicals from price history */}
                <Cell><Lbl>RSI(14)</Lbl><Val $tone={(() => { const x = n(technicals.rsi14); return x == null ? 'mute' : x >= 70 ? 'neg' : x <= 30 ? 'pos' : undefined; })()}>{fNum(technicals.rsi14, 1)}</Val></Cell>
                <Cell><Lbl>ATR(14)</Lbl><Val>{fNum(technicals.atr14, 2)}</Val></Cell>
                <Cell><Lbl>HV (30d)</Lbl><Val>{fPct(technicals.historicalVolatility30, 1)}</Val></Cell>
                <Cell><Lbl>52W Pos.</Lbl><Val $tone={(() => { const x = n(technicals.week52RangePct); return x == null ? 'mute' : x >= 80 ? 'warn' : x <= 20 ? 'info' : undefined; })()}>{technicals.week52RangePct != null ? `${technicals.week52RangePct.toFixed(0)}%` : '–'}</Val></Cell>

                {/* Row 12 — Performance */}
                <Cell><Lbl>YTD Return</Lbl><Val $tone={toneSigned(technicals.ytdReturnPct)}>{fSignedPct(technicals.ytdReturnPct, 1)}</Val></Cell>
                <Cell><Lbl>QTD Return</Lbl><Val $tone={toneSigned(technicals.qtdReturnPct)}>{fSignedPct(technicals.qtdReturnPct, 1)}</Val></Cell>
                <Cell><Lbl>Day Change</Lbl><Val $tone={toneSigned(changePct)}>{fSignedPct(changePct, 2)}</Val></Cell>
                <Cell><Lbl>Range</Lbl><Val>{yrHigh != null && yrLow != null ? `${yrLow.toFixed(2)} – ${yrHigh.toFixed(2)}` : '–'}</Val></Cell>
            </Grid>

            {!fundamentalsAvailable && (
                <Footer>
                    FMP fundamentals unavailable for this ticker (common for ETFs / indices). Showing what we can derive from price history.
                </Footer>
            )}
            {fundamentalsAvailable && (
                <Footer>
                    Color cues: green = stronger / cheaper, red = weaker / richer, yellow = mid range. Tones are heuristic — interpret in context of sector and growth profile.
                </Footer>
            )}
        </Wrap>
    );
};

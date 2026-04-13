import React, { useEffect, useState } from 'react';
import { IonSegment, IonSegmentButton, IonLabel, IonSpinner } from '@ionic/react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { IIronCondorTrade } from '../../services/iron-condor-analytics/iron-condor-analytics.interface';
import { normalizeUnderlying } from '../../utils/symbol-normalizer';

// --- Constants ---

const SVG_WIDTH = 600; // Fixed viewBox width — SVG scales via width:100%

// --- Helpers ---

function computeDTE(expirationDate: string): number {
    const now = new Date();
    const exp = new Date(expirationDate + 'T16:00:00');
    return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatExpiration(expirationDate: string): string {
    const d = new Date(expirationDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isTested(ic: IIronCondorTrade, currentPrice: number): boolean {
    return currentPrice <= ic.putSellStrike || currentPrice >= ic.callSellStrike;
}

// Match Dashboard formulas exactly:
// profitPct = (openCredit - currentPrice) / openCredit * 100
// openCredit values vary by source:
//   - Order-based trades: per-share credit (e.g., 5.10)
//   - Position-based trades: total dollars (e.g., 510.00)
// currentPrice=0 means no close price data — show N/A
function hasClosePrice(ic: IIronCondorTrade): boolean {
    return ic.currentPrice !== 0;
}

function getProfitPct(ic: IIronCondorTrade): number {
    if (ic.openCredit <= 0) return 0;
    return ((ic.openCredit - ic.currentPrice) / ic.openCredit) * 100;
}

function getProfitDollars(ic: IIronCondorTrade): number {
    return ic.openCredit - ic.currentPrice;
}

function getNiceTickInterval(range: number): number {
    if (range <= 0) return 1;
    const rough = range / 6;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / magnitude;
    if (residual <= 1.5) return magnitude;
    if (residual <= 3.5) return 2.5 * magnitude;
    if (residual <= 7.5) return 5 * magnitude;
    return 10 * magnitude;
}

// --- Styled Components ---

const Container = styled.div`
    background: #0d0d1a;
    color: #fff;
    min-height: 100%;
    padding-bottom: 20px;
`;

const SummaryBar = styled.div`
    display: flex;
    gap: 16px;
    padding: 14px 20px;
    background: #111;
    border-bottom: 1px solid #222;
    flex-wrap: wrap;
`;

const SummaryStat = styled.div`
    font-size: 11px;
    span.label { color: #888; }
    span.value { color: #fff; font-weight: 600; }
    span.positive { color: #4dff91; font-weight: 600; }
    span.negative { color: #ff4d6d; font-weight: 600; }
`;

const PriceHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 8px 20px;
    gap: 8px;
    border-bottom: 1px solid #222;
`;

const PriceTicker = styled.span`
    color: #888;
    font-size: 12px;
`;

const PriceValue = styled.span`
    color: #ffaa00;
    font-size: 16px;
    font-weight: 600;
`;

const ChartSection = styled.div`
    padding: 12px 20px 0 20px;
`;

const RowsContainer = styled.div`
    padding: 8px 20px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const IcCard = styled.div<{ $tested: boolean }>`
    background: ${p => p.$tested ? 'rgba(255,77,109,0.06)' : 'rgba(255,255,255,0.02)'};
    border: ${p => p.$tested ? '1.5px solid #ff4d6d' : '1px solid #2a2a3e'};
    border-radius: 8px;
    padding: 12px;
    position: relative;
`;

const TestedBadge = styled.div`
    position: absolute;
    top: 8px;
    right: 12px;
    background: #ff4d6d;
    color: #fff;
    font-size: 9px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
`;

const LabelsRow = styled.div`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 8px;
    align-items: baseline;
`;

const LabelLine = styled.span<{ $color?: string; $bold?: boolean }>`
    font-size: 11px;
    color: ${p => p.$color || '#888'};
    font-weight: ${p => p.$bold ? 'bold' : 'normal'};
    white-space: nowrap;
`;

const Legend = styled.div`
    padding: 0 20px 20px;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
`;

const LegendItem = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #888;
`;

const LegendSwatch = styled.div<{ $bg: string }>`
    width: 14px;
    height: 10px;
    background: ${p => p.$bg};
    border-radius: 2px;
`;

const LegendDash = styled.div`
    width: 3px;
    height: 10px;
    border-left: 2px dashed #ffaa00;
`;

const EmptyState = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: #888;
    font-size: 14px;
`;

const SpinnerBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
`;

const SegmentBox = styled.div`
    padding: 0 20px;
    border-bottom: 1px solid #222;

    ion-segment-button {
        --color: #aaa;
        --color-checked: #4a9eff;
        --indicator-color: #4a9eff;
        font-size: 14px;
        font-weight: 600;
        min-height: 42px;
    }
`;

// --- SVG Sub-components (fixed viewBox, no ResizeObserver needed) ---

interface PriceAxisProps {
    priceMin: number;
    priceMax: number;
    currentPrice: number;
}

const PriceAxisSvg: React.FC<PriceAxisProps> = ({ priceMin, priceMax, currentPrice }) => {
    const w = SVG_WIDTH;
    const h = 28;
    const range = priceMax - priceMin;
    if (range <= 0) return null;

    const tickInterval = getNiceTickInterval(range);
    const firstTick = Math.ceil(priceMin / tickInterval) * tickInterval;
    const ticks: number[] = [];
    for (let t = firstTick; t <= priceMax; t += tickInterval) {
        ticks.push(Math.round(t * 100) / 100);
    }

    const toX = (price: number) => ((price - priceMin) / range) * w;
    const cpX = toX(currentPrice);

    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="#333" strokeWidth="1" />
            {ticks.map(t => {
                const x = toX(t);
                return (
                    <g key={t}>
                        <line x1={x} y1={h - 6} x2={x} y2={h - 1} stroke="#555" strokeWidth="1" />
                        <text x={x} y={h - 10} fill="#555" fontSize="9" textAnchor="middle">
                            {t >= 100 ? Math.round(t) : t.toFixed(1)}
                        </text>
                    </g>
                );
            })}
            {currentPrice > 0 && (
                <line x1={cpX} y1="0" x2={cpX} y2={h} stroke="#ffaa00" strokeWidth="1.5" strokeDasharray="4,3" />
            )}
        </svg>
    );
};

interface IcRowChartProps {
    ic: IIronCondorTrade;
    priceMin: number;
    priceMax: number;
    currentPrice: number;
}

const IcRowChartSvg: React.FC<IcRowChartProps> = ({ ic, priceMin, priceMax, currentPrice }) => {
    const w = SVG_WIDTH;
    const barH = 36;
    const totalH = barH + 16;
    const range = priceMax - priceMin;
    if (range <= 0) return null;

    const toX = (price: number) => ((price - priceMin) / range) * w;

    const pbX = toX(ic.putBuyStrike);
    const psX = toX(ic.putSellStrike);
    const csX = toX(ic.callSellStrike);
    const cbX = toX(ic.callBuyStrike);
    const cpX = currentPrice > 0 ? toX(currentPrice) : -1;

    return (
        <svg viewBox={`0 0 ${w} ${totalH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Max loss left */}
            <rect x={0} y={0} width={Math.max(0, pbX)} height={barH} fill="rgba(255,77,109,0.12)" rx={3} />
            {/* Put spread */}
            <rect x={pbX} y={0} width={Math.max(0, psX - pbX)} height={barH} fill="rgba(255,77,109,0.28)" rx={3} />
            {/* Profit zone */}
            <rect x={psX} y={0} width={Math.max(0, csX - psX)} height={barH} fill="rgba(77,255,145,0.10)" rx={3} />
            {/* Call spread */}
            <rect x={csX} y={0} width={Math.max(0, cbX - csX)} height={barH} fill="rgba(255,77,109,0.28)" rx={3} />
            {/* Max loss right */}
            <rect x={cbX} y={0} width={Math.max(0, w - cbX)} height={barH} fill="rgba(255,77,109,0.12)" rx={3} />

            {/* Current price line */}
            {cpX >= 0 && (
                <line x1={cpX} y1={0} x2={cpX} y2={barH} stroke="#ffaa00" strokeWidth={2} strokeDasharray="5,3" />
            )}

            {/* Strike labels */}
            <text x={pbX} y={barH + 12} fill="#666" fontSize="8" textAnchor="middle">{ic.putBuyStrike}</text>
            <text x={psX} y={barH + 12} fill="#666" fontSize="8" textAnchor="middle">{ic.putSellStrike}</text>
            <text x={csX} y={barH + 12} fill="#666" fontSize="8" textAnchor="middle">{ic.callSellStrike}</text>
            <text x={cbX} y={barH + 12} fill="#666" fontSize="8" textAnchor="middle">{ic.callBuyStrike}</text>
        </svg>
    );
};

// --- Main Component ---

export const GuviduVisualizationComponent: React.FC = observer(() => {
    const services = useServices();
    const [selectedTicker, setSelectedTicker] = useState<string>('');
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [openTrades, setOpenTrades] = useState<IIronCondorTrade[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch trades from history + cross-reference with REAL positions to filter out stale trades
    const account = services.brokerAccount.currentAccount;
    useEffect(() => {
        if (!account) return;
        setIsLoading(true);

        Promise.all([
            services.ironCondorAnalytics.getHistorySummary(),
            services.marketDataProvider.getPositions(account.accountNumber),
        ]).then(([summary, positions]) => {
            // Build lookup set of currently-held position legs
            // Key: ticker|expiration|strike|optionType|direction
            const positionKeys = new Set<string>();
            for (const p of positions) {
                const ticker = normalizeUnderlying(p.underlyingSymbol);
                positionKeys.add(`${ticker}|${p.expirationDate}|${p.strikePrice}|${p.optionType}|${p.quantityDirection}`);
            }

            // Filter open trades: keep only those whose ALL 4 legs exist in current positions
            const open = summary.trades.filter(t => {
                if (t.status !== 'open') return false;
                const longPutKey = `${t.ticker}|${t.expirationDate}|${t.putBuyStrike}|P|Long`;
                const shortPutKey = `${t.ticker}|${t.expirationDate}|${t.putSellStrike}|P|Short`;
                const shortCallKey = `${t.ticker}|${t.expirationDate}|${t.callSellStrike}|C|Short`;
                const longCallKey = `${t.ticker}|${t.expirationDate}|${t.callBuyStrike}|C|Long`;
                return positionKeys.has(longPutKey)
                    && positionKeys.has(shortPutKey)
                    && positionKeys.has(shortCallKey)
                    && positionKeys.has(longCallKey);
            });

            console.log(`[GuviduViz] ${summary.trades.length} total trades, ${summary.trades.filter(t => t.status === 'open').length} marked open, ${open.length} verified against live positions`);
            setOpenTrades(open);
            setIsLoading(false);
        }).catch(err => {
            console.error('[GuviduViz] Error:', err);
            setIsLoading(false);
        });
    }, [account, services.ironCondorAnalytics, services.marketDataProvider]);

    // Group open trades by ticker
    const tickerGroups = new Map<string, IIronCondorTrade[]>();
    for (const t of openTrades) {
        const group = tickerGroups.get(t.ticker) || [];
        group.push(t);
        tickerGroups.set(t.ticker, group);
    }
    const tickers = Array.from(tickerGroups.keys()).sort();

    // Auto-select first ticker
    useEffect(() => {
        if (tickers.length > 0 && !tickers.includes(selectedTicker)) {
            setSelectedTicker(tickers[0]);
        }
    }, [tickers, selectedTicker]);

    // Get current price for selected ticker — reset on switch
    // SPX needs special symbols — try multiple variants
    useEffect(() => {
        setCurrentPrice(0);
        if (!selectedTicker) return;

        const symbolsToTry = selectedTicker === 'SPX'
            ? ['$SPX.X', 'SPX', '$SPX']
            : [selectedTicker];

        services.marketDataProvider.subscribe(symbolsToTry);

        const updatePrice = () => {
            for (const sym of symbolsToTry) {
                const trade = services.marketDataProvider.getSymbolTrade(sym);
                if (trade?.price) {
                    setCurrentPrice(trade.price);
                    return;
                }
                const quote = services.marketDataProvider.getSymbolQuote(sym);
                if (quote && quote.bidPrice && quote.askPrice) {
                    setCurrentPrice((quote.bidPrice + quote.askPrice) / 2);
                    return;
                }
            }
            // Fallback: use underlying price from any trade in this ticker
            // (positions have underlyingLastPrice embedded)
        };

        updatePrice();
        const interval = setInterval(updatePrice, 3000);

        return () => {
            clearInterval(interval);
            services.marketDataProvider.unsubscribe(symbolsToTry);
        };
    }, [selectedTicker, services.marketDataProvider]);

    const tradesForTicker = tickerGroups.get(selectedTicker) || [];

    // Sort: tested first (pinned), then by DTE ascending
    const sortedTrades = [...tradesForTicker].sort((a, b) => {
        const aTested = currentPrice > 0 && isTested(a, currentPrice);
        const bTested = currentPrice > 0 && isTested(b, currentPrice);
        if (aTested && !bTested) return -1;
        if (!aTested && bTested) return 1;
        return computeDTE(a.expirationDate) - computeDTE(b.expirationDate);
    });

    // Price axis range
    let priceMin = 0;
    let priceMax = 0;
    if (tradesForTicker.length > 0) {
        const allPutBuys = tradesForTicker.map(t => t.putBuyStrike);
        const allCallBuys = tradesForTicker.map(t => t.callBuyStrike);
        const rawMin = Math.min(...allPutBuys);
        const rawMax = Math.max(...allCallBuys);
        const padding = (rawMax - rawMin) * 0.05;
        priceMin = rawMin - padding;
        priceMax = rawMax + padding;

        if (currentPrice > 0) {
            priceMin = Math.min(priceMin, currentPrice - padding);
            priceMax = Math.max(priceMax, currentPrice + padding);
        }
    }

    // Summary stats
    const totalCredit = tradesForTicker.reduce((sum, t) => sum + t.openCredit, 0);
    const tradesWithPrice = tradesForTicker.filter(t => hasClosePrice(t));
    const netPL = tradesWithPrice.reduce((sum, t) => sum + getProfitDollars(t), 0);
    const hasAnyPLData = tradesWithPrice.length > 0;
    const testedCount = currentPrice > 0 ? tradesForTicker.filter(t => isTested(t, currentPrice)).length : 0;

    if (isLoading) {
        return (
            <Container>
                <SpinnerBox><IonSpinner /></SpinnerBox>
            </Container>
        );
    }

    if (openTrades.length === 0) {
        return (
            <Container>
                <EmptyState>No open positions. Open an IC in Guvid Management to see it here.</EmptyState>
            </Container>
        );
    }

    return (
        <Container>
            {/* Current price display */}
            {currentPrice > 0 && (
                <PriceHeader>
                    <PriceTicker>{selectedTicker}</PriceTicker>
                    <PriceValue>{currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</PriceValue>
                </PriceHeader>
            )}

            {/* Ticker tabs */}
            {tickers.length > 1 && (
                <SegmentBox>
                    <IonSegment
                        value={selectedTicker}
                        onIonChange={e => setSelectedTicker(e.detail.value as string)}
                    >
                        {tickers.map(ticker => (
                            <IonSegmentButton key={ticker} value={ticker}>
                                <IonLabel>{ticker} ({tickerGroups.get(ticker)?.length || 0})</IonLabel>
                            </IonSegmentButton>
                        ))}
                    </IonSegment>
                </SegmentBox>
            )}

            {/* Summary bar */}
            <SummaryBar>
                <SummaryStat>
                    <span className="label">Open ICs: </span>
                    <span className="value">{tradesForTicker.length}</span>
                </SummaryStat>
                <SummaryStat>
                    <span className="label">Total Credit: </span>
                    <span className="value">${totalCredit.toFixed(2)}</span>
                </SummaryStat>
                <SummaryStat>
                    <span className="label">Net P&L: </span>
                    {hasAnyPLData ? (
                        <span className={netPL >= 0 ? 'positive' : 'negative'}>
                            {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                        </span>
                    ) : (
                        <span className="value">N/A</span>
                    )}
                </SummaryStat>
                <SummaryStat>
                    <span className="label">Tested: </span>
                    <span className={testedCount > 0 ? 'negative' : 'value'}>{testedCount}</span>
                </SummaryStat>
            </SummaryBar>

            {tradesForTicker.length === 0 ? (
                <EmptyState>No open Iron Condors for {selectedTicker}</EmptyState>
            ) : (
                <>
                    {/* Shared price axis */}
                    <ChartSection>
                        <PriceAxisSvg
                            priceMin={priceMin}
                            priceMax={priceMax}
                            currentPrice={currentPrice}
                        />
                    </ChartSection>

                    {/* IC Rows */}
                    <RowsContainer>
                        {sortedTrades.map(ic => {
                            const tested = currentPrice > 0 && isTested(ic, currentPrice);
                            const dte = computeDTE(ic.expirationDate);
                            const hasPL = hasClosePrice(ic);
                            const pl = hasPL ? getProfitDollars(ic) : 0;
                            const plPct = hasPL ? getProfitPct(ic) : 0;
                            const dteColor = dte < 14 ? '#ff4d6d' : dte <= 21 ? '#ffaa00' : '#888';
                            const plColor = hasPL ? (pl >= 0 ? '#4dff91' : '#ff4d6d') : '#888';
                            const strikeColor = tested ? '#ff4d6d' : '#ddd';

                            return (
                                <IcCard key={ic.id} $tested={tested}>
                                    {tested && <TestedBadge>TESTED</TestedBadge>}
                                    {/* Labels row above the chart */}
                                    <LabelsRow>
                                        <LabelLine $color={strikeColor} $bold>
                                            {ic.putBuyStrike}/{ic.putSellStrike}p · {ic.callSellStrike}/{ic.callBuyStrike}c
                                        </LabelLine>
                                        <LabelLine $color={dteColor}>
                                            {dte} DTE · {formatExpiration(ic.expirationDate)}
                                        </LabelLine>
                                        <LabelLine>
                                            Cr: ${ic.openCredit.toFixed(2)} · Qty: {ic.quantity}
                                        </LabelLine>
                                        <LabelLine $color={plColor}>
                                            {hasPL
                                                ? `P&L: ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(0)}%)`
                                                : 'P&L: N/A'}
                                        </LabelLine>
                                    </LabelsRow>
                                    {/* Full-width SVG bar — aligns with shared price axis */}
                                    <IcRowChartSvg
                                        ic={ic}
                                        priceMin={priceMin}
                                        priceMax={priceMax}
                                        currentPrice={currentPrice}
                                    />
                                </IcCard>
                            );
                        })}
                    </RowsContainer>

                    {/* Legend */}
                    <Legend>
                        <LegendItem>
                            <LegendSwatch $bg="rgba(77,255,145,0.15)" />
                            Profit zone
                        </LegendItem>
                        <LegendItem>
                            <LegendSwatch $bg="rgba(255,77,109,0.35)" />
                            Spread width
                        </LegendItem>
                        <LegendItem>
                            <LegendSwatch $bg="rgba(255,77,109,0.12)" />
                            Max loss zone
                        </LegendItem>
                        <LegendItem>
                            <LegendDash />
                            Current price
                        </LegendItem>
                    </Legend>
                </>
            )}
        </Container>
    );
});

import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

const INDICES = [
    { symbol: 'AMEX:SPY',   label: 'SPY' },
    { symbol: 'NASDAQ:QQQ', label: 'QQQ' },
    { symbol: 'AMEX:IWM',   label: 'IWM' },
    { symbol: 'AMEX:GLD',   label: 'GLD' },
    { symbol: 'AMEX:SLV',   label: 'SLV' },
    { symbol: 'TVC:VIX',    label: 'VIX' },
    { symbol: 'AMEX:TLT',   label: 'TLT' },      // Bonds 20Y — corelatie inversa cu actiunile
    { symbol: 'AMEX:HYG',   label: 'HYG' },      // High Yield Bonds — sentiment de risc
];

/* ───────── Styled Components ───────── */

const OverviewContainer = styled.div`
    padding: 12px;
`;

const SectionLabel = styled.div`
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--ion-color-medium);
    margin-bottom: 12px;
    padding-left: 4px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;

    @media (max-width: 1200px) {
        grid-template-columns: repeat(3, 1fr);
    }
    @media (max-width: 900px) {
        grid-template-columns: repeat(2, 1fr);
    }
    @media (max-width: 500px) {
        grid-template-columns: 1fr;
    }
`;

const ChartCard = styled.div`
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    height: 200px;
    position: relative;

    .tradingview-widget-container {
        height: 100% !important;
        width: 100% !important;
    }
`;

/* ───────── Mini Chart Widget ───────── */

const MiniChart: React.FC<{ symbol: string; uniqueId: string }> = ({ symbol, uniqueId }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous widget
        containerRef.current.innerHTML = '';

        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container';

        const widgetInner = document.createElement('div');
        widgetInner.className = 'tradingview-widget-container__widget';
        widgetContainer.appendChild(widgetInner);

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            symbol: symbol,
            width: '100%',
            height: '100%',
            locale: 'en',
            dateRange: '3M',
            colorTheme: 'dark',
            isTransparent: true,
            autosize: true,
            largeChartUrl: '',
            chartOnly: false,
            noTimeScale: false,
        });

        widgetContainer.appendChild(script);
        containerRef.current.appendChild(widgetContainer);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [symbol, uniqueId]);

    return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
};

/* ───────── Main Component ───────── */

export const MarketOverviewComponent: React.FC = () => {
    return (
        <OverviewContainer>
            <SectionLabel>Market Overview</SectionLabel>
            <Grid>
                {INDICES.map((idx) => (
                    <ChartCard key={idx.label}>
                        <MiniChart
                            symbol={idx.symbol}
                            uniqueId={`mini-${idx.label}`}
                        />
                    </ChartCard>
                ))}
            </Grid>
        </OverviewContainer>
    );
};

// TradingViewWidget.jsx
import React, { useEffect, useRef } from 'react';
import {observer} from "mobx-react";

function getMarketCode(listedMarket: string) {
    switch (listedMarket) {
        case 'XNAS':
            return 'NASDAQ';
        case 'XNYS':
            return 'NYSE';
        case 'OTC':
            return 'TVC';
        case 'ARCX':
            return '';
        default:
            return listedMarket;
    }
}

export const  TradingViewWidgetComponent: React.FC<{symbol: string; listedMarket: string}> = observer((props) => {
    const container = useRef<HTMLDivElement | null>(null);

    const market = getMarketCode(props.listedMarket);

    let symbol = props.symbol;

    if(market && symbol) {
       symbol = `${market}:${symbol}`;
    }

    useEffect(
        () => {


            if(!symbol) return;

            const existingScript = document.getElementById("tradingview_widget_script");
            if(existingScript) {
                existingScript.remove();
            }

            const script = document.createElement("script");
            script.id = "tradingview_widget_script";
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
            script.type = "text/javascript";
            script.async = true;
            script.innerHTML = JSON.stringify({
              allow_symbol_change: false,
              calendar: false,
              details: false,
              hide_side_toolbar: true,
              hide_top_toolbar: false,
              hide_legend: false,
              hide_volume: false,
              hotlist: false,
              interval: "D",
              locale: "en",
              save_image: true,
              style: "1",
              symbol: symbol,
              theme: "light",
              timezone: "Etc/UTC",
              backgroundColor: "#ffffff",
              gridColor: "rgba(46, 46, 46, 0.06)",
              watchlist: [],
              withdateranges: true,
              compareSymbols: [],
              studies: ["STD;Bollinger_Bands", "STD;Stochastic_RSI"],
              autosize: true,
            });
            container.current?.appendChild(script);
        },
        [symbol, market]
    );

    return (
        <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>

            <div className="tradingview-widget-copyright">
                <a href={`https://www.tradingview.com/symbols/${symbol.replace(':', '-')}/`} rel="noopener nofollow" target="_blank">
                    <span className="blue-text">{props.symbol} stock chart</span>
                </a>
                <span className="trademark"> by TradingView</span>
            </div>
        </div>
    );
})

//export default memo(TradingViewWidgetComponent);

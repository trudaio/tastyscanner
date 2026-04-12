# Guvid Visualization — Design Spec

## Overview

New page in TastyScanner that visualizes all open Iron Condor positions as horizontal colored bars on a shared price axis, filtered by ticker. Provides instant visual assessment of which positions are being tested by the current price.

**Route**: `/guvid-visualization`
**Branch**: `feature/guvid-vs-catalin`

## Data Source

- **Open IC trades** from `IronCondorAnalyticsService.trades` filtered by `status === 'open'`
- **Current price** from `MarketDataProviderService.getSymbolQuote(ticker)`
- Grouped by `ticker` (SPX, QQQ) — each ticker is a tab
- No Firestore competition data — this is real portfolio only

### IIronCondorTrade fields used

```typescript
{
  ticker: string;           // "SPX" | "QQQ"
  status: 'open';
  putBuyStrike: number;     // Long put (outer)
  putSellStrike: number;    // Short put (inner)
  callSellStrike: number;   // Short call (inner)
  callBuyStrike: number;    // Long call (outer)
  expirationDate: string;   // YYYY-MM-DD
  openDate: string;
  openCredit: number;
  currentPrice: number;     // Current cost to close
  profit: number;           // openCredit - closeDebit (0 for open trades — use openCredit - currentPrice for unrealized P&L)
  quantity: number;
}
```

## Page Layout

### Header
- Page title: "Guvid Visualization"
- Current price of selected ticker displayed on the right (e.g., "SPX 5,612.40")

### Ticker Tabs
- `IonSegment` with one button per ticker that has open ICs
- Format: `SPX (4)` — ticker name + count of open ICs
- Tabs are dynamic — only tickers with open positions appear

### Summary Bar
- Row of stats below tabs: **Open ICs**, **Total Credit**, **Net P&L**, **Tested count**
- Net P&L is green if positive, red if negative
- Tested count is red if > 0

### Shared Price Axis
- Horizontal axis at the top of the IC rows area
- Range: `min(all putBuyStrikes) - padding` to `max(all callBuyStrikes) + padding`
- Padding = 5% of total range on each side
- Tick marks at round intervals (e.g., every 50 for SPX, every 5 for QQQ)

### IC Rows
Each row is a card containing:
- **Left label area** (~120px):
  - Strike description: `5300/5320p · 5750/5770c`
  - DTE + expiration: `21 DTE · May 3` — color-coded orange if 14-21 DTE, red if < 14 DTE
  - Credit + quantity: `Cr: $2.55 · Qty: 2`
  - P&L: `+$310 (+61%)` — green if profit, red if loss. Unrealized P&L for open trades = `(openCredit - currentPrice) * quantity * 100`. Percentage = `unrealizedPL / (openCredit * quantity * 100) * 100`

- **Chart area** (remaining width): Custom SVG with 5 horizontal rectangles:
  1. **Max loss zone (left)**: `putBuyStrike` to left edge — `rgba(255,77,109,0.12)`
  2. **Put spread**: `putBuyStrike` to `putSellStrike` — `rgba(255,77,109,0.28)`
  3. **Profit zone**: `putSellStrike` to `callSellStrike` — `rgba(77,255,145,0.10)`
  4. **Call spread**: `callSellStrike` to `callBuyStrike` — `rgba(255,77,109,0.28)`
  5. **Max loss zone (right)**: `callBuyStrike` to right edge — `rgba(255,77,109,0.12)`

- **Current price line**: Vertical dashed line (`#ffaa00`, stroke-dasharray 5,3) drawn across the bar at the current underlying price position
- **Strike labels**: Small text below each spread boundary showing the strike price

### Sorting & Danger Pinning
- **Default sort**: ascending by DTE (soonest expiration first)
- **Danger pin**: Any IC where the current price has breached a short strike (`price <= putSellStrike` or `price >= callSellStrike`) gets pinned to the top
- **Danger styling**: Red border (`#ff4d6d`), red-tinted background, "TESTED" badge (top-right corner)

### Legend
- Bottom of page, horizontal row: Profit zone, Spread width, Max loss zone, Current price (dashed line)

### Empty State
- When no open ICs exist for the selected ticker: centered message "No open Iron Condors for {ticker}"
- When no open ICs exist at all: "No open positions. Open an IC in Guvid Management to see it here."

## Component Architecture

```
GuviduVisualizationPage (page wrapper)
└── GuviduVisualizationComponent (observer, main logic)
    ├── TickerTabs (IonSegment)
    ├── SummaryBar (stats row)
    ├── PriceAxis (shared SVG axis)
    └── IcRowList
        └── IcRow[] (one per open IC)
            ├── IcRowLabels (left side text)
            └── IcRowChart (SVG bar visualization)
```

All in a single file: `src/components/guvid-visualization/guvid-visualization.component.tsx`

Styled with styled-components, following the existing dark theme:
- Background: `#0d0d1a`
- Card background: `rgba(255,255,255,0.02)`, border: `#2a2a3e`
- Text: `#fff` (primary), `#888` (secondary), `#555` (dim)
- Accent: `#4a9eff` (blue), `#4dff91` (green), `#ff4d6d` (red), `#ffaa00` (orange/warning)

## SVG Coordinate Math

```typescript
// Price-to-X coordinate mapping
const priceToX = (price: number): number => {
  const chartLeft = 120; // label area width
  const chartRight = containerWidth;
  const chartWidth = chartRight - chartLeft;
  return chartLeft + ((price - priceMin) / (priceMax - priceMin)) * chartWidth;
};

// priceMin = min(all putBuyStrikes) - padding
// priceMax = max(all callBuyStrikes) + padding
// padding = (priceMax_raw - priceMin_raw) * 0.05

// "Tested" detection
const isTested = (ic: IIronCondorTrade, currentPrice: number): boolean =>
  currentPrice <= ic.putSellStrike || currentPrice >= ic.callSellStrike;
```

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/pages/GuviduVisualizationPage.tsx` |
| Create | `src/components/guvid-visualization/guvid-visualization.component.tsx` |
| Modify | `src/App.tsx` — add route `/guvid-visualization` |
| Modify | `src/components/Menu.tsx` — add menu item (icon: `eyeOutline` from ionicons) |

## Data Flow

1. Component mounts → calls `services.ironCondorAnalytics.fetchYTDTrades()`
2. Filters `trades` by `status === 'open'` → groups by `ticker`
3. Gets unique tickers → renders tabs. First tab auto-selected.
4. For selected ticker, calls `services.marketDataProvider.getSymbolQuote(ticker)` for current price
5. Computes price axis range from all ICs of selected ticker
6. Sorts ICs: tested first (pinned), then by DTE ascending
7. Renders SVG rows

## Responsive Behavior

- **Desktop (> 768px)**: Full layout with label area + chart side by side
- **Mobile (< 768px)**: Labels stack above chart (label area becomes full-width row, chart below)
- SVG viewBox scales with container width via a `ResizeObserver` or `useRef` + `useEffect`

## Out of Scope (for now)

- Click-to-expand with greeks + break-evens (future enhancement)
- Click-to-navigate to trade details
- Real-time price updates via WebSocket (uses snapshot from REST)
- Historical price chart / candlesticks behind the bars

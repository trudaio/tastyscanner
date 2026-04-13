# Design Guidelines

> Dark theme palette, responsive breakpoints, Ionic patterns, and data visualization conventions for TastyScanner.

## Dark Theme Color Palette

The app uses an always-dark theme with a deep blue-black base. Colors are defined in `src/theme/variables.css` and applied through styled-components.

### Base Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0d0d1a` | Page-level background (`IonContent`) |
| Card | `#1a1a2e` | Card surfaces, sidebar, modal backgrounds |
| Tertiary | `#2a2a3e` | Elevated surfaces, hover states, table headers |
| Border | `#333` - `#3a3a4e` | Card borders, dividers, input borders |

### Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#4a9eff` | Links, primary buttons, active states, selected items |
| Green (Profit) | `#4dff91` | Positive P&L, wins, success states, POP > 80% |
| Red (Loss) | `#ff4d6d` | Negative P&L, losses, danger states, alerts |
| Orange (Warning) | `#ffaa00` | Caution states, medium-priority alerts, DTE warnings |
| Yellow | `#ffd700` | Highlights, trophy icons, draw states |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Primary text | `#ffffff` | Headings, primary data values, labels |
| Secondary text | `#888888` | Descriptions, metadata, timestamps |
| Muted text | `#aaaaaa` | Helper text, disabled states, footnotes |
| Dimmed text | `#666666` | Placeholder text, very low priority info |

### Semantic Color Mapping

```
Profit / Win / Positive  -->  #4dff91 (green)
Loss / Lose / Negative   -->  #ff4d6d (red)
Neutral / Draw / Pending -->  #ffaa00 (orange) or #ffd700 (yellow)
Info / Active / Selected  -->  #4a9eff (blue)
Background emphasis      -->  #2a2a3e (tertiary)
```

## Typography

The app inherits Ionic's default system font stack. No custom fonts are loaded.

### Font Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 24px | 700 | `#fff` |
| Section heading | 18-20px | 600 | `#fff` |
| Card title | 16px | 600 | `#fff` |
| Body text | 14px | 400 | `#fff` |
| Secondary text | 13px | 400 | `#888` |
| Caption / metadata | 12px | 400 | `#aaa` |
| Stat value (large) | 28-36px | 700 | varies (green/red/white) |
| Stat label | 11-12px | 500 | `#888` |
| Table cell | 13-14px | 400 | `#fff` |
| Table header | 12-13px | 600 | `#aaa` |

### Monospace for Numbers

Financial data (prices, P&L, Greeks) should use monospace or tabular figures for alignment:
```css
font-variant-numeric: tabular-nums;
```

## Ionic Component Patterns

### When to Use Which

| Component | When |
|-----------|------|
| `IonPage` + `IonContent` | Every page-level component (required by Ionic routing) |
| `IonList` + `IonItem` | Settings, account info, menu items, simple lists |
| `IonCard` | Dashboard stat summaries, feature descriptions |
| `IonGrid` + `IonRow` + `IonCol` | Multi-column layouts (responsive grid) |
| `IonSegment` + `IonSegmentButton` | Tab-like switching within a page (e.g., "Open" / "Closed" trades) |
| `IonModal` | Order confirmation, broker setup, detail views |
| `IonPopover` | Tooltips, context menus |
| `IonToast` | Status feedback (order sent, error occurred) |
| `IonLoading` | Full-page loading states |
| `IonRefresher` | Pull-to-refresh on mobile |
| `IonSearchbar` | Symbol search in ticker selector |
| `IonBadge` | Status indicators (win/loss/pending) |
| `IonChip` | Tags, filter selections |
| `IonToggle` | Boolean settings |
| `IonInput` + `IonSelect` | Form fields |

### Layout Pattern

Every page follows this structure:
```tsx
<IonPage>
    <IonContent className="ion-padding">
        {/* Page-specific styled-components */}
    </IonContent>
</IonPage>
```

The sidebar menu (`Menu.tsx`) uses `IonSplitPane` with `--side-max-width: 350px` and renders inside the authenticated route layout in `App.tsx`.

## Styled-Components Conventions

### Transient Props

Always prefix custom styling props with `$` to prevent DOM forwarding:

```typescript
const StatCard = styled.div<{ $color: string; $isActive?: boolean }>`
    background: #1a1a2e;
    border-left: 3px solid ${p => p.$color};
    padding: 16px;
    border-radius: 8px;
    opacity: ${p => p.$isActive === false ? 0.5 : 1};
`;
```

### Common Styled Patterns

**Page wrapper:**
```typescript
const PageWrapper = styled.div`
    padding: 16px;
    max-width: 1400px;
    margin: 0 auto;
    background: #0d0d1a;
`;
```

**Section container:**
```typescript
const Section = styled.div`
    background: #1a1a2e;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    border: 1px solid #2a2a3e;
`;
```

**Header row with title + action:**
```typescript
const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
`;
```

## Responsive Breakpoints

| Breakpoint | Target | Usage |
|-----------|--------|-------|
| `480px` | Small phones | Stack all columns, reduce padding, hide secondary data |
| `600px` | Large phones | 2-column grids, compact tables |
| `768px` | Tablets | Sidebar collapses to hamburger below this |
| `900px` | Small laptops | Full sidebar visible, 3-column grids |
| `1200px` | Desktop | Max content width, full table layouts |

### Media Query Pattern

```css
/* Mobile first — base styles target phone */
.stat-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
}

@media (min-width: 600px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
}

@media (min-width: 900px) {
    .stat-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (min-width: 1200px) {
    .stat-grid { grid-template-columns: repeat(4, 1fr); }
}
```

### Sidebar Behavior

The `IonSplitPane` shows the sidebar when viewport >= 768px. Below that, the sidebar becomes a slide-in menu accessible via hamburger button. Max sidebar width is 350px.

## Color-Coded Data

### DTE (Days to Expiration)

| Range | Color | Meaning |
|-------|-------|---------|
| 0-7 DTE | `#ff4d6d` (red) | Danger zone -- gamma risk high |
| 8-21 DTE | `#ffaa00` (orange) | Watch zone -- consider rolling |
| 22-45 DTE | `#4dff91` (green) | Sweet spot -- optimal theta decay |
| 46+ DTE | `#888` (muted) | Far out -- low theta efficiency |

### Profit Percentage

| Range | Color |
|-------|-------|
| >= 50% profit | `#4dff91` (green) |
| 0-49% profit | `#aaa` (muted) or light green gradient |
| Loss (< 0%) | `#ff4d6d` (red) |

### P&L Values

- Positive: `#4dff91` with `+` prefix (e.g., `+$234.50`)
- Negative: `#ff4d6d` with `-` prefix (e.g., `-$89.25`)
- Zero: `#888` (muted)

### IV Rank

| Range | Color | Meaning |
|-------|-------|---------|
| 0-29 | `#888` (muted) | Low IV -- suboptimal for selling |
| 30-49 | `#ffaa00` (orange) | Preferred -- above average volatility |
| 50+ | `#4dff91` (green) | Ideal -- high premium environment |

## Metric Cards

Metric/stat cards use a consistent pattern across Dashboard, Guvid History, and Guvid vs Catalin pages:

```
[colored left border 3px] | Label (12px, #888, uppercase)
                          | Value (28px, bold, color-coded)
                          | Sublabel or delta (12px, #aaa)
```

**Structure:**
```typescript
const MetricCard = styled.div<{ $accent: string }>`
    background: #1a1a2e;
    border-left: 3px solid ${p => p.$accent};
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;
```

Cards are arranged in responsive grids (see breakpoints above). On mobile, cards stack vertically with full width.

## Tables

### Horizontal Scroll

Tables with many columns use horizontal scroll on mobile:

```typescript
const TableWrapper = styled.div`
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;

    table {
        min-width: 700px;
        width: 100%;
        border-collapse: collapse;
    }
`;
```

### Table Styling

```css
th {
    background: #2a2a3e;
    color: #aaa;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 10px 12px;
    text-align: left;
    position: sticky;
    top: 0;
}

td {
    padding: 10px 12px;
    font-size: 13px;
    color: #fff;
    border-bottom: 1px solid #2a2a3e;
}

tr:hover {
    background: rgba(74, 158, 255, 0.05);
}
```

### Sortable Columns

Clickable table headers show sort direction with arrow indicators. Active sort column uses `#4a9eff` color for the header text.

## Status Badges

Used in Guvid vs Catalin competition rounds and Guvid History:

| Badge | Background | Text | Border |
|-------|-----------|------|--------|
| Winner (AI) | `rgba(77, 255, 145, 0.15)` | `#4dff91` | `1px solid rgba(77, 255, 145, 0.3)` |
| Winner (User) | `rgba(74, 158, 255, 0.15)` | `#4a9eff` | `1px solid rgba(74, 158, 255, 0.3)` |
| Draw | `rgba(255, 215, 0, 0.15)` | `#ffd700` | `1px solid rgba(255, 215, 0, 0.3)` |
| Pending | `rgba(136, 136, 136, 0.15)` | `#888` | `1px solid rgba(136, 136, 136, 0.3)` |
| Locked | `rgba(255, 170, 0, 0.15)` | `#ffaa00` | -- |
| Tested | `rgba(74, 158, 255, 0.1)` | `#4a9eff` | -- |
| Ghost | `rgba(136, 136, 136, 0.1)` | `#666` (dimmed) | dashed border |

Badge pattern:
```typescript
const Badge = styled.span<{ $variant: 'win' | 'loss' | 'draw' | 'pending' | 'ghost' }>`
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
`;
```

## Animation Patterns

### Shimmer (Loading Skeleton)

Used for cards and table rows while data loads:

```css
@keyframes shimmer {
    0% { background-position: -200px 0; }
    100% { background-position: 200px 0; }
}

.skeleton {
    background: linear-gradient(90deg, #1a1a2e 25%, #2a2a3e 50%, #1a1a2e 75%);
    background-size: 400px 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
}
```

### Pulse (Live Indicator)

Used for the WebSocket connection indicator and live streaming status:

```css
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4dff91;
    animation: pulse 2s ease-in-out infinite;
}
```

### Transitions

Standard transition for hover/focus states:
```css
transition: all 0.2s ease;
```

Used on: buttons, table rows, card hover, badge hover, sidebar items.

## Form Patterns

### Input Fields

Use Ionic `IonInput` with custom styling:

```typescript
const FormRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;

    label {
        font-size: 12px;
        color: #888;
        text-transform: uppercase;
        font-weight: 600;
    }

    ion-input {
        --background: #2a2a3e;
        --color: #fff;
        --placeholder-color: #666;
        --padding-start: 12px;
        --border-radius: 8px;
        border: 1px solid #333;
        border-radius: 8px;
    }
`;
```

### Select Dropdowns

`IonSelect` with the `interface="popover"` or `interface="action-sheet"` on mobile.

### Buttons

| Type | Background | Text | Usage |
|------|-----------|------|-------|
| Primary | `#4a9eff` | `#fff` | Main actions (Submit, Execute Order) |
| Success | `#4dff91` | `#0d0d1a` | Confirmation (Approve, Close Position) |
| Danger | `#ff4d6d` | `#fff` | Destructive actions (Delete, Reject) |
| Ghost | `transparent` | `#4a9eff` | Secondary actions, links |
| Outline | `transparent` + border | `#aaa` | Tertiary actions, filters |

```css
button {
    border-radius: 8px;
    padding: 10px 20px;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.2s ease;
    cursor: pointer;
}
button:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
}
```

## Chart Conventions (Recharts)

- Background: transparent (inherits card `#1a1a2e`)
- Grid lines: `#2a2a3e` (subtle)
- Axis text: `#888`, 12px
- Tooltip: `background: #1a1a2e`, `border: 1px solid #2a2a3e`, white text
- Line colors: `#4a9eff` (primary), `#4dff91` (profit), `#ff4d6d` (loss)
- Area fills: Same colors with 20% opacity

## See Also

- [Code Standards](code-standards.md) -- styled-components and naming conventions
- [Codebase Summary](codebase-summary.md) -- Component inventory by feature area
- [Project Overview & Roadmap](project-overview-pdr.md) -- Feature context for UI decisions

---

*Last updated: 2026-04-13*

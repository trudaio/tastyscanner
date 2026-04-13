# Code Standards

> TypeScript conventions, MobX patterns, naming rules, and precision requirements for TastyScanner.

## TypeScript Strict Mode

The project uses TypeScript 5.9 in strict mode. **Zero TypeScript errors** is a hard requirement -- `npx tsc --noEmit` must pass before any work is declared complete.

Key `tsconfig.json` settings:
- `strict: true` (enables all strict checks)
- `noEmit` used for type-checking only (Vite handles bundling)
- Separate `tsconfig.node.json` for Vite config files

The backend (`functions/`) has its own `tsconfig.json` targeting Node 20 with ES module output to `lib/`.

## MobX Patterns

MobX 6.15 is the state management layer. All reactive state lives in service classes, not in components.

### Observable Declarations

Use `makeObservable` in the constructor with explicit annotations:

```typescript
constructor() {
    makeObservable(this, {
        isInitialized: observable,
        currentTicker: observable.ref,  // use .ref for object references
        initialize: action,
    });
}
```

- `observable` -- for primitives and collections
- `observable.ref` -- for object references where you replace the whole object (not deep-mutate it)
- `action` -- for synchronous state mutations

### Async Mutations with `runInAction`

All async operations that modify observables must wrap the mutation in `runInAction`:

```typescript
async loadData(): Promise<void> {
    const data = await fetchFromApi();
    runInAction(() => {
        this.items = data;
        this.isLoading = false;
    });
}
```

Never mutate an observable outside of an action or `runInAction` -- MobX will warn in dev mode and behavior becomes unpredictable.

### `autorun` for Reactive Aggregation

The portfolio Greeks pattern in `BrokerAccountService` uses `autorun` to reactively re-aggregate Greeks whenever the underlying streamer data changes:

```typescript
autorun(() => {
    // This re-runs whenever greeks/quotes/trades maps update
    const totalDelta = this.computePortfolioDelta();
    runInAction(() => { this.portfolioDelta = totalDelta; });
});
```

Must call `waitForConnection()` before subscribing to streamer data.

### `observer()` on Components

Every React component that reads MobX observables must be wrapped with `observer()`:

```typescript
import { observer } from 'mobx-react';

export const DashboardPage: React.FC = observer(() => {
    const { tradingDashboard } = services;
    return <div>{tradingDashboard.totalPl}</div>;
});
```

Components without `observer()` will not re-render when observables change.

## Service Factory + Lazy Initialization

All 16 services are instantiated through `ServiceFactory` (`src/services/service-factory.ts`) using the `Lazy<T>` utility:

```typescript
private _tickers: Lazy<ITickersService> = new Lazy<ITickersService>(
    () => new TickersService(this)
);
get tickers(): ITickersService {
    return this._tickers.value;
}
```

**Key behaviors:**
- Services are created on first property access, not at construction time
- Each service receives the factory reference (`this`) for cross-service access
- `MarketDataProvider` is special: it gets re-created on `initialize()` when credentials change
- `onAuthStateChanged` triggers auto-initialization by loading broker credentials from Firestore

**Adding a new service:**
1. Create the interface in `service-name.service.interface.ts`
2. Create the implementation in `service-name.service.ts`
3. Add a `Lazy<>` field and getter in `ServiceFactory`
4. Add the getter to the `IServiceFactory` interface

## Styled-Components Conventions

### Transient Props

Use the `$` prefix for props that should not be forwarded to the DOM:

```typescript
const StatCard = styled.div<{ $color: string; $isActive: boolean }>`
    border-left: 3px solid ${props => props.$color};
    opacity: ${props => props.$isActive ? 1 : 0.5};
`;
```

Without `$`, styled-components forwards the prop to the DOM element, causing React warnings.

### Component-Level Styling

Each component file typically has its styled-components defined at the top of the file or in a co-located `.styles.ts` file. The project uses Ionic structural components (`IonPage`, `IonContent`, `IonList`, `IonItem`) for layout, with styled-components for custom visual styling on top.

### Theme Variables

Global theme colors are in `src/theme/variables.css`. See [Design Guidelines](design-guidelines.md) for the full palette.

## Symbol Format Handling

This is a critical gotcha that has caused silent failures multiple times.

**TastyTrade API format:** `QQQ   260227C00665000` (padded symbol + date + type + zero-padded strike)

**DxLink streamer format:** `.QQQ260227C665` (dot prefix + compact format)

**Rule:** Always use `pos.streamerSymbol` (mapped from `pos['streamer-symbol']`) for WebSocket subscriptions and data lookups. Using TastyTrade format for streamer operations will silently fail -- no errors, no data, just empty maps.

```typescript
// CORRECT
const symbol = position.streamerSymbol;
marketDataProvider.subscribe(symbol);

// WRONG -- silently fails
const symbol = position.symbol; // TastyTrade format
marketDataProvider.subscribe(symbol);
```

## `quantityDirection` Returns Strings

Another critical gotcha. The TastyTrade API field `quantity-direction` returns `"Long"` or `"Short"` as strings, not numbers.

```typescript
// CORRECT
if (pos.quantityDirection === 'Short') { ... }

// WRONG -- always NaN
const qty = parseFloat(pos.quantityDirection);
```

## Decimal Precision

Consistent decimal formatting throughout the application:

| Data Type | Decimals | Examples |
|-----------|----------|---------|
| Monetary values (P&L, credit, prices) | 2 | `$1,234.56`, `$0.85` |
| Delta | 2 | `-0.16`, `0.12` |
| Theta | 2 | `-0.03` |
| Vega | 2 | `0.15` |
| Gamma | 4 | `0.0012` |
| POP (%) | 0 or 1 | `82%`, `78.5%` |
| Alpha (%) | 2 | `3.45%` |
| Risk/Reward ratio | 2 | `4.50` |

Use `toFixed(n)` for display, but keep full precision in calculations until the final render step.

## Error Handling Patterns

### Frontend Services

Services use try/catch with `console.error` and typically return empty/default values on failure rather than throwing:

```typescript
async fetchData(): Promise<IData[]> {
    try {
        const result = await api.getData();
        return result;
    } catch (err) {
        console.error('[ServiceName] fetchData failed:', err);
        return [];
    }
}
```

### Cloud Functions

Functions use try/catch with structured error responses. All errors are logged with a `[prefix]` tag:

```typescript
try {
    // ... logic
} catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHENTICATED') {
        res.status(401).json({ error: 'Unauthorized' });
    } else {
        console.error('[functionName]', message);
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

The `llm-client.ts` wraps Anthropic SDK calls with budget enforcement and throws `BudgetExceededError` when the daily cap is hit.

## Logging Conventions

All log messages use a bracket prefix identifying the source:

```
[aiDailySubmit] Starting for uid=abc123, date=2026-04-13
[closeCheck] Closing AI trade: 75% profit target hit
[API Error] Failed to decrypt credentials
[polygon/stock-bars] Symbol not found
```

Frontend services follow the same pattern via `ConsoleLoggerService`.

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Pages | `PascalCase` + `Page.tsx` | `DashboardPage.tsx` |
| Components | `kebab-case` + `.component.tsx` | `account-info.component.tsx` |
| Services | `kebab-case` + `.service.ts` | `tickers.service.ts` |
| Service interfaces | `kebab-case` + `.service.interface.ts` | `tickers.service.interface.ts` |
| Non-service interfaces | `kebab-case` + `.interface.ts` | `iron-condor-analytics.interface.ts` |
| Models | `kebab-case` + `.model.ts` | `iron-condor.model.ts` |
| View model interfaces | `kebab-case` + `.view-model.interface.ts` | `iron-condor.view-model.interface.ts` |
| Styled components | Defined inline or `kebab-case` + `.styles.ts` | (co-located) |
| Utility files | `kebab-case` + `.ts` | `helper-functions.ts` |
| Service directories | `kebab-case` | `market-data-provider/` |

Interface prefixes: `I` for interfaces (`IServiceFactory`, `ITickersService`, `ICompetitionRoundV2`).

## Git Workflow

- **Feature branches only** -- never commit directly to `main`
- Active development on `feature/guvid-vs-catalin`
- Conventional commit messages visible in recent history (e.g., `feat:`, `fix:`, `refactor:`)
- Run `npx tsc --noEmit` before commits to verify type safety

## Import Organization

Imports follow this order (not enforced by linter but followed by convention):

1. React / external framework imports
2. Ionic component imports
3. Firebase imports
4. MobX imports
5. Third-party library imports
6. Internal service/model/util imports
7. Styled-component definitions (if at top of file)

## Testing Patterns

- **E2E (Cypress):** Test files in `cypress/`. Run with `npm run test.e2e`
- **Unit (Vitest):** Run with `npm run test.unit`. Co-located with source or in `__tests__/` dirs
- No minimum coverage enforced currently, but critical model calculations (credit, POP, EV, Alpha) should have unit tests

## See Also

- [Codebase Summary](codebase-summary.md) -- File inventory and service catalog
- [System Architecture](system-architecture.md) -- How services connect
- [Design Guidelines](design-guidelines.md) -- UI styling conventions
- [Deployment Guide](deployment-guide.md) -- Build and type-check commands

---

*Last updated: 2026-04-13*

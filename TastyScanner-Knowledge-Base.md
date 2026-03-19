# TastyScanner — Knowledge Base Complet

## Ce este TastyScanner?

TastyScanner este o aplicatie de options trading construita pentru **vanzarea sistematica de premium prin Iron Condors**. Este conectata la brokerul TastyTrade prin API si WebSocket, si are ca obiectiv generarea de **$1,000/zi** cu risc definit.

Aplicatia scaneaza in timp real lanturile de optiuni, construieste toate combinatiile posibile de Iron Condors, le filtreaza dupa criterii statistice (POP, Expected Value, Alpha, Delta), si permite trimiterea de ordine direct catre TastyTrade.

---

## Strategia de Trading

### Ce este un Iron Condor?

Un Iron Condor este o strategie de optiuni cu 4 picioare care profita din **decaderea timpului** (theta decay) cand pretul underlying-ului ramane intr-un interval:

1. **Long Put** (BTO) — protectie pe downside, strike cel mai mic
2. **Short Put** (STO) — vanzare de premium pe partea de put
3. **Short Call** (STO) — vanzare de premium pe partea de call
4. **Long Call** (BTO) — protectie pe upside, strike cel mai mare

Profit maxim: se obtine cand pretul ramane intre short put si short call la expirare.
Pierdere maxima: diferenta intre strikes (wing width) minus creditul primit.

### Formulele Cheie

**Credit primit la intrare:**
```
Credit = (midPrice short put + midPrice short call) - (midPrice long put + midPrice long call)
```

**Profit maxim per contract:**
```
MaxProfit = Credit x 100
```

**Pierdere maxima per contract:**
```
MaxLoss = (WingWidth - Credit) x 100
```

**Risk/Reward Ratio:**
```
R/R = WingWidth / Credit
```
Un R/R de 3.0 inseamna ca risti $3 pentru a castiga $1. In strategia noastra, un R/R de 2-5 este normal pentru Iron Condors cu POP mare.

**Probability of Profit (POP):**
```
POP = 100 - max(putBreakEvenDelta%, callBreakEvenDelta%)
```
Unde break-even points sunt:
- Put break-even = Short Put Strike - Credit
- Call break-even = Short Call Strike + Credit

POP-ul se calculeaza gasind delta la strike-ul cel mai apropiat de break-even. Un POP de 80% inseamna ca statistic, 80 din 100 de trade-uri ar trebui sa fie profitabile.

**Expected Value (EV):**
```
EV = (POP/100 x MaxProfit) - ((1 - POP/100) x MaxLoss)
```
EV pozitiv = trade-ul are edge statistic. EV negativ = casa castiga.

**Alpha (Return pe unitate de risc):**
```
Alpha = (EV / MaxLoss) x 100
```
Alpha este metrica principala de sortare. Un alpha de 20% inseamna ca pentru fiecare $100 riscat, te astepti sa castigi $20 in medie.

### Tipuri de Iron Condors

**Symmetric (Neutru):**
- Delta put = Delta call
- Portofoliu delta-neutral
- Profita din lipsa de miscare

**Bullish (Bias pozitiv):**
- Delta put mai mare decat delta call (net delta >= +5)
- Wing-ul put este mai larg (mai multa protectie pe downside)
- Profita daca piata sta pe loc SAU creste usor

**Bearish (Bias negativ):**
- Delta call mai mare decat delta put (net delta <= -5)
- Wing-ul call este mai larg (mai multa protectie pe upside)
- Profita daca piata sta pe loc SAU scade usor

### Filtre de Selectie

Aplicatia filtreaza IC-urile dupa urmatoarele criterii (configurabile):

| Filtru | Default | Scop |
|--------|---------|------|
| Min Delta | 10% | Cat de departe sunt short strikes de pret |
| Max Delta | 20% | Limiteaza riscul directionial |
| Wing Width | $5 | Distanta intre long si short strike |
| Min POP | 60% | Probabilitate minima de profit |
| Min EV | $0 | Expected value minim |
| Min Alpha | 0% | Return minim pe unitate de risc |
| Min Credit | $0.20 | Credit minim per share |
| Max Bid/Ask Spread | $0.50 | Lichiditate minima |
| Min DTE | 30 zile | Zile minime pana la expirare |
| Max DTE | 60 zile | Zile maxime pana la expirare |
| IC Type | symmetric | Tip de IC |
| Earnings Filter | all | Inainte/dupa earnings |

---

## Reguli de Trading (implementate in cod)

### Position Sizing
- **Maxim 5% din Net Liquidity per trade** ca Buying Power Effect (BPE)
- Exemplu: Cu $100,000 net liq, BPE maxim = $5,000 per IC

### Profit Target
- **Inchide la 75% din MaxProfit**
- Daca ai primit $1.00 credit, inchide cand poti cumpara inapoi la $0.25

### Stop Loss
- **Inchide la 200% din credit (2x debitul)**
- Daca ai primit $1.00 credit, inchide daca debitul ajunge la $2.00

### DTE Management
- **Inchide sau roll la 21 DTE**
- Gamma risk creste semnificativ sub 21 DTE

### IV Preference
- **IV Rank > 30 preferat, > 50 ideal**
- Premium-ul este mai mare cand volatilitatea implicita este ridicata
- Vanzarea de premium in IV ridicat = avantaj statistic

### Portfolio Balance
- **Target delta-neutral** — minimizeaza riscul directional
- **Theta pozitiv** — profita din trecerea timpului
- Badge "UNDER-DEPLOYED" apare daca theta/netLiq < 0.2%
- Badge "OVER-EXPOSED" apare daca theta/netLiq > 0.4%

---

## Fractional Kelly Criterion

### Ce este Kelly?

Kelly Criterion determina **marimea optima a pozitiei** bazata pe edge-ul tau statistic:

```
Kelly% = W - (1-W) / R
```
Unde:
- W = Win Rate (probabilitatea de castig, ex: 0.88 pentru 88%)
- R = Win/Loss Ratio = Average Win / Average Loss

### Half-Kelly (Fractional Kelly)

TastyScanner foloseste **Half-Kelly (1/2K)** — jumatate din Kelly complet — pentru position sizing conservator:

```
Half-Kelly = Kelly% x 0.5
Max Bet = Net Liquidity x Half-Kelly
```

### Interpretare

| Half-Kelly | Interpretare |
|-----------|--------------|
| > 20% | Edge foarte mare. Respecta totusi regula 5% BPE |
| 10-20% | Edge solid. Poti folosi 5% BPE cu incredere |
| 0-10% | Edge modest. Position size mai mic recomandat |
| < 0% | Nu exista edge. Nu tranzactiona |

### Exemplu Real
Cu Win Rate 88.1% si W/L Ratio 0.56:
```
Kelly = 0.881 - (1 - 0.881) / 0.56 = 0.881 - 0.213 = 0.668 = 66.8%
Half-Kelly = 33.4%
```
Edge-ul este foarte mare (88% win rate), dar W/L ratio < 1.0 inseamna ca pierderile individuale sunt mai mari decat castigurile individuale. Win rate-ul mare compenseaza.

---

## Sistemul de Backtest

### Cum functioneaza?

Backtester-ul simuleaza strategia pe date istorice folosind:

1. **Date de pret** de la Polygon.io (bare zilnice pentru underlying)
2. **Pricing Black-Scholes** pentru optiuni (cu Greeks calculate matematic)
3. **Simulare zilnica** care gestioneaza intrari si iesiri

### Black-Scholes Pricing

Aplicatia calculeaza preturile optiunilor si Greeks-ii folosind formulele Black-Scholes:

**Pret Call:** `S * N(d1) - K * e^(-rT) * N(d2)`
**Pret Put:** `K * e^(-rT) * N(-d2) - S * N(-d1)`

Unde:
```
d1 = [ln(S/K) + (r + sigma^2/2) * T] / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)
```

**Greeks calculate:**
- **Delta** = N(d1) pentru calls, N(d1) - 1 pentru puts
- **Gamma** = N'(d1) / (S * sigma * sqrt(T))
- **Theta** = -(S * N'(d1) * sigma) / (2 * sqrt(T)) +/- r * K * e^(-rT) * N(d2)
- **Vega** = S * N'(d1) * sqrt(T) / 100

**Implied Volatility** se calculeaza prin Newton-Raphson cu fallback la bisection (max 100 iteratii, precizie 1e-6).

### Parametri de Backtest

| Parametru | Default | Descriere |
|-----------|---------|-----------|
| Capital initial | $100,000 | Capital de start |
| Max % per pozitie | 5% | Maxim BPE per trade |
| Max pozitii deschise | 10 | Limita simultana |
| Profit target | 75% | Inchide la % din max profit |
| Stop loss | 200% | Inchide la % din credit |
| Close DTE | 21 | Inchide la N zile pana la expirare |
| Slippage | $0.02/share | Cost de executie |
| Comision | $1.00/contract | Per contract |
| Risk-free rate | 5% | Rata fara risc anuala |

### Metrici de Rezultat

- **Total Trades, Wins, Losses, Win Rate**
- **Total P&L, Average P&L, Largest Win/Loss**
- **Profit Factor** = Total Wins / |Total Losses|
- **Max Drawdown** ($ si %)
- **Sharpe Ratio** = (mean daily return / std dev) x sqrt(252)
- **Sortino Ratio** = foloseste doar volatilitatea negativa
- **Calmar Ratio** = return anual / max drawdown
- **Kelly Fraction** = w - (1-w)/b
- **Equity Curve** = evolutia capitalului in timp
- **Monthly Breakdown** = P&L per luna
- **Ticker Breakdown** = P&L per underlying

### Motivele de Iesire

| Motiv | Cand |
|-------|------|
| profit_target | P&L atinge 75% din max profit |
| stop_loss | Pierderea atinge 200% din credit (2x debit) |
| dte_close | Raman 21 zile pana la expirare |
| expiration | Optiunile expira la maturitate |

---

## Guvid History — Analiza Performantei

### Ce masoara?

Guvid History analizeaza TOATE Iron Condor-urile tranzactionate YTD (Year To Date):

**Metrici globale:**
- Closed IC Trades — numar total de trade-uri inchise
- Win Rate — % trade-uri profitabile
- Total P&L — profit/pierdere totala realizata
- Avg Profit / Trade — profit mediu per trade inchis
- P&L / Day — profit mediu per zi de tranzactionare
- Avg Duration — numarul mediu de zile de la deschidere la inchidere

**Breakdown per Ticker:**
- Fiecare underlying (SPX, QQQ, SPY, GLD, IWM, etc.) cu trades, win rate, P&L, P&L/day, avg duration

**Breakdown per Luna:**
- P&L, trades, win rate defalcate pe luni calendaristice

**Calendar Heatmap:**
- Vizualizare zilnica tip calendar cu zile verzi (profit) si rosii (pierdere)
- Numar de IC-uri inchise pe zi

### Cum se calculeaza trade-urile?

1. Se extrag toate ordinele si tranzactiile din TastyTrade API
2. Se parseaza simbolurile optiunilor (format: `SPY   260212P00580000`)
3. Se grupeaza leg-urile in spread-uri (2 picioare fiecare)
4. Se potrivesc spread-urile de deschidere cu cele de inchidere
5. Se calculeaza P&L: `openCredit - closeDebit`
6. Trade-urile expirate = creditul integral pastrat ca profit

**Symbol Mapping:**
- SPXW se mapeaza la SPX (acelasi underlying, expirari diferite)

---

## Iron Condor Savior — Pozitii de Salvare

### Scop

Cand un IC existent este "underwater" (in pierdere), Savior-ul cauta noi IC-uri care pot oferi suficient credit pentru a compensa pierderea.

### Cum functioneaza?

1. Primeste: ticker, range DTE, target credit (suma necesara pentru break-even)
2. Scaneaza lanturile de optiuni
3. Incearca wing widths: $1, $2, $3, $5, $10
4. Pentru fiecare combinatie calculeaza credit, POP, R/R, greeks
5. Filtreaza: creditul trebuie sa fie >= target credit
6. Sorteaza: cele care indeplinesc target-ul primele, apoi POP descrescator
7. Returneaza top 50 rezultate

---

## Arhitectura Tehnica

### Stack

| Componenta | Tehnologie |
|-----------|-----------|
| Frontend | React 19 + Ionic 8 + TypeScript (strict) |
| State | MobX 6 (observables, autorun, runInAction) |
| Build | Vite |
| Broker API | @tastytrade/api v6.0.1 (REST + DxLink WebSocket) |
| Auth | Firebase Auth (email/password) |
| Backend | Firebase Functions (AES-256 credential storage) |
| Hosting | Firebase Hosting |
| Date istorice | Polygon.io (through Firebase Functions proxy) |
| Testing | Cypress (E2E) |

### Servicii (14 servicii, ServiceFactory pattern)

| Serviciu | Rol |
|----------|-----|
| MarketDataProvider | WebSocket streaming, options chains, greeks, quotes |
| BrokerAccount | Balante cont, portfolio greeks aggregate |
| IronCondorAnalytics | Tracking YTD, win/loss, P&L per ticker/luna |
| IronCondorSavior | Cautare pozitii de salvare |
| TradingDashboard | P&L agregat, net liquidity history |
| Positions | Pozitii curente cu detectie de conflicte |
| WatchlistData | Watchlist real-time cu auto-refresh |
| Settings | Preferinte filtre strategie |
| Tickers | Search simboluri si recent tickers |
| Backtest | Simulare pe date istorice |
| Credentials | Stocare securizata credentiale TastyTrade |
| Storage | Persistenta locala |
| Logger | Diagnostice aplicatie |
| Language | Suport i18n |

### WebSocket si Date Real-Time

TastyScanner se conecteaza la DxLink WebSocket pentru streaming de:
- **Quotes** (bid/ask) — pentru calcul mid price
- **Greeks** (delta, gamma, theta, vega) — pentru fiecare optiune
- **Trades** — ultimul pret tranzactionat

**Critical:** Formatul simbolurilor difera:
- TastyTrade REST: `QQQ   260227C00665000`
- DxLink WebSocket: `.QQQ260227C665`
- Trebuie folosit mereu `streamer-symbol` pentru WebSocket

### Portfolio Greeks

Portfolio Greeks se calculeaza reactiv prin MobX autorun:
```
Pentru fiecare pozitie de optiuni:
  direction = "Short" ? -1 : 1
  multiplier = quantity x direction x 100

  totalDelta += greeks.delta x multiplier
  totalTheta += greeks.theta x multiplier
  totalGamma += greeks.gamma x multiplier
  totalVega  += greeks.vega  x multiplier
```

---

## Pagini si Componente Principale

### Iron Condor Builder (pagina principala)
- Selectare ticker din watchlist
- Afisare IV Rank, Beta, earnings date
- Filtre configurabile (delta, DTE, wings, POP, EV, Alpha)
- Acordeon per expirare cu toate IC-urile
- Buton "Best POP" — afiseaza doar cel mai bun POP din fiecare expirare
- Card-uri colorate: galben = best POP, albastru = best R/R, gradient = ambele
- Culori delta bias: verde = bullish, rosu = bearish, transparent = neutru
- Buton TRADE pe fiecare card

### Dashboard
- P&L summary, net liquidity chart
- IC open trades table cu CLOSE/HOLD/WAIT suggestions
- Profit-by-ticker breakdown

### Account Info (sidebar)
- Net Liquidity, Option BP, Stock BP, Cash, Maintenance
- Portfolio Greeks (Delta, Theta cu %, Gamma, Vega)
- Badge UNDER-DEPLOYED / OVER-EXPOSED (bazat pe theta/netLiq ratio)
- Position sizing rule (5% of net liq)
- Fractional Kelly cu interpretare

### Guvid History
- YTD performance cu stat cards
- Trades by Ticker table
- Monthly P&L table
- Daily P&L Calendar heatmap
- Trade History sortabila si filtrabila

### Backtest (stil OptionAlpha)
- Sectiuni colapsabile: Strategy Setup, Leg Selection, Capital, Position Entry, Exit Options, Backtest Options
- Test period chips (1Y, 2Y, 3Y, Custom)
- Rezultate cu equity curve, monthly table, ticker table, trade history
- Save/Load backtests in Firestore

---

## Performanta Reala (YTD 2026)

Bazat pe datele din aplicatie:

| Metrica | Valoare |
|---------|---------|
| Total closed trades | 380 |
| Win Rate | 88.1% |
| Total P&L | ~$90,000+ |
| Net Liquidity | ~$96,500 |
| W/L Ratio | 0.56 |
| Half-Kelly | 33.3% |

**Per Ticker:**
| Ticker | Trades | Win Rate | Total P&L |
|--------|--------|----------|-----------|
| SPX | 77 | 98.7% | $25,667 |
| QQQ | 129 | 96.1% | $24,724 |
| SPY | 107 | 96.3% | $21,621 |
| GLD | 33 | 57.6% | $12,212 |
| IWM | 32 | 87.5% | $6,122 |

**Per Luna:**
| Luna | Trades | Win Rate | P&L |
|------|--------|----------|-----|
| 2026-01 | 76 | 76.3% | $9,140 |
| 2026-02 | 189 | 95.2% | $46,373 |
| 2026-03 | 115 | 98.3% | $34,601 |

**Observatii:**
- GLD are win rate semnificativ mai mic (57.6%) dar P&L total bun — se pierd trade-uri mari dar se castiga si mai mult
- Ianuarie a avut win rate mai mic (76.3%) — posibil perioada de ajustare sau volatilitate crescuta
- Februarie si Martie au win rate exceptional (95-98%)

---

## Glossar de Termeni

| Termen | Definitie |
|--------|----------|
| **BTO** | Buy To Open — cumparare pentru deschidere pozitie |
| **STO** | Sell To Open — vanzare pentru deschidere pozitie |
| **BTC** | Buy To Close — cumparare pentru inchidere pozitie |
| **STC** | Sell To Close — vanzare pentru inchidere pozitie |
| **DTE** | Days To Expiration — zile pana la expirare |
| **BPE** | Buying Power Effect — capitalul blocat |
| **POP** | Probability of Profit — probabilitatea de profit |
| **EV** | Expected Value — valoarea asteptata |
| **IV** | Implied Volatility — volatilitate implicita |
| **IVR** | IV Rank — rangul IV pe 52 saptamani |
| **Wing** | Distanta intre short si long strike |
| **Credit** | Prima incasata la deschidere |
| **Debit** | Suma platita la inchidere |
| **Roll** | Inchiderea unei pozitii si deschiderea uneia noi cu alta data |
| **Theta** | Decay zilnic al valorii optiunii |
| **Delta** | Sensibilitatea la miscarea underlying-ului |
| **Gamma** | Rata de schimbare a delta |
| **Vega** | Sensibilitatea la schimbarea volatilitatii |
| **Net Liq** | Net Liquidity — valoarea totala a contului |
| **Sharpe** | Risk-adjusted return (return / volatilitate) |
| **Sortino** | Ca Sharpe dar masoara doar volatilitatea negativa |
| **Kelly** | Formula pentru position sizing optim |

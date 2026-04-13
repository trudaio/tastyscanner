# Iron Condor Best Practices — Research & Video Studies

Compilat din studii TastyTrade, Options With Davis, si alte surse. Referinta pentru optimizarea strategiilor Guvidul.

---

## Surse Studiate

1. **Options With Davis** — "The Most In-Depth Iron Condor Training on YouTube" (4h)
2. **Jim Schultz (TastyTrade)** — IC Management Framework
3. **Mike (TastyTrade)** — 3 Iron Condor Adjustments
4. **Options With Davis** — Managing Losing Iron Condors
5. **TastyTrade Research** — How Wide Should Iron Condors Be (12 ani, 1000+ trades, 2013-2025)

---

## Wing Width (CRITICAL — studiu 12 ani, 1000+ trades)

**$5 wings sunt NEPROFITABILE pe TOATE underlyings ($100-$500 pret)**

Regula de aur — wing width per pret underlying:
| Underlying Price | Wing Width Recomandat |
|-----------------|----------------------|
| $100 | $10 |
| $200 | $15 |
| $300 | $20 |
| $400 | $25 |
| $500 (QQQ) | $25-$30 |
| $6800 (SPX) | $25-$30+ |

- **$20 wings**: best performer across the board
- Toate studiile: 45 DTE entry, 16 delta short strikes, managed at 21 DTE
- Wings mai mici = slippage mare, nevoie de mai multe contracte, profitabilitate mai mica

## DTE Sweet Spot: 45-60 zile

Bazat pe studiul TastyTrade 1993-2026 (30 ani de date):
- **Sub 45 DTE**: expected move NU depaseste realized move → dezavantaj statistic
- **45-60 DTE**: expected move > realized move → avantaj statistic
- **Peste 60 DTE**: theta decay scade, premium per day scade
- **Sweet spot**: 45-60 DTE la entry

## Delta Sweet Spot: 16-20

- 20 Delta pe ambele parti = ~68% POP teoretic, dar **77%+ real** (IV overstates RV)
- TastyTrade research: 16 delta short strikes, cel mai studiat si validat
- Studiul Options With Davis (100 trades strangle): **77% win rate** la ~20 delta
- IV overstatement confirmat pe SPY, QQQ, IWM in TOATE mediile de volatilitate

## Expected Move vs Realized Move

- IV overstates RV in mod constant, pe toate time-frame-urile de 45+ DTE
- SPY: expected move > realized move in toate nivelurile de IV (low, medium, high)
- QQQ: acelasi pattern, chiar mai pronuntat (QQQ mai volatil)
- IWM: acelasi pattern
- **Actul occurrences in range: 85%** (vs 68% teoretic bazat pe delta)

## Entry Rules

- **Credit target**: 1/3 din wing width (Jim Schultz)
  - $10 wings → target $3.33 credit
  - $20 wings → target $6.67 credit
  - $25 wings → target $8.33 credit
- **Minimum credit**: proportional cu wing width, nu fix $1
- **Timing**: 45-60 DTE la entry

## Exit Rules

### Winners
- **50% of max profit** (Jim Schultz, TastyTrade research)
  - Cel mai validat exit target
  - Mai bun risk-adjusted return decat 75% sau hold to expiration
- **21 DTE management point**: daca nu ai atins take-profit, inchide/roll la 21 DTE
  - Sub 21 DTE: gamma risk creste, assignment risk creste
  - Studiul TastyTrade: exit la 21 DTE > hold to expiration

### Losers
- **NU pune stop-loss** fix (studiu TastyTrade: stop-loss la 2x credit REDUCE profitul)
- **Narrow ICs ($5-$10)**: sit and wait, roll la 21 DTE daca poti lua credit
- **Wide ICs ($15-$25)**: roll untested side (se comporta ca strangle)
  - Stock moves up → roll put spread UP
  - Stock moves down → roll call spread DOWN
- **In profit zone (intre break-evens)**: NU face nimic — lasa theta sa lucreze
- **Past break-even, >21 DTE**: ai timp, nu panica
- **Past break-even, <21 DTE**: management activ necesar (assignment risk)

### Scratch Trades
- Verifica IVR la 21 DTE
- IVR inca ridicat → pastreaza pozitia
- IVR a scazut → inchide pozitia

## IC Adjustments (3 tipuri)

1. **Stock up → Roll put spread UP** (creeaza iron fly)
   - Colecteaza credit suplimentar
   - Reduce max loss
   - Reduce profit zone (mai greu de profitat)

2. **Stock down → Roll call spread DOWN**
   - Colecteaza credit suplimentar
   - Reduce max loss

3. **Near expiration → Roll INTREAGA pozitie** la urmatoarea expirare
   - Minim 45 DTE pe noua expirare
   - Trebuie sa iei credit pe roll (nu debit)

## Skewed Iron Condor (Index ETFs)

- Index ETFs (SPX, QQQ, IWM) au **put skew** → put side mai scump
- Skewed IC: 16 delta pe ambele short strikes, 5 delta pe long strikes
- Rezultat: put side mai larg decat call side (natural)
- Standard IC ($10 wide ambele parti) e OK pentru incepatori

## Jade Iron Condor

- Varianta cu put spread mai larg si call spread mai ingust
- **85% win rate** (vs ~70% standard IC)
- Bullish bias natural
- Colecteaza mai mult credit pe put side

## Common Mistakes

1. **Wings prea inguste** ($2-$5) — cel mai mare mistake (studiu 12 ani confirma)
2. **DTE prea scurt** (sub 45 zile) — expected move < realized move
3. **Panic closing** cand e in profit zone — lasa theta sa lucreze
4. **Stop-loss fix** — reduce profitul pe termen lung
5. **Nu roll-uiesti** untested side pe wide ICs
6. **Hold past 21 DTE** fara management — assignment risk

## Key Statistics

| Metric | Value | Source |
|--------|-------|--------|
| Typical IC win rate | 65-68% (teoretic) | TastyTrade |
| Actual IC win rate (IV overstatement) | 77%+ | Options With Davis (100 trades) |
| Expected move accuracy >45 DTE | 85% in range | TastyTrade (30 years) |
| Optimal exit | 50% max profit | Jim Schultz / TastyTrade |
| Management point | 21 DTE | All sources |
| Min profitable wings | $10 | TastyTrade Research (12 years) |
| Best wings for $500 underlying | $25-$30 | TastyTrade Research |
| Best delta for short strikes | 16 | TastyTrade Research |

---

## Entry: Credit Target = 1/3 Wing Width (Jim Schultz, TastyTrade)

Confirmat si de lifecycle video: la 44 DTE, 24 delta, $15 wings pe QQQ → credit $4.82 (≈1/3 din $15).
- Nu intra in trade daca creditul e sub 1/4 din wing width
- Nu intra daca creditul e peste 1/2 din wing width (delta prea mare, risc prea mare)

## Rolling Iron Condors (Lifecycle of a Trade — Jim Schultz)

Exemplu real QQQ $15 wide IC, 44 DTE, 24 delta:
1. **Stock challenges call side** → roll untested put spread UP (aduna credit, reduce delta)
2. **Roll la expirare urmatoare** → roll call spread la strikes mai inalte, colecteaza credit pe roll
3. **Buying power expansion** pe roll: temporar folosesti mai mult capital (ai 2 spread-uri active)
   - Fix: inchide put spread mai intai, apoi roll call spread separat
4. **Massage deltas**: nu merge la neutral perfect, leana directional daca ai convingere
5. **Net credit tracking**: urmareste creditul total acumulat peste toate roll-urile

## OptionAlpha — Bot Template $30K Iron Condor Portfolio

### Position Sizing (Kirk Du Plessis)
- **50% cash always** — nu investi niciodata tot capitalul
- **4-5% risk per symbol** — $30K portfolio → max $1,200-$1,500 risk per symbol
- **10 uncorrelated ETFs**: SPX/XSP, EEM, TLT, XRT, GLD, XLY/XLU, XOP, etc.
- Target: diversificare maxima pe sectoare necorelate

### Sequence of Return Risk
- La 70% POP: 1 din 4 trades pierde, 1 din 11 au 2 pierderi consecutive
- De aceea position sizing mic: sa supravietuiesti 10-20 pierderi consecutive (probabilitate foarte mica dar non-zero)
- **NU risca 50% pe un trade** chiar daca POP e 70%

### Trade Frequency & Overlap
- Cu capital mic ($3K): 1 pozitie per simbol pe luna → prea putine trades, depinzi de noroc
- Cu capital mare ($30K): overlap-uri → 2-3 pozitii active pe simbol simultan
- **Mai multe trades = convergenta mai rapida la edge-ul statistic**
- Target: 100+ trades/an pentru rezultate semnificative statistic

### Bot Parameters (OptionAlpha)
- **Entry**: 65-70% POP, EV > $5, IVR > 20
- **Exit**: 30% of max profit (mai conservator decat 50%)
- **Filters**: positive expected value, minimum implied volatility
- **Watch list**: 10 uncorrelated ETFs ranked by IVR

### Scaling Strategy
| Portfolio Size | Cash | Position Size | Symbols | Risk/Symbol |
|---------------|------|---------------|---------|-------------|
| $3,000 | $1,500 | ~8% | 6 | ~$250 |
| $10,000 | $5,000 | 5% | 8 | ~$500 |
| $30,000 | $15,000 | 4% | 10 | ~$1,200 |
| $100,000 | $50,000 | 3-4% | 10+ | ~$3,000-$4,000 |

## Iron Condor Setup (OptionAlpha IC 101)

### Payoff Diagram Mental Model
- Gandeste IC-ul ca un **range** in jurul pretului curent
- Stock-ul poate merge sus/jos, dar trebuie sa ramana IN range la expirare
- Poti fi temporar in pierdere (stock trece de break-even) si tot sa castigi daca revine

### Max Loss Calculation
- **Max Loss = Wing Width - Credit Received**
- Ex: $5 wings, $2 credit → Max Loss = $3 ($300 per contract)

### IC ca Short Strangle + Protection
- Short strangle: premium mare DAR risc nelimitat
- IC = short strangle + long wings → premium mai mic DAR risc definit
- Trade-off: platesti pentru protectie, dar dormi linistit

### Automation Principles (OptionAlpha Bot)
- **Entry automation**: scaneaza zilnic, intra automat cand filtrele sunt indeplinite
- **Exit automation**: close automat la 30% profit
- **No manual intervention**: botul ruleaza singur, nu necesita decizii zilnice
- **Consistency > perfection**: 100 trades mediocre > 10 trades "perfecte"

## Weekly Income Strategy (Rick — 20 ani experienta)

### Iron Condor pentru Income Saptamanal
- Weekly expiration (7 DTE) pentru income frecvent
- Target: 70%+ probability of max profit, <30% probability of max loss
- Scanner tools (Option Samurai): filtreaza automat dupa POP si risk

### Adjustment When Tested
- Inchide spread-ul care pierde (buy back)
- Deschide spread nou la strike-uri mai sigure
- **Atentie**: adjustment reduce max profit si creste max loss potential
- Roll doar daca esti confident in directia noua

## Key Differences: Conservative vs Aggressive Approaches

| Aspect | Conservative (OptionAlpha) | Balanced (TastyTrade) | Aggressive (Weekly) |
|--------|--------------------------|----------------------|-------------------|
| DTE | 45-60 | 40-50 | 7 (weekly) |
| Exit | 30% profit | 50% profit | Hold to expiration |
| POP target | 65-70% | 68%+ | 70%+ |
| Position size | 3-5% | 5% | Varies |
| Cash reserve | 50% | 30-50% | Varies |
| Management | Automated bot | Manual at 21 DTE | Manual rolling |
| Best for | Consistency, scaling | Balance risk/reward | Maximum income |

---

## Hidden Cost of Playing Safe — ICs vs Strangles (TastyTrade Research)

### IC Wings Cost You 25-40% of Credit
- Adding 10 delta wings to a 20 delta strangle:
  - Reduces buying power by 85%
  - Reduces max profit by 48%
  - **Probability of hitting max loss pe IC = 3x mai mare decat pe strangle**
- Concluzie: defined risk costa — platesti 25-40% din credit pentru wings

### Narrow ICs = Spinning Wheels
- Narrowing wings reduces credit, BPR, si risk proportional la fel
- Nu optimizezi nimic — doar faci trade-ul mai mic
- **"We got out of the narrow iron condor business a long time ago"** — TastyTrade

### IVR Matters A LOT
- High IV stocks: BPR increase mult mai mic la strangles vs low IV
- Trade IC-uri si strangles DOAR pe underlyings cu IV ridicat
- Low IV = grind greu, spread mic, nu merita

### Sizing Up ICs = More Risk Than Strangles
- Daca maresti contractele pe IC (in loc de strangle), riscul creste MAI MULT
- IC-urile au P&L swings mai mici dar **max loss occurrences mai frecvente**
- Avg P&L pe strangle > avg P&L pe IC

### Recommendations by Account Size
| Account Size | Preferred Strategy |
|-------------|-------------------|
| < $25,000 | Iron Condors (defined risk) |
| $25,000 - $100,000 | Mix IC + Strangles |
| > $100,000 | Lean into strangles (undefined risk) |

## Strangles vs Iron Condors — Ultimate Guide (TastyTrade)

### Greeks Comparison
| Greek | IC | Strangle | Ratio |
|-------|-----|---------|-------|
| Delta | ~0 | ~0 | Same |
| Vega | Low | High | Strangle has more vol sensitivity |
| Theta | Low | High | **Strangle earns 8x more theta** |
| Gamma | Low | High | Strangle takes more directional risk |

### Key Insight: IC = Strangle + Wings (Red Bull)
- Start cu strangle → add one wing = Jade Lizard → add second wing = Iron Condor
- Move one wing = Skewed IC, add contracts = Unbalanced IC
- **Wider is always better**: widening wings → higher realized return on capital over time

### Don't Get Seduced by Tight ICs
- Tight IC: "I can make $7, lose $3" — looks great on paper
- Reality: probability of making that money is very small
- **Wider wings = higher realized return on capital over time** (research confirmed)

## IC Adjustment: Roll to Butterfly (Visual Simulation — ProjectOption)

### Adjustment Strategy: Short Strike Tested → Roll to Butterfly
1. When stock hits short strike (put or call side)
2. Close the OPPOSING (untested) spread
3. Sell new spread at the SHORT STRIKE of the tested side
4. Result: iron condor → iron butterfly

### Benefits
- Colecteaza credit suplimentar pe adjustment
- **Reduce max loss cu 40-50%** (ex: $700 → sub $400)
- Position becomes defensive — nu mai targetezi profit mare

### Key Detail: Keep Far OTM Long Option
- Daca long option-ul din spread-ul inchis valoreaza sub $0.05 → NU il inchide
- Pastreaza-l ca "lottery ticket" — costa $0 practic dar are upside potential
- Exemplu: 225 call la $0.03 → pastreaza

### Time Decay Visualization
- T+0 line: IC pierde bani daca stock-ul se misca azi
- T+8 line: mai mult profit daca stock-ul e in range
- T+16 line: aproape max profit daca stock-ul e in range
- **Theta decay accelereaza dramatic dupa T+16 (sub 10 DTE)**

## Legging Out IC — Research Study (TastyTrade, 72 scenarios)

### Setup: 3 ani de date, SPX iron condors
- Testat 72 combinatii: 6 profit targets x 4 leg-out thresholds x 3 leg-out types (put/call/both)
- Profit targets: 15%, 20%, 25%, 30%, 35%, 40%, 50%
- Leg-out thresholds: $0.25, $0.50, $0.75, $1.00

### CRITICAL FINDINGS

**1. Best Profit Target: 25% (confirmat)**
- 25% profit target optimal across ALL scenarios
- Sub 25% (15-20%): lasi premium pe masa
- Peste 30% (35-50%): performance scade semnificativ — greedy = pierderi

**2. Legging Out Does NOT Beat Standard IC Management**
- Win rate: identic intre toate strategiile (~81-88%)
- Avg P&L: standard IC management la 25% target = best
- Legging out ONE side: marginal, nu justifica complexitatea

**3. NEVER Leg Out Both Sides**
- Managing both sides = **WORST performer** din toate 72 scenarios
- **Singura strategie care produce P&L negativ** pe 3 ani de date
- Both sides tested = extremely rare, but when you manage both, you hemorrhage premium

**4. Win Rate e controlat de Profit Target, nu de Leg-Out**
- 15% target → ~90% win rate (dar P&L mic)
- 25% target → ~85% win rate (sweet spot)
- 50% target → sub 80% win rate (risky)

### Takeaway
- **Nu complica**: intra ca IC, iesi ca IC la 25% profit
- Daca vrei sa leg out, fa-o pe UN SINGUR side (preferabil put side)
- **NICIODATA** nu manage ambele sides — rezultate garantat mai proaste

---

## MASSIVE IC Management Study — 71,000 Trades, 10 Years SPY (ProjectOption)

**Cel mai important studiu din toate cele analizate.** 10 ani de date (2007-2017), SPY, 16 combinatii de management, 2 IC variations.

### Setup
- **Ticker**: SPY (S&P 500 ETF)
- **Period**: Jan 2007 - Mar 2017
- **Entry**: every single trading day
- **Target expiration**: closest to 45 DTE (lands between 30-60 DTE)
- **Two IC variations**:
  - **16 Delta IC**: sell 16Δ short, buy 5Δ long (~40,000 trades)
  - **30 Delta IC**: sell 30Δ short, buy 16Δ long (~30,000 trades)
- **16 management combos**: profit targets (25%, 50%, 75%, 100%) x loss limits (exp, -100%, -200%, -300%)

### RESULTS — 16 Delta Iron Condors (Far OTM shorts)

**Without VIX filter:**
- **Best profit expectancy (45-day adjusted, after commissions): 50-75% profit target**
- 25% profit target: highest win rate BUT lowest profit expectancy (commissions eat profits)
- Hold to expiration: highest avg P&L per trade BUT NOT highest when time-adjusted
- Taking losses (100-200% of credit) slightly helps vs hold to expiration

**With VIX filter (CRITICAL):**
- **HIGH VIX entries = highest profit expectancy across ALL approaches**
- Low VIX (< 14): modest profits, marginal
- High VIX (> 23.2): **best performers by far** at 50-100% profit targets
- 25% profit in high VIX: actually NEGATIVE expectancy (too early exit in volatile market)

**OPTIMAL for 16Δ ICs: Enter in high VIX, take profit at 50-75%**

### RESULTS — 30 Delta Iron Condors (Closer to ATM shorts)

**Without VIX filter:**
- **Best: 25% profit target** (opposite of 16Δ ICs!)
- Short strikes closer to ATM = more frequent testing = need to take profits EARLIER
- Holding longer = more losers

**With VIX filter (CRITICAL):**
- **HIGH VIX = dramatically better** (even more than 16Δ ICs)
- Low VIX (< 14): **many approaches have NEGATIVE profit expectancy**
- Medium VIX (14-23): marginal
- High VIX (> 23.2): **best performing by huge margin**

**OPTIMAL for 30Δ ICs: ONLY trade in high VIX (> 23), take profit at 25%**

### Key Formula: 45-Day Adjusted P&L

```
adjusted_pnl = avg_pnl_per_trade × (45 / avg_time_in_trade) - commissions
```

This normalization is CRITICAL because earlier exits = shorter time in trade = more trades per period. Without it, hold-to-expiration looks best but isn't when you account for capital reuse.

### Summary Table — Optimal Management by IC Type

| IC Type | Optimal Profit Target | Loss Management | VIX Requirement | Key Insight |
|---------|---------------------|-----------------|----------------|-------------|
| **16Δ IC** (far OTM) | 50-75% | 100-200% or exp | High VIX preferred | Can hold longer, more patient |
| **30Δ IC** (near ATM) | 25% | Any | **HIGH VIX ONLY** | Must exit fast, only works in high vol |

### Implications for Guvidul Strategies

| Guvidul Profile | Maps To | Optimal Exit | VIX Filter |
|----------------|---------|-------------|------------|
| **Conservative** (delta 11-16) | ~16Δ IC | 50-75% profit | Any VIX OK |
| **Neutral** (delta 11-24) | Mix 16-30Δ | 50% profit | Prefer high VIX |
| **Aggressive** (delta 18-24) | ~30Δ IC | 25% profit | **HIGH VIX ONLY** |

### Commission Impact
- $1/contract × 4 legs × 2 (open+close) = **$8 per IC round-trip**
- 25% profit target = most trades = most commissions = biggest drag
- **For 16Δ ICs**: commissions make 25% target the WORST despite highest win rate
- **For 30Δ ICs**: 25% target STILL best because higher per-trade P&L offsets commissions

---

# APPENDIX — Sinteza Top 100 YouTube IC Videos (sursa: iron_condor_training.md)

Material complementar din analiza top 100 YouTube videos despre IC. Doar continut UNIC fata de sectiunile de mai sus.

## A1. 0DTE Iron Condor Framework (SPX)

SPX are expirari **Luni / Miercuri / Vineri** (0DTE). Marti / Joi se folosesc 1DTE.

### Diferente vs 30-45 DTE

| Factor | 0DTE | 30-45 DTE |
|--------|------|-----------|
| Theta decay | Extrema (intraday) | Gradual |
| Gamma risk | Extrema langa strikes | Moderata |
| Time to adjust | Ore | Zile |
| Position size | Mai mic | Standard |
| Win rate | Mare dar profit mic | Moderat, profit mai mare |

### Sasha the Options Coach — 0DTE timing

- **Best entry**: 11am-12pm ET dupa volatility settle
- **Strikes**: ±0.3-0.5% de la pretul curent
- **Credit target**: $1-3 pe spread $5 wide pe SPX
- **Management**: Close la 50% profit OR cu 15 min inainte de close

### Theta Profits — studiu 9000+ trade-uri 0DTE pe SPX

- Win rate: **~40% individual wins** (mai mic decat 30-45 DTE)
- DAR: average win >> average loss (asymmetric payoff)
- "Breakeven Iron Condor" (premium egal pe ambele parti) consistent profitable
- Cheia: **position sizing** + nu over-trade in zile volatile
- AVOID: zile cu CPI/FOMC/jobs report

## A2. Strategy Comparison — IC vs Alternatives

| Strategy | Structure | Use Case |
|----------|-----------|----------|
| **Iron Condor** | 4 legs, defined risk | Neutral, range-bound |
| **Short Strangle** | 2 legs, undefined risk | Neutral, high IV, large account |
| **Iron Butterfly** | 4 legs, ATM short strikes | Pinpoint neutral, narrow range |
| **Jade Lizard** | Put spread + naked call | Slight bullish bias |
| **Broken Wing Butterfly** | Unbalanced condor | Eliminate one-sided risk |
| **Calendar Spread** | Same strike, diff expirations | Flat spot, rising IV |

### IC vs Iron Butterfly

- **Iron Butterfly**: short ATM = credit mai mare, profit zone mai ingusta, max loss potential mai mare
- **Iron Condor**: short OTM = credit mai mic, profit zone mai larga, mai forgiving la miscari mici

### Jade Lizard
- Put spread + naked call = no upside risk (call premium > put spread width)
- Bias usor bullish — colectezi premium pe ambele parti dar nu poti pierde sus

### Broken Wing Butterfly
- Wings asimetrice — eliminates downside (sau upside) risk complet
- Trade-off: max profit redus pe partea cu wing larg

## A3. EV (Expected Value) — Calcul Explicit

```
EV = (P(win) × Average Win) − (P(loss) × Average Loss)
```

**Exemplu fara management:**
- 70% win × $150 win medie − 30% × $350 loss medie = $105 − $105 = **$0 EV**

**Cu management 50% profit target:**
- 78% win × $100 (average win mai mic) − 22% × $400 (loss mai mare cand pierzi) = $78 − $88 = **slightly negative**

**Edge-ul vine din**:
1. Selectia high-IV environments (IVR > 30, ideal > 50)
2. Avoiding earnings + macro events
3. Wing width potrivit (NU $5 — vezi studiul 12-yr)
4. Disciplina pe 50% profit target + 2× credit stop loss

## A4. Position Sizing — Kelly Criterion

**Formula Kelly pentru IC:**
```
P(win) = 0.68 (16-delta default)
Win/Loss ratio = 0.5 (credit / max loss)
Kelly fraction ≈ 0.36 (full Kelly)
```

- **Recomandare practica**: 1/4 Kelly = **9% of capital per trade** (TEORETIC)
- **Realitate**: cei mai succesfuli traderi folosesc **2-5% per pozitie**
- Half-Kelly vs Full-Kelly: half = lower drawdown, similar long-term return

**Implicatii pentru Catalin (NLV ~$X):**
- 5% rule = max risk per trade (compatibil cu sizing-ul tau actual)
- Total portfolio theta target: 0.1-0.5% NLV/zi
- Max simultaneous positions: 5-10 (in linie cu regula ta de 5-6/expirare)

## A5. SKY VIEW TRADING Framework (5 pasi)

Strategie compacta cu 1.3M views:
1. Enter at high IV (IV Rank > 30%)
2. Target 1/3 credit of spread width
3. Manage at 50% profit
4. Roll untested side closer when one threatened
5. Exit entire position at **2× credit loss**

## A6. Adjustment Decision Tree (Quick Reference)

```
Is profit > 50%?           → CLOSE (take profit)
Is loss > 2× credit?       → CLOSE (cut loss)
Is DTE ≤ 21?               → CLOSE (avoid gamma)
Is one side tested?        → EVALUATE roll

Price near short PUT:
  → Roll untested CALL side DOWN for credit
  → OR roll put spread DOWN/OUT for credit
  → Last resort: take the loss

Price near short CALL:
  → Roll untested PUT side UP for credit
  → OR roll call spread UP/OUT for credit
  → Last resort: take the loss
```

## A7. Skew (puts > calls IV)

**Realitate de piata:** put-urile au tipic IV mai mare decat call-urile la acelasi delta.

**Implicatii pentru Catalin:**
- 16-delta put = strike mai aproape de spot decat 16-delta call
- Asta inseamna IC simetric pe delta = ASYMMETRIC pe distanta
- Daca vrei distanta egala (wings simetrice), foloseste delta diferit (ex. 16 put + 14 call)

## A8. Backtesting Metrics — KPI Reference

Pentru evaluarea oricarei strategii IC:
- **Win Rate**: % trade-uri profitable
- **Profit Factor**: gross profit / gross loss (target > 1.5)
- **Avg P&L per trade**: trebuie pozitiv
- **Max Drawdown**: cea mai mare scadere peak-to-trough
- **Sharpe Ratio**: target > 1.0 (return / volatility)
- **Sortino Ratio**: ca Sharpe dar doar downside vol
- **Calmar Ratio**: annual return / max drawdown

## A9. Common Mistakes — Lista Definitiva (TastyTrade)

1. **Sizing prea mare** — peste 5% portfolio per trade
2. **Ignori IV Rank** — IV prea mic = premium insuficient
3. **No exit plan** — trebuie sa decizi profit target + stop INAINTE de entry
4. **Over-adjusting** — rolling multiple ori = comisioane + risc
5. **Trading prin earnings** — IV crush merge contra ta daca direction wrong
6. **Letting positions go to max loss** — manage la 2× credit ALWAYS

### Why You're Losing on ICs (ProjectOption real trader analysis)
- Take profits too early (under 50%) reduces edge
- Hold losers too long destroys account
- Ignore skew when picking strikes
- Underestimate gamma in last week

## A10. Top YouTube Creators (referenta)

| Creator | Channel | Focus |
|---------|---------|-------|
| Chris Butler | projectoption | In-depth tutorials, data studies |
| Tom Sosnoff | tastylive | Systematic, research |
| Kirk Du Plessis | Option Alpha | Automation |
| Davis | Options With Davis | Beginners step-by-step |
| Sasha | Sasha the Options Coach | Weekly income, SPX 0DTE |
| Henry | Invest with Henry | Small accounts |
| Pushkar Raj Thakur | (Indian channel) | Large following |
| - | Volatility Trading Strategies | Rules-based |

---

*Ultima actualizare: 2026-04-13*
*Surse adaugate: iron_condor_training.md (sinteza top 100 YouTube videos), iron_condor_youtube_top100.csv (referinta)*
*Surse originale: 14 video-uri YouTube analizate complet*
*Autori: Options With Davis, Jim Schultz (TastyTrade), Mike (TastyTrade), TastyTrade Research Team, Kirk Du Plessis (OptionAlpha), Rick, Chris Butler (ProjectOption), Ben (TastyTrade), Sasha the Options Coach, Theta Profits, SKY VIEW TRADING*

import React from 'react';
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonMenuButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
} from '@ionic/react';
import styled from 'styled-components';

const PageContent = styled.div`
    max-width: 900px;
    margin: 0 auto;
    padding: 16px;
`;

const SectionTitle = styled.h2`
    font-size: 1.4rem;
    font-weight: 700;
    margin: 32px 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--ion-color-tertiary);
    color: var(--ion-color-tertiary);

    &:first-child {
        margin-top: 8px;
    }
`;

const GuideCard = styled(IonCard)`
    margin: 12px 0;
`;

const CardTitleBox = styled(IonCardTitle)`
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Symbol = styled.span`
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--ion-color-tertiary);
`;

const FormulaBox = styled.div`
    background: var(--ion-color-light);
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    font-family: 'Courier New', monospace;
    font-size: 0.95rem;
    border-left: 4px solid var(--ion-color-tertiary);
`;

const InterpretBox = styled.div`
    background: rgba(76, 175, 80, 0.08);
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    border-left: 4px solid var(--ion-color-success);
    font-size: 0.93rem;
`;

const WarningBox = styled.div`
    background: rgba(255, 152, 0, 0.08);
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    border-left: 4px solid var(--ion-color-warning);
    font-size: 0.93rem;
`;

const Intro = styled.p`
    font-size: 1rem;
    line-height: 1.6;
    color: var(--ion-text-color);
    margin-bottom: 24px;
`;

export const GuvidGuidePage: React.FC = () => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>Guvid Guide</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <PageContent>
                    <Intro>
                        This guide explains the metrics used in Operatiunea Guvidul to
                        evaluate Iron Condor strategies: the option Greeks, strategy
                        metrics, Strategia Guvidul itself, and the technical indicators
                        (RSI, Bollinger Bands, ATR) shown in the ticker header.
                    </Intro>

                    {/* ============ THE GREEKS ============ */}
                    <SectionTitle>The Greeks</SectionTitle>

                    {/* DELTA */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>&Delta;</Symbol> Delta</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Delta measures how much an option's price changes for every $1 move
                                in the underlying stock. It ranges from 0 to 1 for calls and 0 to -1 for puts.
                            </p>
                            <FormulaBox>
                                IC Delta = Short Put &Delta; + Long Call &Delta; - Long Put &Delta; - Short Call &Delta;
                            </FormulaBox>
                            <p>
                                For an Iron Condor, <strong>net delta</strong> tells you the directional bias
                                of the position. A delta near zero means the trade is market-neutral.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>Delta &asymp; 0</strong> &mdash; Neutral position, profits if the stock stays in the range<br/>
                                &bull; <strong>Delta &gt; 0 (positive)</strong> &mdash; Bullish bias, benefits from upward moves<br/>
                                &bull; <strong>Delta &lt; 0 (negative)</strong> &mdash; Bearish bias, benefits from downward moves
                            </InterpretBox>
                            <WarningBox>
                                <strong>Short strike delta</strong> also indicates probability of expiring ITM.
                                A 24&Delta; short put has roughly a 24% chance of being breached at expiration.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* THETA */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>&Theta;</Symbol> Theta</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Theta measures how much value an option loses each day due to the passage
                                of time, all else being equal. This is also called <strong>time decay</strong>.
                            </p>
                            <FormulaBox>
                                IC Theta = Long Put &Theta; + Long Call &Theta; - Short Put &Theta; - Short Call &Theta;
                            </FormulaBox>
                            <p>
                                As a premium seller, theta is your best friend. Every day that passes,
                                the options you sold lose value &mdash; and that value becomes your profit.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>Positive theta</strong> &mdash; You earn money each day (this is what you want as a seller)<br/>
                                &bull; The value shown is your estimated daily profit from time decay alone<br/>
                                &bull; Example: Theta = 13.45 means you earn ~$13.45/day from time decay
                            </InterpretBox>
                            <WarningBox>
                                Theta accelerates as expiration approaches. The last 21 days have the
                                fastest decay.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* GAMMA */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>&Gamma;</Symbol> Gamma</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Gamma measures the rate of change of delta for every $1 move in the
                                underlying. It tells you how quickly your directional exposure changes.
                            </p>
                            <FormulaBox>
                                Gamma = Rate of change of Delta per $1 move
                            </FormulaBox>
                            <p>
                                For Iron Condors, gamma is typically negative &mdash; meaning large moves
                                in either direction are bad for your position.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>Negative gamma</strong> &mdash; Normal for Iron Condors. Large moves hurt you.<br/>
                                &bull; <strong>Higher absolute gamma</strong> &mdash; Your delta changes faster, meaning more risk from big moves<br/>
                                &bull; Gamma increases as expiration approaches, making short positions riskier near expiry
                            </InterpretBox>
                            <WarningBox>
                                Gamma risk is highest at-the-money and near expiration.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* VEGA */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>V</Symbol> Vega</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Vega measures how much an option's price changes for every 1% change
                                in implied volatility (IV). It indicates your exposure to volatility changes.
                            </p>
                            <FormulaBox>
                                Vega = Change in option price per 1% change in IV
                            </FormulaBox>
                            <p>
                                As a premium seller, you want volatility to decrease after you enter a trade.
                                When IV drops, the options you sold lose value &mdash; which is profit for you.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>Negative vega</strong> (typical for IC) &mdash; You profit when IV decreases<br/>
                                &bull; <strong>Positive vega</strong> &mdash; You profit when IV increases<br/>
                                &bull; This is why we prefer entering trades when IV Rank is high (&gt;30) &mdash; IV is more likely to revert lower
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* ============ STRATEGY METRICS ============ */}
                    <SectionTitle>Strategy Metrics</SectionTitle>

                    {/* POP */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>%</Symbol> POP (Probability of Profit)</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                POP estimates the probability that the Iron Condor will be profitable
                                at expiration. It is derived from the delta of the options at the
                                breakeven points.
                            </p>
                            <FormulaBox>
                                Put Breakeven = Short Put Strike - Credit Received<br/>
                                Call Breakeven = Short Call Strike + Credit Received<br/>
                                <br/>
                                POP = 100% - max(Put BE Delta, Call BE Delta)
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>POP 75-85%</strong> &mdash; Ideal range for Iron Condors<br/>
                                &bull; <strong>POP &gt; 85%</strong> &mdash; Very safe but low credit received<br/>
                                &bull; <strong>POP &lt; 70%</strong> &mdash; Higher credit but the risk may not be worth it
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* EV */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>EV</Symbol> Expected Value</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Expected Value is the statistical average outcome if you placed this
                                exact same trade thousands of times. It combines your probability of
                                profit with the potential gain and loss.
                            </p>
                            <FormulaBox>
                                Max Profit = Credit &times; 100 (per contract)<br/>
                                Max Loss = (Wing Width - Credit) &times; 100<br/>
                                <br/>
                                EV = (POP &times; Max Profit) - ((1 - POP) &times; Max Loss)
                            </FormulaBox>
                            <p>
                                A positive EV means the trade has a statistical edge &mdash; over many
                                trades, you are expected to come out ahead.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>EV &gt; $0</strong> (green) &mdash; The trade has a positive mathematical edge<br/>
                                &bull; <strong>EV &lt; $0</strong> &mdash; The trade is expected to lose money over time. Avoid.<br/>
                                &bull; <strong>Higher EV</strong> &mdash; Larger expected profit per trade on average
                            </InterpretBox>
                            <WarningBox>
                                EV assumes you hold to expiration. In practice, closing at 75% of max profit
                                improves real-world results because it eliminates the tail risk of late reversals.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* ALPHA */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>&alpha;</Symbol> Alpha</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Alpha represents the expected return on risk. It normalizes EV by the
                                maximum loss, giving you a percentage that shows how much edge you're
                                getting per dollar risked.
                            </p>
                            <FormulaBox>
                                Alpha = (EV / Max Loss) &times; 100%
                            </FormulaBox>
                            <p>
                                This is the primary sorting metric in the scanner. Higher alpha means
                                more edge per unit of risk.
                            </p>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>Alpha &gt; 40%</strong> &mdash; Excellent edge, prioritize these trades<br/>
                                &bull; <strong>Alpha 20-40%</strong> &mdash; Good edge, solid trade candidates<br/>
                                &bull; <strong>Alpha &lt; 20%</strong> &mdash; Marginal edge, consider skipping<br/>
                                &bull; <strong>Alpha &lt; 0%</strong> &mdash; Negative expected return. Do not trade.
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* RISK/REWARD */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>R:R</Symbol> Risk/Reward Ratio</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                The risk/reward ratio compares the maximum potential loss (wing width)
                                to the credit received. It tells you how much you're risking to earn $1.
                            </p>
                            <FormulaBox>
                                Risk/Reward = Wing Width / Credit
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>R:R &lt; 2.0</strong> &mdash; Excellent. Risking less than 2x the premium collected<br/>
                                &bull; <strong>R:R 2.0 - 3.0</strong> &mdash; Good. Standard for Iron Condors<br/>
                                &bull; <strong>R:R &gt; 3.0</strong> &mdash; High risk relative to reward. Be cautious.
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* BPE */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox><Symbol>$</Symbol> BPE (Buying Power Effect)</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                BPE is the amount of buying power (margin) required by your broker to
                                hold the position. For Iron Condors, this is the max loss of the wider
                                side of the spread.
                            </p>
                            <FormulaBox>
                                BPE = Max Loss = (Wing Width - Credit) &times; 100
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; BPE tells you the capital required per contract<br/>
                                &bull; Use the <strong>5% rule</strong>: never risk more than 5% of your net liquidity on a single trade<br/>
                                &bull; Example: Net Liq = $50,000 &rarr; Max BPE per trade = $2,500
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* ============ STRATEGIA GUVIDUL ============ */}
                    <SectionTitle>Strategia Guvidul</SectionTitle>

                    <GuideCard>
                        <IonCardContent>
                            <InterpretBox>
                                <strong>Strategia Guvidul</strong> este o abordare sistematica pentru Iron Condors,
                                destinata exclusiv <strong>indicilor</strong> (SPX, QQQ, IWM, RUT, SPY, GLD).
                                Selecteaza toate combinatiile de Iron Condor cu <strong>POP &gt; 75-80%</strong> pe
                                fiecare expirare pana in <strong>45-50 DTE</strong>.
                                Pozitiile se inchid la <strong>75% din profitul maxim</strong> sau se lasa sa expire.
                                Intrarile se fac la <strong>10:00 AM ora New York</strong> pentru lichiditate optima.
                                Short strike delta: <strong>16-22</strong>.
                            </InterpretBox>
                        </IonCardContent>
                    </GuideCard>

                    <GuideCard>
                        <IonCardContent>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--ion-color-tertiary)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px' }}>Parametru</th>
                                        <th style={{ textAlign: 'left', padding: '8px' }}>Regula</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Underlyings', 'Doar indici (SPX, QQQ, IWM, RUT, SPY, GLD)'],
                                        ['DTE la intrare', 'Pana in 45-50 zile, intrare la 10:00 AM NY'],
                                        ['Short Strike Delta', '16-22'],
                                        ['POP', '> 75-80%'],
                                        ['EV', '> $0 (pozitiv)'],
                                        ['Alpha', '> 30%'],
                                        ['Risk/Reward', '< 2.5'],
                                        ['IV Rank', '> 17 minim'],
                                        ['Net Delta', 'La alegere (simetric, bullish, sau bearish)'],
                                        ['Theta', 'Pozitiv (mai mare = mai bine)'],
                                        ['Profit Target', 'Inchide la 75% din profitul maxim sau lasa sa expire'],
                                        ['Marime pozitie', 'Max 5% din net liquidity'],
                                    ].map(([metric, range]) => (
                                        <tr key={metric} style={{ borderBottom: '1px solid var(--ion-color-light-shade)' }}>
                                            <td style={{ padding: '8px', fontWeight: 600 }}>{metric}</td>
                                            <td style={{ padding: '8px' }}>{range}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </IonCardContent>
                    </GuideCard>

                    {/* ============ TECHNICAL INDICATORS ============ */}
                    <SectionTitle>Technical Indicators</SectionTitle>

                    <p style={{ color: 'var(--ion-color-medium)', marginBottom: 16 }}>
                        The header of each ticker shows three daily-close indicators for
                        context before placing a trade. They are computed at 4:15 PM ET
                        each weekday and passed to the autonomous AI (Operatiunea Guvid)
                        as informational context &mdash; not as mechanical triggers.
                    </p>

                    {/* RSI */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox>RSI(14) &mdash; Relative Strength Index</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                RSI measures the speed and change of price movements on a 0&ndash;100 scale.
                                It compares average up-closes against average down-closes over the last
                                14 days, using Wilder&#39;s smoothing.
                            </p>
                            <FormulaBox>
                                RSI = 100 &minus; 100 / (1 + avgGain / avgLoss)<br/>
                                where avgGain / avgLoss are Wilder-smoothed over 14 bars
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>RSI &lt; 30</strong> &mdash; oversold (possible bounce / put-side risk)<br/>
                                &bull; <strong>RSI 30&ndash;70</strong> &mdash; neutral, normal trading range<br/>
                                &bull; <strong>RSI &gt; 70</strong> &mdash; overbought (possible reversal / call-side risk)<br/>
                                &bull; <strong>&lt;25 or &gt;75</strong> &mdash; extreme, highest-conviction signal<br/>
                                For an IC: elevated RSI argues for pulling call wings slightly tighter.
                            </InterpretBox>
                            <WarningBox>
                                RSI <strong>fails in strong trends</strong> &mdash; during a sustained uptrend
                                it can stay above 70 for weeks without reversing. Do not sell premium
                                against a trend on RSI signal alone. Use it as a <em>tail-risk input</em>,
                                not a directional call.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* Bollinger Bands */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox>Bollinger Bands(20, 2&sigma;)</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Bollinger Bands plot a 20-period simple moving average (the &ldquo;mid band&rdquo;)
                                and two lines at +2 and &minus;2 standard deviations around it. They show
                                where price is relative to its own recent volatility.
                            </p>
                            <FormulaBox>
                                mid = SMA(close, 20)<br/>
                                upper = mid + 2 &times; stdDev(close, 20)<br/>
                                lower = mid &minus; 2 &times; stdDev(close, 20)<br/>
                                distance&sigma; = (close &minus; mid) / stdDev
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>|distance&sigma;| &lt; 1</strong> &mdash; price near mid, neutral<br/>
                                &bull; <strong>+1&sigma; to +2&sigma;</strong> &mdash; price near upper band, call-side stretched<br/>
                                &bull; <strong>&gt;+2&sigma;</strong> &mdash; above upper band, strong overextension<br/>
                                &bull; <strong>&minus;1&sigma; to &minus;2&sigma;</strong> &mdash; near lower band, put-side stretched<br/>
                                &bull; <strong>&lt;&minus;2&sigma;</strong> &mdash; below lower band, strong downward extension<br/>
                                For an IC: being deep near one band is a signal that side is richer in premium.
                            </InterpretBox>
                            <WarningBox>
                                Beware of the <strong>band walk</strong> &mdash; in a strong trend, price can
                                ride the upper band for many days. BB alone is not a reversal signal.
                                Combine with RSI and trend context.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                    {/* ATR */}
                    <GuideCard>
                        <IonCardHeader>
                            <CardTitleBox>ATR(14) &mdash; Average True Range</CardTitleBox>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                ATR measures realized volatility in dollar terms: the Wilder-smoothed
                                average of the true range (high&ndash;low or gap) over the last 14 days.
                                Unlike VIX (which is implied), ATR tells you how far price actually
                                moved, on average, each day.
                            </p>
                            <FormulaBox>
                                TR = max(high &minus; low, |high &minus; prevClose|, |low &minus; prevClose|)<br/>
                                ATR = Wilder-smooth(TR, 14)
                            </FormulaBox>
                            <InterpretBox>
                                <strong>How to read it:</strong><br/>
                                &bull; <strong>SPX:</strong> &lt;40 low, 40&ndash;70 normal, &gt;70 elevated<br/>
                                &bull; <strong>QQQ:</strong> &lt;5 low, 5&ndash;9 normal, &gt;9 elevated<br/>
                                &bull; <strong>Wing-width guidance for ICs:</strong> if ATR is elevated, prefer
                                wider wings ($15 instead of $10 on SPX) &mdash; tight wings can be blown
                                through on a single day&#39;s range.
                            </InterpretBox>
                            <WarningBox>
                                ATR is <strong>not directional</strong> &mdash; a high ATR tells you volume of
                                movement, not its sign. Pair with RSI/BB to know whether the risk is on
                                the call side or the put side.
                            </WarningBox>
                        </IonCardContent>
                    </GuideCard>

                </PageContent>
            </IonContent>
        </IonPage>
    );
};

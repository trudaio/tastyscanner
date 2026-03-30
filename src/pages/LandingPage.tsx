import React from 'react';
import { IonPage, IonContent, IonButton } from '@ionic/react';
import styled from 'styled-components';

/* ───────── Layout ───────── */

const PageWrapper = styled.div`
    background: #ffffff;
    color: #1a1a2e;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;

/* ───────── Nav ───────── */

const Nav = styled.nav`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 40px;
    max-width: 1200px;
    margin: 0 auto;
    border-bottom: 1px solid #e8ecf1;

    @media (max-width: 600px) {
        padding: 12px 20px;
    }
`;

const NavLogo = styled.img`
    height: 48px;
    width: auto;
`;

const NavButtons = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
`;

/* ───────── Hero ───────── */

const HeroSection = styled.section`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 72px 24px 80px;
    max-width: 900px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 40px 20px 60px;
    }
`;

const HeroLogo = styled.img`
    width: 200px;
    height: auto;
    margin-bottom: 32px;

    @media (max-width: 600px) {
        width: 150px;
        margin-bottom: 24px;
    }
`;

const HeroTitle = styled.h1`
    font-size: 3.2rem;
    font-weight: 800;
    line-height: 1.15;
    margin: 0 0 20px;
    color: #1a1a2e;

    @media (max-width: 600px) {
        font-size: 2rem;
    }
`;

const HeroAccent = styled.span`
    color: #1a73e8;
`;

const HeroSubtitle = styled.p`
    font-size: 1.2rem;
    line-height: 1.65;
    color: #555e6e;
    max-width: 640px;
    margin: 0 0 40px;

    @media (max-width: 600px) {
        font-size: 1rem;
    }
`;

const HeroCTA = styled.div`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
`;

const PrimaryButton = styled(IonButton)`
    --background: #1a73e8;
    --background-hover: #1565c0;
    --border-radius: 8px;
    --padding-start: 32px;
    --padding-end: 32px;
    --padding-top: 14px;
    --padding-bottom: 14px;
    --color: #fff;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.3px;
`;

const SecondaryButton = styled(IonButton)`
    --background: transparent;
    --border-radius: 8px;
    --border-width: 2px;
    --border-style: solid;
    --border-color: #c8d0dc;
    --color: #444e5c;
    --padding-start: 32px;
    --padding-end: 32px;
    --padding-top: 14px;
    --padding-bottom: 14px;
    font-weight: 600;
    font-size: 1rem;
`;

/* ───────── Divider ───────── */

const Divider = styled.div`
    height: 1px;
    background: linear-gradient(90deg, transparent, #dde3eb 50%, transparent);
    max-width: 1000px;
    margin: 0 auto;
`;

/* ───────── App Showcase (screenshots) ───────── */

const ShowcaseSection = styled.section`
    padding: 80px 24px;
    background: #f7f9fc;

    @media (max-width: 600px) {
        padding: 48px 16px;
    }
`;

const ShowcaseInner = styled.div`
    max-width: 1100px;
    margin: 0 auto;
`;

const ShowcaseGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-top: 48px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
        gap: 24px;
    }
`;

const ShowcaseCard = styled.div`
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid #e4e8ef;
    background: #fff;
    transition: transform 0.3s, box-shadow 0.3s;

    &:hover {
        transform: translateY(-6px);
        box-shadow: 0 16px 48px rgba(26, 115, 232, 0.15);
    }
`;

const ShowcaseImage = styled.img`
    width: 100%;
    height: auto;
    display: block;
`;

const ShowcaseCaption = styled.div`
    padding: 16px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a2e;
    text-align: center;
    border-top: 1px solid #f0f2f5;
`;

/* ───────── Iron Condor Strategy ───────── */

const StrategySection = styled.section`
    padding: 80px 24px;
    max-width: 900px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 48px 16px;
    }
`;

const StrategyImageBox = styled.div`
    margin-top: 40px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    border: 1px solid #e4e8ef;
    background: #f7f9fc;
`;

const StrategyImage = styled.img`
    width: 100%;
    height: auto;
    display: block;
`;

const StrategyDesc = styled.p`
    text-align: center;
    color: #666e7e;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 24px auto 0;
    max-width: 700px;
`;

/* ───────── Videos ───────── */

const VideosSection = styled.section`
    padding: 80px 24px;
    background: #f7f9fc;

    @media (max-width: 600px) {
        padding: 48px 16px;
    }
`;

const VideosInner = styled.div`
    max-width: 1100px;
    margin: 0 auto;
`;

const PlaylistWrapper = styled.div`
    margin-top: 48px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    border: 1px solid #e4e8ef;
    background: #000;
    aspect-ratio: 16 / 9;
    width: 100%;
`;

const PlaylistEmbed = styled.iframe`
    width: 100%;
    height: 100%;
    display: block;
    border: none;
`;

const PlaylistLink = styled.a`
    display: block;
    text-align: center;
    margin-top: 20px;
    color: #1a73e8;
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
    &:hover { text-decoration: underline; }
`;

/* ───────── Features ───────── */

const FeaturesSection = styled.section`
    padding: 80px 24px;
    max-width: 1100px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 48px 20px;
    }
`;

const SectionTitle = styled.h2`
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
    margin: 0 0 12px;
    color: #1a1a2e;

    @media (max-width: 600px) {
        font-size: 1.5rem;
    }
`;

const SectionSubtitle = styled.p`
    text-align: center;
    color: #777f8e;
    font-size: 1.05rem;
    margin: 0 0 48px;
`;

const FeaturesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
        gap: 16px;
    }
`;

const FeatureCard = styled.div`
    background: #f7f9fc;
    border: 1px solid #e4e8ef;
    border-radius: 16px;
    padding: 32px 24px;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;

    &:hover {
        border-color: #1a73e8;
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(26, 115, 232, 0.1);
    }
`;

const FeatureIcon = styled.div`
    font-size: 2.2rem;
    margin-bottom: 16px;
`;

const FeatureTitle = styled.h3`
    font-size: 1.15rem;
    font-weight: 700;
    color: #1a1a2e;
    margin: 0 0 8px;
`;

const FeatureDesc = styled.p`
    font-size: 0.92rem;
    line-height: 1.55;
    color: #666e7e;
    margin: 0;
`;

/* ───────── How it works ───────── */

const HowSection = styled.section`
    padding: 80px 24px;
    max-width: 900px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 48px 20px;
    }
`;

const StepsGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 32px;
    margin-top: 48px;
`;

const StepRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 24px;

    @media (max-width: 600px) {
        gap: 16px;
    }
`;

const StepNumber = styled.div`
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1a73e8, #1557b0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 800;
    color: #fff;
`;

const StepContent = styled.div`
    flex: 1;
`;

const StepTitle = styled.h3`
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a2e;
    margin: 0 0 6px;
`;

const StepDesc = styled.p`
    font-size: 0.95rem;
    line-height: 1.55;
    color: #666e7e;
    margin: 0;
`;

/* ───────── Stats banner ───────── */

const StatsSection = styled.section`
    padding: 60px 24px;
    background: #f0f4f9;
`;

const StatsGrid = styled.div`
    display: flex;
    justify-content: center;
    gap: 64px;
    flex-wrap: wrap;
    max-width: 800px;
    margin: 0 auto;

    @media (max-width: 600px) {
        gap: 32px;
    }
`;

const StatItem = styled.div`
    text-align: center;
`;

const StatValue = styled.div`
    font-size: 2.4rem;
    font-weight: 800;
    color: #1a73e8;
    margin-bottom: 4px;

    @media (max-width: 600px) {
        font-size: 1.8rem;
    }
`;

const StatLabel = styled.div`
    font-size: 0.9rem;
    color: #666e7e;
`;

/* ───────── CTA bottom ───────── */

const CTASection = styled.section`
    text-align: center;
    padding: 80px 24px;
    max-width: 700px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 48px 20px;
    }
`;

const CTATitle = styled.h2`
    font-size: 2.2rem;
    font-weight: 800;
    color: #1a1a2e;
    margin: 0 0 16px;

    @media (max-width: 600px) {
        font-size: 1.6rem;
    }
`;

const CTADesc = styled.p`
    color: #666e7e;
    font-size: 1.05rem;
    margin: 0 0 32px;
    line-height: 1.6;
`;

/* ───────── Footer ───────── */

const Footer = styled.footer`
    border-top: 1px solid #e4e8ef;
    padding: 32px 24px;
    text-align: center;
    color: #999;
    font-size: 0.85rem;
`;

/* ═══════════════════════════════════════════ */

export const LandingPage: React.FC = () => {
    return (
        <IonPage>
            <IonContent scrollEvents={true}>
                <PageWrapper>

                    {/* ── Nav ── */}
                    <Nav>
                        <NavLogo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
                        <NavButtons>
                            <SecondaryButton routerLink="/login" size="small">
                                Autentificare
                            </SecondaryButton>
                            <PrimaryButton routerLink="/register" size="small">
                                Incepe acum
                            </PrimaryButton>
                        </NavButtons>
                    </Nav>

                    {/* ── Hero ── */}
                    <HeroSection>
                        <HeroLogo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
                        <HeroTitle>
                            Vinde prime mai inteligent. <HeroAccent>Construieste iron condors mai rapid.</HeroAccent>
                        </HeroTitle>
                        <HeroSubtitle>
                            Scaneaza intreaga piata de optiuni in cateva secunde. Gaseste cele mai profitabile
                            iron condors, credit spreads si setup-uri de vanzare de prime — filtrate dupa
                            delta, POP, expected value si alpha — conectat direct la contul tau TastyTrade.
                        </HeroSubtitle>
                        <HeroCTA>
                            <PrimaryButton routerLink="/register">
                                Incepe gratuit
                            </PrimaryButton>
                            <SecondaryButton routerLink="/login">
                                Am deja un cont
                            </SecondaryButton>
                        </HeroCTA>
                    </HeroSection>

                    {/* ── App Screenshots ── */}
                    <ShowcaseSection>
                        <ShowcaseInner>
                            <SectionTitle>Vezi aplicatia in actiune</SectionTitle>
                            <SectionSubtitle>
                                Interfata clara, date in timp real, totul la un click distanta.
                            </SectionSubtitle>
                            <ShowcaseGrid>
                                <ShowcaseCard>
                                    <ShowcaseImage src="/screenshot-scanner.jpg" alt="Scanner Iron Condors" />
                                    <ShowcaseCaption>Scanner de Iron Condors cu filtre avansate</ShowcaseCaption>
                                </ShowcaseCard>
                                <ShowcaseCard>
                                    <ShowcaseImage src="/screenshot-dashboard.jpg" alt="Dashboard P&L" />
                                    <ShowcaseCaption>Dashboard cu P&L si performanta in timp real</ShowcaseCaption>
                                </ShowcaseCard>
                            </ShowcaseGrid>
                        </ShowcaseInner>
                    </ShowcaseSection>

                    {/* ── Iron Condor Strategy ── */}
                    <StrategySection>
                        <SectionTitle>Ce este un Iron Condor?</SectionTitle>
                        <SectionSubtitle>
                            Strategia preferata pentru vanzatorii de prime cu risc definit.
                        </SectionSubtitle>
                        <StrategyImageBox>
                            <StrategyImage src="/iron-condor-diagram.svg" alt="Iron Condor - diagrama profit/pierdere" />
                        </StrategyImageBox>
                        <StrategyDesc>
                            Un iron condor combina un put credit spread cu un call credit spread pe acelasi activ.
                            Profitul este maxim cand pretul ramane intre cele doua strike-uri vandute.
                            Riscul este limitat si definit de la inceput — exact cum ne place.
                        </StrategyDesc>
                    </StrategySection>

                    {/* ── Videos ── */}
                    <VideosSection>
                        <VideosInner>
                            <SectionTitle>Vezi cum functioneaza</SectionTitle>
                            <SectionSubtitle>
                                Tutoriale video pas cu pas pentru a intelege strategia si aplicatia.
                            </SectionSubtitle>
                            <PlaylistWrapper>
                                <PlaylistEmbed
                                    src="https://www.youtube.com/embed/wxlD3dPZ2LU?list=PLIlqy_W3O7tD2QFSYeRmHhjLcTkrdCHr6"
                                    title="Operatiunea Guvidul — Playlist tutoriale"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </PlaylistWrapper>
                            <PlaylistLink
                                href="https://www.youtube.com/playlist?list=PLIlqy_W3O7tD2QFSYeRmHhjLcTkrdCHr6"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Vezi toate clipurile pe YouTube →
                            </PlaylistLink>
                        </VideosInner>
                    </VideosSection>

                    <Divider />

                    {/* ── Features ── */}
                    <FeaturesSection>
                        <SectionTitle>Tot ce ai nevoie pentru a vinde prime</SectionTitle>
                        <SectionSubtitle>
                            Construit de vanzatori de prime, pentru vanzatori de prime.
                        </SectionSubtitle>

                        <FeaturesGrid>
                            <FeatureCard>
                                <FeatureIcon>🎯</FeatureIcon>
                                <FeatureTitle>Scanner inteligent de Iron Condors</FeatureTitle>
                                <FeatureDesc>
                                    Scaneaza instant sute de expiratii din watchlist-urile tale.
                                    Filtreaza dupa delta, DTE, credit, POP, expected value si alpha
                                    pentru a gasi cele mai bune setup-uri.
                                </FeatureDesc>
                            </FeatureCard>

                            <FeatureCard>
                                <FeatureIcon>📊</FeatureIcon>
                                <FeatureTitle>Dashboard in timp real</FeatureTitle>
                                <FeatureDesc>
                                    Urmareste P&L-ul, net liquidity, pozitiile deschise si greeks-urile
                                    portofoliului intr-o singura vizualizare. Vezi progresul zilnic, saptamanal si lunar.
                                </FeatureDesc>
                            </FeatureCard>

                            <FeatureCard>
                                <FeatureIcon>⚡</FeatureIcon>
                                <FeatureTitle>Ordine cu un singur click</FeatureTitle>
                                <FeatureDesc>
                                    Ai gasit un setup bun? Trimite-l direct la TastyTrade cu un singur
                                    click. Fara copy-paste la strike-uri sau schimbat tab-uri.
                                </FeatureDesc>
                            </FeatureCard>

                            <FeatureCard>
                                <FeatureIcon>🛟</FeatureIcon>
                                <FeatureTitle>IC Savior</FeatureTitle>
                                <FeatureDesc>
                                    Ai un iron condor pe pierdere? IC Savior gaseste pozitii de salvare
                                    pentru a reduce riscul si a recupera trade-ul.
                                </FeatureDesc>
                            </FeatureCard>

                            <FeatureCard>
                                <FeatureIcon>🔬</FeatureIcon>
                                <FeatureTitle>Filtre avansate</FeatureTitle>
                                <FeatureDesc>
                                    IC-uri simetrice, bullish sau bearish. Wings asimetrice. Credit minim,
                                    POP minim, alpha minim. Personalizeaza fiecare parametru dupa strategia ta.
                                </FeatureDesc>
                            </FeatureCard>

                            <FeatureCard>
                                <FeatureIcon>📱</FeatureIcon>
                                <FeatureTitle>Gata de mobil</FeatureTitle>
                                <FeatureDesc>
                                    Verifica setup-urile de pe telefon. Intreaga aplicatie este responsive
                                    si optimizata atat pentru desktop cat si pentru mobil.
                                </FeatureDesc>
                            </FeatureCard>
                        </FeaturesGrid>
                    </FeaturesSection>

                    <Divider />

                    {/* ── How it works ── */}
                    <HowSection>
                        <SectionTitle>Gata in 3 minute</SectionTitle>
                        <SectionSubtitle>Conecteaza-ti contul TastyTrade si incepe sa scanezi.</SectionSubtitle>

                        <StepsGrid>
                            <StepRow>
                                <StepNumber>1</StepNumber>
                                <StepContent>
                                    <StepTitle>Creeaza-ti contul</StepTitle>
                                    <StepDesc>
                                        Inregistreaza-te cu email-ul tau. Dureaza 30 de secunde.
                                    </StepDesc>
                                </StepContent>
                            </StepRow>

                            <StepRow>
                                <StepNumber>2</StepNumber>
                                <StepContent>
                                    <StepTitle>Conecteaza TastyTrade</StepTitle>
                                    <StepDesc>
                                        Ia cheile API de pe developer.tastytrade.com si lipeste-le
                                        in pagina Contul meu. Acces read-only — nu plasam niciodata trade-uri fara tine.
                                    </StepDesc>
                                </StepContent>
                            </StepRow>

                            <StepRow>
                                <StepNumber>3</StepNumber>
                                <StepContent>
                                    <StepTitle>Scaneaza &amp; tradeaza</StepTitle>
                                    <StepDesc>
                                        Alege un ticker, seteaza filtrele si rasfoia setup-urile cu cea mai mare
                                        probabilitate. Cand gasesti unul care iti place, trimite ordinul la TastyTrade cu un click.
                                    </StepDesc>
                                </StepContent>
                            </StepRow>
                        </StepsGrid>
                    </HowSection>

                    <Divider />

                    {/* ── Stats ── */}
                    <StatsSection>
                        <StatsGrid>
                            <StatItem>
                                <StatValue>10+</StatValue>
                                <StatLabel>Parametri de filtrare</StatLabel>
                            </StatItem>
                            <StatItem>
                                <StatValue>3 min</StatValue>
                                <StatLabel>Timp de configurare</StatLabel>
                            </StatItem>
                            <StatItem>
                                <StatValue>100%</StatValue>
                                <StatLabel>Risc definit</StatLabel>
                            </StatItem>
                            <StatItem>
                                <StatValue>Real-time</StatValue>
                                <StatLabel>Date in streaming</StatLabel>
                            </StatItem>
                        </StatsGrid>
                    </StatsSection>

                    <Divider />

                    {/* ── Bottom CTA ── */}
                    <CTASection>
                        <CTATitle>Pregatit sa navighezi in ape profitabile?</CTATitle>
                        <CTADesc>
                            Alatura-te echipajului. Conecteaza-ti contul TastyTrade si incepe
                            sa gasesti iron condors cu probabilitate mare chiar azi.
                        </CTADesc>
                        <PrimaryButton routerLink="/register" size="large">
                            Creeaza cont gratuit
                        </PrimaryButton>
                    </CTASection>

                    {/* ── Footer ── */}
                    <Footer>
                        &copy; {new Date().getFullYear()} Operatiunea Guvidul — Navigam in ape profitabile
                    </Footer>

                </PageWrapper>
            </IonContent>
        </IonPage>
    );
};

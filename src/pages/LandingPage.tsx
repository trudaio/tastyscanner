import React, { useState } from 'react';
import { IonButton, IonContent, IonPage } from '@ionic/react';
import styled from 'styled-components';

const PageWrapper = styled.div`
    background:
        radial-gradient(circle at top left, rgba(103, 168, 255, 0.16), transparent 18%),
        radial-gradient(circle at right 20%, rgba(125, 226, 209, 0.12), transparent 16%),
        linear-gradient(180deg, #0b1526 0%, #081120 52%, #060d19 100%);
    color: #f3f7ff;
    min-height: 100vh;
    font-family: var(--ion-font-family);
`;

const Nav = styled.nav`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    position: sticky;
    top: 0;
    z-index: 20;
    padding: 16px 40px;
    max-width: 1200px;
    margin: 0 auto;
    border-bottom: 1px solid rgba(162, 184, 219, 0.12);
    background: rgba(8, 17, 31, 0.72);
    backdrop-filter: blur(18px);

    @media (max-width: 720px) {
        flex-wrap: wrap;
        padding: 12px 20px;
    }
`;

const NavBrand = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
`;

const NavLogo = styled.img`
    height: 48px;
    width: auto;
    display: block;
`;

const NavBrandText = styled.div`
    display: grid;
    gap: 2px;
    min-width: 0;

    @media (max-width: 520px) {
        display: none;
    }
`;

const NavTitle = styled.div`
    color: #f3f7ff;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

const NavSubtitle = styled.div`
    color: var(--app-text-muted);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
`;

const NavButtons = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;

    @media (max-width: 720px) {
        width: 100%;

        & > * {
            flex: 1;
        }
    }
`;

const HeroSection = styled.section`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 76px 24px 88px;
    max-width: 960px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 40px 20px 56px;
    }
`;

const HeroEyebrow = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(103, 168, 255, 0.18);
    background: rgba(103, 168, 255, 0.08);
    color: var(--app-text-soft);
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
`;

const HeroLogo = styled.img`
    width: 180px;
    height: auto;
    margin-bottom: 28px;
    display: block;

    @media (max-width: 600px) {
        width: 148px;
        margin-bottom: 22px;
    }
`;

const HeroTitle = styled.h1`
    font-size: clamp(2.35rem, 6vw, 4.2rem);
    font-weight: 800;
    line-height: 1.02;
    margin: 0 0 20px;
    color: #f7fbff;
    letter-spacing: -0.05em;

    @media (max-width: 600px) {
        font-size: 2.05rem;
    }
`;

const HeroAccent = styled.span`
    color: #8dd6ff;
`;

const HeroSubtitle = styled.p`
    font-size: 1.08rem;
    line-height: 1.7;
    color: #b6c4da;
    max-width: 760px;
    margin: 0 0 28px;

    @media (max-width: 600px) {
        font-size: 1rem;
    }
`;

const HeroMetrics = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin: 0 0 32px;
`;

const HeroMetric = styled.div`
    padding: 10px 14px;
    border-radius: 999px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
    color: var(--app-text-soft);
    font-size: 0.84rem;
    font-weight: 700;
`;

const HeroCTA = styled.div`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
`;

const PrimaryButton = styled(IonButton)`
    --background: linear-gradient(135deg, #67a8ff, #7de2d1);
    --background-hover: linear-gradient(135deg, #5f9df2, #71d5c5);
    --border-radius: 18px;
    --padding-start: 32px;
    --padding-end: 32px;
    --padding-top: 14px;
    --padding-bottom: 14px;
    --color: #08111f;
    --box-shadow: 0 16px 28px rgba(103, 168, 255, 0.18);
    font-weight: 800;
    font-size: 1rem;
    letter-spacing: 0;
    text-transform: none;
`;

const SecondaryButton = styled(IonButton)`
    --background: transparent;
    --border-radius: 18px;
    --border-width: 1.5px;
    --border-style: solid;
    --border-color: rgba(162, 184, 219, 0.18);
    --color: #d8e1f0;
    --padding-start: 28px;
    --padding-end: 28px;
    --padding-top: 14px;
    --padding-bottom: 14px;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0;
    text-transform: none;
`;

const Divider = styled.div`
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(162, 184, 219, 0.14) 50%, transparent);
    max-width: 1000px;
    margin: 0 auto;
`;

const SectionShell = styled.section<{ $soft?: boolean }>`
    padding: 80px 24px;
    background: ${(props) => props.$soft ? 'var(--app-subtle-surface)' : 'transparent'};

    @media (max-width: 600px) {
        padding: 48px 16px;
    }
`;

const SectionInner = styled.div`
    max-width: 1100px;
    margin: 0 auto;
`;

const SectionEyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    margin-bottom: 10px;
`;

const SectionTitle = styled.h2`
    font-size: 2rem;
    font-weight: 800;
    text-align: center;
    margin: 0 0 12px;
    color: #f3f7ff;
    letter-spacing: -0.03em;

    @media (max-width: 600px) {
        font-size: 1.6rem;
    }
`;

const SectionSubtitle = styled.p`
    text-align: center;
    color: var(--app-text-muted);
    font-size: 1.02rem;
    margin: 0 auto 48px;
    line-height: 1.65;
    max-width: 780px;
`;

const ShowcaseGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
        gap: 24px;
    }
`;

const ShowcaseCard = styled.div`
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(162, 184, 219, 0.12);
    background: rgba(17, 31, 53, 0.8);
    backdrop-filter: blur(16px);
    transition: transform 0.3s, box-shadow 0.3s;

    &:hover {
        transform: translateY(-6px);
        box-shadow: 0 22px 44px rgba(0, 0, 0, 0.26);
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
    font-weight: 700;
    color: var(--app-text);
    text-align: center;
    border-top: 1px solid rgba(162, 184, 219, 0.1);
`;

const StrategyImageBox = styled.div`
    margin-top: 40px;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(162, 184, 219, 0.12);
    background: rgba(17, 31, 53, 0.8);
`;

const StrategyImage = styled.img`
    width: 100%;
    height: auto;
    display: block;
`;

const StrategyDesc = styled.p`
    text-align: center;
    color: var(--app-text-soft);
    font-size: 0.95rem;
    line-height: 1.7;
    margin: 24px auto 0;
    max-width: 760px;
`;

const VideosGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
        gap: 24px;
    }
`;

const VideoCard = styled.div`
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(162, 184, 219, 0.12);
    background: rgba(17, 31, 53, 0.8);
    backdrop-filter: blur(16px);
`;

const VideoPosterButton = styled.button`
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: block;
    position: relative;
    aspect-ratio: 16 / 9;
`;

const VideoPosterImage = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
`;

const VideoPosterOverlay = styled.div`
    position: absolute;
    inset: 0;
    display: grid;
    align-content: end;
    gap: 12px;
    padding: 18px;
    background: linear-gradient(180deg, rgba(6, 13, 25, 0.08), rgba(6, 13, 25, 0.78));
`;

const PlayBadge = styled.div`
    width: 62px;
    height: 62px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(103, 168, 255, 0.96), rgba(125, 226, 209, 0.96));
    color: var(--ion-color-primary-contrast);
    font-size: 0.95rem;
    font-weight: 900;
    box-shadow: 0 18px 28px rgba(103, 168, 255, 0.22);
`;

const VideoMeta = styled.div`
    display: grid;
    gap: 6px;
    text-align: left;
`;

const VideoKicker = styled.div`
    color: rgba(243, 247, 255, 0.72);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
`;

const VideoTitle = styled.div`
    color: var(--app-text);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.4;
`;

const VideoEmbed = styled.iframe`
    width: 100%;
    aspect-ratio: 16 / 9;
    display: block;
    border: none;
`;

const VideoCaption = styled.div`
    padding: 16px 20px;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--app-text);
    text-align: center;
    border-top: 1px solid rgba(162, 184, 219, 0.1);
`;

const FeaturesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;

    @media (max-width: 960px) {
        grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
        gap: 16px;
    }
`;

const FeatureCard = styled.div`
    background: rgba(17, 31, 53, 0.74);
    border: 1px solid rgba(162, 184, 219, 0.12);
    border-radius: 20px;
    padding: 32px 24px;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;

    &:hover {
        border-color: rgba(103, 168, 255, 0.24);
        transform: translateY(-4px);
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.18);
    }
`;

const FeatureBadge = styled.div`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(103, 168, 255, 0.18);
    background: rgba(103, 168, 255, 0.08);
    color: var(--ion-color-primary);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 16px;
`;

const FeatureTitle = styled.h3`
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--app-text);
    margin: 0 0 8px;
`;

const FeatureDesc = styled.p`
    font-size: 0.92rem;
    line-height: 1.62;
    color: var(--app-text-muted);
    margin: 0;
`;

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
    background: linear-gradient(135deg, #67a8ff, #7de2d1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--ion-color-primary-contrast);
`;

const StepContent = styled.div`
    flex: 1;
`;

const StepTitle = styled.h3`
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--app-text);
    margin: 0 0 6px;
`;

const StepDesc = styled.p`
    font-size: 0.95rem;
    line-height: 1.62;
    color: var(--app-text-muted);
    margin: 0;
`;

const StatsSection = styled.section`
    padding: 60px 24px;
    background: var(--app-subtle-surface);
    backdrop-filter: blur(12px);
`;

const StatsGrid = styled.div`
    display: flex;
    justify-content: center;
    gap: 64px;
    flex-wrap: wrap;
    max-width: 900px;
    margin: 0 auto;

    @media (max-width: 600px) {
        gap: 28px;
    }
`;

const StatItem = styled.div`
    text-align: center;
`;

const StatValue = styled.div`
    font-size: 2.4rem;
    font-weight: 800;
    color: #8dd6ff;
    margin-bottom: 4px;

    @media (max-width: 600px) {
        font-size: 1.8rem;
    }
`;

const StatLabel = styled.div`
    font-size: 0.9rem;
    color: var(--app-text-muted);
`;

const CTASection = styled.section`
    text-align: center;
    padding: 80px 24px;
    max-width: 760px;
    margin: 0 auto;

    @media (max-width: 600px) {
        padding: 48px 20px;
    }
`;

const CTATitle = styled.h2`
    font-size: 2.2rem;
    font-weight: 800;
    color: var(--app-text);
    margin: 0 0 16px;
    letter-spacing: -0.03em;

    @media (max-width: 600px) {
        font-size: 1.7rem;
    }
`;

const CTADesc = styled.p`
    color: var(--app-text-soft);
    font-size: 1.05rem;
    margin: 0 0 32px;
    line-height: 1.68;
`;

const Footer = styled.footer`
    border-top: 1px solid rgba(162, 184, 219, 0.12);
    padding: 32px 24px;
    text-align: center;
    color: #8290a7;
    font-size: 0.85rem;
`;

const landingVideos = [
    {
        id: 'pw1nwUSLgTc',
        title: 'Tutorial de utilizare a workspace-ului',
        kicker: 'Tutorial',
        embedTitle: 'Tutorial Operatiunea Guvidul',
    },
    {
        id: 'P0bdtDqlN30',
        title: 'Prezentare a produsului si a fluxului de selectie',
        kicker: 'Prezentare',
        embedTitle: 'Prezentare soft Iron Condor',
    },
];

const landingFeatures = [
    {
        badge: 'Scanner',
        title: 'Scanning orientat pe selectie',
        description: 'Setup-urile sunt filtrate dupa delta, DTE, credit, POP, expected value si alpha, astfel incat universul de decizie sa fie redus inteligent.',
    },
    {
        badge: 'Portofoliu',
        title: 'Context de portofoliu in acelasi flux',
        description: 'Net liquidity, pozitii deschise si greeks de portofoliu sunt vizibile in shell-ul de lucru, fara a rupe atentia intre ecrane disparate.',
    },
    {
        badge: 'Executie',
        title: 'Executie fara frictiune',
        description: 'Dupa selectie, contextul de trade ramane in acelasi workflow. Mai putin copy-paste, mai putine mutari inutile intre tab-uri.',
    },
    {
        badge: 'Risc',
        title: 'Management si reparatie de pozitii',
        description: 'Pentru trade-urile aflate sub presiune, produsul expune si instrumente dedicate de analiza pentru ajustare si control.',
    },
    {
        badge: 'Analiza',
        title: 'Backtesting si comparatie de scenarii',
        description: 'Parametrii pot fi comparati in mod structurat, astfel incat regulile de intrare si iesire sa fie verificate inainte de executie.',
    },
    {
        badge: 'Mobilitate',
        title: 'Consistenta cross-device',
        description: 'Desktop pentru densitate, tableta pentru revizuire si mobil pentru scanare rapida: acelasi sistem vizual, aceeasi ierarhie, acelasi flux logic.',
    },
];

const setupSteps = [
    {
        number: '1',
        title: 'Provisionezi accesul',
        description: 'Creezi contul aplicatiei si stabilesti accesul la workspace. Pasul este scurt si izolat de credentialele brokerului.',
    },
    {
        number: '2',
        title: 'Conectezi TastyTrade',
        description: 'Adaugi client secret si refresh token din portalul TastyTrade, apoi activezi datele de cont si fluxul de quote-uri live.',
    },
    {
        number: '3',
        title: 'Rulezi primul workflow',
        description: 'Alegi simbolul, setezi filtrele de baza si evaluezi setup-urile intr-un flux in care riscul, contextul si executia raman conectate.',
    },
];

const landingStats = [
    { value: '10+', label: 'parametri de selectie' },
    { value: '3 min', label: 'pana la primul workflow complet' },
    { value: 'Risc definit', label: 'structura controlata din start' },
    { value: 'Date live', label: 'quotes, greeks si context de cont' },
];

export const LandingPage: React.FC = () => {
    const [loadedVideos, setLoadedVideos] = useState<Record<string, boolean>>({});

    const openVideo = (id: string) => {
        setLoadedVideos((current) => ({ ...current, [id]: true }));
    };

    return (
        <IonPage>
            <IonContent scrollEvents={true}>
                <PageWrapper>
                    <Nav>
                        <NavBrand>
                            <NavLogo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
                            <NavBrandText>
                                <NavTitle>Operatiunea Guvidul</NavTitle>
                                <NavSubtitle>Workspace de trading</NavSubtitle>
                            </NavBrandText>
                        </NavBrand>

                        <NavButtons>
                            <SecondaryButton routerLink="/login" size="small">
                                Autentificare
                            </SecondaryButton>
                            <PrimaryButton routerLink="/register" size="small">
                                Solicita acces
                            </PrimaryButton>
                        </NavButtons>
                    </Nav>

                    <HeroSection>
                        <HeroEyebrow>Workspace pentru selectie si control de risc</HeroEyebrow>
                        <HeroLogo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
                        <HeroTitle>
                            Un workspace pentru selectie disciplinata. <HeroAccent>Nu doar un scanner de setup-uri.</HeroAccent>
                        </HeroTitle>
                        <HeroSubtitle>
                            Operatiunea Guvidul concentreaza analiza, contextul de portofoliu si executia intr-un singur mediu de lucru.
                            Pentru strategiile de premium selling, asta inseamna mai putina fragmentare, mai mult control si decizii mai usor de aparat.
                        </HeroSubtitle>
                        <HeroMetrics>
                            <HeroMetric>Scanner orientat pe selectie</HeroMetric>
                            <HeroMetric>Portofoliu si risc in acelasi flux</HeroMetric>
                            <HeroMetric>Executie cu context complet</HeroMetric>
                        </HeroMetrics>
                        <HeroCTA>
                            <PrimaryButton routerLink="/register">Deschide workspace-ul</PrimaryButton>
                            <SecondaryButton routerLink="/login">Am deja acces</SecondaryButton>
                        </HeroCTA>
                    </HeroSection>

                    <SectionShell $soft>
                        <SectionInner>
                            <SectionEyebrow>Vizibilitate</SectionEyebrow>
                            <SectionTitle>Vizibilitate operationala, nu doar date brute</SectionTitle>
                            <SectionSubtitle>
                                Interfata este construita pentru workflow: selectie de simbol, evaluare de risc, comparatie de setup-uri si context de portofoliu in acelasi ecran.
                            </SectionSubtitle>
                            <ShowcaseGrid>
                                <ShowcaseCard>
                                    <ShowcaseImage src="/screenshot-scanner.jpg" alt="Scanner Iron Condors" />
                                    <ShowcaseCaption>Scanner de Iron Condors cu filtre orientate pe decizie</ShowcaseCaption>
                                </ShowcaseCard>
                                <ShowcaseCard>
                                    <ShowcaseImage src="/screenshot-dashboard.jpg" alt="Dashboard de pozitii" />
                                    <ShowcaseCaption>Management de pozitii si performanta intr-o singura vedere</ShowcaseCaption>
                                </ShowcaseCard>
                            </ShowcaseGrid>
                        </SectionInner>
                    </SectionShell>

                    <SectionShell>
                        <SectionInner>
                            <SectionEyebrow>Strategie</SectionEyebrow>
                            <SectionTitle>De ce Iron Condor, in mod disciplinat</SectionTitle>
                            <SectionSubtitle>
                                Strategia are sens doar cand este legata de selectie, sizing si management. Tocmai aceste trei straturi sunt aduse la suprafata in produs.
                            </SectionSubtitle>
                            <StrategyImageBox>
                                <StrategyImage src="/iron-condor-diagram.svg" alt="Iron Condor - diagrama profit pierdere" />
                            </StrategyImageBox>
                            <StrategyDesc>
                                Un Iron Condor combina un put credit spread cu un call credit spread pe acelasi activ.
                                Profitul este limitat, riscul este limitat, iar disciplina de selectie si iesire devine esentiala.
                                Platforma este construita tocmai pentru acest tip de workflow controlat.
                            </StrategyDesc>
                        </SectionInner>
                    </SectionShell>

                    <SectionShell $soft>
                        <SectionInner>
                            <SectionEyebrow>Demo</SectionEyebrow>
                            <SectionTitle>Context vizual pentru modul de lucru</SectionTitle>
                            <SectionSubtitle>
                                Tutorialele de mai jos se incarca doar la interactiune, astfel incat landing page-ul sa ramana rapid, iar continutul video sa fie deschis doar cand utilizatorul il cere.
                            </SectionSubtitle>
                            <VideosGrid>
                                {landingVideos.map((video) => (
                                    <VideoCard key={video.id}>
                                        {loadedVideos[video.id] ? (
                                            <VideoEmbed
                                                src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
                                                title={video.embedTitle}
                                                loading="lazy"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        ) : (
                                            <VideoPosterButton
                                                type="button"
                                                onClick={() => openVideo(video.id)}
                                                aria-label={`Ruleaza video: ${video.title}`}
                                            >
                                                <VideoPosterImage
                                                    src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                                                    alt={video.title}
                                                    loading="lazy"
                                                />
                                                <VideoPosterOverlay>
                                                    <PlayBadge>Reda</PlayBadge>
                                                    <VideoMeta>
                                                        <VideoKicker>{video.kicker}</VideoKicker>
                                                        <VideoTitle>{video.title}</VideoTitle>
                                                    </VideoMeta>
                                                </VideoPosterOverlay>
                                            </VideoPosterButton>
                                        )}
                                        <VideoCaption>{video.title}</VideoCaption>
                                    </VideoCard>
                                ))}
                            </VideosGrid>
                        </SectionInner>
                    </SectionShell>

                    <Divider />

                    <SectionShell>
                        <SectionInner>
                            <SectionEyebrow>Capabilitati</SectionEyebrow>
                            <SectionTitle>Capabilitati pentru un workflow serios</SectionTitle>
                            <SectionSubtitle>
                                Nu este o pagina cu widget-uri disparate. Este o suita compacta pentru selectie, management si control de risc.
                            </SectionSubtitle>
                            <FeaturesGrid>
                                {landingFeatures.map((feature) => (
                                    <FeatureCard key={feature.title}>
                                        <FeatureBadge>{feature.badge}</FeatureBadge>
                                        <FeatureTitle>{feature.title}</FeatureTitle>
                                        <FeatureDesc>{feature.description}</FeatureDesc>
                                    </FeatureCard>
                                ))}
                            </FeaturesGrid>
                        </SectionInner>
                    </SectionShell>

                    <Divider />

                    <HowSection>
                        <SectionEyebrow>Onboarding</SectionEyebrow>
                        <SectionTitle>Setup controlat in cateva minute</SectionTitle>
                        <SectionSubtitle>
                            Accesul, credentialele si primul workflow sunt despartite clar, ca sa pastrezi controlul asupra configurarii.
                        </SectionSubtitle>
                        <StepsGrid>
                            {setupSteps.map((step) => (
                                <StepRow key={step.number}>
                                    <StepNumber>{step.number}</StepNumber>
                                    <StepContent>
                                        <StepTitle>{step.title}</StepTitle>
                                        <StepDesc>{step.description}</StepDesc>
                                    </StepContent>
                                </StepRow>
                            ))}
                        </StepsGrid>
                    </HowSection>

                    <Divider />

                    <StatsSection>
                        <StatsGrid>
                            {landingStats.map((stat) => (
                                <StatItem key={stat.label}>
                                    <StatValue>{stat.value}</StatValue>
                                    <StatLabel>{stat.label}</StatLabel>
                                </StatItem>
                            ))}
                        </StatsGrid>
                    </StatsSection>

                    <Divider />

                    <CTASection>
                        <SectionEyebrow>Start</SectionEyebrow>
                        <CTATitle>Pregatit pentru un workflow mai coerent?</CTATitle>
                        <CTADesc>
                            Daca vrei un mediu de lucru in care selectie, context si management raman conectate,
                            poti porni acum si continua configurarea in cativa pasi controlati.
                        </CTADesc>
                        <PrimaryButton routerLink="/register" size="large">
                            Solicita acces
                        </PrimaryButton>
                    </CTASection>

                    <Footer>
                        &copy; {new Date().getFullYear()} Operatiunea Guvidul. Workspace pentru selectie disciplinata si management de risc.
                    </Footer>
                </PageWrapper>
            </IonContent>
        </IonPage>
    );
};

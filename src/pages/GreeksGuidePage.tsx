import React from 'react';
import { IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/react';
import styled from 'styled-components';
import { AppPageShell } from '../components/ui/app-page-shell';
import {
    AccentBox,
    CardGrid,
    PageContainer,
    PageEyebrow,
    PageHero,
    PageSubtitle,
    PageTitle,
    SectionDescription,
    SectionHeader,
    SectionStack,
    SectionTitle,
    SuccessBox,
    SurfaceCard,
    WarningBox,
} from '../components/ui/page-primitives';

const GuideCard = styled(SurfaceCard)`
    overflow: hidden;
`;

const HeroHighlights = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
`;

const HighlightPill = styled.div`
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
    color: var(--app-text-soft);
    font-size: 0.83rem;
    font-weight: 700;
`;

const CardTitleRow = styled(IonCardTitle)`
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--app-text);
    font-size: 1.08rem;
`;

const SymbolMark = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border-radius: 12px;
    background: rgba(244, 162, 97, 0.12);
    border: 1px solid rgba(244, 162, 97, 0.2);
    color: var(--ion-color-tertiary);
    font-size: 1.1rem;
    font-weight: 800;
`;

const LeadText = styled.p`
    margin: 0;
    color: var(--app-text-soft);
    line-height: 1.68;
    font-size: 0.96rem;
`;

const FormulaBox = styled(AccentBox)`
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.9rem;
    white-space: pre-line;
`;

const BulletList = styled.ul`
    margin: 0;
    padding-left: 18px;
    color: var(--app-text-soft);
    display: grid;
    gap: 8px;
    line-height: 1.6;

    li::marker {
        color: var(--ion-color-primary);
    }
`;

const RuleGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    @media (max-width: 720px) {
        grid-template-columns: 1fr;
    }
`;

const RuleCard = styled.div`
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
`;

const RuleLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 0.77rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
`;

const RuleValue = styled.div`
    color: var(--app-text);
    font-size: 0.96rem;
    font-weight: 700;
    line-height: 1.5;
    margin-top: 8px;
`;

const CardBody = styled(IonCardContent)`
    display: grid;
    gap: 14px;
`;

interface GuideTopic {
    symbol: string;
    title: string;
    summary: string;
    formula: string;
    interpretation: string[];
    caution?: string;
}

const greekTopics: GuideTopic[] = [
    {
        symbol: 'Δ',
        title: 'Delta',
        summary: 'Delta măsoară cât se schimbă prețul opțiunii la o mișcare de 1 dolar a activului suport. În practică, îți arată bias-ul direcțional al structurii.',
        formula: 'Delta netă IC = Delta short put + Delta long call - Delta long put - Delta short call',
        interpretation: [
            'Delta aproape de 0 indică o structură neutră, adecvată pentru range.',
            'Delta pozitivă semnalează expunere ușor bullish.',
            'Delta negativă semnalează expunere ușor bearish.',
        ],
        caution: 'Delta short strike este și un proxy pentru probabilitatea ca acel strike să fie atins la expirare.',
    },
    {
        symbol: 'Θ',
        title: 'Theta',
        summary: 'Theta cuantifică ritmul în care poziția beneficiază de trecerea timpului. Pentru vânzătorii de premium, este unul dintre principalele motoare de profit.',
        formula: 'Theta netă IC = Theta long put + Theta long call - Theta short put - Theta short call',
        interpretation: [
            'Theta pozitivă înseamnă că poziția câștigă din time decay.',
            'Valoarea afișată este o aproximație a profitului zilnic generat doar de timp.',
            'Theta se accelerează pe măsură ce expirarea se apropie.',
        ],
        caution: 'Ultimele săptămâni până la expirare aduc cel mai agresiv time decay, dar și cel mai mare risc de gamma.',
    },
    {
        symbol: 'Γ',
        title: 'Gamma',
        summary: 'Gamma măsoară cât de repede se schimbă delta când activul suport se mișcă. Este indicatorul care îți spune cât de repede pierzi neutralitatea.',
        formula: 'Gamma = rata de schimbare a deltei la o mișcare de 1 dolar a suportului',
        interpretation: [
            'Gamma negativă este normală pentru Iron Condor și penalizează mișcările ample.',
            'O valoare absolută mai mare înseamnă că expunerea direcțională se schimbă mai agresiv.',
            'Gamma crește puternic aproape de expirare și în jurul strike-urilor at-the-money.',
        ],
        caution: 'Când gamma urcă, ajustările întârziate devin mai costisitoare decât intrările disciplinate.',
    },
    {
        symbol: 'V',
        title: 'Vega',
        summary: 'Vega indică sensibilitatea poziției la variații ale volatilității implicite. Este esențială pentru timing-ul intrării și pentru controlul riscului după deschidere.',
        formula: 'Vega = schimbarea valorii poziției la o variație de 1% a volatilității implicite',
        interpretation: [
            'Vega negativă este tipică pentru short premium și favorizează scăderea IV după intrare.',
            'Intrările la IV Rank ridicat oferă, în general, un context mai bun pentru mean reversion.',
            'Creșterile bruște de IV pot deteriora rapid PnL-ul înainte ca prețul să lovească strike-urile.',
        ],
    },
];

const metricTopics: GuideTopic[] = [
    {
        symbol: '%',
        title: 'POP',
        summary: 'Probability of Profit estimează șansa statistică ca structura să fie profitabilă la expirare. Este o filtrare de prim nivel, nu o garanție de rezultat.',
        formula: 'Break-even put = short put strike - credit\nBreak-even call = short call strike + credit\nPOP = 100% - max(delta la BE put, delta la BE call)',
        interpretation: [
            'Intervalul 75-85% este, de regulă, cel mai util pentru selecții echilibrate.',
            'Un POP foarte mare înseamnă, de obicei, credit mai mic și edge limitat.',
            'Un POP sub 70% cere o justificare foarte bună din EV și context.',
        ],
    },
    {
        symbol: 'EV',
        title: 'Expected Value',
        summary: 'EV exprimă rezultatul mediu estimat dacă ai executa același setup de multe ori. Este criteriul care separă o tranzacție confortabilă de una cu edge real.',
        formula: 'Max profit = credit x 100\nMax loss = (wing width - credit) x 100\nEV = (POP x Max profit) - ((1 - POP) x Max loss)',
        interpretation: [
            'EV pozitiv sugerează avantaj statistic pe termen lung.',
            'EV negativ indică o structură care, repetată, erodează capitalul.',
            'EV este mai relevant decât premium-ul brut atunci când compari setup-uri.',
        ],
        caution: 'În practică, managementul ieșirilor poate îmbunătăți rezultatele față de modelul simplu de hold-to-expiry.',
    },
    {
        symbol: 'α',
        title: 'Alpha',
        summary: 'Alpha normalizează EV-ul raportat la risc și arată cât edge primești pentru fiecare unitate de capital expus.',
        formula: 'Alpha = (EV / Max loss) x 100%',
        interpretation: [
            'Alpha peste 40% indică un setup foarte competitiv.',
            'Zona 20-40% rămâne validă pentru selecții bune, în funcție de context.',
            'Alpha negativă înseamnă că riscul nu este remunerat corect.',
        ],
    },
    {
        symbol: 'R:R',
        title: 'Risk / Reward',
        summary: 'Raportul dintre riscul maxim și creditul încasat arată cât capital pui în joc pentru fiecare dolar de premium.',
        formula: 'Risk / Reward = wing width / credit',
        interpretation: [
            'Sub 2.0 este excelent pentru o structură short premium.',
            'Între 2.0 și 3.0 este acceptabil în majoritatea configurațiilor.',
            'Peste 3.0 ai nevoie de justificare clară din EV, IV și structură.',
        ],
    },
    {
        symbol: '$',
        title: 'BPE',
        summary: 'Buying Power Effect este capitalul blocat de broker pentru poziție și trebuie tratat ca limită de risc, nu ca simplă cerință tehnică.',
        formula: 'BPE = max loss = (wing width - credit) x 100',
        interpretation: [
            'Folosește BPE pentru dimensionare, nu doar pentru verificarea fondurilor disponibile.',
            'Regula de 5% din net liquidity per poziție reduce riscul de concentrare.',
            'BPE trebuie citit împreună cu numărul de poziții și corelația dintre active.',
        ],
    },
];

const operatingRules = [
    ['Universe', 'Indici și ETF-uri lichide: SPX, QQQ, IWM, RUT, SPY, GLD'],
    ['Fereastră de intrare', 'Până la 45-50 DTE, ideal în jurul orei 10:00 AM New York'],
    ['Short strike delta', '16-22, în funcție de profilul de risc urmărit'],
    ['POP minim', '75-80% pentru shortlist-ul inițial'],
    ['Expected Value', 'Strict pozitiv înainte de intrare'],
    ['Alpha', 'Preferabil peste 30% pentru prioritizare'],
    ['Risk / Reward', 'Țintă sub 2.5 atunci când piața permite'],
    ['IV Rank', 'Cel puțin 17, preferabil mai ridicat pentru short premium'],
    ['Profit target', 'Închidere la 75% din profitul maxim sau expirare controlată'],
    ['Sizing', 'Maximum 5% din net liquidity pe fiecare poziție'],
];

const renderTopicCard = (topic: GuideTopic) => (
    <GuideCard key={topic.title}>
        <IonCardHeader>
            <CardTitleRow>
                <SymbolMark>{topic.symbol}</SymbolMark>
                {topic.title}
            </CardTitleRow>
        </IonCardHeader>
        <CardBody>
            <LeadText>{topic.summary}</LeadText>
            <FormulaBox>{topic.formula}</FormulaBox>
            <SuccessBox>
                <strong>Interpretare operațională</strong>
                <BulletList>
                    {topic.interpretation.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </BulletList>
            </SuccessBox>
            {topic.caution ? (
                <WarningBox>
                    <strong>Context de risc</strong>
                    <div>{topic.caution}</div>
                </WarningBox>
            ) : null}
        </CardBody>
    </GuideCard>
);

export const GreeksGuidePage: React.FC = () => {
    return (
        <AppPageShell
            eyebrow="Reference"
            title="Ghid Greeks & Metrics"
            subtitle="Cadru de interpretare pentru metricile folosite în selecția și administrarea strategiilor Iron Condor."
            fullscreen
        >
            <PageContainer>
                <PageHero>
                    <PageEyebrow>Decision framework</PageEyebrow>
                    <PageTitle>Nu memora formule. Citește expunerea corect și decide mai repede.</PageTitle>
                    <PageSubtitle>
                        Acest ghid traduce indicatorii tehnici în semnale practice pentru selecție, sizing
                        și control al riscului. Scopul este coerența deciziei, nu acumularea de definiții.
                    </PageSubtitle>
                    <HeroHighlights>
                        <HighlightPill>Selecție bazată pe edge</HighlightPill>
                        <HighlightPill>Risk context vizibil</HighlightPill>
                        <HighlightPill>Interpretare unificată pentru echipă</HighlightPill>
                    </HeroHighlights>
                </PageHero>

                <SectionStack>
                    <SectionHeader>
                        <SectionTitle>The Greeks</SectionTitle>
                        <SectionDescription>
                            Indicatorii de mai jos descriu sensibilitatea poziției la mișcarea prețului,
                            trecerea timpului și schimbările de volatilitate.
                        </SectionDescription>
                    </SectionHeader>
                    <CardGrid>{greekTopics.map(renderTopicCard)}</CardGrid>
                </SectionStack>

                <SectionStack>
                    <SectionHeader>
                        <SectionTitle>Strategy metrics</SectionTitle>
                        <SectionDescription>
                            Aceste metrici sunt folosite pentru prioritizarea setup-urilor și pentru evaluarea
                            raportului dintre edge, risc și capital blocat.
                        </SectionDescription>
                    </SectionHeader>
                    <CardGrid>{metricTopics.map(renderTopicCard)}</CardGrid>
                </SectionStack>

                <SectionStack>
                    <SectionHeader>
                        <SectionTitle>Strategia Guvidul</SectionTitle>
                        <SectionDescription>
                            Reguli operaționale sintetizate pentru a păstra selecția, managementul și sizing-ul
                            într-un cadru repetabil.
                        </SectionDescription>
                    </SectionHeader>
                    <GuideCard>
                        <CardBody>
                            <SuccessBox>
                                <strong>Cadru operațional</strong>
                                <div>
                                    Strategia se concentrează pe structuri Iron Condor cu risc definit, aplicate
                                    pe active lichide, cu intrări disciplinate și ieșiri standardizate. Accentul
                                    este pe repetabilitate, controlul downside-ului și selecție statistică, nu pe
                                    tranzacții oportuniste izolate.
                                </div>
                            </SuccessBox>
                            <RuleGrid>
                                {operatingRules.map(([label, value]) => (
                                    <RuleCard key={label}>
                                        <RuleLabel>{label}</RuleLabel>
                                        <RuleValue>{value}</RuleValue>
                                    </RuleCard>
                                ))}
                            </RuleGrid>
                        </CardBody>
                    </GuideCard>
                </SectionStack>
            </PageContainer>
        </AppPageShell>
    );
};

import React, { useState } from 'react';
import {
    IonPage,
    IonContent,
    IonButton,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

/* ── Layout ── */

const Wrapper = styled.div`
    background: #0f1117;
    color: #e8ecf1;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 40px 24px 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
`;

const Logo = styled.img`
    height: 56px;
    width: auto;
    margin-bottom: 32px;
`;

const Title = styled.h1`
    font-size: 1.8rem;
    font-weight: 800;
    color: #fff;
    text-align: center;
    margin: 0 0 8px;

    @media (max-width: 600px) { font-size: 1.4rem; }
`;

const Subtitle = styled.p`
    font-size: 1rem;
    color: #888;
    text-align: center;
    margin: 0 0 40px;
    max-width: 520px;
    line-height: 1.6;
`;

/* ── Tabs ── */

const Tabs = styled.div`
    display: flex;
    gap: 0;
    border: 1px solid #2a2d38;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 36px;
    width: 100%;
    max-width: 520px;
`;

const Tab = styled.button<{ $active: boolean }>`
    flex: 1;
    padding: 11px 16px;
    border: none;
    background: ${p => p.$active ? '#1a73e8' : 'transparent'};
    color: ${p => p.$active ? '#fff' : '#888'};
    font-size: 0.88rem;
    font-weight: ${p => p.$active ? '700' : '500'};
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    &:hover { color: #fff; background: ${p => p.$active ? '#1a73e8' : '#1e2230'}; }
`;

/* ── Steps card ── */

const Card = styled.div`
    background: #161920;
    border: 1px solid #2a2d38;
    border-radius: 16px;
    padding: 32px;
    width: 100%;
    max-width: 620px;

    @media (max-width: 600px) { padding: 24px 18px; }
`;

const StepList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 28px;
`;

const StepRow = styled.div`
    display: flex;
    gap: 20px;
    align-items: flex-start;
`;

const StepNum = styled.div`
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1a73e8, #1557b0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 800;
    color: #fff;
    margin-top: 2px;
`;

const StepBody = styled.div`
    flex: 1;
`;

const StepTitle = styled.h3`
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    margin: 0 0 6px;
`;

const StepDesc = styled.p`
    font-size: 0.9rem;
    line-height: 1.6;
    color: #aab0be;
    margin: 0;
`;

const CodeBlock = styled.code`
    display: block;
    background: #0d1117;
    border: 1px solid #2a2d38;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.82rem;
    color: #7dd3fc;
    margin-top: 10px;
    line-height: 1.7;
    word-break: break-all;
    white-space: pre-wrap;
`;

const InlineCode = styled.code`
    background: #1e2332;
    color: #f87171;
    padding: 2px 7px;
    border-radius: 5px;
    font-size: 0.85em;
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid #2a2d38;
    margin: 28px 0;
`;

const NoteBox = styled.div`
    background: rgba(26, 115, 232, 0.08);
    border: 1px solid rgba(26, 115, 232, 0.25);
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 0.88rem;
    color: #93c5fd;
    line-height: 1.6;
    margin-top: 8px;
`;

const WarningBox = styled.div`
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 0.88rem;
    color: #fde68a;
    line-height: 1.6;
    margin-top: 8px;
`;

const ExternalLink = styled.a`
    color: #60a5fa;
    font-weight: 600;
    text-decoration: none;
    &:hover { text-decoration: underline; }
`;

/* ── CTA ── */

const CTARow = styled.div`
    display: flex;
    justify-content: center;
    margin-top: 36px;
    width: 100%;
    max-width: 620px;
`;

/* ═══════════════════════ COMPONENT ═══════════════════════ */

type TabKey = 'token' | 'tutorials';

export const OnboardingPage: React.FC = () => {
    const history = useHistory();
    const [tab, setTab] = useState<TabKey>('token');

    return (
        <IonPage>
            <IonContent>
                <Wrapper>
                    <Logo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
                    <Title>Bine ai venit la Operatiunea Guvidul</Title>
                    <Subtitle>
                        Urmareste ghidul de mai jos pentru a conecta contul TastyTrade
                        si a incepe sa scanezi iron condors in timp real.
                    </Subtitle>

                    <Tabs>
                        <Tab $active={tab === 'token'} onClick={() => setTab('token')}>
                            Cum obtii token-ul
                        </Tab>
                        <Tab $active={tab === 'tutorials'} onClick={() => setTab('tutorials')}>
                            Tutoriale video
                        </Tab>
                    </Tabs>

                    {tab === 'token' && (
                        <Card>
                            <StepList>

                                <StepRow>
                                    <StepNum>1</StepNum>
                                    <StepBody>
                                        <StepTitle>Mergi pe portalul de developeri TastyTrade</StepTitle>
                                        <StepDesc>
                                            Deschide{' '}
                                            <ExternalLink
                                                href="https://developer.tastytrade.com"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                developer.tastytrade.com
                                            </ExternalLink>{' '}
                                            in browser si logeaza-te cu contul tau TastyTrade obisnuit.
                                        </StepDesc>
                                    </StepBody>
                                </StepRow>

                                <StepRow>
                                    <StepNum>2</StepNum>
                                    <StepBody>
                                        <StepTitle>Creeaza o aplicatie noua</StepTitle>
                                        <StepDesc>
                                            In dashboard-ul de developer, apasa <strong>Create Application</strong>.
                                            Seteaza un nume (ex: <InlineCode>TastyScanner</InlineCode>) si tipul{' '}
                                            <InlineCode>Confidential</InlineCode>. Redirect URI poate fi orice URL valid,
                                            de exemplu <InlineCode>https://localhost</InlineCode>.
                                        </StepDesc>
                                        <NoteBox>
                                            Dupa creare vei vedea imediat <strong>Client ID</strong> si <strong>Client Secret</strong>.
                                            Copiaza <InlineCode>client_secret</InlineCode> — il vei folosi in pasul urmator.
                                        </NoteBox>
                                    </StepBody>
                                </StepRow>

                                <StepRow>
                                    <StepNum>3</StepNum>
                                    <StepBody>
                                        <StepTitle>Obtine Refresh Token-ul prin OAuth</StepTitle>
                                        <StepDesc>
                                            TastyTrade foloseste OAuth 2.0. Cel mai simplu mod e sa faci un request
                                            direct cu credentialele tale de cont:
                                        </StepDesc>
                                        <CodeBlock>{`POST https://api.tastytrade.com/sessions
Content-Type: application/json

{
  "login": "email@tau.com",
  "password": "parola_tastytrade",
  "remember-me": true
}`}</CodeBlock>
                                        <StepDesc style={{ marginTop: 12 }}>
                                            Raspunsul va contine campul <InlineCode>remember-token</InlineCode> — acesta
                                            este <strong>Refresh Token-ul</strong> tau. Copiaza-l.
                                        </StepDesc>
                                        <NoteBox>
                                            Poti folosi curl, Postman sau orice client HTTP. Exemplu curl:
                                            <CodeBlock>{`curl -X POST https://api.tastytrade.com/sessions \\
  -H "Content-Type: application/json" \\
  -d '{"login":"email@tau.com","password":"parola","remember-me":true}'`}</CodeBlock>
                                        </NoteBox>
                                    </StepBody>
                                </StepRow>

                                <Divider />

                                <StepRow>
                                    <StepNum>4</StepNum>
                                    <StepBody>
                                        <StepTitle>Adauga credentialele in TastyScanner</StepTitle>
                                        <StepDesc>
                                            Mergi la <strong>Contul meu</strong> → <strong>Broker Accounts</strong> →
                                            apasa <strong>+ Add Account</strong> → alege <strong>TastyTrade</strong>.
                                        </StepDesc>
                                        <StepDesc style={{ marginTop: 8 }}>
                                            Completeaza cele doua campuri:
                                        </StepDesc>
                                        <CodeBlock>{`Client Secret  →  valoarea din campul "client_secret" de la developer.tastytrade.com
Refresh Token  →  valoarea din campul "remember-token" de la raspunsul /sessions`}</CodeBlock>
                                        <WarningBox>
                                            Pastreaza credentialele in siguranta. Nu le trimite niciodata pe email sau chat.
                                            TastyScanner le stocheaza criptat in Firestore, asociate contului tau.
                                        </WarningBox>
                                    </StepBody>
                                </StepRow>

                                <StepRow>
                                    <StepNum>5</StepNum>
                                    <StepBody>
                                        <StepTitle>Gata — incepe sa scanezi</StepTitle>
                                        <StepDesc>
                                            Dupa salvare, TastyScanner se va conecta automat la contul tau TastyTrade,
                                            va incarca pozitiile deschise si va incepe streaming live de date.
                                            Mergi pe pagina principala si cauta primul tau ticker.
                                        </StepDesc>
                                    </StepBody>
                                </StepRow>

                            </StepList>
                        </Card>
                    )}

                    {tab === 'tutorials' && (
                        <Card>
                            <StepDesc style={{ textAlign: 'center', marginBottom: 24 }}>
                                Tutoriale video cu demonstratii complete ale aplicatiei.
                            </StepDesc>
                            <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9' }}>
                                <iframe
                                    width="100%"
                                    height="100%"
                                    src="https://www.youtube.com/embed/wxlD3dPZ2LU?list=PLIlqy_W3O7tD2QFSYeRmHhjLcTkrdCHr6"
                                    title="Operatiunea Guvidul — Tutoriale"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    style={{ border: 'none', display: 'block' }}
                                />
                            </div>
                            <div style={{ textAlign: 'center', marginTop: 16 }}>
                                <ExternalLink
                                    href="https://www.youtube.com/playlist?list=PLIlqy_W3O7tD2QFSYeRmHhjLcTkrdCHr6"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Vezi toate clipurile pe YouTube →
                                </ExternalLink>
                            </div>
                        </Card>
                    )}

                    <CTARow>
                        <IonButton
                            expand="block"
                            style={{ maxWidth: 320 }}
                            onClick={() => history.push('/app')}
                        >
                            Continua catre aplicatie →
                        </IonButton>
                    </CTARow>
                </Wrapper>
            </IonContent>
        </IonPage>
    );
};

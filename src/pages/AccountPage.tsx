import React, { useEffect, useState } from 'react';
import {
    IonBadge,
    IonButton,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonInput,
    IonItem,
    IonSpinner,
    IonText,
} from '@ionic/react';
import {
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
} from 'firebase/auth';
import styled, { css } from 'styled-components';
import { observer } from 'mobx-react-lite';
import { checkmarkCircleOutline, closeCircleOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { auth } from '../firebase';
import { useServices } from '../hooks/use-services.hook';
import { AppPageShell } from '../components/ui/app-page-shell';
import {
    PageContainer,
    PageEyebrow,
    PageHero,
    PageSubtitle,
    PageTitle,
    SurfaceCard,
} from '../components/ui/page-primitives';

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-top: 24px;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
    }
`;

const Card = styled(SurfaceCard)`
    margin: 0;
`;

const WideCard = styled(Card)`
    grid-column: 1 / -1;
`;

const CardTitleText = styled(IonCardTitle)`
    color: var(--app-text);
    font-size: 1.1rem;
    letter-spacing: -0.02em;
`;

const CardKicker = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const CardBody = styled(IonCardContent)`
    display: grid;
    gap: 14px;
`;

const MetaRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
`;

const MetaPill = styled.div`
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
    color: var(--app-text-soft);
    font-size: 0.86rem;
    line-height: 1.5;
`;

const InlineCode = styled.code`
    font-size: 0.77rem;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--app-subtle-surface-2);
    color: var(--app-text);
`;

const HelperText = styled.p`
    margin: 0;
    color: var(--app-text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
`;

const FieldStack = styled.form`
    display: grid;
    gap: 14px;
`;

const Field = styled(IonItem)`
    --background: var(--app-subtle-surface);
    --border-color: var(--app-border);
    --padding-start: 14px;
    --padding-end: 14px;
    --min-height: 64px;
    border-radius: 18px;
`;

const ActionRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
`;

const PrimaryAction = styled(IonButton)`
    --background: linear-gradient(135deg, #67a8ff, #7de2d1);
    --background-hover: linear-gradient(135deg, #5d9cf0, #70d3c3);
    --color: #08111f;
    --border-radius: 18px;
    --box-shadow: 0 20px 32px rgba(103, 168, 255, 0.24);
    text-transform: none;
    letter-spacing: 0;
    min-height: 52px;
    flex: 1 1 220px;
`;

const SecondaryAction = styled(IonButton)`
    --background: transparent;
    --background-hover: var(--app-hover-surface);
    --border-color: var(--app-border);
    --border-radius: 18px;
    --color: var(--app-text-soft);
    text-transform: none;
    letter-spacing: 0;
    min-height: 50px;
    flex: 1 1 180px;
`;

const GhostAction = styled(IonButton)`
    --background: transparent;
    --background-hover: var(--app-hover-surface);
    --border-radius: 18px;
    --color: var(--app-text-soft);
    text-transform: none;
    letter-spacing: 0;
`;

const statusTone = {
    neutral: css`
        background: var(--app-subtle-surface);
        border-color: var(--app-border);
    `,
    success: css`
        background: rgba(84, 214, 148, 0.1);
        border-color: rgba(84, 214, 148, 0.18);
    `,
    warning: css`
        background: rgba(246, 200, 95, 0.1);
        border-color: rgba(246, 200, 95, 0.18);
    `,
    danger: css`
        background: rgba(255, 107, 126, 0.1);
        border-color: rgba(255, 107, 126, 0.18);
    `,
};

const StatusBanner = styled.div<{ $tone: keyof typeof statusTone }>`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid transparent;
    ${(props) => statusTone[props.$tone]}
`;

const StatusText = styled.div`
    display: grid;
    gap: 6px;
`;

const StatusMessage = styled.div`
    color: var(--app-text-soft);
    font-size: 0.9rem;
    line-height: 1.55;
`;

const InstructionsBox = styled.div`
    background: var(--app-subtle-surface);
    color: var(--app-text-soft);
    border-radius: 18px;
    padding: 20px;
    border: 1px solid var(--app-border);
    font-size: 0.92rem;
    line-height: 1.6;

    h3 {
        margin: 0 0 12px;
        font-size: 1rem;
        font-weight: 700;
        color: var(--ion-color-primary);
    }

    ol {
        margin: 0;
        padding-left: 20px;
    }

    li + li {
        margin-top: 8px;
    }

    a {
        color: var(--ion-color-primary);
        text-decoration: none;
        font-weight: 600;
    }

    code {
        background: var(--app-subtle-surface-2);
        color: var(--app-text);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 600;
    }
`;

const FeedbackText = styled(IonText)`
    p {
        margin: 0;
        padding: 10px 14px;
        border-radius: 14px;
        line-height: 1.5;
        font-size: 0.92rem;
        background: var(--app-subtle-surface);
        border: 1px solid var(--app-border);
    }
`;

type CredentialStatus = 'loading' | 'set' | 'missing' | 'error';

const credentialStatusUi: Record<CredentialStatus, {
    badge: string;
    message: string;
    tone: keyof typeof statusTone;
    icon?: string;
}> = {
    loading: {
        badge: 'Verificare',
        message: 'Se verifica starea credentialelor TastyTrade si conectarea la datele live.',
        tone: 'neutral',
    },
    set: {
        badge: 'Conectat',
        message: 'Credentialele sunt salvate. Poti actualiza sau revalida valorile direct din formular.',
        tone: 'success',
        icon: checkmarkCircleOutline,
    },
    missing: {
        badge: 'Neconfigurat',
        message: 'Introdu credentialele TastyTrade pentru a activa datele live si conectarea contului.',
        tone: 'warning',
        icon: closeCircleOutline,
    },
    error: {
        badge: 'Eroare',
        message: 'Credentialele nu au putut fi incarcate. Le poti reintroduce si reconecta din aceasta pagina.',
        tone: 'danger',
        icon: closeCircleOutline,
    },
};

export const AccountPage: React.FC = observer(() => {
    const services = useServices();
    const user = auth.currentUser;

    const [resetSent, setResetSent] = useState(false);
    const [resetError, setResetError] = useState('');

    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [pwdMsg, setPwdMsg] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);

    const [credStatus, setCredStatus] = useState<CredentialStatus>('loading');
    const [clientSecret, setClientSecret] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [credMsg, setCredMsg] = useState('');
    const [credError, setCredError] = useState('');
    const [credLoading, setCredLoading] = useState(false);

    useEffect(() => {
        setCredStatus('loading');
        services.credentials.loadCredentials()
            .then((creds) => {
                setCredStatus(creds ? 'set' : 'missing');
            })
            .catch(() => {
                setCredStatus('error');
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSendReset = async () => {
        if (!user?.email) return;
        setResetError('');
        try {
            await sendPasswordResetEmail(auth, user.email);
            setResetSent(true);
        } catch (e) {
            setResetError(e instanceof Error ? e.message : 'Eroare la trimiterea email-ului');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;
        if (newPwd.length < 6) {
            setPwdError('Minim 6 caractere.');
            return;
        }

        setPwdLoading(true);
        setPwdError('');
        setPwdMsg('');

        try {
            const cred = EmailAuthProvider.credential(user.email, currentPwd);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, newPwd);
            setPwdMsg('Parola a fost actualizata cu succes.');
            setCurrentPwd('');
            setNewPwd('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Eroare';
            if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
                setPwdError('Parola curenta este incorecta.');
            } else {
                setPwdError(msg);
            }
        } finally {
            setPwdLoading(false);
        }
    };

    const handleSaveCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientSecret.trim() || !refreshToken.trim()) {
            setCredError('Ambele campuri sunt obligatorii.');
            return;
        }

        setCredLoading(true);
        setCredError('');
        setCredMsg('');

        try {
            await services.credentials.saveCredentials(clientSecret.trim(), refreshToken.trim());
            services.initialize(clientSecret.trim(), refreshToken.trim());
            setCredStatus('set');
            setCredMsg('Credentialele au fost salvate. Aplicatia s-a reconectat.');
            setClientSecret('');
            setRefreshToken('');
        } catch (e) {
            setCredError(e instanceof Error ? e.message : 'Eroare la salvarea credentialelor');
        } finally {
            setCredLoading(false);
        }
    };

    const handleTestCredentials = async () => {
        if (!clientSecret.trim() || !refreshToken.trim()) {
            setCredError('Introdu credentialele mai intai pentru a le testa.');
            return;
        }

        setCredLoading(true);
        setCredError('');
        setCredMsg('');

        try {
            const valid = await services.credentials.validateCredentials(clientSecret.trim(), refreshToken.trim());
            setCredMsg(valid ? 'Formatul credentialelor este valid.' : 'Format invalid. Verifica valorile introduse.');
        } catch {
            setCredError('Nu s-au putut valida credentialele.');
        } finally {
            setCredLoading(false);
        }
    };

    const currentStatus = credentialStatusUi[credStatus];

    return (
        <AppPageShell
            eyebrow="Workspace"
            title="Cont si credentiale"
            subtitle="Securitate, conectare TastyTrade si verificari operationale pentru activarea fluxului live."
        >
            <PageContainer>
                <PageHero>
                    <PageEyebrow>Account Center</PageEyebrow>
                    <PageTitle>Cont, credentiale si verificari critice intr-un singur loc.</PageTitle>
                    <PageSubtitle>
                        Ordinea corecta ramane simpla: verifici accesul in aplicatie, confirmi starea brokerului,
                        apoi continui in scanner cu date live si context complet.
                    </PageSubtitle>
                </PageHero>

                <CardsGrid>
                    <Card>
                        <IonCardHeader>
                            <CardKicker>Identitate</CardKicker>
                            <CardTitleText>Contul meu</CardTitleText>
                        </IonCardHeader>
                        <CardBody>
                            <MetaRow>
                                <MetaPill>{user?.email ?? 'Necunoscut'}</MetaPill>
                                <MetaPill>UID: <InlineCode>{user?.uid ?? '—'}</InlineCode></MetaPill>
                            </MetaRow>
                            <HelperText>
                                Parola aplicatiei controleaza doar accesul in workspace. Credentialele brokerului raman separate si se administreaza mai jos.
                            </HelperText>
                            <ActionRow>
                                {resetSent ? (
                                    <FeedbackText color="success">
                                        <p>Email de resetare trimis la {user?.email}</p>
                                    </FeedbackText>
                                ) : (
                                    <SecondaryAction fill="outline" onClick={() => void handleSendReset()}>
                                        Trimite email de resetare
                                    </SecondaryAction>
                                )}
                            </ActionRow>
                            {resetError && (
                                <FeedbackText color="danger">
                                    <p>{resetError}</p>
                                </FeedbackText>
                            )}
                        </CardBody>
                    </Card>

                    <Card>
                        <IonCardHeader>
                            <CardKicker>Securitate</CardKicker>
                            <CardTitleText>Actualizeaza parola</CardTitleText>
                        </IonCardHeader>
                        <CardBody>
                            <FieldStack onSubmit={handleChangePassword}>
                                <Field>
                                    <IonInput
                                        label="Parola curenta"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="••••••••"
                                        value={currentPwd}
                                        onIonInput={e => setCurrentPwd(e.detail.value ?? '')}
                                        required
                                    />
                                </Field>
                                <Field>
                                    <IonInput
                                        label="Parola noua"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Minim 6 caractere"
                                        value={newPwd}
                                        onIonInput={e => setNewPwd(e.detail.value ?? '')}
                                        required
                                    />
                                </Field>
                                {pwdError && (
                                    <FeedbackText color="danger">
                                        <p>{pwdError}</p>
                                    </FeedbackText>
                                )}
                                {pwdMsg && (
                                    <FeedbackText color="success">
                                        <p>{pwdMsg}</p>
                                    </FeedbackText>
                                )}
                                <PrimaryAction expand="block" type="submit" disabled={pwdLoading}>
                                    {pwdLoading ? <IonSpinner name="crescent" /> : 'Actualizeaza parola'}
                                </PrimaryAction>
                            </FieldStack>
                        </CardBody>
                    </Card>

                    <WideCard>
                        <IonCardHeader>
                            <CardKicker>Broker</CardKicker>
                            <CardTitleText>Credentiale TastyTrade</CardTitleText>
                        </IonCardHeader>
                        <CardBody>
                            <StatusBanner $tone={currentStatus.tone}>
                                {credStatus === 'loading' ? (
                                    <IonSpinner name="dots" />
                                ) : currentStatus.icon ? (
                                    <IonIcon icon={currentStatus.icon} color={currentStatus.tone === 'success' ? 'success' : currentStatus.tone === 'warning' ? 'warning' : 'danger'} style={{ fontSize: '1.3rem' }} />
                                ) : null}
                                <StatusText>
                                    <IonBadge color={currentStatus.tone === 'success' ? 'success' : currentStatus.tone === 'warning' ? 'warning' : currentStatus.tone === 'danger' ? 'danger' : 'medium'}>
                                        {currentStatus.badge}
                                    </IonBadge>
                                    <StatusMessage>{currentStatus.message}</StatusMessage>
                                </StatusText>
                            </StatusBanner>

                            <InstructionsBox>
                                <h3>Cum obtii cheile API de la TastyTrade</h3>
                                <ol>
                                    <li>Autentifica-te pe <a href="https://developer.tastytrade.com" target="_blank" rel="noopener noreferrer">developer.tastytrade.com</a>.</li>
                                    <li>Intra in sectiunea <strong>My Apps &amp; Keys</strong>.</li>
                                    <li>Creeaza o aplicatie noua cu orice nume intern.</li>
                                    <li>Copiaza <code>Client Secret</code> si lipeste-l in formular.</li>
                                    <li>Genereaza un <strong>Refresh Token</strong> cu scope-ul <code>read trade</code>.</li>
                                    <li>Copiaza <code>Refresh Token</code> si finalizeaza reconectarea de aici.</li>
                                </ol>
                            </InstructionsBox>

                            <FieldStack onSubmit={handleSaveCredentials}>
                                <Field>
                                    <IonInput
                                        label="Client Secret"
                                        labelPlacement="stacked"
                                        type={showSecret ? 'text' : 'password'}
                                        placeholder="Lipeste client_secret aici"
                                        value={clientSecret}
                                        onIonInput={e => setClientSecret(e.detail.value ?? '')}
                                    />
                                    <GhostAction slot="end" fill="clear" size="small" onClick={() => setShowSecret(!showSecret)}>
                                        <IonIcon icon={showSecret ? eyeOffOutline : eyeOutline} />
                                    </GhostAction>
                                </Field>

                                <Field>
                                    <IonInput
                                        label="Refresh Token"
                                        labelPlacement="stacked"
                                        type={showToken ? 'text' : 'password'}
                                        placeholder="Lipeste refresh_token aici"
                                        value={refreshToken}
                                        onIonInput={e => setRefreshToken(e.detail.value ?? '')}
                                    />
                                    <GhostAction slot="end" fill="clear" size="small" onClick={() => setShowToken(!showToken)}>
                                        <IonIcon icon={showToken ? eyeOffOutline : eyeOutline} />
                                    </GhostAction>
                                </Field>

                                {credError && (
                                    <FeedbackText color="danger">
                                        <p>{credError}</p>
                                    </FeedbackText>
                                )}
                                {credMsg && (
                                    <FeedbackText color="success">
                                        <p>{credMsg}</p>
                                    </FeedbackText>
                                )}

                                <ActionRow>
                                    <PrimaryAction type="submit" disabled={credLoading}>
                                        {credLoading ? <IonSpinner name="crescent" /> : 'Salveaza si reconecteaza'}
                                    </PrimaryAction>
                                    <SecondaryAction fill="outline" disabled={credLoading} onClick={() => void handleTestCredentials()}>
                                        Testeaza formatul
                                    </SecondaryAction>
                                </ActionRow>
                            </FieldStack>
                        </CardBody>
                    </WideCard>
                </CardsGrid>
            </PageContainer>
        </AppPageShell>
    );
});

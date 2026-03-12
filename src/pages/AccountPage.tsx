import React, { useState, useEffect } from 'react';
import {
    IonPage, IonContent, IonCard, IonCardHeader, IonCardTitle,
    IonCardContent, IonItem, IonInput, IonButton, IonText,
    IonBadge, IonSpinner, IonIcon,
} from '@ionic/react';
import {
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase';
import styled from 'styled-components';
import { useServices } from '../hooks/use-services.hook';
import { checkmarkCircleOutline, closeCircleOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { observer } from 'mobx-react-lite';

const PageBox = styled.div`
    max-width: 600px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const SectionTitle = styled.h3`
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ion-color-medium);
    margin: 0 0 4px 0;
`;

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
`;

const ApiInstructionsBox = styled.div`
    background: #ffffff;
    color: #1a1a2e;
    border-radius: 10px;
    padding: 20px;
    margin: 12px 0 16px;
    font-size: 0.9rem;
    line-height: 1.6;
    border: 1px solid #e0e0e0;

    h3 {
        margin: 0 0 12px 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: #1a73e8;
    }

    ol {
        margin: 0;
        padding-left: 22px;
    }

    li {
        margin-bottom: 8px;
        color: #333;
    }

    a {
        color: #1a73e8;
        text-decoration: none;
        font-weight: 600;
        &:hover {
            text-decoration: underline;
        }
    }

    code {
        background: #f0f0f0;
        color: #d63384;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 600;
    }
`;

type CredentialStatus = 'loading' | 'set' | 'missing' | 'error';

export const AccountPage: React.FC = observer(() => {
    const services = useServices();
    const user = auth.currentUser;

    // ── Resetare parola (email) ─────────────────────────────────────────────
    const [resetSent, setResetSent] = useState(false);
    const [resetError, setResetError] = useState('');

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

    // ── Schimbare parola ────────────────────────────────────────────────────
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [pwdMsg, setPwdMsg] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;
        if (newPwd.length < 6) { setPwdError('Minim 6 caractere.'); return; }
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

    // ── Credentiale TastyTrade ─────────────────────────────────────────────
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
            setCredMsg(valid ? '✅ Formatul credentialelor este valid.' : '❌ Format invalid — verifica valorile.');
        } catch {
            setCredError('Nu s-au putut valida credentialele.');
        } finally {
            setCredLoading(false);
        }
    };

    return (
        <IonPage>
            <IonContent>
                <PageBox>

                    {/* ── Informatii cont ────────────────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>Contul meu</SectionTitle>
                            <IonCardTitle style={{ fontSize: '1.1rem' }}>
                                {user?.email ?? 'Necunoscut'}
                            </IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)', marginBottom: '12px' }}>
                                UID: <code style={{ fontSize: '0.75rem' }}>{user?.uid ?? '—'}</code>
                            </p>
                            {resetSent ? (
                                <IonText color="success">
                                    <p>Email de resetare trimis la {user?.email}</p>
                                </IonText>
                            ) : (
                                <IonButton fill="outline" size="small" onClick={() => void handleSendReset()}>
                                    Trimite email de resetare parola
                                </IonButton>
                            )}
                            {resetError && <IonText color="danger"><p>{resetError}</p></IonText>}
                        </IonCardContent>
                    </IonCard>

                    {/* ── Schimbare parola ──────────────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>Schimba parola</SectionTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <form onSubmit={handleChangePassword}>
                                <IonItem>
                                    <IonInput
                                        label="Parola curenta"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="••••••••"
                                        value={currentPwd}
                                        onIonInput={e => setCurrentPwd(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonItem>
                                    <IonInput
                                        label="Parola noua"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Minim 6 caractere"
                                        value={newPwd}
                                        onIonInput={e => setNewPwd(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                {pwdError && <IonText color="danger"><p>{pwdError}</p></IonText>}
                                {pwdMsg && <IonText color="success"><p>{pwdMsg}</p></IonText>}
                                <IonButton
                                    expand="block"
                                    type="submit"
                                    disabled={pwdLoading}
                                    className="ion-margin-top"
                                    fill="outline"
                                >
                                    {pwdLoading ? <IonSpinner name="crescent" /> : 'Actualizeaza parola'}
                                </IonButton>
                            </form>
                        </IonCardContent>
                    </IonCard>

                    {/* ── Credentiale TastyTrade ───────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>Credentiale TastyTrade</SectionTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            {/* Status indicator */}
                            <StatusRow>
                                {credStatus === 'loading' && (
                                    <><IonSpinner name="dots" /><span style={{ fontSize: '0.85rem', color: 'var(--ion-color-medium)' }}>Se verifica credentialele…</span></>
                                )}
                                {credStatus === 'set' && (
                                    <>
                                        <IonIcon icon={checkmarkCircleOutline} color="success" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="success">Conectat</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Credentialele sunt salvate. Foloseste formularul de mai jos pentru a le actualiza.</span>
                                    </>
                                )}
                                {credStatus === 'missing' && (
                                    <>
                                        <IonIcon icon={closeCircleOutline} color="warning" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="warning">Neconfigurat</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Introdu credentialele TastyTrade mai jos.</span>
                                    </>
                                )}
                                {credStatus === 'error' && (
                                    <>
                                        <IonIcon icon={closeCircleOutline} color="danger" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="danger">Eroare</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Nu s-au putut incarca credentialele. Introdu-le mai jos.</span>
                                    </>
                                )}
                            </StatusRow>

                            <ApiInstructionsBox>
                                <h3>Cum obtii cheile API de la TastyTrade</h3>
                                <ol>
                                    <li>Autentifica-te pe <a href="https://developer.tastytrade.com" target="_blank" rel="noopener noreferrer">developer.tastytrade.com</a></li>
                                    <li>Mergi la <strong>My Apps & Keys</strong></li>
                                    <li>Apasa <strong>Add Application</strong> si da-i orice nume</li>
                                    <li>Copiaza <code>Client Secret</code> si lipeste-l mai jos</li>
                                    <li>La sectiunea <strong>OAuth</strong>, genereaza un <strong>Refresh Token</strong> cu scope-ul <code>read trade</code></li>
                                    <li>Copiaza <code>Refresh Token</code> si lipeste-l mai jos</li>
                                </ol>
                            </ApiInstructionsBox>

                            <form onSubmit={handleSaveCredentials}>
                                <IonItem>
                                    <IonInput
                                        label="Client Secret"
                                        labelPlacement="stacked"
                                        type={showSecret ? 'text' : 'password'}
                                        placeholder="Lipeste client_secret aici"
                                        value={clientSecret}
                                        onIonInput={e => setClientSecret(e.detail.value ?? '')}
                                    />
                                    <IonButton
                                        slot="end"
                                        fill="clear"
                                        size="small"
                                        onClick={() => setShowSecret(!showSecret)}
                                        style={{ marginTop: '16px' }}
                                    >
                                        <IonIcon icon={showSecret ? eyeOffOutline : eyeOutline} />
                                    </IonButton>
                                </IonItem>

                                <IonItem>
                                    <IonInput
                                        label="Refresh Token"
                                        labelPlacement="stacked"
                                        type={showToken ? 'text' : 'password'}
                                        placeholder="Lipeste refresh_token aici"
                                        value={refreshToken}
                                        onIonInput={e => setRefreshToken(e.detail.value ?? '')}
                                    />
                                    <IonButton
                                        slot="end"
                                        fill="clear"
                                        size="small"
                                        onClick={() => setShowToken(!showToken)}
                                        style={{ marginTop: '16px' }}
                                    >
                                        <IonIcon icon={showToken ? eyeOffOutline : eyeOutline} />
                                    </IonButton>
                                </IonItem>

                                {credError && <IonText color="danger"><p style={{ padding: '8px 0' }}>{credError}</p></IonText>}
                                {credMsg && <IonText color="success"><p style={{ padding: '8px 0' }}>{credMsg}</p></IonText>}

                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <IonButton
                                        type="submit"
                                        disabled={credLoading}
                                        style={{ flex: 1 }}
                                    >
                                        {credLoading ? <IonSpinner name="crescent" /> : 'Salveaza & Reconecteaza'}
                                    </IonButton>
                                    <IonButton
                                        fill="outline"
                                        disabled={credLoading}
                                        onClick={() => void handleTestCredentials()}
                                    >
                                        Testeaza
                                    </IonButton>
                                </div>
                            </form>
                        </IonCardContent>
                    </IonCard>

                </PageBox>
            </IonContent>
        </IonPage>
    );
});

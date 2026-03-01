import React, { useState, useEffect } from 'react';
import {
    IonPage, IonContent, IonCard, IonCardHeader, IonCardTitle,
    IonCardContent, IonItem, IonInput, IonButton, IonText,
    IonBadge, IonNote, IonSpinner, IonIcon,
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

type CredentialStatus = 'loading' | 'set' | 'missing' | 'error';

export const AccountPage: React.FC = observer(() => {
    const services = useServices();
    const user = auth.currentUser;

    // ── Password reset (email) ─────────────────────────────────────────────
    const [resetSent, setResetSent] = useState(false);
    const [resetError, setResetError] = useState('');

    const handleSendReset = async () => {
        if (!user?.email) return;
        setResetError('');
        try {
            await sendPasswordResetEmail(auth, user.email);
            setResetSent(true);
        } catch (e) {
            setResetError(e instanceof Error ? e.message : 'Failed to send reset email');
        }
    };

    // ── Change password ────────────────────────────────────────────────────
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [pwdMsg, setPwdMsg] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;
        if (newPwd.length < 6) { setPwdError('Minimum 6 characters.'); return; }
        setPwdLoading(true);
        setPwdError('');
        setPwdMsg('');
        try {
            const cred = EmailAuthProvider.credential(user.email, currentPwd);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, newPwd);
            setPwdMsg('Password updated successfully.');
            setCurrentPwd('');
            setNewPwd('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed';
            if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
                setPwdError('Current password is incorrect.');
            } else {
                setPwdError(msg);
            }
        } finally {
            setPwdLoading(false);
        }
    };

    // ── TastyTrade Credentials ─────────────────────────────────────────────
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
            setCredError('Both fields are required.');
            return;
        }
        setCredLoading(true);
        setCredError('');
        setCredMsg('');
        try {
            let savedToServer = false;
            try {
                await services.credentials.saveCredentials(clientSecret.trim(), refreshToken.trim());
                savedToServer = true;
            } catch {
                // Functions unreachable (CORS/not deployed) — still initialize locally
            }
            // Always reconnect with the entered credentials
            services.initialize(clientSecret.trim(), refreshToken.trim());
            setCredStatus('set');
            setCredMsg(savedToServer ? 'Credentials saved. App reconnected.' : 'App reconnected locally (server unreachable).');
            setClientSecret('');
            setRefreshToken('');
        } catch (e) {
            setCredError(e instanceof Error ? e.message : 'Failed to save credentials');
        } finally {
            setCredLoading(false);
        }
    };

    const handleTestCredentials = async () => {
        if (!clientSecret.trim() || !refreshToken.trim()) {
            setCredError('Enter credentials first to test them.');
            return;
        }
        setCredLoading(true);
        setCredError('');
        setCredMsg('');
        try {
            const valid = await services.credentials.validateCredentials(clientSecret.trim(), refreshToken.trim());
            setCredMsg(valid ? '✅ Credentials format is valid.' : '❌ Credentials format invalid — check the values.');
        } catch {
            setCredError('Could not reach the server. Make sure Functions are deployed.');
        } finally {
            setCredLoading(false);
        }
    };

    return (
        <IonPage>
            <IonContent>
                <PageBox>

                    {/* ── Account Info ────────────────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>Account</SectionTitle>
                            <IonCardTitle style={{ fontSize: '1.1rem' }}>
                                {user?.email ?? 'Unknown'}
                            </IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)', marginBottom: '12px' }}>
                                UID: <code style={{ fontSize: '0.75rem' }}>{user?.uid ?? '—'}</code>
                            </p>
                            {resetSent ? (
                                <IonText color="success">
                                    <p>Password reset email sent to {user?.email}</p>
                                </IonText>
                            ) : (
                                <IonButton fill="outline" size="small" onClick={() => void handleSendReset()}>
                                    Send password reset email
                                </IonButton>
                            )}
                            {resetError && <IonText color="danger"><p>{resetError}</p></IonText>}
                        </IonCardContent>
                    </IonCard>

                    {/* ── Change Password ──────────────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>Change Password</SectionTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <form onSubmit={handleChangePassword}>
                                <IonItem>
                                    <IonInput
                                        label="Current password"
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
                                        label="New password"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Min. 6 characters"
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
                                    {pwdLoading ? <IonSpinner name="crescent" /> : 'Update Password'}
                                </IonButton>
                            </form>
                        </IonCardContent>
                    </IonCard>

                    {/* ── TastyTrade Credentials ───────────────────────── */}
                    <IonCard>
                        <IonCardHeader>
                            <SectionTitle>TastyTrade Credentials</SectionTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            {/* Status indicator */}
                            <StatusRow>
                                {credStatus === 'loading' && (
                                    <><IonSpinner name="dots" /><span style={{ fontSize: '0.85rem', color: 'var(--ion-color-medium)' }}>Checking credentials…</span></>
                                )}
                                {credStatus === 'set' && (
                                    <>
                                        <IonIcon icon={checkmarkCircleOutline} color="success" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="success">Connected</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Credentials saved. Use the form below to update them.</span>
                                    </>
                                )}
                                {credStatus === 'missing' && (
                                    <>
                                        <IonIcon icon={closeCircleOutline} color="warning" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="warning">Not configured</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Enter your TastyTrade credentials below.</span>
                                    </>
                                )}
                                {credStatus === 'error' && (
                                    <>
                                        <IonIcon icon={closeCircleOutline} color="danger" style={{ fontSize: '1.3rem' }} />
                                        <IonBadge color="danger">Cannot reach server</IonBadge>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--ion-color-medium)' }}>Functions not deployed yet. Enter credentials to save locally.</span>
                                    </>
                                )}
                            </StatusRow>

                            <form onSubmit={handleSaveCredentials}>
                                <IonItem>
                                    <IonInput
                                        label="Client Secret"
                                        labelPlacement="stacked"
                                        type={showSecret ? 'text' : 'password'}
                                        placeholder="Your TastyTrade client_secret"
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
                                    <IonNote slot="helper">
                                        TastyTrade → Settings → API Tokens → Client Secret (40 hex chars)
                                    </IonNote>
                                </IonItem>

                                <IonItem>
                                    <IonInput
                                        label="Refresh Token"
                                        labelPlacement="stacked"
                                        type={showToken ? 'text' : 'password'}
                                        placeholder="Your TastyTrade refresh_token (JWT)"
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
                                    <IonNote slot="helper">
                                        TastyTrade → Settings → API Tokens → Remember Token (long JWT string)
                                    </IonNote>
                                </IonItem>

                                {credError && <IonText color="danger"><p style={{ padding: '8px 0' }}>{credError}</p></IonText>}
                                {credMsg && <IonText color="success"><p style={{ padding: '8px 0' }}>{credMsg}</p></IonText>}

                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <IonButton
                                        type="submit"
                                        disabled={credLoading}
                                        style={{ flex: 1 }}
                                    >
                                        {credLoading ? <IonSpinner name="crescent" /> : 'Save & Reconnect'}
                                    </IonButton>
                                    <IonButton
                                        fill="outline"
                                        disabled={credLoading}
                                        onClick={() => void handleTestCredentials()}
                                    >
                                        Test
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

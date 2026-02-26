import React, { useState } from 'react';
import {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonText,
    IonNote,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { FirebaseAuthService } from '../services/auth/firebase-auth.service';
import styled from 'styled-components';

const CenteredContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100%;
    padding: 20px;
`;

const StyledCard = styled(IonCard)`
    max-width: 400px;
    width: 100%;
`;

const authService = new FirebaseAuthService();

export const RegisterPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const history = useHistory();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.register(email, password);
            const idToken = await user.getIdToken();

            const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_BASE_URL}/api/credentials`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    clientSecret,
                    refreshToken,
                }),
            });

            if (!response.ok) {
                const data: unknown = await response.json().catch(() => ({}));
                const message = (data as { message?: string }).message ?? 'Failed to save credentials';
                throw new Error(message);
            }

            history.push('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonPage>
            <IonContent>
                <CenteredContainer>
                    <StyledCard>
                        <IonCardHeader>
                            <IonCardTitle className="ion-text-center">Create Account</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <form onSubmit={handleSubmit}>
                                <IonItem>
                                    <IonLabel slot="label">Email</IonLabel>
                                    <IonInput
                                        type="email"
                                        value={email}
                                        onIonInput={e => setEmail(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonItem>
                                    <IonLabel slot="label">Password</IonLabel>
                                    <IonInput
                                        type="password"
                                        value={password}
                                        onIonInput={e => setPassword(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonItem>
                                    <IonLabel slot="label">Confirm Password</IonLabel>
                                    <IonInput
                                        type="password"
                                        value={confirmPassword}
                                        onIonInput={e => setConfirmPassword(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonItem>
                                    <IonLabel slot="label">TastyTrade Client Secret</IonLabel>
                                    <IonInput
                                        type="password"
                                        value={clientSecret}
                                        onIonInput={e => setClientSecret(e.detail.value ?? '')}
                                        required
                                    />
                                    <IonNote slot="helper">
                                        Found in TastyTrade API settings under API tokens
                                    </IonNote>
                                </IonItem>
                                <IonItem>
                                    <IonLabel slot="label">TastyTrade Refresh Token</IonLabel>
                                    <IonInput
                                        type="password"
                                        value={refreshToken}
                                        onIonInput={e => setRefreshToken(e.detail.value ?? '')}
                                        required
                                    />
                                    <IonNote slot="helper">
                                        Found in TastyTrade API settings — generate a remember token to get a refresh token
                                    </IonNote>
                                </IonItem>
                                <IonButton
                                    expand="block"
                                    type="submit"
                                    disabled={loading}
                                    className="ion-margin-top"
                                >
                                    {loading ? 'Creating account...' : 'Register'}
                                </IonButton>
                                {error && (
                                    <IonText color="danger">
                                        <p>{error}</p>
                                    </IonText>
                                )}
                                <IonButton fill="clear" expand="block" routerLink="/login">
                                    Already have an account? Login
                                </IonButton>
                            </form>
                        </IonCardContent>
                    </StyledCard>
                </CenteredContainer>
            </IonContent>
        </IonPage>
    );
};

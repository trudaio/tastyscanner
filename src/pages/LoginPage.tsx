import React, { useState } from 'react';
import {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonInput,
    IonButton,
    IonText,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { FirebaseAuthService } from '../services/auth/firebase-auth.service';
import styled from 'styled-components';

const CenteredContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 20px;
`;

const StyledCard = styled(IonCard)`
    max-width: 400px;
    width: 100%;
`;

const authService = new FirebaseAuthService();

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const history = useHistory();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await authService.login(email, password);
            history.push('/app');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
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
                            <IonCardTitle className="ion-text-center">Operatiunea Guvidul</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <form onSubmit={handleSubmit}>
                                <IonItem>
                                    <IonInput
                                        label="Email"
                                        labelPlacement="stacked"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onIonInput={e => setEmail(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonItem>
                                    <IonInput
                                        label="Password"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Your password"
                                        value={password}
                                        onIonInput={e => setPassword(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>
                                <IonButton
                                    expand="block"
                                    type="submit"
                                    disabled={loading}
                                    className="ion-margin-top"
                                >
                                    {loading ? 'Logging in...' : 'Login'}
                                </IonButton>
                                {error && (
                                    <IonText color="danger">
                                        <p>{error}</p>
                                    </IonText>
                                )}
                                <IonButton fill="clear" expand="block" routerLink="/register">
                                    Don't have an account? Register
                                </IonButton>
                            </form>
                        </IonCardContent>
                    </StyledCard>
                </CenteredContainer>
            </IonContent>
        </IonPage>
    );
};

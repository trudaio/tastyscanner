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
    min-height: 100%;
    padding: 20px;
`;

const StyledCard = styled(IonCard)`
    max-width: 440px;
    width: 100%;
`;

const authService = new FirebaseAuthService();

export const RegisterPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const history = useHistory();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Parolele nu se potrivesc.');
            return;
        }

        setLoading(true);
        try {
            await authService.register(email, password);
            history.push('/account');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Inregistrarea a esuat');
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
                            <IonCardTitle className="ion-text-center">Creeaza cont</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <form onSubmit={handleSubmit}>

                                <IonItem>
                                    <IonInput
                                        label="Email"
                                        labelPlacement="stacked"
                                        type="email"
                                        placeholder="email@exemplu.com"
                                        value={email}
                                        onIonInput={e => setEmail(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>

                                <IonItem>
                                    <IonInput
                                        label="Parola"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Minim 6 caractere"
                                        value={password}
                                        onIonInput={e => setPassword(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>

                                <IonItem>
                                    <IonInput
                                        label="Confirma parola"
                                        labelPlacement="stacked"
                                        type="password"
                                        placeholder="Repeta parola"
                                        value={confirmPassword}
                                        onIonInput={e => setConfirmPassword(e.detail.value ?? '')}
                                        required
                                    />
                                </IonItem>

                                <IonButton
                                    expand="block"
                                    type="submit"
                                    disabled={loading}
                                    className="ion-margin-top"
                                >
                                    {loading ? 'Se creeaza contul...' : 'Inregistreaza-te'}
                                </IonButton>

                                {error && (
                                    <IonText color="danger">
                                        <p>{error}</p>
                                    </IonText>
                                )}

                                <IonButton fill="clear" expand="block" routerLink="/login">
                                    Ai deja cont? Autentifica-te
                                </IonButton>
                            </form>
                        </IonCardContent>
                    </StyledCard>
                </CenteredContainer>
            </IonContent>
        </IonPage>
    );
};

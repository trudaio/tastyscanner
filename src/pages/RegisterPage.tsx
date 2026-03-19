import React, { useState } from 'react';
import { IonInput } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { FirebaseAuthService } from '../services/auth/firebase-auth.service';
import { AuthLayout } from '../components/ui/auth-layout';
import {
    AuthField,
    AuthForm,
    AuthHelper,
    AuthMessage,
    AuthPrimaryButton,
    AuthSecondaryButton,
} from '../components/ui/auth-form';

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
        <AuthLayout
            badge="Provisionare acces"
            brandTitle="Configurezi accesul. Calibrarea vine imediat dupa."
            brandSubtitle="Crearea contului trebuie sa fie rapida, iar partea operationala ramane intr-un pas separat, controlat si explicit."
            eyebrow="Cont nou"
            subtitle="Deschizi contul, apoi continui in zona My Account pentru credentialele TastyTrade si configurarea initiala a mediului."
            title="Provisioneaza workspace-ul"
        >
            <AuthForm onSubmit={handleSubmit}>
                <AuthField>
                    <IonInput
                        label="Email"
                        labelPlacement="stacked"
                        type="email"
                        placeholder="email@exemplu.com"
                        value={email}
                        onIonInput={e => setEmail(e.detail.value ?? '')}
                        required
                    />
                </AuthField>

                <AuthField>
                    <IonInput
                        label="Parola"
                        labelPlacement="stacked"
                        type="password"
                        placeholder="Minim 6 caractere"
                        value={password}
                        onIonInput={e => setPassword(e.detail.value ?? '')}
                        required
                    />
                </AuthField>

                <AuthField>
                    <IonInput
                        label="Confirma parola"
                        labelPlacement="stacked"
                        type="password"
                        placeholder="Repeta parola"
                        value={confirmPassword}
                        onIonInput={e => setConfirmPassword(e.detail.value ?? '')}
                        required
                    />
                </AuthField>

                <AuthHelper>
                    <span>Parola securizeaza accesul in aplicatie. Credentialele brokerului se pastreaza separat, in fluxul dedicat de conectare.</span>
                </AuthHelper>

                {error && (
                    <AuthMessage color="danger">
                        <p>{error}</p>
                    </AuthMessage>
                )}

                <AuthPrimaryButton expand="block" type="submit" disabled={loading}>
                    {loading ? 'Se creeaza contul...' : 'Provisioneaza contul'}
                </AuthPrimaryButton>

                <AuthSecondaryButton fill="outline" expand="block" routerLink="/login">
                    Ai deja cont? Autentifica-te
                </AuthSecondaryButton>
            </AuthForm>
        </AuthLayout>
    );
};

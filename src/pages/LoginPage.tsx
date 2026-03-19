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
            setError(err instanceof Error ? err.message : 'Autentificarea a esuat');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            badge="Workspace activ"
            brandTitle="Acces rapid la un workspace disciplinat."
            brandSubtitle="Operatiunea Guvidul este gandita pentru selectie structurata, control de risc si executie fara frictiune operationala."
            eyebrow="Autentificare"
            subtitle="Autentifica-te pentru a reveni in workspace-ul tau, cu watchlist-uri, filtre si date de portofoliu disponibile in acelasi flux."
            title="Reintra in mediul de lucru"
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
                        placeholder="Introdu parola contului"
                        value={password}
                        onIonInput={e => setPassword(e.detail.value ?? '')}
                        required
                    />
                </AuthField>

                <AuthHelper>
                    <span>Ai nevoie doar de email si parola. Credentialele TastyTrade raman separate si se administreaza din contul tau.</span>
                </AuthHelper>

                {error && (
                    <AuthMessage color="danger">
                        <p>{error}</p>
                    </AuthMessage>
                )}

                <AuthPrimaryButton expand="block" type="submit" disabled={loading}>
                    {loading ? 'Se autentifica...' : 'Acceseaza workspace-ul'}
                </AuthPrimaryButton>

                <AuthSecondaryButton fill="outline" expand="block" routerLink="/register">
                    Nu ai cont? Creeaza unul
                </AuthSecondaryButton>
            </AuthForm>
        </AuthLayout>
    );
};

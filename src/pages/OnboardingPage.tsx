import React from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { AuthLayout } from '../components/ui/auth-layout';
import { AuthPrimaryButton, AuthSecondaryButton, AuthHelper } from '../components/ui/auth-form';

const Checklist = styled.div`
    display: grid;
    gap: 12px;
    margin-top: 8px;
`;

const ChecklistItem = styled.div`
    padding: 14px 16px;
    border-radius: 16px;
    border: 1px solid var(--app-border);
    background: var(--app-subtle-surface);
`;

const ChecklistTitle = styled.div`
    color: var(--app-text);
    font-weight: 700;
    margin-bottom: 4px;
`;

const ChecklistText = styled.div`
    color: var(--app-text-muted);
    line-height: 1.55;
    font-size: 0.92rem;
`;

const ButtonRow = styled.div`
    display: grid;
    gap: 12px;
    margin-top: 22px;
`;

export const OnboardingPage: React.FC = () => {
    const history = useHistory();

    return (
        <AuthLayout
            badge="Initial setup"
            brandTitle="Conectezi datele. Abia dupa aceea incepe analiza."
            brandSubtitle="Pasul acesta pregateste fluxul operational: autentificare, credentiale broker si reguli de risc vizibile direct in workspace."
            eyebrow="Onboarding"
            subtitle="Nu intri direct in scanner fara context. Mai intai confirmi datele necesare, apoi continui intr-un mediu pregatit pentru decizie."
            title="Bine ai venit in workspace"
        >
            <Checklist>
                <ChecklistItem>
                    <ChecklistTitle>1. Verifica accesul in cont</ChecklistTitle>
                    <ChecklistText>Ai deja contul creat. Dupa autentificare, pagina My Account ramane punctul unic pentru credentiale si configurari sensibile.</ChecklistText>
                </ChecklistItem>

                <ChecklistItem>
                    <ChecklistTitle>2. Adauga credentialele TastyTrade</ChecklistTitle>
                    <ChecklistText>Aplicatia foloseste client secret si refresh token pentru a incarca datele de cont, greeks-urile si fluxul de quote-uri in timp real.</ChecklistText>
                </ChecklistItem>

                <ChecklistItem>
                    <ChecklistTitle>3. Incepe cu watchlist si filtre simple</ChecklistTitle>
                    <ChecklistText>Alege mai intai simbolurile relevante si un range de delta/DTE. Ajustarile avansate raman disponibile fara sa incarce excesiv primul workflow.</ChecklistText>
                </ChecklistItem>
            </Checklist>

            <AuthHelper>
                <span>Poti intra direct in aplicatie, dar varianta corecta operational este sa verifici mai intai credentialele brokerului in My Account.</span>
            </AuthHelper>

            <ButtonRow>
                <AuthPrimaryButton expand="block" onClick={() => history.push('/account')}>
                    Continua spre My Account
                </AuthPrimaryButton>
                <AuthSecondaryButton fill="outline" expand="block" onClick={() => history.push('/app')}>
                    Intra direct in scanner
                </AuthSecondaryButton>
            </ButtonRow>
        </AuthLayout>
    );
};

import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { IonPage, IonContent, IonSpinner, IonText } from '@ionic/react';
import styled from 'styled-components';
import { auth } from '../firebase';

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 16px;
    padding: 24px;
    text-align: center;
`;

const StatusText = styled.div`
    font-size: 1rem;
    color: #ccc;
`;

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_URL ?? 'https://api-4jy4u5mpaa-uc.a.run.app';
const IBKR_CONSUMER_KEY = import.meta.env.VITE_IBKR_CONSUMER_KEY ?? '';

/**
 * Handles the redirect back from IBKR OAuth authorization.
 * Extracts the ?code= param, exchanges it for tokens via our Firebase Function,
 * then redirects to /app.
 */
export const IbkrCallbackPage: React.FC = () => {
    const location = useLocation();
    const history = useHistory();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            setStatus('error');
            setErrorMsg(`IBKR denied access: ${error}`);
            return;
        }

        if (!code) {
            setStatus('error');
            setErrorMsg('No authorization code received from IBKR.');
            return;
        }

        void (async () => {
            try {
                const user = auth.currentUser;
                if (!user) {
                    setStatus('error');
                    setErrorMsg('Not logged in. Please log in first.');
                    return;
                }

                const idToken = await user.getIdToken();
                const redirectUri = `${window.location.origin}/ibkr-callback`;

                const resp = await fetch(`${FUNCTIONS_BASE}/api/ibkr/oauth/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        code,
                        redirectUri,
                        consumerKey: IBKR_CONSUMER_KEY,
                    }),
                });

                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error((data as { error: string }).error || `HTTP ${resp.status}`);
                }

                setStatus('success');
                // Redirect to app after short delay
                setTimeout(() => history.replace('/app'), 1500);
            } catch (err) {
                setStatus('error');
                setErrorMsg(err instanceof Error ? err.message : 'Token exchange failed');
            }
        })();
    }, [location.search, history]);

    return (
        <IonPage>
            <IonContent fullscreen>
                <CenterBox>
                    {status === 'loading' && (
                        <>
                            <IonSpinner name="crescent" style={{ fontSize: '2rem' }} />
                            <StatusText>Connecting to Interactive Brokers...</StatusText>
                        </>
                    )}
                    {status === 'success' && (
                        <>
                            <div style={{ fontSize: '3rem' }}>&#10003;</div>
                            <StatusText>IBKR connected! Redirecting...</StatusText>
                        </>
                    )}
                    {status === 'error' && (
                        <>
                            <IonText color="danger">
                                <h2>Connection Failed</h2>
                                <p>{errorMsg}</p>
                            </IonText>
                            <a href="/app" style={{ color: '#60a5fa' }}>Back to App</a>
                        </>
                    )}
                </CenterBox>
            </IonContent>
        </IonPage>
    );
};

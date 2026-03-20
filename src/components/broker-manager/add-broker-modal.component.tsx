import React, { useState } from 'react';
import {
    IonModal, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonButtons, IonItem, IonInput,
    IonText, IonSpinner, IonIcon,
} from '@ionic/react';
import styled from 'styled-components';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import {
    BrokerType,
} from '../../services/broker-provider/broker-provider.interface';
import type {
    ITastyTradeCredentials,
    IIBKRCredentials,
} from '../../services/broker-provider/broker-provider.interface';
import type { IBrokerAccount } from '../../services/credentials/broker-credentials.service.interface';

/* ── Styles ──────────────────────────────────────────────────── */
const ModalContent = styled.div`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const BrokerRow = styled.div`
    display: flex;
    gap: 10px;
`;

const BrokerCard = styled.button<{ $selected: boolean; $rgb: string }>`
    background: ${p => p.$selected ? `rgba(${p.$rgb}, 0.15)` : 'rgba(255,255,255,0.04)'};
    border: 2px solid ${p => p.$selected ? `rgb(${p.$rgb})` : 'rgba(255,255,255,0.1)'};
    border-radius: 10px;
    padding: 14px;
    cursor: pointer;
    flex: 1;
    text-align: left;
    transition: border-color 0.15s;
    &:hover { border-color: rgb(${p => p.$rgb}); }
`;

const BrokerBadge = styled.span<{ $bg: string }>`
    display: inline-block;
    background: ${p => p.$bg};
    color: #fff;
    font-size: 0.6rem;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    margin-bottom: 6px;
`;

const BrokerTitle = styled.div`
    font-size: 0.9rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 3px;
`;

const BrokerSub = styled.div`
    font-size: 0.72rem;
    color: #888;
    line-height: 1.4;
`;

const Label = styled.div`
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #888;
    margin-top: 4px;
`;

type AddConfig = Omit<IBrokerAccount, 'id'>;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (config: AddConfig) => Promise<void>;
}

export const AddBrokerModal: React.FC<Props> = ({ isOpen, onClose, onAdd }) => {
    const [step, setStep] = useState<'select' | 'form'>('select');
    const [broker, setBroker] = useState<BrokerType>(BrokerType.TastyTrade);
    const [label, setLabel] = useState('');

    // TastyTrade fields
    const [clientSecret, setClientSecret] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [showToken, setShowToken] = useState(false);

    // IBKR fields
    const [gatewayUrl, setGatewayUrl] = useState('https://localhost:5000');
    const [accountId, setAccountId] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setStep('select');
        setBroker(BrokerType.TastyTrade);
        setLabel('');
        setClientSecret('');
        setRefreshToken('');
        setGatewayUrl('https://localhost:5000');
        setAccountId('');
        setError('');
        setLoading(false);
    };

    const handleClose = () => { reset(); onClose(); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        let credentials: ITastyTradeCredentials | IIBKRCredentials;
        if (broker === BrokerType.TastyTrade) {
            if (!clientSecret.trim() || !refreshToken.trim()) {
                setError('Client Secret and Refresh Token are required.');
                return;
            }
            credentials = {
                brokerType: BrokerType.TastyTrade,
                clientSecret: clientSecret.trim(),
                refreshToken: refreshToken.trim(),
            } satisfies ITastyTradeCredentials;
        } else {
            if (!gatewayUrl.trim() || !accountId.trim()) {
                setError('Gateway URL and Account ID are required.');
                return;
            }
            credentials = {
                brokerType: BrokerType.IBKR,
                gatewayUrl: gatewayUrl.trim(),
                accountId: accountId.trim(),
            } satisfies IIBKRCredentials;
        }

        const finalLabel = label.trim() || (broker === BrokerType.TastyTrade ? 'TastyTrade' : 'IBKR');
        setLoading(true);
        try {
            await onAdd({
                brokerType: broker,
                label: finalLabel,
                isActive: false, // caller decides active state
                credentials,
            });
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonModal isOpen={isOpen} onDidDismiss={handleClose}>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>
                        {step === 'select' ? 'Add Broker Account' :
                            `${broker === BrokerType.TastyTrade ? 'TastyTrade' : 'IBKR'} Account`}
                    </IonTitle>
                    <IonButtons slot="end">
                        <IonButton onClick={handleClose}>Cancel</IonButton>
                    </IonButtons>
                </IonToolbar>
            </IonHeader>

            <IonContent>
                <ModalContent>
                    {step === 'select' ? (
                        <>
                            <Label>Choose your broker</Label>
                            <BrokerRow>
                                <BrokerCard
                                    $selected={broker === BrokerType.TastyTrade}
                                    $rgb="255, 107, 53"
                                    onClick={() => setBroker(BrokerType.TastyTrade)}
                                >
                                    <BrokerBadge $bg="#ff6b35">TastyTrade</BrokerBadge>
                                    <BrokerTitle>TastyTrade</BrokerTitle>
                                    <BrokerSub>OAuth REST + DxLink WebSocket. Client Secret + Refresh Token.</BrokerSub>
                                </BrokerCard>

                                <BrokerCard
                                    $selected={broker === BrokerType.IBKR}
                                    $rgb="220, 53, 69"
                                    onClick={() => setBroker(BrokerType.IBKR)}
                                >
                                    <BrokerBadge $bg="#dc3545">IBKR</BrokerBadge>
                                    <BrokerTitle>Interactive Brokers</BrokerTitle>
                                    <BrokerSub>Client Portal Gateway. Gateway URL + Account ID.</BrokerSub>
                                </BrokerCard>
                            </BrokerRow>

                            <IonButton expand="block" onClick={() => setStep('form')}>
                                Continue
                            </IonButton>
                        </>
                    ) : (
                        <form onSubmit={e => void handleSubmit(e)}>
                            <Label>Label (optional)</Label>
                            <IonItem>
                                <IonInput
                                    placeholder={broker === BrokerType.TastyTrade ? 'e.g. TastyTrade Main' : 'e.g. IBKR Pro'}
                                    value={label}
                                    onIonInput={e => setLabel(e.detail.value ?? '')}
                                />
                            </IonItem>

                            {broker === BrokerType.TastyTrade ? (
                                <>
                                    <Label style={{ marginTop: 12 }}>TastyTrade credentials</Label>
                                    <IonItem>
                                        <IonInput
                                            label="Client Secret"
                                            labelPlacement="stacked"
                                            type={showSecret ? 'text' : 'password'}
                                            placeholder="Paste client_secret here"
                                            value={clientSecret}
                                            onIonInput={e => setClientSecret(e.detail.value ?? '')}
                                        />
                                        <IonButton slot="end" fill="clear" size="small"
                                            onClick={() => setShowSecret(!showSecret)}
                                            style={{ marginTop: '16px' }}>
                                            <IonIcon icon={showSecret ? eyeOffOutline : eyeOutline} />
                                        </IonButton>
                                    </IonItem>
                                    <IonItem>
                                        <IonInput
                                            label="Refresh Token"
                                            labelPlacement="stacked"
                                            type={showToken ? 'text' : 'password'}
                                            placeholder="Paste refresh_token here"
                                            value={refreshToken}
                                            onIonInput={e => setRefreshToken(e.detail.value ?? '')}
                                        />
                                        <IonButton slot="end" fill="clear" size="small"
                                            onClick={() => setShowToken(!showToken)}
                                            style={{ marginTop: '16px' }}>
                                            <IonIcon icon={showToken ? eyeOffOutline : eyeOutline} />
                                        </IonButton>
                                    </IonItem>
                                </>
                            ) : (
                                <>
                                    <Label style={{ marginTop: 12 }}>IBKR Client Portal Gateway</Label>
                                    <IonItem>
                                        <IonInput
                                            label="Gateway URL"
                                            labelPlacement="stacked"
                                            placeholder="https://localhost:5000"
                                            value={gatewayUrl}
                                            onIonInput={e => setGatewayUrl(e.detail.value ?? '')}
                                        />
                                    </IonItem>
                                    <IonItem>
                                        <IonInput
                                            label="Account ID"
                                            labelPlacement="stacked"
                                            placeholder="e.g. U1234567"
                                            value={accountId}
                                            onIonInput={e => setAccountId(e.detail.value ?? '')}
                                        />
                                    </IonItem>
                                </>
                            )}

                            {error && (
                                <IonText color="danger">
                                    <p style={{ fontSize: '0.85rem', padding: '6px 4px' }}>{error}</p>
                                </IonText>
                            )}

                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <IonButton fill="outline" onClick={() => setStep('select')} disabled={loading}>
                                    Back
                                </IonButton>
                                <IonButton expand="block" type="submit" disabled={loading} style={{ flex: 1 }}>
                                    {loading ? <IonSpinner name="crescent" /> : 'Save Account'}
                                </IonButton>
                            </div>
                        </form>
                    )}
                </ModalContent>
            </IonContent>
        </IonModal>
    );
};

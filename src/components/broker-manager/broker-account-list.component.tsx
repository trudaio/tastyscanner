import React, { useState, useEffect, useCallback } from 'react';
import {
    IonButton, IonSpinner, IonText, IonIcon, IonAlert,
} from '@ionic/react';
import styled from 'styled-components';
import {
    checkmarkCircleOutline,
    trashOutline,
    addCircleOutline,
} from 'ionicons/icons';
import { observer } from 'mobx-react-lite';
import { useServices } from '../../hooks/use-services.hook';
import { BrokerType } from '../../services/broker-provider/broker-provider.interface';
import type { IBrokerAccount } from '../../services/credentials/broker-credentials.service.interface';
import type { ITastyTradeCredentials } from '../../services/broker-provider/broker-provider.interface';
import { AddBrokerModal } from './add-broker-modal.component';

/* ── Styles ──────────────────────────────────────────────────── */
const AccountCard = styled.div<{ $active: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid ${p => p.$active ? 'rgba(77,255,145,0.35)' : 'rgba(255,255,255,0.1)'};
    background: ${p => p.$active ? 'rgba(77,255,145,0.05)' : 'rgba(255,255,255,0.02)'};
    margin-bottom: 8px;
`;

const BrokerBadge = styled.span<{ $broker: BrokerType }>`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${p => p.$broker === BrokerType.TastyTrade ? '#ff6b35' : '#4d9fff'};
    color: #fff;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 3px 7px;
    border-radius: 4px;
    white-space: nowrap;
`;

const AccountInfo = styled.div`
    flex: 1;
    min-width: 0;
`;

const AccountLabel = styled.div`
    font-size: 0.88rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const AccountMeta = styled.div`
    font-size: 0.72rem;
    color: #888;
    margin-top: 2px;
`;

const Actions = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
`;

const EmptyState = styled.div`
    text-align: center;
    color: #666;
    font-size: 0.85rem;
    padding: 20px 0;
    border: 1px dashed rgba(255,255,255,0.1);
    border-radius: 8px;
`;

const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
`;

const SectionTitle = styled.h3`
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ion-color-medium);
    margin: 0;
`;

/* ── Component ───────────────────────────────────────────────── */
export const BrokerAccountListComponent: React.FC = observer(() => {
    const services = useServices();

    const [accounts, setAccounts] = useState<IBrokerAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<IBrokerAccount | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setAccounts(await services.brokerCredentials.listBrokerAccounts());
        } catch {
            setError('Could not load broker accounts.');
        } finally {
            setLoading(false);
        }
    }, [services.brokerCredentials]);

    useEffect(() => { void reload(); }, [reload]);

    const handleAdd = async (config: Omit<IBrokerAccount, 'id'>) => {
        // First account gets activated automatically
        const current = await services.brokerCredentials.listBrokerAccounts();
        const shouldActivate = current.length === 0;
        const id = await services.brokerCredentials.saveBrokerAccount({
            ...config,
            isActive: shouldActivate,
        });
        // If this TastyTrade account is now active, reinitialize app services
        if (shouldActivate && config.brokerType === BrokerType.TastyTrade) {
            const creds = config.credentials as ITastyTradeCredentials;
            services.initialize(creds.clientSecret, creds.refreshToken);
        }
        await reload();
        return id;
    };

    const handleSetActive = async (account: IBrokerAccount) => {
        setActionId(account.id);
        try {
            await services.brokerCredentials.setActiveBrokerAccount(account.id);
            // Reinitialize app with the newly active account's credentials
            if (account.brokerType === BrokerType.TastyTrade) {
                const creds = account.credentials as ITastyTradeCredentials;
                services.initialize(creds.clientSecret, creds.refreshToken);
            }
            await reload();
        } catch {
            setError('Failed to switch active account.');
        } finally {
            setActionId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setActionId(id);
        try {
            await services.brokerCredentials.deleteBrokerAccount(id);
            await reload();
        } catch {
            setError('Failed to delete account.');
        } finally {
            setActionId(null);
            setDeleteTarget(null);
        }
    };

    const brokerName = (bt: BrokerType) =>
        bt === BrokerType.TastyTrade ? 'TastyTrade' : 'Interactive Brokers';

    return (
        <>
            <SectionHeader>
                <SectionTitle>Broker Accounts</SectionTitle>
                <IonButton fill="clear" size="small" onClick={() => setShowModal(true)}>
                    <IonIcon icon={addCircleOutline} slot="start" />
                    Add Account
                </IonButton>
            </SectionHeader>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                    <IonSpinner name="dots" />
                </div>
            ) : error ? (
                <IonText color="danger"><p style={{ fontSize: '0.85rem' }}>{error}</p></IonText>
            ) : accounts.length === 0 ? (
                <EmptyState>
                    <IonIcon icon={addCircleOutline}
                        style={{ fontSize: '2rem', display: 'block', margin: '0 auto 8px', color: '#555' }} />
                    No broker accounts yet.
                    <br />
                    <span style={{ color: '#555' }}>Click "Add Account" to get started.</span>
                </EmptyState>
            ) : (
                accounts.map(account => (
                    <AccountCard key={account.id} $active={account.isActive}>
                        <BrokerBadge $broker={account.brokerType}>
                            {account.brokerType === BrokerType.TastyTrade ? 'TT' : 'IB'}
                        </BrokerBadge>

                        <AccountInfo>
                            <AccountLabel>{account.label}</AccountLabel>
                            <AccountMeta>{brokerName(account.brokerType)}</AccountMeta>
                        </AccountInfo>

                        <Actions>
                            {account.isActive ? (
                                <IonIcon
                                    icon={checkmarkCircleOutline}
                                    style={{ color: '#4dff91', fontSize: '1.2rem' }}
                                    title="Active"
                                />
                            ) : (
                                <IonButton
                                    fill="outline"
                                    size="small"
                                    disabled={actionId === account.id}
                                    onClick={() => void handleSetActive(account)}
                                >
                                    {actionId === account.id
                                        ? <IonSpinner name="crescent" style={{ width: 14, height: 14 }} />
                                        : 'Set Active'}
                                </IonButton>
                            )}
                            <IonButton
                                fill="clear"
                                size="small"
                                color="danger"
                                disabled={actionId === account.id}
                                onClick={() => setDeleteTarget(account)}
                            >
                                <IonIcon icon={trashOutline} />
                            </IonButton>
                        </Actions>
                    </AccountCard>
                ))
            )}

            <AddBrokerModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onAdd={async config => { await handleAdd(config); }}
            />

            <IonAlert
                isOpen={deleteTarget !== null}
                onDidDismiss={() => setDeleteTarget(null)}
                header="Remove account?"
                message={`Remove "${deleteTarget?.label ?? ''}"?`}
                buttons={[
                    { text: 'Cancel', role: 'cancel' },
                    {
                        text: 'Remove',
                        role: 'destructive',
                        handler: () => { if (deleteTarget) void handleDelete(deleteTarget.id); },
                    },
                ]}
            />
        </>
    );
});

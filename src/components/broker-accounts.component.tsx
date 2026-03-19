import React from "react";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import { IonButton, IonIcon } from "@ionic/react";
import { chevronDownOutline } from "ionicons/icons";
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useServices } from "../hooks/use-services.hook";

const AccountsBox = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
    width: 100%;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--app-border);
    background:
        radial-gradient(circle at top right, rgba(103, 168, 255, 0.1), transparent 42%),
        var(--app-surface-2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
`;

const SelectField = styled.label`
    display: grid;
    gap: 8px;
    width: 100%;
`;

const SelectLabel = styled.span`
    color: var(--app-text);
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
`;

const SelectHint = styled.span`
    color: var(--app-text-muted);
    font-size: 0.8rem;
    line-height: 1.45;
`;

const SelectControl = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const AccountPicker = styled.select`
    width: 100%;
    min-height: 56px;
    padding: 0 44px 0 14px;
    border-radius: 14px;
    background: var(--app-surface-1);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    outline: none;
    appearance: none;
    font-size: 0.98rem;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;

    &:focus {
        border-color: rgba(103, 168, 255, 0.42);
        box-shadow: 0 0 0 4px rgba(103, 168, 255, 0.12);
        background: var(--app-hover-surface);
    }

    &:disabled {
        cursor: not-allowed;
        color: var(--app-text-muted);
        background: var(--app-subtle-surface);
    }

    option {
        background: var(--app-surface-1);
        color: var(--app-text);
    }
`;

const SelectIcon = styled(IonIcon)`
    position: absolute;
    right: 14px;
    pointer-events: none;
    font-size: 1rem;
    color: var(--app-text-muted);
`;

const DisconnectButton = styled(IonButton)`
    --background: transparent;
    --background-hover: rgba(255, 107, 126, 0.08);
    --color: var(--ion-color-danger);
    --border-color: rgba(255, 107, 126, 0.22);
    --border-radius: 14px;
    width: 100%;
    min-height: 52px;
    margin: 0;
`;

export const BrokerAccountsComponent: React.FC = observer(() => {
    const services = useServices();
    const accounts = services.brokerAccount.accounts;

    return (
        <AccountsBox>
            <SelectField>
                <SelectLabel>Cont activ</SelectLabel>
                <SelectControl>
                    <AccountPicker
                        value={services.brokerAccount.currentAccount?.accountNumber ?? ''}
                        disabled={accounts.length === 0}
                        onChange={e => services.brokerAccount.setCurrentAccount(e.target.value)}
                    >
                        <option value="">
                            {accounts.length === 0 ? 'Niciun cont broker disponibil' : 'Alege contul broker'}
                        </option>
                        {accounts.map(account => (
                            <option key={account.accountNumber} value={account.accountNumber}>
                                {account.accountNumber}
                            </option>
                        ))}
                    </AccountPicker>
                    <SelectIcon icon={chevronDownOutline} />
                </SelectControl>
                <SelectHint>
                    {accounts.length === 0
                        ? 'Conecteaza brokerul ca sa activezi dashboard-ul, istoricul si datele agregate.'
                        : 'Contul selectat devine sursa pentru dashboard, istoric si date live.'}
                </SelectHint>
            </SelectField>

            <DisconnectButton
                fill="outline"
                onClick={() => {
                    void signOut(auth).then(() => {
                        window.location.href = '/login';
                    });
                }}
            >
                Delogare
            </DisconnectButton>
        </AccountsBox>
    );
});

import React from "react";
import {observer} from "mobx-react";
import {useServices} from "../hooks/use-services.hook";
import styled from "styled-components";
import {IonButton, IonSelect, IonSelectOption} from "@ionic/react";
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AccountsBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    font-size: 1rem;
    width: 100%;
    border-bottom: 1px solid var(--ion-color-light-shade);
    padding-bottom: 8px;
`


export const BrokerAccountsComponent: React.FC = observer(() => {
    const services = useServices();
    const accounts = services.brokerAccount.accounts;
    return (
        <AccountsBox>
            <IonSelect label={"Current account:"}
                       value={services.brokerAccount.currentAccount?.accountNumber}
                       onIonChange={e => services.brokerAccount.setCurrentAccount(e.detail.value)}>
                {accounts.map(account => (<IonSelectOption key={account.accountNumber} value={account.accountNumber}>
                    {account.accountNumber}
                </IonSelectOption>))}
            </IonSelect>
            <IonButton
                fill="outline"
                color="danger"
                onClick={() => {
                    void signOut(auth).then(() => {
                        window.location.href = '/login';
                    });
                }}
            >
                Disconnect
            </IonButton>
        </AccountsBox>
    )
})

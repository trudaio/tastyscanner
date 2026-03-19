import React from 'react';
import {
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonPage,
    IonTitle,
    IonToolbar,
} from '@ionic/react';
import styled from 'styled-components';

const HeaderTitleGroup = styled.div`
    display: grid;
    gap: 4px;
    padding: 4px 0;
`;

const HeaderEyebrow = styled.div`
    color: var(--app-text-muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
`;

const HeaderMainTitle = styled.div`
    color: var(--app-text);
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;

    @media (max-width: 720px) {
        font-size: 0.98rem;
    }
`;

const HeaderSubtitle = styled.div`
    color: var(--app-text-muted);
    font-size: 0.84rem;
    line-height: 1.4;
    max-width: 54ch;

    @media (max-width: 720px) {
        font-size: 0.8rem;
    }
`;

interface AppPageShellProps {
    title: React.ReactNode;
    eyebrow?: string;
    subtitle?: string;
    children: React.ReactNode;
    fullscreen?: boolean;
}

export const AppPageShell: React.FC<AppPageShellProps> = ({
    children,
    eyebrow,
    fullscreen = false,
    subtitle,
    title,
}) => {
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonMenuButton />
                    </IonButtons>
                    <IonTitle>
                        {eyebrow || subtitle ? (
                            <HeaderTitleGroup>
                                {eyebrow ? <HeaderEyebrow>{eyebrow}</HeaderEyebrow> : null}
                                <HeaderMainTitle>{title}</HeaderMainTitle>
                                {subtitle ? <HeaderSubtitle>{subtitle}</HeaderSubtitle> : null}
                            </HeaderTitleGroup>
                        ) : (
                            title
                        )}
                    </IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen={fullscreen}>
                {children}
            </IonContent>
        </IonPage>
    );
};

import React from 'react';
import {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonText,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

const CenteredContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 20px;
`;

const StyledCard = styled(IonCard)`
    max-width: 480px;
    width: 100%;
`;

export const OnboardingPage: React.FC = () => {
    const history = useHistory();

    return (
        <IonPage>
            <IonContent>
                <CenteredContainer>
                    <StyledCard>
                        <IonCardHeader>
                            <IonCardTitle className="ion-text-center">Welcome to TastyScanner</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <IonText>
                                <p className="ion-text-center">
                                    To get started, you'll need to connect your TastyTrade account.
                                    This allows TastyScanner to stream live market data and manage
                                    your iron condor positions.
                                </p>
                                <p className="ion-text-center">
                                    You'll need your TastyTrade API client secret and refresh token.
                                    These can be found in your TastyTrade account settings under API tokens.
                                </p>
                            </IonText>
                            <IonButton
                                expand="block"
                                className="ion-margin-top"
                                onClick={() => history.push('/app')}
                            >
                                Get Started
                            </IonButton>
                        </IonCardContent>
                    </StyledCard>
                </CenteredContainer>
            </IonContent>
        </IonPage>
    );
};

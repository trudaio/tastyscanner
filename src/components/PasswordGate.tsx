import React, { useState, useEffect } from 'react';
import {
  IonPage,
  IonContent,
  IonInput,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonText,
} from '@ionic/react';
import styled from 'styled-components';

const PASSWORD = 'fiifkw2011';
const AUTH_KEY = 'app_authenticated';

const CenteredContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 20px;
`;

const StyledCard = styled(IonCard)`
  max-width: 400px;
  width: 100%;
`;

const ErrorText = styled(IonText)`
  display: block;
  margin-top: 10px;
  text-align: center;
`;

interface PasswordGateProps {
  children: React.ReactNode;
}

const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authenticated = sessionStorage.getItem(AUTH_KEY);
    if (authenticated === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <IonPage>
      <IonContent>
        <CenteredContainer>
          <StyledCard>
            <IonCardHeader>
              <IonCardTitle className="ion-text-center">
                Password Required
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <form onSubmit={handleSubmit}>
                <IonInput
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onIonInput={(e) => setPassword(e.detail.value || '')}
                  fill="outline"
                  className="ion-margin-bottom"
                />
                <IonButton expand="block" type="submit">
                  Unlock
                </IonButton>
                {error && (
                  <ErrorText color="danger">
                    {error}
                  </ErrorText>
                )}
              </form>
            </IonCardContent>
          </StyledCard>
        </CenteredContainer>
      </IonContent>
    </IonPage>
  );
};

export default PasswordGate;

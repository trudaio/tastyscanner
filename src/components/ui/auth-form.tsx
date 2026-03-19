import { IonButton, IonItem, IonText } from '@ionic/react';
import styled from 'styled-components';

export const AuthForm = styled.form`
  display: grid;
  gap: 14px;
`;

export const AuthField = styled(IonItem)`
  --background: var(--app-subtle-surface);
  --border-color: var(--app-border);
  --padding-start: 14px;
  --padding-end: 14px;
  --min-height: 64px;
  border-radius: 18px;
`;

export const AuthPrimaryButton = styled(IonButton)`
  --background: linear-gradient(135deg, #67a8ff, #7de2d1);
  --background-hover: linear-gradient(135deg, #5d9cf0, #70d3c3);
  --color: #08111f;
  --border-radius: 18px;
  --box-shadow: 0 20px 32px rgba(103, 168, 255, 0.24);
  min-height: 54px;
  margin-top: 8px;
  font-size: 0.98rem;
  text-transform: none;
  letter-spacing: 0;
`;

export const AuthSecondaryButton = styled(IonButton)`
  --background: transparent;
  --background-hover: var(--app-hover-surface);
  --border-color: var(--app-border);
  --border-radius: 18px;
  --color: var(--app-text-soft);
  min-height: 50px;
  text-transform: none;
  letter-spacing: 0;
`;

export const AuthMessage = styled(IonText)`
  p {
    margin: 0;
    padding: 10px 14px;
    border-radius: 14px;
    line-height: 1.5;
    font-size: 0.92rem;
    background: var(--app-subtle-surface);
  }
`;

export const AuthHelper = styled.div`
  display: grid;
  gap: 6px;
  margin-top: -2px;
  color: var(--app-text-muted);
  font-size: 0.88rem;
  line-height: 1.55;
`;

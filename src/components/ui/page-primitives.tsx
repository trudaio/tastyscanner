import { IonCard } from '@ionic/react';
import styled from 'styled-components';

export const PageContainer = styled.div`
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: clamp(18px, 3vw, 32px) clamp(16px, 3vw, 28px) clamp(28px, 5vw, 48px);
`;

export const PageHero = styled.section`
    position: relative;
    overflow: hidden;
    border-radius: var(--app-radius-lg);
    padding: clamp(22px, 4vw, 34px);
    background: var(--app-hero-surface);
    border: 1px solid var(--app-hero-border);
    box-shadow: var(--app-shadow);
`;

export const PageEyebrow = styled.div`
    color: var(--ion-color-primary);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
`;

export const PageTitle = styled.h1`
    margin: 14px 0 0;
    color: var(--app-text);
    font-size: clamp(1.9rem, 4vw, 3rem);
    line-height: 1.04;
    letter-spacing: -0.04em;
    max-width: 16ch;
`;

export const PageSubtitle = styled.p`
    margin: 14px 0 0;
    color: var(--app-text-soft);
    font-size: 0.98rem;
    line-height: 1.68;
    max-width: 72ch;
`;

export const SectionStack = styled.section`
    display: grid;
    gap: 16px;
    margin-top: 24px;
`;

export const SectionHeader = styled.div`
    display: grid;
    gap: 8px;
`;

export const SectionTitle = styled.h2`
    margin: 0;
    color: var(--app-text);
    font-size: clamp(1.2rem, 2vw, 1.55rem);
    line-height: 1.2;
    letter-spacing: -0.02em;
`;

export const SectionDescription = styled.p`
    margin: 0;
    color: var(--app-text-muted);
    font-size: 0.94rem;
    line-height: 1.6;
    max-width: 68ch;
`;

export const CardGrid = styled.div`
    display: grid;
    gap: 16px;
`;

export const SurfaceCard = styled(IonCard)`
    margin: 0;
    --background: var(--app-panel-surface);
    border: 1px solid var(--app-border);
    border-radius: 22px;
    box-shadow: var(--app-shadow);
`;

export const AccentBox = styled.div`
    background: rgba(103, 168, 255, 0.1);
    border: 1px solid rgba(103, 168, 255, 0.18);
    border-radius: 16px;
    padding: 14px 16px;
    color: var(--app-text-soft);
    line-height: 1.58;
`;

export const SuccessBox = styled.div`
    background: rgba(84, 214, 148, 0.1);
    border: 1px solid rgba(84, 214, 148, 0.18);
    border-radius: 16px;
    padding: 14px 16px;
    color: var(--app-text-soft);
    line-height: 1.58;
`;

export const WarningBox = styled.div`
    background: rgba(246, 200, 95, 0.1);
    border: 1px solid rgba(246, 200, 95, 0.18);
    border-radius: 16px;
    padding: 14px 16px;
    color: var(--app-text-soft);
    line-height: 1.58;
`;

import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import styled from 'styled-components';

const AuthPage = styled(IonPage)`
  background: var(--app-canvas);
`;

const AuthContent = styled(IonContent)`
  --background: transparent;
`;

const Layout = styled.div`
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(320px, 520px);
  gap: 32px;
  align-items: stretch;
  justify-content: center;
  padding: 32px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
    padding: 20px;
  }
`;

const BrandPanel = styled.section`
  position: relative;
  overflow: hidden;
  border-radius: var(--app-radius-lg);
  padding: 32px;
  border: 1px solid var(--app-hero-border);
  background:
    radial-gradient(circle at top right, rgba(125, 226, 209, 0.2), transparent 28%),
    radial-gradient(circle at bottom left, rgba(244, 162, 97, 0.16), transparent 22%),
    linear-gradient(180deg, rgba(16, 31, 52, 0.98) 0%, rgba(9, 19, 33, 0.98) 100%);
  box-shadow: var(--app-shadow);
  text-align: left;

  @media (max-width: 960px) {
    order: 2;
    padding: 24px;
  }
`;

const BrandBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(103, 168, 255, 0.24);
  background: rgba(103, 168, 255, 0.1);
  color: var(--app-text-soft);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
`;

const BrandLogo = styled.img`
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 18px;
  margin-top: 24px;
  margin-bottom: 24px;
  display: block;
  margin-left: auto;
  margin-right: auto;
  filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.25));
`;

const BrandTitle = styled.h1`
  margin: 0;
  color: var(--app-text);
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.02;
  letter-spacing: -0.04em;
  max-width: 11ch;

  @media (max-width: 960px) {
    max-width: none;
    font-size: clamp(1.7rem, 7vw, 2.4rem);
  }
`;

const BrandSubtitle = styled.p`
  margin: 16px 0 0;
  color: var(--app-text-soft);
  font-size: 1rem;
  line-height: 1.65;
  max-width: 46ch;

  @media (max-width: 960px) {
    max-width: none;
    font-size: 0.95rem;
  }
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 28px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StatPill = styled.div`
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--app-subtle-surface-2);
  border: 1px solid var(--app-border);
`;

const StatValue = styled.div`
  color: var(--app-text);
  font-size: 1.15rem;
  font-weight: 800;
`;

const StatLabel = styled.div`
  color: var(--app-text-muted);
  font-size: 0.78rem;
  margin-top: 4px;
`;

const FeatureList = styled.div`
  display: grid;
  gap: 12px;
  margin-top: 28px;
`;

const FeatureItem = styled.div`
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--app-subtle-surface);
  border: 1px solid var(--app-border);
`;

const FeatureTitle = styled.div`
  color: var(--app-text);
  font-weight: 700;
  margin-bottom: 4px;
`;

const FeatureText = styled.div`
  color: var(--app-text-muted);
  font-size: 0.92rem;
  line-height: 1.55;
`;

const CardPanel = styled.section`
  align-self: center;
  border-radius: var(--app-radius-lg);
  padding: 32px;
  background: var(--app-panel-surface);
  border: 1px solid var(--app-border);
  box-shadow: var(--app-shadow);

  @media (max-width: 960px) {
    order: 1;
    padding: 24px;
  }
`;

const Eyebrow = styled.div`
  color: var(--ion-color-primary);
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 14px;
`;

const CardTitle = styled.h2`
  margin: 0;
  color: var(--app-text);
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  line-height: 1.08;
  letter-spacing: -0.03em;
`;

const CardSubtitle = styled.p`
  margin: 12px 0 0;
  color: var(--app-text-muted);
  line-height: 1.65;
  font-size: 0.98rem;
  max-width: 54ch;
`;

const FormWrap = styled.div`
  margin-top: 28px;
`;

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge: string;
  brandTitle: string;
  brandSubtitle: string;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  badge,
  brandSubtitle,
  brandTitle,
  children,
  eyebrow,
  subtitle,
  title,
}) => {
  return (
    <AuthPage>
      <AuthContent fullscreen>
        <Layout>
          <BrandPanel>
            <BrandBadge>{badge}</BrandBadge>
            <BrandLogo src="/logo-guvidul.svg" alt="Operatiunea Guvidul" />
            <BrandTitle>{brandTitle}</BrandTitle>
            <BrandSubtitle>{brandSubtitle}</BrandSubtitle>

            <StatsRow>
              <StatPill>
                <StatValue>Date live</StatValue>
                <StatLabel>quotes si greeks sincronizate</StatLabel>
              </StatPill>
              <StatPill>
                <StatValue>3 min</StatValue>
                <StatLabel>pana la primul workflow complet</StatLabel>
              </StatPill>
              <StatPill>
                <StatValue>Controlat</StatValue>
                <StatLabel>risc si disciplina vizibile din start</StatLabel>
              </StatPill>
            </StatsRow>

            <FeatureList>
              <FeatureItem>
                <FeatureTitle>Scanner orientat pe selectie, nu pe zgomot</FeatureTitle>
                <FeatureText>Universul de setup-uri este filtrat dupa POP, EV, alpha si parametrii de risc care conteaza operational.</FeatureText>
              </FeatureItem>
              <FeatureItem>
                <FeatureTitle>Flux unificat de analiza si executie</FeatureTitle>
                <FeatureText>Contextul de cont, watchlist-urile si decizia de intrare raman in acelasi workspace, fara tab-uri auxiliare.</FeatureText>
              </FeatureItem>
              <FeatureItem>
                <FeatureTitle>Portofoliu tratat ca sistem de risc</FeatureTitle>
                <FeatureText>Net liquidity, greeks si sizing rules sunt expuse explicit, ca instrumente de control, nu ca detalii secundare.</FeatureText>
              </FeatureItem>
            </FeatureList>
          </BrandPanel>

          <CardPanel>
            <Eyebrow>{eyebrow}</Eyebrow>
            <CardTitle>{title}</CardTitle>
            <CardSubtitle>{subtitle}</CardSubtitle>
            <FormWrap>{children}</FormWrap>
          </CardPanel>
        </Layout>
      </AuthContent>
    </AuthPage>
  );
};

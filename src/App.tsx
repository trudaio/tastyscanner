import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect } from 'react-router-dom';
import Menu from './components/Menu';
import Page from './pages/Page';
import { DashboardPage } from './pages/DashboardPage';
import { IronCondorSaviorPage } from './pages/IronCondorSaviorPage';
import { AccountPage } from './pages/AccountPage';
import { GreeksGuidePage } from './pages/GreeksGuidePage';
import { GuvidHistoryPage } from './pages/GuvidHistoryPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { DeltaAlertPage } from './pages/DeltaAlertPage';
import { DteAnalyzerPage } from './pages/DteAnalyzerPage';
import { StrategySimulatorPage } from './pages/StrategySimulatorPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { LandingPage } from './pages/LandingPage';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import React, { useState, useEffect } from 'react';
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import styled from "styled-components";
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';

setupIonicReact();

const SplitPaneBox = styled(IonSplitPane)`
  --side-max-width: 350px;
`

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setAuthLoading(false);
        });
        return unsubscribe;
    }, []);

    if (authLoading) return null;

    return (
        <IonApp>
            <IonReactRouter>
                {/* Public routes — no sidebar */}
                <Route path="/welcome" exact>
                    {user ? <Redirect to="/app" /> : <LandingPage />}
                </Route>
                <Route path="/login" exact>
                    {user ? <Redirect to="/app" /> : <LoginPage />}
                </Route>
                <Route path="/register" exact>
                    {user ? <Redirect to="/app" /> : <RegisterPage />}
                </Route>
                <Route path="/onboarding" exact>
                    {!user ? <Redirect to="/login" /> : <OnboardingPage />}
                </Route>

                {/* Root redirect */}
                <Route path="/" exact>
                    {user ? <Redirect to="/app" /> : <Redirect to="/welcome" />}
                </Route>

                {/* Protected routes — with sidebar */}
                <Route>
                    {!user ? (
                        <Redirect to="/welcome" />
                    ) : (
                        <SplitPaneBox contentId="main">
                            <Menu />
                            <IonRouterOutlet id="main">
                                <Route path="/app" exact={true}>
                                    <Page />
                                </Route>
                                <Route path="/dashboard" exact={true}>
                                    <DashboardPage />
                                </Route>
                                <Route path="/iron-condor-savior" exact={true}>
                                    <IronCondorSaviorPage />
                                </Route>
                                <Route path="/account" exact={true}>
                                    <AccountPage />
                                </Route>
                                <Route path="/guvid-history" exact={true}>
                                    <GuvidHistoryPage />
                                </Route>
                                <Route path="/guide" exact={true}>
                                    <GreeksGuidePage />
                                </Route>
                                <Route path="/delta-alert" exact={true}>
                                    <DeltaAlertPage />
                                </Route>
                                <Route path="/dte-analyzer" exact={true}>
                                    <DteAnalyzerPage />
                                </Route>
                                <Route path="/strategy-simulator" exact={true}>
                                    <StrategySimulatorPage />
                                </Route>
                                <Route path="/superadmin" exact={true}>
                                    <SuperAdminPage />
                                </Route>
                            </IonRouterOutlet>
                        </SplitPaneBox>
                    )}
                </Route>
            </IonReactRouter>
        </IonApp>
    );
};

export default App;

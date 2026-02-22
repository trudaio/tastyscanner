import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route } from 'react-router-dom';
import Menu from './components/Menu';
import Page from './pages/Page';
import { DashboardPage } from './pages/DashboardPage';
import { IronCondorSaviorPage } from './pages/IronCondorSaviorPage';
import { KanbanPage } from './pages/KanbanPage';

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
import React from 'react';
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import styled from "styled-components";

setupIonicReact();

const SplitPaneBox = styled(IonSplitPane)`
  --side-max-width: 350px;
`

const App: React.FC = () => {
  return (
    <IonApp>
      <IonReactRouter>
        <SplitPaneBox contentId="main">
          <Menu />
          <IonRouterOutlet id="main">
            <Route path="/" exact={true}>
              <Page />
            </Route>
            <Route path="/dashboard" exact={true}>
              <DashboardPage />
            </Route>
            <Route path="/iron-condor-savior" exact={true}>
              <IronCondorSaviorPage />
            </Route>
            <Route path="/kanban" exact={true}>
              <KanbanPage />
            </Route>
          </IonRouterOutlet>

        </SplitPaneBox>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;

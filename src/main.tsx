import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {ServiceFactory} from "./services/service-factory";
import { ServiceFactoryContext } from './react-contexts/service-factory-context';
import PasswordGate from './components/PasswordGate';
import './extensions/array.extensions';

const serviceFactory = new ServiceFactory();

const container = document.getElementById('root');
const root = createRoot(container!);
/*
root.render(
  <React.StrictMode>
      <ServiceFactoryContext.Provider value={serviceFactory}>
          <App />
      </ServiceFactoryContext.Provider>
  </React.StrictMode>
);

 */

root.render(
    <PasswordGate>
        <ServiceFactoryContext.Provider value={serviceFactory}>
            <App />
        </ServiceFactoryContext.Provider>
    </PasswordGate>
);

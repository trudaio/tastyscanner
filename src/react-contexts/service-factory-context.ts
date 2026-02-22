import React from 'react';
import {IServiceFactory} from "../services/service-factory.interface";

export const ServiceFactoryContext = React.createContext<IServiceFactory>(null!);

import {useContext} from "react";
import {ServiceFactoryContext} from "../react-contexts/service-factory-context";

export function useServices() {
    return useContext(ServiceFactoryContext);
}

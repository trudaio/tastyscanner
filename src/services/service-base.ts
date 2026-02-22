import {IServiceFactory} from "./service-factory.interface";

export class ServiceBase {
    constructor(protected readonly services: IServiceFactory) {
    }
}
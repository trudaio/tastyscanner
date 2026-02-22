import {StorageServiceBase} from "../storage-service-base";
import {RawLocalStorageKeys} from "./raw-local-storage-keys";
import {IRawLocalStorageService} from "./raw-local-storage.service.interface";
import {IServiceFactory} from "../../service-factory.interface";
import {UndefinedString} from "../../../utils/nullable-types";

/**
 * Stores the keys as they are provided. No environment is appended to the key
 */
export class RawLocalStorageService extends StorageServiceBase<RawLocalStorageKeys> implements IRawLocalStorageService {
    constructor(services: IServiceFactory) {
        super(localStorage, services);
    }

    protected get _storageName(): string {
        return "rawLocalStorage";
    }

    protected _composeKey(key: RawLocalStorageKeys, discriminator: UndefinedString): string {
        if(discriminator) {
            return `${key}.${discriminator}`;
        } else {
            return key;
        }
    }

}
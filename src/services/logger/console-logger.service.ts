import {ILoggerService} from "./logger.service.interface";

export class ConsoleLoggerService implements ILoggerService {

    debug(message: string, ...err: any): void {
        console.debug(message, ...err);
    }

    info(message: string, ...err: any): void {
        console.info(message, ...err);
    }

    warning(message: string, ...err: any): void {
        console.warn(message, ...err);
    }

    error(message: string, ...err: any): void {
        console.error(message, ...err);
    }

}

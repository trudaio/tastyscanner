export interface ILoggerService {
    debug(message: string, ...err: any): void;
    info(message: string, ...err: any): void;
    warning(message: string, ...err: any): void;
    error(message: string, ...err: any[]): void;
}


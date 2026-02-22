import {ILanguageService} from "./language.service.interface";

export class LanguageService implements ILanguageService {
    translate(key: string): string {
        return key;
    }
}
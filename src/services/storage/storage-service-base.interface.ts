import {IStorage} from "./storage.interface";


export interface IStorageServiceBase<TKey extends string> extends IStorage<TKey>{

}
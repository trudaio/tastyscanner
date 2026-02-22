import {NullableString} from "../../utils/nullable-types";

export interface IStorageOptions {
    discriminator?: string;
}

export interface IStorage<TKey extends string> {
    setItem(key: TKey, value: string, options?: IStorageOptions): void;
    getItem(key: TKey, options?: IStorageOptions): NullableString;
    setJson(key: TKey, value: any, options?: IStorageOptions): void;
    getJson<TValue = any>(key: TKey, options?: IStorageOptions): TValue | null;
    removeItem(key: TKey, options?: IStorageOptions): void;
}

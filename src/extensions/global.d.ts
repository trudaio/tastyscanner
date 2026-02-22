export {}

declare global {
    interface Array<T> {
        toDictionary(keySelector: (item: T, index: number) => string): Record<string, T>;
        toDictionaryOfType<TValue>(keySelector: (item: T, index: number) => string, valueSelector: (item: T, index: number) => TValue): Record<string, TValue>;
        groupByKey(keySelector: (item: T, index: number) => string): Record<string, T[]>;
        groupByKeyAndMapToType<TValue>(keySelector: (item: T, index: number) => string, valueSelector: (item: T) => TValue): Record<string, TValue[]>;
        findFirst(filter: (item: T) => boolean): T;
        max(valueSelector: (item: T) => number): number;
        min(valueSelector: (item: T) => number): number;
        sum(valueSelector: (item: T) => number): number;
        all(predicate: (item: T) => boolean): boolean;
        splitToChunks(chunkSize: number): Array<T[]>;
        distinct(keySelector: (item: T) => string): T[];
        distinct<TResult>(keySelector: (item: T) => string, projection: (item: T) => TResult): TResult[];
        selectMany<TValue>(valuesSelector: (item: T, index: number) => TValue[]): TValue[];
    }


}



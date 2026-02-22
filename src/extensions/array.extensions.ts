if (!Array.prototype.toDictionary) {
    Array.prototype.toDictionary = function<T>(keySelector: (item: T, index: number) => string): Record<string, T> {
        const result: Record<string, T> = {};
        this.forEach((item, index) => {
            result[keySelector(item, index)] = item;
        })
        return result;
    }
}

if (!Array.prototype.toDictionaryOfType) {
    Array.prototype.toDictionaryOfType = function<TItem, TValue>(keySelector: (item: TItem, index: number) => string,
                                                                 valueSelector: (item: TItem, index: number) => TValue ): Record<string, TValue> {
        const result: Record<string, TValue> = {};
        this.forEach((item, index) => {
            result[keySelector(item, index)] = valueSelector(item, index);
        })
        return result;
    }
}


if (!Array.prototype.findFirst) {
    Array.prototype.findFirst = function<T>(filter: (item: T) => boolean): T {
        return this.filter(filter)[0];
    }
}

if (!Array.prototype.max) {
    Array.prototype.max = function<T>(valueSelector: (item: T) => number): number {
        if(this.length === 0) {
            return 0;
        }
        return Math.max(...this.map(valueSelector));
    }
}

if (!Array.prototype.min) {
    Array.prototype.min = function<T>(valueSelector: (item: T) => number): number {
        if(this.length === 0) {
            return 0;
        }
        return Math.min(...this.map(valueSelector));
    }
}
if(!Array.prototype.groupByKey) {
    Array.prototype.groupByKey = function<T>(keySelector: (item: T, index: number) => string): Record<string, T[]> {
        const result: Record<string, T[]> = {};
        this.forEach((item, index) => {
            const key = keySelector(item, index);
            if(!result[key]) {
                result[key] = [];
            }
            result[key].push(item);
        });
        return result;
    }
}

if(!Array.prototype.groupByKeyAndMapToType) {
    Array.prototype.groupByKeyAndMapToType = function<TItem, TValue>(keySelector: (item: TItem, index: number) => string,
                                                                     valueSelector: (item: TItem) => TValue ): Record<string, TValue[]> {

        const result: Record<string, TValue[]> = {};
        const groupedByKey = this.groupByKey(keySelector);

        Object.keys(groupedByKey).forEach(key => {
            result[key] = groupedByKey[key].map(valueSelector);
        })

        return result;
    }
}

if(!Array.prototype.sum) {
    Array.prototype.sum = function<T>(valueSelector: (item: T) => number): number {
        if(this.length === 0) {
            return 0;
        }
        let result = 0;
        this.forEach(item => {
            result += valueSelector(item);
        });

        return result;
    }
}

if(!Array.prototype.all) {
    Array.prototype.all = function<T>(predicate: (item: T) => boolean): boolean {
        if(this.length === 0) {
            return false;
        }

        for(let item of this) {
            if(!predicate(item)) {
                return false;
            }
        }
        return true;
    }
}

if(!Array.prototype.splitToChunks) {
    Array.prototype.splitToChunks = function<T>(chunkSize: number): Array<T[]> {
        if(this.length === 0) {
            return [];
        }

        let result: Array<T[]> = [];
        for(let i = 0; i * chunkSize < this.length; i++) {
            result.push(this.slice(i * chunkSize, i * chunkSize + chunkSize));
        }

        return result;
    }
}

if(!Array.prototype.distinct) {
    Array.prototype.distinct = function<TItem, TResult>(keySelector: (item: TItem) => string, valueSelector?: (item: TItem) => TResult | TItem): Array<TResult | TItem> {
        if(this.length === 0) {
            return [];
        }

        const uniqueItems: Record<string, TResult | TItem> = {};
        if(!valueSelector) {
            valueSelector = (item) => item;
        }

        for(let item of this) {
            uniqueItems[keySelector(item)] = valueSelector(item);
        }

        return Object.values(uniqueItems);
    }
}

if(!Array.prototype.selectMany) {
    Array.prototype.selectMany = function<TItem, TValue>(valuesSelector: (item: TItem, index: number) => TValue[]): TValue[] {

        const result: TValue[] = [];
        this.forEach((item, index) => {
            for(let value of valuesSelector(item, index)) {
                result.push(value);
            }
        });
        return result;
    }
}

export {};

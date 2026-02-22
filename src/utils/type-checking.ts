export class Check {

    static isFunction(input: unknown) : boolean {
        return '[object Function]' === Object.prototype.toString.call(input);
    }

    static isString(input: unknown) : input is string {
        return '[object String]' === Object.prototype.toString.call(input);
    }

    static isNumber(input: unknown): input is number {
        return '[object Number]' === Object.prototype.toString.call(input) && !isNaN(input as number);
    }

    static isObject(input: unknown): input is object {
        return '[object Object]' === Object.prototype.toString.call(input);
    }

    static isDate(input: unknown): input is Date {
        return '[object Date]' === Object.prototype.toString.call(input) && (input as Date).toString() !== "Invalid Date";
    }

    static isArray(expectedArray: unknown): expectedArray is Array<unknown> {
        return Array.isArray(expectedArray);
    }

    static isArrayOfStrings(expectedArray: unknown): expectedArray is string[] {
        if(!Array.isArray(expectedArray)) {
            return false;
        }

        for(let i = 0; i < expectedArray.length; i++) {
            if(!Check.isString(expectedArray[i])) {
                return false;
            }
        }

        return true;
    }

    static isBoolean(input: unknown): input is boolean {
        return true === input || false === input || '[object Boolean]' === Object.prototype.toString.call(input);
    }


    static isError(input: unknown) : input is Error {
        return '[object Error]' === Object.prototype.toString.call(input);
    }

    static isSymbol(input: unknown): input is Symbol {
        return '[object Symbol]' === Object.prototype.toString.call(input);
    }

    static isUndefined(input: unknown): input is undefined {
        return '[object Undefined]' === Object.prototype.toString.call(input);
    }

    static isNull(value: unknown): value is null {
        return value === null;
    }

    static isNullOrUndefined(input: unknown): input is null | undefined {
        return this.isNull(input) || this.isUndefined(input);
    }

    static isEmpty(input: unknown): boolean {

        if(Check.isNullOrUndefined(input)) {
            return true;
        }

        if(Check.isString(input) || Check.isArray(input)) {
            return input.length === 0;
        }

        return Check.isObject(input) && Object.keys(input).length === 0;
    }

}


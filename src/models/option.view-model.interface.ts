export interface IOptionViewModel {
    readonly optionType: string;
    readonly strikePrice: number;
    readonly midPrice: number;
    readonly rawDelta: number;
    readonly absoluteRawDelta: number;
    readonly deltaPercent: number;
    readonly absoluteDeltaPercent: number;
    readonly theta: number;
    readonly bidAskSpread: number;
    readonly expirationDate: string;
    readonly daysToExpiration: number;

}
import {ByEarningsDate, IcType, ISettingsService, IStrategyFiltersViewModel} from "./settings.service.interface";
import {makeObservable, observable, runInAction} from "mobx";
import {ServiceBase} from "../service-base";
import {IServiceFactory} from "../service-factory.interface";
import {RawLocalStorageKeys} from "../storage/raw-local-storage/raw-local-storage-keys";

export class SettingsService extends ServiceBase implements ISettingsService {
    constructor(services: IServiceFactory) {
        super(services);
        this.strategyFilters = new StrategyFiltersModel(services)
    }
    readonly strategyFilters:StrategyFiltersModel ;
}

export class StrategyFiltersModel implements IStrategyFiltersViewModel {
    constructor(private readonly services: IServiceFactory) {
        this._loadFromStorage();
        makeObservable<this, '_minDelta'
            | '_maxDelta'
            | '_maxRiskRewardRatio'
            | '_minDaysToExpiration'
            | '_maxDaysToExpiration'
            | '_maxBidAskSpread'
            | '_wings'
            | '_byEarningsDate'
            | '_minPop'
            | '_minExpectedValue'
            | '_minAlpha'
            | '_icType'
            | '_minCredit'>(this, {
            _minDelta: observable.ref,
            _maxDelta: observable.ref,
            _maxRiskRewardRatio: observable.ref,
            _minDaysToExpiration: observable.ref,
            _maxDaysToExpiration: observable.ref,
            _maxBidAskSpread: observable.ref,
            _wings: observable.ref,
            _byEarningsDate: observable.ref,
            _minPop: observable.ref,
            _minExpectedValue: observable.ref,
            _minAlpha: observable.ref,
            _icType: observable.ref,
            _minCredit: observable.ref,
            lastUpdate: observable.ref
        })
    }

    _minDelta: number = 10;
    _maxDelta: number = 30;
    _maxRiskRewardRatio: number = 4;
    _minDaysToExpiration: number = 35;
    _maxDaysToExpiration: number = 60;
    _wings: number[] = [5, 10];
    _maxBidAskSpread: number = 5;
    _byEarningsDate: ByEarningsDate = "all";
    _minPop: number = 0;
    _minExpectedValue: number = 0;
    _minAlpha: number = 0;
    _icType: IcType = "symmetric";
    _minCredit: number = 1;
    lastUpdate: number = Date.now()


    private _setProperty(propName: keyof this, value: any): void {
        runInAction(() => this[propName] = value);
        this._saveToStorage(propName, value);
        runInAction(() => this.lastUpdate = Date.now());
    }
    
    get minDelta(): number {
        return this._minDelta;
    }
    set minDelta(value) {
        this._setProperty("_minDelta", value);
    }

    get maxDelta(): number {
        return this._maxDelta;
    }
    set maxDelta(value) {
        this._setProperty("_maxDelta", value);
    }

    get maxRiskRewardRatio(): number {
        return this._maxRiskRewardRatio;
    }
    set maxRiskRewardRatio(value) {
        this._setProperty("_maxRiskRewardRatio", value);
    }

    get minDaysToExpiration(): number {
        return this._minDaysToExpiration;
    }
    set minDaysToExpiration(value) {
        this._setProperty("_minDaysToExpiration", value);
    }

    get maxDaysToExpiration(): number {
        return this._maxDaysToExpiration;
    }
    set maxDaysToExpiration(value) {
        this._setProperty("_maxDaysToExpiration", value);
    }

    get maxBidAskSpread(): number {
        return this._maxBidAskSpread;
    }
    set maxBidAskSpread(value) {
        this._setProperty("_maxBidAskSpread", value);
    }

    get availableWings(): number[] {
        return [5, 10, 15, 20];
    }

    get wings(): number[] {
        return this._wings;
    }
    set wings(value) {
        this._setProperty("_wings", value);
    }


    get byEarningsDate(): ByEarningsDate {
        return this._byEarningsDate;
    }

    set byEarningsDate(value: ByEarningsDate) {
        this._setProperty("_byEarningsDate", value);
    }

    get minPop(): number {
        return this._minPop;
    }
    set minPop(value: number) {
        this._setProperty("_minPop", value);
    }

    get minExpectedValue(): number {
        return this._minExpectedValue;
    }
    set minExpectedValue(value: number) {
        this._setProperty("_minExpectedValue", value);
    }

    get minAlpha(): number {
        return this._minAlpha;
    }
    set minAlpha(value: number) {
        this._setProperty("_minAlpha", value);
    }

    get icType(): IcType {
        return this._icType;
    }
    set icType(value: IcType) {
        this._setProperty("_icType", value);
    }

    get minCredit(): number {
        return this._minCredit;
    }
    set minCredit(value: number) {
        this._setProperty("_minCredit", value);
    }

    private _storedData: any = {};

    private _saveToStorage(propName: keyof this, value: any): void {
        this._storedData[propName] = value;
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.strategyFilters, this._storedData);
    }

    private _loadFromStorage(): void {
        this._storedData = this.services.rawLocalStorage.getJson(RawLocalStorageKeys.strategyFilters) ?? {};

        for(const key of Object.keys(this._storedData)) {
            (this as any)[key] = this._storedData[key];
        }
    }

}
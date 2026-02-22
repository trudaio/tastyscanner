import {ITickerViewModel} from "../../models/ticker.view-model.interface";

export interface ITickersService {
    readonly currentTicker: ITickerViewModel | null;
    setCurrentTicker(symbol: string): Promise<void>;
    readonly recentTickers: ITickerViewModel[];
    searchTicker(query: string): Promise<ISearchTickerResultItem[]>;
}

export interface ISearchTickerResultItem {
    symbol: string;
    description: string;
}
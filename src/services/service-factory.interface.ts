import {ITickersService} from "./tickers/tickers.service.interface";
import {ISettingsService} from "./settings/settings.service.interface";
import {IMarketDataProviderService} from "./market-data-provider/market-data-provider.service.interface";
import {ILanguageService} from "./language/language.service.interface";
import {ILoggerService} from "./logger/logger.service.interface";
import {IBrokerAccountService} from "./broker-account/broker-account.service.interface";
import {IRawLocalStorageService} from "./storage/raw-local-storage/raw-local-storage.service.interface";
import {IPositionsService} from "./positions/positions.service.interface";
import {IIronCondorAnalyticsService} from "./iron-condor-analytics/iron-condor-analytics.interface";
import {IWatchlistDataService} from "./watchlist-data/watchlist-data.service.interface";
import {ITradingDashboardService} from "./trading-dashboard/trading-dashboard.interface";
import {IIronCondorSaviorService} from "./iron-condor-savior/iron-condor-savior.interface";
import {ITradeLogService} from "./trade-log/trade-log.interface";
import type { ICredentialsService } from './credentials/credentials.service.interface';
import type { IBrokerCredentialsService } from './credentials/broker-credentials.service.interface';
import type { BrokerType, IBrokerCredentials } from './broker-provider/broker-provider.interface';
import type { IDeltaAlertService } from './delta-alert/delta-alert.interface';
import type { ITechnicalsService } from './technicals/technicals.service.interface';
import type { IScenarioStudyService } from './scenario-study/scenario-study.interface';

export interface IServiceFactory {
    readonly tickers: ITickersService;
    readonly settings: ISettingsService;
    readonly marketDataProvider: IMarketDataProviderService;
    readonly language: ILanguageService;
    readonly logger: ILoggerService;
    readonly brokerAccount: IBrokerAccountService;
    readonly rawLocalStorage: IRawLocalStorageService;
    readonly positions: IPositionsService;
    readonly ironCondorAnalytics: IIronCondorAnalyticsService;
    readonly watchlistData: IWatchlistDataService;
    readonly tradingDashboard: ITradingDashboardService;
    readonly ironCondorSavior: IIronCondorSaviorService;
    readonly tradeLog: ITradeLogService;
    /** @deprecated Use `brokerCredentials` for multi-broker support. */
    readonly credentials: ICredentialsService;
    readonly brokerCredentials: IBrokerCredentialsService;
    readonly deltaAlert: IDeltaAlertService;
    readonly technicals: ITechnicalsService;
    readonly scenarioStudy: IScenarioStudyService;
    readonly isInitialized: boolean;
    /** Initialize with a broker credentials object (multi-broker). */
    initialize(credentials: IBrokerCredentials): void;
    /** @deprecated Initialize with raw TastyTrade credentials. */
    initialize(clientSecret: string, refreshToken: string, brokerType?: BrokerType): void;
}

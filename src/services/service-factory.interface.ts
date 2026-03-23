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
import type { IBacktestService } from './backtest/backtest-engine.interface';
import type { BrokerType } from './broker-provider/broker-provider.interface';
import type { IDeltaAlertService } from './delta-alert/delta-alert.interface';
import type { ITradeProposalService } from './trade-proposals/trade-proposal.interface';
import type { IScannerService } from './scanner/scanner.service.interface';

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
    readonly backtest: IBacktestService;
    readonly deltaAlert: IDeltaAlertService;
    readonly tradeProposals: ITradeProposalService;
    readonly scanner: IScannerService;
    readonly isInitialized: boolean;
    /**
     * Initialize the factory with TastyTrade credentials.
     * @param brokerType Defaults to BrokerType.TastyTrade for backward compatibility.
     */
    initialize(clientSecret: string, refreshToken: string, brokerType?: BrokerType): void;
}

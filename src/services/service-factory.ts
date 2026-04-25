import { makeObservable, observable, action, runInAction } from 'mobx';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ITickersService } from "./tickers/tickers.service.interface";
import {IServiceFactory} from "./service-factory.interface";
import {Lazy} from "../utils/lazy";
import {TickersService} from "./tickers/tickers.service";
import {ISettingsService} from "./settings/settings.service.interface";
import {SettingsService} from "./settings/settings.service";
import {IMarketDataProviderService} from "./market-data-provider/market-data-provider.service.interface";
import {MarketDataProviderService} from "./market-data-provider/market-data-provider.service";
import {ILanguageService} from "./language/language.service.interface";
import {LanguageService} from "./language/language.service";
import {ILoggerService} from "./logger/logger.service.interface";
import {ConsoleLoggerService} from "./logger/console-logger.service";
import {IBrokerAccountService} from "./broker-account/broker-account.service.interface";
import {BrokerAccountService} from "./broker-account/broker-account.service";
import {IRawLocalStorageService} from "./storage/raw-local-storage/raw-local-storage.service.interface";
import {RawLocalStorageService} from "./storage/raw-local-storage/raw-local-storage.service";
import {IPositionsService} from "./positions/positions.service.interface";
import {PositionsService} from "./positions/positions.service";
import {IIronCondorAnalyticsService} from "./iron-condor-analytics/iron-condor-analytics.interface";
import {IronCondorAnalyticsService} from "./iron-condor-analytics/iron-condor-analytics.service";
import {IWatchlistDataService} from "./watchlist-data/watchlist-data.service.interface";
import {WatchlistDataService} from "./watchlist-data/watchlist-data.service";
import {ITradingDashboardService} from "./trading-dashboard/trading-dashboard.interface";
import {TradingDashboardService} from "./trading-dashboard/trading-dashboard.service";
import {IIronCondorSaviorService} from "./iron-condor-savior/iron-condor-savior.interface";
import {IronCondorSaviorService} from "./iron-condor-savior/iron-condor-savior.service";
import {ITradeLogService} from "./trade-log/trade-log.interface";
import {TradeLogService} from "./trade-log/trade-log.service";
import type { ICredentialsService } from './credentials/credentials.service.interface';
import { CredentialsService } from './credentials/credentials.service';
import type { IBrokerCredentialsService } from './credentials/broker-credentials.service.interface';
import { BrokerCredentialsService } from './credentials/broker-credentials.service';
import { BrokerType, type IBrokerCredentials } from './broker-provider/broker-provider.interface';
import type { IDeltaAlertService } from './delta-alert/delta-alert.interface';
import { DeltaAlertService } from './delta-alert/delta-alert.service';
import type { ITechnicalsService } from './technicals/technicals.service.interface';
import { TechnicalsService } from './technicals/technicals.service';
import type { IScenarioStudyService } from './scenario-study/scenario-study.interface';
import { ScenarioStudyService } from './scenario-study/scenario-study.service';
import type { ITradeJournalService } from './trade-journal/trade-journal.service.interface';
import { TradeJournalService } from './trade-journal/trade-journal.service';
import type { IEconomicCalendarService } from './economic-calendar/economic-calendar.service.interface';
import { EconomicCalendarService } from './economic-calendar/economic-calendar.service';

export class ServiceFactory implements IServiceFactory {

    isInitialized = false;

    private _clientSecret = '';
    private _refreshToken = '';
    private _brokerType: BrokerType = BrokerType.TastyTrade;

    constructor() {
        makeObservable(this, {
            isInitialized: observable,
            initialize: action,
        });

        // Auto-initialize when Firebase auth confirms user
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.brokerCredentials.getActiveBrokerAccount()
                    .then((active) => {
                        if (active) {
                            this.initialize(active.credentials);
                        } else {
                            console.warn('No active broker account found. Please add a broker in the sidebar.');
                        }
                    })
                    .catch((err: unknown) => {
                        console.warn('Failed to load broker account:', err);
                    });
            } else {
                runInAction(() => {
                    this.isInitialized = false;
                });
            }
        });
    }

    initialize(credentials: IBrokerCredentials): void;
    initialize(clientSecret: string, refreshToken: string, brokerType?: BrokerType): void;
    initialize(credentialsOrSecret: IBrokerCredentials | string, refreshToken?: string, brokerType: BrokerType = BrokerType.TastyTrade): void {
        let credentials: IBrokerCredentials;
        if (typeof credentialsOrSecret === 'string') {
            // Legacy path: raw TastyTrade credentials
            this._clientSecret = credentialsOrSecret;
            this._refreshToken = refreshToken!;
            this._brokerType = brokerType;
            credentials = { brokerType: BrokerType.TastyTrade, clientSecret: credentialsOrSecret, refreshToken: refreshToken! };
        } else {
            credentials = credentialsOrSecret;
            this._brokerType = credentials.brokerType;
            if (credentials.brokerType === BrokerType.TastyTrade) {
                this._clientSecret = credentials.clientSecret;
                this._refreshToken = credentials.refreshToken;
            }
        }
        this._marketDataProvider = new Lazy<IMarketDataProviderService>(
            () => new MarketDataProviderService(credentials)
        );
        this.isInitialized = true;
        // Reload accounts using the new credentials (handles race condition where
        // BrokerAccountService was created before credentials were available)
        void this._brokerAccount.value.reload();
        // Start WebSocket on the new provider; once connected re-subscribe the
        // current ticker so quotes/greeks stream immediately
        void this.marketDataProvider.start().then(() => {
            const symbol = this.tickers.currentTicker?.symbol;
            if (symbol) {
                void this.tickers.setCurrentTicker(symbol);
            }
            // Start background delta monitoring after WebSocket is ready
            this.deltaAlert.startBackgroundMonitoring();
        });
    }

    private _credentials: Lazy<ICredentialsService> = new Lazy<ICredentialsService>(() => new CredentialsService());
    get credentials(): ICredentialsService {
        return this._credentials.value;
    }

    private _brokerCredentials: Lazy<IBrokerCredentialsService> = new Lazy<IBrokerCredentialsService>(() => new BrokerCredentialsService());
    get brokerCredentials(): IBrokerCredentialsService {
        return this._brokerCredentials.value;
    }

    private _tickers: Lazy<ITickersService> = new Lazy<ITickersService>(() => new TickersService(this));
    get tickers(): ITickersService {
        return this._tickers.value;
    }

    private _settings: Lazy<ISettingsService> = new Lazy<ISettingsService>(() => new SettingsService(this));
    get settings(): ISettingsService {
        return this._settings.value;
    }

    private _marketDataProvider: Lazy<IMarketDataProviderService> = new Lazy<IMarketDataProviderService>(
        () => new MarketDataProviderService(this._clientSecret, this._refreshToken)
    );
    get marketDataProvider(): IMarketDataProviderService {
        return this._marketDataProvider.value;
    }

    private _language: Lazy<ILanguageService> = new Lazy<ILanguageService>(() => new LanguageService());
    get language(): ILanguageService {
        return this._language.value;
    }

    private _logger: Lazy<ILoggerService> = new Lazy<ILoggerService>(() => new ConsoleLoggerService());
    get logger(): ILoggerService {
        return this._logger.value;
    }

    private _brokerAccount: Lazy<IBrokerAccountService> = new Lazy<IBrokerAccountService>(() => new BrokerAccountService(this));
    get brokerAccount(): IBrokerAccountService {
        return this._brokerAccount.value;
    }

    private _rawLocalStorage: Lazy<IRawLocalStorageService> = new Lazy<IRawLocalStorageService>(() => new RawLocalStorageService(this));
    get rawLocalStorage(): IRawLocalStorageService {
        return this._rawLocalStorage.value;
    }

    private _positions: Lazy<IPositionsService> = new Lazy<IPositionsService>(() => new PositionsService(this));
    get positions(): IPositionsService {
        return this._positions.value;
    }

    private _ironCondorAnalytics: Lazy<IIronCondorAnalyticsService> = new Lazy<IIronCondorAnalyticsService>(() => new IronCondorAnalyticsService(this));
    get ironCondorAnalytics(): IIronCondorAnalyticsService {
        return this._ironCondorAnalytics.value;
    }

    private _watchlistData: Lazy<IWatchlistDataService> = new Lazy<IWatchlistDataService>(() => new WatchlistDataService(this));
    get watchlistData(): IWatchlistDataService {
        return this._watchlistData.value;
    }

    private _tradingDashboard: Lazy<ITradingDashboardService> = new Lazy<ITradingDashboardService>(() => new TradingDashboardService(this));
    get tradingDashboard(): ITradingDashboardService {
        return this._tradingDashboard.value;
    }

    private _ironCondorSavior: Lazy<IIronCondorSaviorService> = new Lazy<IIronCondorSaviorService>(() => new IronCondorSaviorService(this));
    get ironCondorSavior(): IIronCondorSaviorService {
        return this._ironCondorSavior.value;
    }

    private _tradeLog: Lazy<ITradeLogService> = new Lazy<ITradeLogService>(() => new TradeLogService(this));
    get tradeLog(): ITradeLogService {
        return this._tradeLog.value;
    }

    private _deltaAlert: Lazy<IDeltaAlertService> = new Lazy<IDeltaAlertService>(() => new DeltaAlertService(this));
    get deltaAlert(): IDeltaAlertService {
        return this._deltaAlert.value;
    }

    private _technicals: Lazy<ITechnicalsService> = new Lazy<ITechnicalsService>(() => new TechnicalsService());
    get technicals(): ITechnicalsService {
        return this._technicals.value;
    }

    private _scenarioStudy: Lazy<IScenarioStudyService> = new Lazy<IScenarioStudyService>(() => new ScenarioStudyService(this));
    get scenarioStudy(): IScenarioStudyService {
        return this._scenarioStudy.value;
    }

    private _tradeJournal: Lazy<ITradeJournalService> = new Lazy<ITradeJournalService>(() => new TradeJournalService(this));
    get tradeJournal(): ITradeJournalService {
        return this._tradeJournal.value;
    }

    private _economicCalendar: Lazy<IEconomicCalendarService> = new Lazy<IEconomicCalendarService>(() => {
        const svc = new EconomicCalendarService();
        svc.init();
        return svc;
    });
    get economicCalendar(): IEconomicCalendarService {
        return this._economicCalendar.value;
    }

}

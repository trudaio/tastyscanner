import {ServiceBase} from "../service-base";
import {IBrokerAccountService, IBrokerAccountViewModel} from "./broker-account.service.interface";
import {IServiceFactory} from "../service-factory.interface";
import {makeObservable, observable, runInAction} from "mobx";
import {BrokerAccountModel} from "./broker-account.model";
import {RawLocalStorageKeys} from "../storage/raw-local-storage/raw-local-storage-keys";

export class BrokerAccountService extends ServiceBase implements IBrokerAccountService {
    constructor(services: IServiceFactory) {
        super(services);
        makeObservable(this, {
            accounts: observable.ref,
            currentAccount: observable.ref
        });
        services.marketDataProvider.getAccounts().then(accounts => {
            runInAction(() => {
                this.accounts = accounts.map(acc => new BrokerAccountModel(acc.accountNumber, services));
                const lastUsedAccount = services.rawLocalStorage.getItem(RawLocalStorageKeys.currentBrokerAccount);
                if(lastUsedAccount) {
                    this.setCurrentAccount(lastUsedAccount);
                }

                if(!this.currentAccount) {
                    this.currentAccount = this.accounts[0] ?? null;
                }

                // Load balances for current account
                if(this.currentAccount) {
                    this.currentAccount.loadBalances();
                }
            })
        });
    }
    accounts: BrokerAccountModel[] = [];

    currentAccount: IBrokerAccountViewModel | null = null;

    async reload(): Promise<void> {
        const accounts = await this.services.marketDataProvider.getAccounts();
        runInAction(() => {
            this.accounts = accounts.map(acc => new BrokerAccountModel(acc.accountNumber, this.services));
            const lastUsedAccount = this.services.rawLocalStorage.getItem(RawLocalStorageKeys.currentBrokerAccount);
            if (lastUsedAccount) {
                this.setCurrentAccount(lastUsedAccount);
            }
            if (!this.currentAccount) {
                this.currentAccount = this.accounts[0] ?? null;
            }
            if (this.currentAccount) {
                this.currentAccount.loadBalances();
            }
        });
    }

    setCurrentAccount(accountNumber: string): void {
        runInAction(() => {
            this.currentAccount = this.accounts.find(acc => acc.accountNumber === accountNumber) ?? null;
        });

        if(this.currentAccount) {
            this.services.rawLocalStorage.setItem(RawLocalStorageKeys.currentBrokerAccount, this.currentAccount.accountNumber);
            // Load balances when account changes
            this.currentAccount.loadBalances();
        }

    }
}

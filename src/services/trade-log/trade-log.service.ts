import {ITradeLogEntry, ITradeLogLeg, ITradeLogService, TradeLogStatus} from "./trade-log.interface";
import {makeObservable, observable, runInAction} from "mobx";
import {ServiceBase} from "../service-base";
import {IServiceFactory} from "../service-factory.interface";
import {RawLocalStorageKeys} from "../storage/raw-local-storage/raw-local-storage-keys";

export class TradeLogService extends ServiceBase implements ITradeLogService {

    constructor(services: IServiceFactory) {
        super(services);
        this._entries = this._loadFromStorage();
        makeObservable<this, '_entries' | '_discordWebhookUrl'>(this, {
            _entries: observable.ref,
            _discordWebhookUrl: observable.ref,
        });
    }

    private _entries: ITradeLogEntry[];
    private _discordWebhookUrl: string = '';

    get entries(): ITradeLogEntry[] {
        return this._entries;
    }

    get discordWebhookUrl(): string {
        return this._discordWebhookUrl || this.services.rawLocalStorage.getJson<string>(RawLocalStorageKeys.discordWebhookUrl) || '';
    }

    set discordWebhookUrl(value: string) {
        runInAction(() => { this._discordWebhookUrl = value; });
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.discordWebhookUrl, value);
    }

    async logTrade(entry: Omit<ITradeLogEntry, 'id' | 'timestamp' | 'status'>): Promise<ITradeLogEntry> {
        const newEntry: ITradeLogEntry = {
            ...entry,
            id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            status: 'open' as TradeLogStatus,
        };

        runInAction(() => {
            this._entries = [newEntry, ...this._entries];
        });

        this._saveToStorage();
        await this._sendToDiscord(newEntry);

        return newEntry;
    }

    closeTrade(id: string, closePrice: number, realizedPnl: number, notes?: string): void {
        runInAction(() => {
            this._entries = this._entries.map(e =>
                e.id === id
                    ? { ...e, status: 'closed' as TradeLogStatus, closedAt: Date.now(), closePrice, realizedPnl, notes }
                    : e
            );
        });
        this._saveToStorage();
    }

    deleteEntry(id: string): void {
        runInAction(() => {
            this._entries = this._entries.filter(e => e.id !== id);
        });
        this._saveToStorage();
    }

    clearAll(): void {
        runInAction(() => { this._entries = []; });
        this._saveToStorage();
    }

    private _saveToStorage(): void {
        this.services.rawLocalStorage.setJson(RawLocalStorageKeys.tradeLog, this._entries);
    }

    private _loadFromStorage(): ITradeLogEntry[] {
        return this.services.rawLocalStorage.getJson<ITradeLogEntry[]>(RawLocalStorageKeys.tradeLog) ?? [];
    }

    private async _sendToDiscord(entry: ITradeLogEntry): Promise<void> {
        const webhookUrl = this.discordWebhookUrl;
        if (!webhookUrl) return;

        const evSign = entry.expectedValue >= 0 ? '+' : '';
        const alphaSign = entry.alpha >= 0 ? '+' : '';
        const date = new Date(entry.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' });
        const legsText = entry.legs.map(leg =>
            `${leg.action} ${leg.strikePrice}${leg.optionType} @${leg.midPrice.toFixed(2)}`
        ).join('\n');

        const embed = {
            title: `🦅 New Trade: ${entry.symbol} ${entry.strategyName}`,
            color: entry.expectedValue >= 0 ? 0x00b09b : 0xff6b6b,
            fields: [
                { name: '📅 DTE', value: `${entry.dte} days`, inline: true },
                { name: '💰 Credit', value: `$${entry.credit.toFixed(2)}`, inline: true },
                { name: '📦 Qty', value: `${entry.quantity}`, inline: true },
                { name: '🎯 POP', value: `${entry.pop}%`, inline: true },
                { name: '📊 EV', value: `${evSign}$${entry.expectedValue.toFixed(2)}`, inline: true },
                { name: '⚡ Alpha', value: `${alphaSign}${entry.alpha.toFixed(2)}%`, inline: true },
                { name: '✅ Max Profit', value: `$${entry.maxProfit.toFixed(0)}`, inline: true },
                { name: '❌ Max Loss', value: `$${entry.maxLoss.toFixed(0)}`, inline: true },
                { name: '📐 R/R', value: `${entry.riskRewardRatio}:1`, inline: true },
                { name: '🔺 Delta', value: `${entry.delta}`, inline: true },
                { name: '⏱ Theta', value: `${entry.theta}`, inline: true },
                { name: '🏗 IC Type', value: entry.icType, inline: true },
                { name: '📋 Legs', value: legsText, inline: false },
            ],
            footer: { text: `Operatiunea Guvidul • ${date} ET` },
            timestamp: new Date(entry.timestamp).toISOString(),
        };

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] }),
            });
        } catch (err) {
            this.services.logger.error('TradeLogService: Discord webhook failed', err);
        }
    }
}

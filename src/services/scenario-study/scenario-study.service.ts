import { makeObservable, observable, runInAction } from 'mobx';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { IServiceFactory } from '../service-factory.interface';
import type {
    IScenarioStudyService,
    ITradeScenarioResult,
    IScenarioStudySummary,
    IUnderlyingBar,
} from './scenario-study.interface';
import { computeAllScenarios, computeSummary } from './scenario-compute';

// SPY/SPX ratio — we use SPY bars from marketTechnicals and scale for SPX trades
const SPY_TO_SPX_RATIO = 10;

export class ScenarioStudyService implements IScenarioStudyService {
    isLoading = false;
    results: ITradeScenarioResult[] = [];
    summary: IScenarioStudySummary | null = null;
    error: string | null = null;

    constructor(private services: IServiceFactory) {
        makeObservable(this, {
            isLoading: observable,
            results: observable.ref,
            summary: observable.ref,
            error: observable,
        });
    }

    async compute(): Promise<void> {
        runInAction(() => { this.isLoading = true; this.error = null; });
        try {
            // 1. Get closed trades from IronCondorAnalytics
            const allTrades = await this.services.ironCondorAnalytics.fetchYTDTrades();
            const closed = allTrades.filter((t) => t.status === 'closed' || t.status === 'expired');

            if (closed.length === 0) {
                runInAction(() => { this.results = []; this.summary = null; this.isLoading = false; });
                return;
            }

            // 2. Get underlying bars — group trades by ticker
            const tickers = [...new Set(closed.map((t) => t.ticker))];
            const barsByTicker = new Map<string, IUnderlyingBar[]>();

            for (const ticker of tickers) {
                const bars = await this.fetchUnderlyingBars(ticker);
                barsByTicker.set(ticker, bars);
            }

            // 2b. Scale SPY bars → SPX level (marketTechnicals + Polygon both store SPY prices)
            if (barsByTicker.has('SPX')) {
                const spyBars = barsByTicker.get('SPX')!;
                barsByTicker.set('SPX', spyBars.map((b) => ({ ...b, close: b.close * SPY_TO_SPX_RATIO })));
            }

            // 3. Compute scenarios per trade
            const results: ITradeScenarioResult[] = [];
            for (const trade of closed) {
                const bars = barsByTicker.get(trade.ticker) ?? [];
                if (bars.length === 0) continue;
                results.push(computeAllScenarios(trade, bars));
            }

            const summary = computeSummary(results);

            runInAction(() => {
                this.results = results;
                this.summary = summary;
                this.isLoading = false;
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            runInAction(() => { this.error = msg; this.isLoading = false; });
        }
    }

    private async fetchUnderlyingBars(ticker: string): Promise<IUnderlyingBar[]> {
        // Try marketTechnicals Firestore doc first (has 90 recent bars)
        const mappedTicker = ticker === 'SPX' ? 'SPX' : ticker;
        try {
            const techDoc = await getDoc(doc(db, 'marketTechnicals', mappedTicker));
            if (techDoc.exists()) {
                const data = techDoc.data() as { bars?: Array<{ date: string; close: number }> };
                if (data.bars && data.bars.length > 0) {
                    return data.bars.map((b) => ({ date: b.date, close: b.close }));
                }
            }
        } catch (e) {
            console.warn(`[ScenarioStudy] Failed to read marketTechnicals/${mappedTicker}:`, e);
        }

        // Fallback: fetch from Polygon stock-bars proxy (for trades older than 90d)
        try {
            const user = auth.currentUser;
            if (!user) return [];
            const token = await user.getIdToken();
            const polygonTicker = ticker === 'SPX' ? 'SPY' : ticker;
            const from = '2025-01-01'; // YTD start
            const to = new Date().toISOString().split('T')[0];
            const resp = await fetch(
                `https://api-awasrjiqfq-uc.a.run.app/api/polygon/stock-bars?symbol=${polygonTicker}&from=${from}&to=${to}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!resp.ok) return [];
            const json = await resp.json() as { bars: Array<{ date: string; close: number }> };
            return json.bars.map((b) => ({ date: b.date, close: b.close }));
        } catch (e) {
            console.warn(`[ScenarioStudy] Failed to fetch proxy bars for ${ticker}:`, e);
            return [];
        }
    }
}

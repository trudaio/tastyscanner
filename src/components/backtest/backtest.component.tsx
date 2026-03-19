/**
 * Backtest Component — OptionAlpha-style orchestrator
 *
 * Manages all parameter state, delegates to section sub-components,
 * and renders results + saved tests panel.
 */

import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { IonSpinner } from '@ionic/react';
import { useServices } from '../../hooks/use-services.hook';
import type { IBacktestParams, IBacktestResults } from '../../services/backtest/backtest-engine.interface';
import { DEFAULT_BACKTEST_PARAMS } from '../../services/backtest/backtest-engine.interface';

// Sub-components
import { StrategySetupSection } from './sections/strategy-setup-section';
import { LegSelectionSection } from './sections/leg-selection-section';
import { CapitalSection } from './sections/capital-section';
import { PositionEntrySection } from './sections/position-entry-section';
import { ExitOptionsSection } from './sections/exit-options-section';
import { BacktestOptionsSection } from './sections/backtest-options-section';
import { BacktestResultsComponent } from './results/backtest-results';
import { BatchComparisonComponent } from './results/batch-comparison.component';
import { SavedTestsPanelComponent } from './saved/saved-tests-panel';

// Shared styled
import {
    Container, Card, CardHeader, CardHeaderTitle, OptionalBadge,
    ChevronIcon, CardContent, ButtonRow, RunButton, CancelButton,
    ProgressContainer, ProgressBar, ProgressText, ErrorBox,
    Hero, HeroTop, HeroText, HeroEyebrow, HeroTitle, HeroSummary,
    HeroMetrics, HeroMetric, HeroMetricLabel, HeroMetricValue,
    PanelEmptyState, PanelEmptyText, PanelEmptyTitle, PanelHint, PanelHintRow,
    WorkflowCard, WorkflowGrid, WorkflowStep, WorkflowText, WorkflowTitle,
} from './backtest-styled';

/* ─── Date helpers ───────────────────────────────────────────────────────── */

function getDefaultDates(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

/* ─── CollapsibleCard wrapper ────────────────────────────────────────────── */

interface CollapsibleCardProps {
    title: string;
    optional?: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({ title, optional, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Card>
            <CardHeader onClick={() => setOpen(!open)}>
                <CardHeaderTitle>
                    {title}
                    {optional && <OptionalBadge>(optional)</OptionalBadge>}
                </CardHeaderTitle>
                <ChevronIcon $open={open}>▾</ChevronIcon>
            </CardHeader>
            <CardContent $open={open}>{children}</CardContent>
        </Card>
    );
};

/* ─── Main Component ─────────────────────────────────────────────────────── */

export const BacktestComponent: React.FC = observer(() => {
    const services = useServices();
    const bt = services.backtest;
    const defaults = getDefaultDates();

    // ─── Strategy Setup State ─────────────────────────────────────────────
    const [tickers, setTickers] = useState<string[]>(['SPY']);
    const [icType, setIcType] = useState<'symmetric' | 'bullish' | 'bearish'>('symmetric');
    const [minDTE, setMinDTE] = useState(DEFAULT_BACKTEST_PARAMS.minDTE);
    const [maxDTE, setMaxDTE] = useState(DEFAULT_BACKTEST_PARAMS.maxDTE);
    const [ladderingMode, setLadderingMode] = useState<'single' | 'fill-all'>('single');

    // ─── Leg Selection State ──────────────────────────────────────────────
    const [targetDelta, setTargetDelta] = useState(16);
    const [wingWidth, setWingWidth] = useState(5);
    const [asymmetricDelta, setAsymmetricDelta] = useState(false);
    const [putTargetDelta, setPutTargetDelta] = useState(20);
    const [callTargetDelta, setCallTargetDelta] = useState(15);

    // ─── Capital State ────────────────────────────────────────────────────
    const [capital, setCapital] = useState(100000);
    const [maxPositionPct, setMaxPositionPct] = useState(5);
    const [maxOpenPositions, setMaxOpenPositions] = useState(10);
    const [contractsPerPosition, setContractsPerPosition] = useState(1);

    // ─── Position Entry State ─────────────────────────────────────────────
    const [slippage, setSlippage] = useState(DEFAULT_BACKTEST_PARAMS.slippage);
    const [commissionPerContract, setCommissionPerContract] = useState(DEFAULT_BACKTEST_PARAMS.commissionPerContract);
    const [riskFreeRate, setRiskFreeRate] = useState(DEFAULT_BACKTEST_PARAMS.riskFreeRate);

    // ─── Exit Options State ───────────────────────────────────────────────
    const [profitTarget, setProfitTarget] = useState(DEFAULT_BACKTEST_PARAMS.profitTargetPct);
    const [stopLoss, setStopLoss] = useState(DEFAULT_BACKTEST_PARAMS.stopLossPct);
    const [closeDTE, setCloseDTE] = useState(DEFAULT_BACKTEST_PARAMS.closeDTE);
    const [profitTargetEnabled, setProfitTargetEnabled] = useState(true);
    const [stopLossEnabled, setStopLossEnabled] = useState(true);
    const [closeDTEEnabled, setCloseDTEEnabled] = useState(true);
    const [batchMode, setBatchMode] = useState(false);
    const [batchTargets, setBatchTargets] = useState<number[]>([9999, 70, 85, 90]);

    // ─── Backtest Options State ───────────────────────────────────────────
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);
    const [testPeriod, setTestPeriod] = useState<'1Y' | '2Y' | '3Y' | 'custom'>('1Y');
    const [description, setDescription] = useState('');
    const [excludedDates, setExcludedDates] = useState('');

    // ─── Ticker Toggle ────────────────────────────────────────────────────
    const toggleTicker = useCallback((t: string) => {
        setTickers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    }, []);

    // ─── Build Params ─────────────────────────────────────────────────────
    const buildParams = useCallback((): IBacktestParams => {
        const deltaMargin = 4;
        const parsedExcluded = excludedDates.trim()
            ? excludedDates.trim().split(/\s+/).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            : undefined;

        const effectiveDelta = asymmetricDelta ? Math.round((putTargetDelta + callTargetDelta) / 2) : targetDelta;

        return {
            tickers,
            startDate,
            endDate,
            initialCapital: capital,
            maxPositionPct,
            maxOpenPositions,
            minDelta: Math.max(1, effectiveDelta - deltaMargin),
            maxDelta: effectiveDelta + deltaMargin,
            wings: [wingWidth],
            icType,
            minPop: 0,
            minExpectedValue: 0,
            minAlpha: 0,
            minCredit: 0.20,
            maxRiskRewardRatio: 20,
            minDTE,
            maxDTE,
            profitTargetPct: batchMode ? 9999 : (profitTargetEnabled ? profitTarget : 9999),
            stopLossPct: stopLossEnabled ? stopLoss : 9999,
            closeDTE: closeDTEEnabled ? closeDTE : 0,
            riskFreeRate,
            slippage,
            commissionPerContract,
            // New Guvidul params
            ...(asymmetricDelta ? {
                putTargetDelta,
                callTargetDelta,
            } : {}),
            ladderingMode,
            contractsPerPosition,
            ...(batchMode ? { batchProfitTargets: [...batchTargets].sort((a, b) => b - a) } : {}),
            description: description || undefined,
            excludedDates: parsedExcluded,
        };
    }, [
        tickers, startDate, endDate, capital, maxPositionPct, maxOpenPositions,
        targetDelta, wingWidth, icType, minDTE, maxDTE, profitTarget, stopLoss, closeDTE,
        profitTargetEnabled, stopLossEnabled, closeDTEEnabled,
        riskFreeRate, slippage, commissionPerContract, description, excludedDates,
        asymmetricDelta, putTargetDelta, callTargetDelta, ladderingMode, contractsPerPosition,
        batchMode, batchTargets,
    ]);

    // ─── Run ──────────────────────────────────────────────────────────────
    const handleRun = useCallback(() => {
        void bt.runBacktest(buildParams());
    }, [bt, buildParams]);

    // ─── Save ─────────────────────────────────────────────────────────────
    const handleSave = useCallback((name: string) => {
        void bt.saveBacktest(name);
    }, [bt]);

    // ─── Load Saved Test ──────────────────────────────────────────────────
    const handleLoadTest = useCallback((params: IBacktestParams, results: IBacktestResults) => {
        // Populate UI state from loaded params
        setTickers(params.tickers);
        setIcType(params.icType);
        setTargetDelta(Math.round((params.minDelta + params.maxDelta) / 2));
        setWingWidth(params.wings[0] || 5);
        setMinDTE(params.minDTE);
        setMaxDTE(params.maxDTE);
        setCapital(params.initialCapital);
        setMaxPositionPct(params.maxPositionPct);
        setMaxOpenPositions(params.maxOpenPositions);
        setSlippage(params.slippage);
        setCommissionPerContract(params.commissionPerContract);
        setRiskFreeRate(params.riskFreeRate);
        setStartDate(params.startDate);
        setEndDate(params.endDate);
        setTestPeriod('custom');
        setDescription(params.description || '');
        setExcludedDates(params.excludedDates?.join(' ') || '');
        setLadderingMode(params.ladderingMode ?? 'single');
        setContractsPerPosition(params.contractsPerPosition ?? 1);

        if (params.putTargetDelta != null && params.callTargetDelta != null) {
            setAsymmetricDelta(true);
            setPutTargetDelta(params.putTargetDelta);
            setCallTargetDelta(params.callTargetDelta);
        } else {
            setAsymmetricDelta(false);
        }

        if (params.batchProfitTargets && params.batchProfitTargets.length > 1) {
            setBatchMode(true);
            setBatchTargets(params.batchProfitTargets);
        } else {
            setBatchMode(false);
        }

        if (params.profitTargetPct >= 9999) {
            setProfitTargetEnabled(false);
        } else {
            setProfitTargetEnabled(true);
            setProfitTarget(params.profitTargetPct);
        }
        if (params.stopLossPct >= 9999) {
            setStopLossEnabled(false);
        } else {
            setStopLossEnabled(true);
            setStopLoss(params.stopLossPct);
        }
        if (params.closeDTE <= 0) {
            setCloseDTEEnabled(false);
        } else {
            setCloseDTEEnabled(true);
            setCloseDTE(params.closeDTE);
        }

        // Set results directly on the service
        bt.results = results;
    }, [bt]);

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <Container>
            <Hero>
                <HeroTop>
                    <HeroText>
                        <HeroEyebrow>Research Lab</HeroEyebrow>
                        <HeroTitle>Backtest strategii</HeroTitle>
                        <HeroSummary>
                            Optimizeaza parametrii fara sa te pierzi in setari. Structura este gandita sa functioneze bine si pe desktop, si pe tableta,
                            iar pe mobil ordinea sectiunilor ramane aceeasi: setup, capital, exits, apoi rularea efectiva.
                        </HeroSummary>
                    </HeroText>
                </HeroTop>

                <HeroMetrics>
                    <HeroMetric>
                        <HeroMetricLabel>Tickers selectate</HeroMetricLabel>
                        <HeroMetricValue>{tickers.length}</HeroMetricValue>
                    </HeroMetric>
                    <HeroMetric>
                        <HeroMetricLabel>Fereastra test</HeroMetricLabel>
                        <HeroMetricValue>{startDate} → {endDate}</HeroMetricValue>
                    </HeroMetric>
                    <HeroMetric>
                        <HeroMetricLabel>Capital initial</HeroMetricLabel>
                        <HeroMetricValue>${capital.toLocaleString('en-US')}</HeroMetricValue>
                    </HeroMetric>
                </HeroMetrics>
            </Hero>

            <WorkflowGrid>
                <WorkflowCard>
                    <WorkflowStep>1. Configure</WorkflowStep>
                    <WorkflowTitle>Alege structura si capitalul</WorkflowTitle>
                    <WorkflowText>
                        Setezi ticker-ele, DTE, tipul de iron condor si limitele de capital inainte sa rafinezi regulile.
                    </WorkflowText>
                </WorkflowCard>
                <WorkflowCard>
                    <WorkflowStep>2. Simulate</WorkflowStep>
                    <WorkflowTitle>Ruleaza unul sau mai multe scenarii</WorkflowTitle>
                    <WorkflowText>
                        Foloseste profit target simplu sau batch mode ca sa vezi repede unde se schimba rezultatul semnificativ.
                    </WorkflowText>
                </WorkflowCard>
                <WorkflowCard>
                    <WorkflowStep>3. Review</WorkflowStep>
                    <WorkflowTitle>Salveaza doar ce merita retinut</WorkflowTitle>
                    <WorkflowText>
                        Cand un setup e promitator, salvezi testul si il reincarci mai tarziu fara sa pierzi contextul initial.
                    </WorkflowText>
                </WorkflowCard>
            </WorkflowGrid>

            {/* ─── Strategy Setup (always visible) ────────────────────── */}
            <StrategySetupSection
                tickers={tickers}
                icType={icType}
                minDTE={minDTE}
                maxDTE={maxDTE}
                ladderingMode={ladderingMode}
                onTickerToggle={toggleTicker}
                onIcTypeChange={setIcType}
                onMinDTEChange={setMinDTE}
                onMaxDTEChange={setMaxDTE}
                onLadderingModeChange={setLadderingMode}
            />

            {/* ─── Leg Selection (always visible) ─────────────────────── */}
            <Card>
                <CardHeader style={{ cursor: 'default' }}>
                    <CardHeaderTitle>Leg Selection</CardHeaderTitle>
                </CardHeader>
                <CardContent $open={true}>
                    <LegSelectionSection
                        targetDelta={targetDelta}
                        wingWidth={wingWidth}
                        icType={icType}
                        asymmetricDelta={asymmetricDelta}
                        putTargetDelta={putTargetDelta}
                        callTargetDelta={callTargetDelta}
                        onTargetDeltaChange={setTargetDelta}
                        onWingWidthChange={setWingWidth}
                        onAsymmetricDeltaChange={setAsymmetricDelta}
                        onPutTargetDeltaChange={setPutTargetDelta}
                        onCallTargetDeltaChange={setCallTargetDelta}
                    />
                </CardContent>
            </Card>

            {/* ─── Capital ────────────────────────────────────────────── */}
            <CollapsibleCard title="Capital" defaultOpen={true}>
                <CapitalSection
                    capital={capital}
                    maxPositionPct={maxPositionPct}
                    maxOpenPositions={maxOpenPositions}
                    contractsPerPosition={contractsPerPosition}
                    onCapitalChange={setCapital}
                    onMaxPositionPctChange={setMaxPositionPct}
                    onMaxOpenPositionsChange={setMaxOpenPositions}
                    onContractsPerPositionChange={setContractsPerPosition}
                />
            </CollapsibleCard>

            {/* ─── Position Entry ─────────────────────────────────────── */}
            <CollapsibleCard title="Position Entry" optional>
                <PositionEntrySection
                    slippage={slippage}
                    commissionPerContract={commissionPerContract}
                    riskFreeRate={riskFreeRate}
                    onSlippageChange={setSlippage}
                    onCommissionPerContractChange={setCommissionPerContract}
                    onRiskFreeRateChange={setRiskFreeRate}
                />
            </CollapsibleCard>

            {/* ─── Exit Options ────────────────────────────────────────── */}
            <CollapsibleCard title="Exit Options" defaultOpen={true}>
                <ExitOptionsSection
                    profitTarget={profitTarget}
                    stopLoss={stopLoss}
                    closeDTE={closeDTE}
                    profitTargetEnabled={profitTargetEnabled}
                    stopLossEnabled={stopLossEnabled}
                    closeDTEEnabled={closeDTEEnabled}
                    batchMode={batchMode}
                    batchTargets={batchTargets}
                    onProfitTargetChange={setProfitTarget}
                    onStopLossChange={setStopLoss}
                    onCloseDTEChange={setCloseDTE}
                    onProfitTargetEnabledChange={setProfitTargetEnabled}
                    onStopLossEnabledChange={setStopLossEnabled}
                    onCloseDTEEnabledChange={setCloseDTEEnabled}
                    onBatchModeChange={setBatchMode}
                    onBatchTargetsChange={setBatchTargets}
                />
            </CollapsibleCard>

            {/* ─── Backtest Options ────────────────────────────────────── */}
            <CollapsibleCard title="Backtest Options" optional defaultOpen={true}>
                <BacktestOptionsSection
                    startDate={startDate}
                    endDate={endDate}
                    testPeriod={testPeriod}
                    description={description}
                    excludedDates={excludedDates}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    onTestPeriodChange={setTestPeriod}
                    onDescriptionChange={setDescription}
                    onExcludedDatesChange={setExcludedDates}
                />
            </CollapsibleCard>

            {/* ─── Run / Cancel ────────────────────────────────────────── */}
            <ButtonRow>
                <RunButton onClick={handleRun} disabled={bt.isRunning || tickers.length === 0}>
                    {bt.isRunning ? <><IonSpinner name="dots" /> Running...</> : (
                        batchMode ? `Run ${batchTargets.length} Scenarios` : 'Run Backtest'
                    )}
                </RunButton>
                {bt.isRunning && (
                    <CancelButton onClick={() => bt.cancelBacktest()}>Cancel</CancelButton>
                )}
            </ButtonRow>

            {/* ─── Progress ────────────────────────────────────────────── */}
            {bt.isRunning && (
                <ProgressContainer>
                    <ProgressBar $pct={bt.progress} />
                    <ProgressText>{bt.progressMessage}</ProgressText>
                </ProgressContainer>
            )}

            {/* ─── Error ───────────────────────────────────────────────── */}
            {bt.error && <ErrorBox>{bt.error}</ErrorBox>}

            {/* ─── Batch Comparison ─────────────────────────────────────── */}
            {bt.batchResults && (
                <BatchComparisonComponent batchResults={bt.batchResults} />
            )}

            {/* ─── Results (single or first scenario) ──────────────────── */}
            {bt.results && (
                <BacktestResultsComponent
                    results={bt.results}
                    onSave={handleSave}
                    isSaving={bt.isSaving}
                />
            )}

            {!bt.results && !bt.batchResults && !bt.isRunning && !bt.error && (
                <PanelEmptyState>
                    <PanelEmptyTitle>Rezultatele apar aici dupa primul run</PanelEmptyTitle>
                    <PanelEmptyText>
                        Completarea formularului este doar primul pas. Dupa rulare vei vedea equity curve, breakdown pe ticker, istoric de trade-uri si comparatii intre scenarii.
                    </PanelEmptyText>
                    <PanelHintRow>
                        <PanelHint>{tickers.length} ticker selectat{tickers.length === 1 ? '' : 'e'}</PanelHint>
                        <PanelHint>{batchMode ? `${batchTargets.length} scenarii batch` : 'single scenario'}</PanelHint>
                        <PanelHint>{startDate} → {endDate}</PanelHint>
                    </PanelHintRow>
                </PanelEmptyState>
            )}

            {/* ─── Saved Tests ─────────────────────────────────────────── */}
            <SavedTestsPanelComponent onLoadTest={handleLoadTest} />
        </Container>
    );
});

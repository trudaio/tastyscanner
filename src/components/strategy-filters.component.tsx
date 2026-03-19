import React from "react";
import { IonRange } from "@ionic/react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { useServices } from "../hooks/use-services.hook";
import { IcType } from "../services/settings/settings.service.interface";

const FiltersContainerBox = styled.div`
    display: grid;
    width: 100%;
    gap: 14px;
    padding: 12px 0 22px;
    box-sizing: border-box;
`

const IntroPanel = styled.div`
    display: grid;
    gap: 6px;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background: linear-gradient(180deg, var(--app-subtle-surface), var(--app-panel-surface));
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`

const IntroTitle = styled.div`
    color: var(--app-text);
    font-size: 0.86rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
`

const IntroText = styled.div`
    color: var(--app-text-muted);
    font-size: 0.8rem;
    line-height: 1.55;
`

const FilterGroupCard = styled.section`
    display: grid;
    gap: 12px;
    width: 100%;
    margin: 0;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid var(--app-border);
    background: var(--app-panel-surface);
    box-shadow: var(--app-shadow);
    box-sizing: border-box;
`

const FilterGroupHeader = styled.div`
    display: grid;
    gap: 4px;
`

const FilterGroupTitle = styled.div`
    color: var(--app-text);
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: -0.01em;
`

const FilterGroupCaption = styled.div`
    color: var(--app-text-muted);
    font-size: 0.79rem;
    line-height: 1.5;
`

const ControlStack = styled.div`
    display: grid;
    gap: 10px;
`

const ControlCard = styled.div`
    display: grid;
    gap: 10px;
    width: 100%;
    padding: 12px;
    border-radius: 16px;
    background: var(--app-surface-1);
    border: 1px solid var(--app-border);
    box-sizing: border-box;
`

const ControlHeader = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
`

const ControlLabelStack = styled.div`
    display: grid;
    gap: 4px;
    min-width: 0;
`

const ControlLabel = styled.div`
    color: var(--app-text);
    font-size: 0.86rem;
    font-weight: 800;
    line-height: 1.35;
`

const ControlDescription = styled.div`
    color: var(--app-text-muted);
    font-size: 0.76rem;
    line-height: 1.45;
`

const ValueBadge = styled.div`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 78px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--app-border);
    background: var(--app-subtle-surface-2);
    color: var(--app-text);
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
`

const StyledRange = styled(IonRange)`
    --bar-background: var(--app-subtle-surface-3);
    --bar-background-active: linear-gradient(90deg, var(--ion-color-primary), var(--ion-color-secondary));
    --knob-background: var(--ion-color-primary);
    --knob-box-shadow: 0 0 0 6px rgba(103, 168, 255, 0.12);
    --pin-background: var(--app-panel-solid);
    --pin-color: var(--app-text);
    --padding-start: 0;
    --padding-end: 0;
    --bar-height: 4px;
    --knob-size: 18px;
    width: 100%;
    margin: 0;
`

const SegmentGrid = styled.div<{ $columns?: number }>`
    display: grid;
    grid-template-columns: repeat(${p => p.$columns ?? 3}, minmax(0, 1fr));
    gap: 8px;

    @media (max-width: 320px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`

const SegmentButton = styled.button<{ $active?: boolean }>`
    display: grid;
    gap: 4px;
    align-items: center;
    justify-items: start;
    width: 100%;
    min-height: 54px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid ${p => p.$active ? "rgba(103, 168, 255, 0.32)" : "var(--app-border)"};
    background: ${p => p.$active ? "linear-gradient(180deg, rgba(103, 168, 255, 0.16), rgba(125, 226, 209, 0.08))" : "var(--app-panel-surface)"};
    color: ${p => p.$active ? "var(--app-text)" : "var(--app-text-soft)"};
    box-shadow: ${p => p.$active ? "0 12px 24px rgba(103, 168, 255, 0.12)" : "none"};
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, color 120ms ease;

    &:hover {
        border-color: var(--app-border-strong);
        color: var(--app-text);
    }
`

const SegmentTitle = styled.span`
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.2;
`

const SegmentHint = styled.span`
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--app-text-muted);
`

const WingsGrid = styled(SegmentGrid)`
    grid-template-columns: repeat(4, minmax(0, 1fr));

    @media (max-width: 360px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`

const Divider = styled.div`
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(162, 184, 219, 0.18), transparent);
    margin: 2px 0;
`

type RangeValue = { lower: number; upper: number };

interface SliderControlProps {
    label: string;
    description?: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    onValueChanged: (value: number) => void;
    formatValue?: (value: number) => string;
}

const SliderControl: React.FC<SliderControlProps> = observer((props) => {
    const displayValue = props.formatValue ? props.formatValue(props.value) : `${props.value}`;

    return (
        <ControlCard>
            <ControlHeader>
                <ControlLabelStack>
                    <ControlLabel>{props.label}</ControlLabel>
                    {props.description ? <ControlDescription>{props.description}</ControlDescription> : null}
                </ControlLabelStack>
                <ValueBadge>{displayValue}</ValueBadge>
            </ControlHeader>
            <StyledRange
                pin={true}
                min={props.min}
                max={props.max}
                step={props.step}
                value={props.value}
                onIonChange={e => props.onValueChanged(e.detail.value as number)}
            />
        </ControlCard>
    );
});

interface DualSliderControlProps {
    label: string;
    description?: string;
    min: number;
    max: number;
    lower: number;
    upper: number;
    onValueChanged: (value: RangeValue) => void;
    formatValue?: (value: number) => string;
}

const DualSliderControl: React.FC<DualSliderControlProps> = observer((props) => {
    const format = (value: number) => props.formatValue ? props.formatValue(value) : `${value}`;
    const displayValue = `${format(props.lower)} - ${format(props.upper)}`;

    return (
        <ControlCard>
            <ControlHeader>
                <ControlLabelStack>
                    <ControlLabel>{props.label}</ControlLabel>
                    {props.description ? <ControlDescription>{props.description}</ControlDescription> : null}
                </ControlLabelStack>
                <ValueBadge>{displayValue}</ValueBadge>
            </ControlHeader>
            <StyledRange
                dualKnobs={true}
                pin={true}
                min={props.min}
                max={props.max}
                value={{ lower: props.lower, upper: props.upper }}
                onIonChange={e => props.onValueChanged(e.detail.value as RangeValue)}
            />
        </ControlCard>
    );
});

interface ChoiceOption<T extends string> {
    value: T;
    label: string;
    hint?: string;
}

interface ChoiceGridProps<T extends string> {
    label: string;
    description?: string;
    value: T;
    options: ChoiceOption<T>[];
    onChange: (value: T) => void;
    columns?: number;
}

function ChoiceGrid<T extends string>(props: ChoiceGridProps<T>) {
    return (
        <ControlCard>
            <ControlLabelStack>
                <ControlLabel>{props.label}</ControlLabel>
                {props.description ? <ControlDescription>{props.description}</ControlDescription> : null}
            </ControlLabelStack>
            <SegmentGrid $columns={props.columns}>
                {props.options.map(option => (
                    <SegmentButton
                        key={option.value}
                        type="button"
                        $active={props.value === option.value}
                        onClick={() => props.onChange(option.value)}
                    >
                        <SegmentTitle>{option.label}</SegmentTitle>
                        {option.hint ? <SegmentHint>{option.hint}</SegmentHint> : null}
                    </SegmentButton>
                ))}
            </SegmentGrid>
        </ControlCard>
    );
}

const WingChoiceGrid: React.FC = observer(() => {
    const services = useServices();
    const filters = services.settings.strategyFilters;

    const toggleWing = (value: number) => {
        const current = filters.wings.includes(value);
        if (current) {
            filters.wings = filters.wings.filter(wing => wing !== value);
            return;
        }

        filters.wings = [...filters.wings, value].sort((a, b) => a - b);
    };

    return (
        <ControlCard>
            <ControlLabelStack>
                <ControlLabel>Wings / spread size</ControlLabel>
                <ControlDescription>Selectezi dimensiunile pe care vrei sa le vezi rapid in scanner.</ControlDescription>
            </ControlLabelStack>
            <WingsGrid>
                {filters.availableWings.map(wing => (
                    <SegmentButton
                        key={wing}
                        type="button"
                        $active={filters.wings.includes(wing)}
                        onClick={() => toggleWing(wing)}
                    >
                        <SegmentTitle>{wing}$</SegmentTitle>
                        <SegmentHint>{filters.wings.includes(wing) ? "Activ" : "Inactiv"}</SegmentHint>
                    </SegmentButton>
                ))}
            </WingsGrid>
        </ControlCard>
    );
});

export const StrategyFiltersComponent: React.FC = observer(() => {
    const services = useServices();
    const filters = services.settings.strategyFilters;

    return (
        <FiltersContainerBox>
            <IntroPanel>
                <IntroTitle>Workflow filtre</IntroTitle>
                <IntroText>
                    Porneste cu delta, DTE si wings. Restul sunt filtre de rafinare, utile dupa ce vezi suficiente setup-uri valide.
                </IntroText>
            </IntroPanel>

            <FilterGroupCard>
                <FilterGroupHeader>
                    <FilterGroupTitle>Selectie de baza</FilterGroupTitle>
                    <FilterGroupCaption>Prima trecere prin rezultate. Aici restrangi universul fara sa tai prea agresiv.</FilterGroupCaption>
                </FilterGroupHeader>

                <ControlStack>
                    <SliderControl
                        label="Max risk / reward"
                        description="Raportul maxim acceptat intre risc si reward."
                        min={1}
                        max={10}
                        value={filters.maxRiskRewardRatio}
                        formatValue={value => `${value}/1`}
                        onValueChanged={value => filters.maxRiskRewardRatio = value}
                    />

                    <DualSliderControl
                        label="Delta range"
                        description="Intervalul de delta pentru short legs."
                        min={5}
                        max={49}
                        lower={filters.minDelta}
                        upper={filters.maxDelta}
                        onValueChanged={value => {
                            filters.minDelta = value.lower;
                            filters.maxDelta = value.upper;
                        }}
                    />

                    <DualSliderControl
                        label="DTE range"
                        description="Zile pana la expirare pentru seturile afisate."
                        min={0}
                        max={90}
                        lower={filters.minDaysToExpiration}
                        upper={filters.maxDaysToExpiration}
                        onValueChanged={value => {
                            filters.minDaysToExpiration = value.lower;
                            filters.maxDaysToExpiration = value.upper;
                        }}
                    />

                    <SliderControl
                        label="Max bid / ask spread"
                        description="Filtru de lichiditate pentru contractele afisate."
                        min={0}
                        max={10}
                        value={filters.maxBidAskSpread}
                        formatValue={value => `${value}%`}
                        onValueChanged={value => filters.maxBidAskSpread = value}
                    />

                    <SliderControl
                        label="Min credit"
                        description="Creditul minim cerut per structura."
                        min={1}
                        max={10}
                        step={0.5}
                        value={filters.minCredit}
                        formatValue={value => `${value.toFixed(2)}$`}
                        onValueChanged={value => filters.minCredit = value}
                    />
                </ControlStack>
            </FilterGroupCard>

            <FilterGroupCard>
                <FilterGroupHeader>
                    <FilterGroupTitle>Structura</FilterGroupTitle>
                    <FilterGroupCaption>Alegi forma spread-ului si bias-ul general al iron condor-ului.</FilterGroupCaption>
                </FilterGroupHeader>

                <ControlStack>
                    <WingChoiceGrid />

                    <Divider />

                    <ChoiceGrid<IcType>
                        label="IC Type"
                        description="Selectezi geometria generala a structurii."
                        value={filters.icType}
                        onChange={value => filters.icType = value}
                        options={[
                            { value: "symmetric", label: "Symmetric", hint: "Equal wings" },
                            { value: "bullish", label: "Bullish", hint: "Put Δ > Call Δ" },
                            { value: "bearish", label: "Bearish", hint: "Call Δ > Put Δ" },
                        ]}
                    />
                </ControlStack>
            </FilterGroupCard>

            <FilterGroupCard>
                <FilterGroupHeader>
                    <FilterGroupTitle>Rafinare si risc</FilterGroupTitle>
                    <FilterGroupCaption>Filtre secundare pentru POP, EV, alpha si earnings. Foloseste-le dupa selectia de baza.</FilterGroupCaption>
                </FilterGroupHeader>

                <ControlStack>
                    <ChoiceGrid<"all" | "before" | "after">
                        label="Earnings date"
                        description="Cum tratezi expirariile raportate la urmatorul earnings event."
                        value={filters.byEarningsDate}
                        onChange={value => filters.byEarningsDate = value}
                        options={[
                            { value: "all", label: "No filter", hint: "Pastreaza toate" },
                            { value: "before", label: "Before", hint: "Doar inainte de earnings" },
                            { value: "after", label: "After", hint: "Doar dupa earnings" },
                        ]}
                    />

                    <SliderControl
                        label="Min POP"
                        description="Probabilitatea minima de profit acceptata."
                        min={0}
                        max={90}
                        value={filters.minPop}
                        formatValue={value => value === 0 ? "Off" : `${value}%`}
                        onValueChanged={value => filters.minPop = value}
                    />

                    <SliderControl
                        label="Min Expected Value"
                        description="Expected value minim per contract."
                        min={-200}
                        max={200}
                        value={filters.minExpectedValue}
                        formatValue={value => value === 0 ? "Off" : `${value > 0 ? "+" : ""}$${value}`}
                        onValueChanged={value => filters.minExpectedValue = value}
                    />

                    <SliderControl
                        label="Min Alpha"
                        description="Alpha minim ca procent din risc."
                        min={-100}
                        max={100}
                        value={filters.minAlpha}
                        formatValue={value => value === 0 ? "Off" : `${value > 0 ? "+" : ""}${value}%`}
                        onValueChanged={value => filters.minAlpha = value}
                    />
                </ControlStack>
            </FilterGroupCard>
        </FiltersContainerBox>
    );
});

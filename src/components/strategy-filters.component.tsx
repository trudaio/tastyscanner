import React from "react";
import { observer } from "mobx-react";
import {useServices} from "../hooks/use-services.hook";
import {IonChip, IonRadio, IonRadioGroup, IonRange, IonToggle} from "@ionic/react";
import styled from "styled-components";

const FiltersContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 8px;
    padding: 16px;
`

const FilterLabelBox = styled.div`
    display: flex;
    align-items: center;
`

const FilterValueBox = styled(IonChip)`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-width: 70px;
    
`


const StandardIronCondorFilterBox = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
`

const RangeBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
`


const WingsEditorBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`

const RadioGroupBox = styled(IonRadioGroup)`
    
    & .radio-group-wrapper {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }
    
`

const ByEarningDateRadioGroupBox = styled(RadioGroupBox)`
    & .radio-group-wrapper {
        flex-direction: column;
        align-items: flex-start;
        justify-content: unset;
        gap: 8px;
    }
`

const SeparatorBox = styled.hr`
    background-color: var(--ion-color-light-shade);
    height: 1px;
    margin-left: -12px;
    margin-right: -12px;
    box-sizing: border-box;
`

const WingValueComponent: React.FC<{value: number}> = observer((props) => {
    const services = useServices();
    const isChecked = services.settings.strategyFilters.wings.includes(props.value);
    const onToggleHandle = (checked: boolean) => {
        const wings = [...services.settings.strategyFilters.wings];
        if(checked) {
            wings.push(props.value);
            services.settings.strategyFilters.wings = wings.sort((a, b) => a - b);
        } else {
            services.settings.strategyFilters.wings = wings.filter(w => w !== props.value);
        }
    }
    return (
        <IonToggle checked={isChecked} labelPlacement={"stacked"}
                   onIonChange={e => onToggleHandle(e.detail.checked)}>
            {`${props.value}$`}
        </IonToggle>
    )
})

interface SingleValueEditorComponentProps {
    label: string;
    min: number;
    max: number;
    value: number;
    onValueChanged: (value: number) => void;
    formatValue?: (value: number) => string;
}
const SingleValueEditorComponent: React.FC<SingleValueEditorComponentProps> = observer((props) => {
    return (
        <StandardIronCondorFilterBox>
            <FilterLabelBox>
                {props.label}
            </FilterLabelBox>
            <RangeBox>
                <IonRange pin={true} min={props.min} max={props.max} value={props.value} onIonChange={e => {
                    props.onValueChanged(e.detail.value as number)
                }}/>
                <FilterValueBox>
                    {props.formatValue ? props.formatValue(props.value) : props.value}
                </FilterValueBox>
            </RangeBox>

        </StandardIronCondorFilterBox>
    )
})

interface RangeEditorComponentProps {
    label: string;
    min: number;
    max: number;
    lower: number;
    upper: number;
    onValueChanged: (value: {lower: number; upper: number}) => void;
    formatValue?: (value: number) => string;
}

const RangeEditorComponent: React.FC<RangeEditorComponentProps> = observer((props) => {

    const formatValue = () => {
        if(props.formatValue) {
            return `${props.formatValue(props.lower)} - ${props.formatValue(props.upper)}`
        }

        return `${props.lower} - ${props.upper}`
    }

    return (
        <StandardIronCondorFilterBox>
            <FilterLabelBox>
                {props.label}
            </FilterLabelBox>
            <RangeBox>
                <IonRange dualKnobs={true}
                          min={props.min}
                          max={props.max}
                          value={{lower: props.lower, upper: props.upper}}
                          pin={true}
                          onIonChange={e => {
                              const range = e.detail.value as any;
                    props.onValueChanged({lower: range.lower, upper: range.upper})
                }}/>
                <FilterValueBox>
                    {formatValue()}
                </FilterValueBox>
            </RangeBox>

        </StandardIronCondorFilterBox>
    )
})

export const StrategyFiltersComponent: React.FC = observer(() => {
    const services = useServices();

    const filters = services.settings.strategyFilters;

    return (
        <FiltersContainerBox>
            <SingleValueEditorComponent label="Max risk/reward"
                                               min={1}
                                               max={10}
                                               value={filters.maxRiskRewardRatio}
                                               formatValue={value => `${value}/1`}
                                               onValueChanged={value => filters.maxRiskRewardRatio = value}/>

            <SeparatorBox/>

            <RangeEditorComponent label="Delta range"
                                   min={5}
                                   max={49}
                                   lower={filters.minDelta}
                                   upper={filters.maxDelta}
                                   onValueChanged={value => {
                                       filters.minDelta = value.lower;
                                       filters.maxDelta = value.upper;
                                   }}/>

            <SeparatorBox/>

            <RangeEditorComponent label="DTE range"
                                   min={0}
                                   max={90}
                                   lower={filters.minDaysToExpiration}
                                   upper={filters.maxDaysToExpiration}
                                   onValueChanged={value => {
                                       filters.minDaysToExpiration = value.lower;
                                       filters.maxDaysToExpiration = value.upper;
                                   }}/>

            <SeparatorBox/>
            <SingleValueEditorComponent label="Max bid/ask spread"
                                               min={0}
                                               max={10}
                                               value={filters.maxBidAskSpread}
                                               formatValue={value => `${value}%`}
                                               onValueChanged={value => filters.maxBidAskSpread = value}/>

            <SeparatorBox/>
            <FilterLabelBox>
                Wings/Spread size
            </FilterLabelBox>
            <WingsEditorBox>
                {filters.availableWings.map(w => <WingValueComponent key={w} value={w}/>)}
            </WingsEditorBox>

            <SeparatorBox/>

            <FilterLabelBox>
                Price to use
            </FilterLabelBox>


            <SeparatorBox/>

            <FilterLabelBox>
                Filter expirations by earnings date
            </FilterLabelBox>

            <ByEarningDateRadioGroupBox value={services.settings.strategyFilters.byEarningsDate}
                           onIonChange={e => services.settings.strategyFilters.byEarningsDate = e.detail.value}>
                <IonRadio value={"all"} labelPlacement="end">
                    No filter
                </IonRadio>

                <IonRadio value={"before"} labelPlacement="end">
                    Before earnings
                </IonRadio>

                <IonRadio value={"after"} labelPlacement="end">
                    After earnings
                </IonRadio>

            </ByEarningDateRadioGroupBox>

        </FiltersContainerBox>
    )
})
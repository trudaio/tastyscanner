import React from "react";
import {observer} from "mobx-react";
import {
    IOptionsExpirationVewModel,
    OptionExpirationTypeEnum
} from "../../models/options-expiration.view-model.interface";
import {ITickerViewModel} from "../../models/ticker.view-model.interface";
import {EarningsDatePositionEnum} from "./helper-functions";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {
    EarningsDateMarkerAfterExpirationComponent,
    EarningsDateMarkerBeforeExpirationComponent
} from "../earnings-date-marker.component";
import {OptionsStrategyComponent} from "./options-strategy.component";
import {IonAccordion, IonChip, IonItem, IonLabel} from "@ionic/react";
import styled, {css} from "styled-components";
import {useServices} from "../../hooks/use-services.hook";
import {computeCompositeScore, STRATEGY_PROFILES} from "../../models/strategy-profile";

function computeHeaderColor(expirationType: OptionExpirationTypeEnum) {
    switch (expirationType) {
        case OptionExpirationTypeEnum.Regular:
            return css`
                --background: var(--ion-color-light-shade);
                --color: var(--ion-color-light-contrast);
            `;
        case OptionExpirationTypeEnum.Quarterly:
        case OptionExpirationTypeEnum.EndOfMonth:
            return css`
                --background: var(--ion-color-medium-tint);
                --color: var(--ion-color-medium-contrast);
            `
        default:
            return css`
                --background: var(--ion-color-light);
                --color: var(--ion-color-light-contrast);
            `
    }
}

const ExpirationHeaderItemBox = styled(IonItem)<{ $expirationType: OptionExpirationTypeEnum}>`
    cursor: pointer;
    ${props =>computeHeaderColor(props.$expirationType)}
`
const ExpirationHeaderItemContentBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 20px;
    padding: 8px 16px;
     
`

const StrategiesCountBox = styled(IonChip)<{ $empty?: boolean }>`
    --background: ${props => props.$empty ? 'var(--ion-color-medium)' : 'var(--ion-color-tertiary)'};
    --color: ${props => props.$empty ? 'var(--ion-color-medium-contrast)' : 'var(--ion-color-tertiary-contrast)'};
    min-width: 50px;
    text-align: center;
    justify-content: center;

`

const EmptyExpirationHintBox = styled.span`
    color: var(--ion-color-medium);
    font-size: 0.8em;
    font-style: italic;
`

const NoStrategiesMessageBox = styled.div`
    padding: 16px;
    color: var(--ion-color-medium);
    font-size: 0.9em;
`

const PositionsCountBox = styled(IonChip)`
    --background: var(--ion-color-warning);
    --color: var(--ion-color-warning-contrast);
    min-width: 36px;
    text-align: center;
    justify-content: center;
    font-size: 0.85em;
`

const StrategiesBox = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
    padding: 12px;

    @media (max-width: 400px) {
        grid-template-columns: 1fr;
        gap: 8px;
        padding: 8px;
    }
`

interface OptionsExpirationStrategiesComponentProps {
    ticker: ITickerViewModel;
    expiration: IOptionsExpirationVewModel;
    strategies: IOptionsStrategyViewModel[];
    /** Specific reason why this expiration has zero strategies (which filter). */
    emptyReason?: string | null;
    earningsDatePosition: EarningsDatePositionEnum;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
}
export const OptionsExpirationStrategiesComponent: React.FC<OptionsExpirationStrategiesComponentProps> = observer((props) => {
    const services = useServices();

    const strategies = props.strategies;
    const isEmpty = strategies.length === 0;
    const isWaitingForData = isEmpty && !props.expiration.hasStreamingData;
    const bestPop = Math.max(...strategies.map(strategy => strategy.pop));
    const bestRiskReward = Math.min(...strategies.map(strategy => strategy.riskRewardRatio));
    const positionCount = services.positions.getPositionsForExpiration(props.expiration.expirationDate).length;

    // Compute Guvidul's pick: best composite score (neutral profile) without conflicts
    const guvidPickKey = (() => {
        let bestKey = '';
        let bestScore = -Infinity;
        for (const s of strategies) {
            if (s.positionConflict) continue;
            const score = computeCompositeScore(s, STRATEGY_PROFILES.neutral);
            if (score > bestScore) {
                bestScore = score;
                bestKey = s.key;
            }
        }
        return bestKey;
    })();


    let label = `${props.expiration.expirationDate} (${props.expiration.daysToExpiration} days) - ${props.expiration.expirationType}`;
    if(props.expiration.settlementType === 'AM') {
        label +=  ` [${props.expiration.settlementType}]`
    }

    return (
        <React.Fragment>
            <EarningsDateMarkerBeforeExpirationComponent ticker={props.ticker} position={props.earningsDatePosition}/>

            <IonAccordion value={props.expiration.key}>

                <ExpirationHeaderItemBox slot="header" $expirationType={props.expiration.expirationType}>
                    <ExpirationHeaderItemContentBox>
                        <StrategiesCountBox $empty={isEmpty}>
                            {isWaitingForData ? '…' : strategies.length}
                        </StrategiesCountBox>
                        {positionCount > 0 && (
                            <PositionsCountBox>
                                {positionCount}
                            </PositionsCountBox>
                        )}
                        <IonLabel>
                            {label}
                        </IonLabel>
                        {isEmpty && (
                            <EmptyExpirationHintBox>
                                {isWaitingForData ? 'loading quotes…' : (props.emptyReason ?? 'no match for current filters')}
                            </EmptyExpirationHintBox>
                        )}

                    </ExpirationHeaderItemContentBox>
                </ExpirationHeaderItemBox>

                {isEmpty ? (
                    <NoStrategiesMessageBox slot="content">
                        {isWaitingForData
                            ? 'Waiting for live quotes for this expiration…'
                            : (props.emptyReason ?? 'No combination passes the current filters (delta, wings, spread, credit). Try widening the filters.')}
                    </NoStrategiesMessageBox>
                ) : (
                    <StrategiesBox slot="content">
                        {strategies.map(condor => (<OptionsStrategyComponent key={condor.key}
                                                                             strategy={condor} bestPop={bestPop}
                                                                             bestRiskReward={bestRiskReward} onOpenTradeModal={props.onTrade}
                                                                             isGuvidPick={condor.key === guvidPickKey}/>))}
                    </StrategiesBox>
                )}

            </IonAccordion>


            <EarningsDateMarkerAfterExpirationComponent ticker={props.ticker} position={props.earningsDatePosition}/>

        </React.Fragment>

    );
})
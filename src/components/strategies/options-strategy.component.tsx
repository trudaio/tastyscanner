import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import React from "react";
import {observer} from "mobx-react";
import {IonCard, IonIcon} from "@ionic/react";
import {OptionsStrategyHeaderComponent} from "./options-strategy-header.component";
import {OptionsStrategyLegComponent} from "./options-strategy-leg.component";
import {OptionsStrategyFooterComponent} from "./options-strategy-footer.component";
import styled, {css} from "styled-components";
import {warningOutline} from "ionicons/icons";

type DeltaBias = 'bullish' | 'bearish' | 'neutral';

export const StrategyBox = styled.div<{$isBestPop: boolean; $isBestRiskReward: boolean; $hasConflict: boolean; $deltaBias: DeltaBias}>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 24px;

    @media (max-width: 480px) {
        padding: 12px;
    }

    /* Delta bias background - applied first as base */
    ${props => props.$deltaBias === 'bullish' && css`
        background-color: rgba(76, 175, 80, 0.15);
    `}
    ${props => props.$deltaBias === 'bearish' && css`
        background-color: rgba(244, 67, 54, 0.15);
    `}
    ${props => props.$deltaBias === 'neutral' && css`
        background-color: transparent;
    `}

    /* Best POP/Risk-Reward overrides */
    ${props => props.$isBestPop && css`
        background-color: var(--ion-color-warning-tint);
        color: var(--ion-color-warning-contrast);
    `}
    ${props => props.$isBestRiskReward && css`
        background-color: var(--ion-color-primary-tint);
        color: var(--ion-color-primary-contrast);
    `}

    ${props => props.$isBestRiskReward && props.$isBestPop && css`
        background: linear-gradient(to right, var(--ion-color-primary-tint), var(--ion-color-warning-tint));
        color: var(--ion-color-primary-contrast);
    `}

    ${props => props.$hasConflict && css`
        border: 5px solid var(--ion-color-danger);
        border-radius: 8px;
        box-shadow: 0 0 20px 5px rgba(255, 77, 109, 0.6),
                    0 0 40px 10px rgba(255, 77, 109, 0.3),
                    inset 0 0 15px rgba(255, 77, 109, 0.1);
    `}
`

const ConflictWarningBox = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background-color: var(--ion-color-danger-tint);
    color: var(--ion-color-danger-contrast);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 8px;
`

const ConflictIcon = styled(IonIcon)`
    font-size: 18px;
    color: var(--ion-color-danger);
`

export interface OptionsStrategyComponentProps {
    strategy: IOptionsStrategyViewModel;
    bestPop: number;
    bestRiskReward: number;
    onOpenTradeModal: (strategy: IOptionsStrategyViewModel) => void;
}
// Helper function to determine delta bias
// Delta threshold: values within ±0.03 are considered neutral
const getDeltaBias = (delta: number): DeltaBias => {
    const threshold = 0.03;
    if (delta > threshold) return 'bullish';
    if (delta < -threshold) return 'bearish';
    return 'neutral';
};

export const OptionsStrategyComponent: React.FC<OptionsStrategyComponentProps> = observer(props => {
    const isBestRiskReward = props.strategy.riskRewardRatio === props.bestRiskReward;
    const isBestPop = props.strategy.pop === props.bestPop;
    const conflict = props.strategy.positionConflict;
    const hasConflict = conflict !== null;
    const deltaBias = getDeltaBias(props.strategy.delta);

    return (
        <IonCard>
            <StrategyBox $isBestRiskReward={isBestRiskReward}
                         $isBestPop={isBestPop}
                         $hasConflict={hasConflict}
                         $deltaBias={deltaBias}>
                {hasConflict && (
                    <ConflictWarningBox>
                        <ConflictIcon icon={warningOutline} />
                        <span>{conflict.message}</span>
                    </ConflictWarningBox>
                )}
                <OptionsStrategyHeaderComponent/>
                {props.strategy.legs.map(leg => (<OptionsStrategyLegComponent key={leg.key} leg={leg}/>))}
                <OptionsStrategyFooterComponent strategy={props.strategy} onOpenTradeDialog={() => props.onOpenTradeModal(props.strategy)}/>
            </StrategyBox>
        </IonCard>
    )
})
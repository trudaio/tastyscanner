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

const StrategyCard = styled(IonCard)<{$isBestPop: boolean; $isBestRiskReward: boolean; $hasConflict: boolean; $deltaBias: DeltaBias}>`
    margin: 0;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
    box-shadow: 0 10px 28px rgba(9, 17, 31, 0.08);

    ${props => props.$deltaBias === 'bullish' && css`
        border-color: rgba(84, 214, 148, 0.24);
        background: linear-gradient(180deg, rgba(84, 214, 148, 0.08), var(--app-surface-1));
    `}
    ${props => props.$deltaBias === 'bearish' && css`
        border-color: rgba(255, 107, 126, 0.24);
        background: linear-gradient(180deg, rgba(255, 107, 126, 0.08), var(--app-surface-1));
    `}
    ${props => props.$isBestPop && css`
        box-shadow: 0 0 0 1px rgba(244, 162, 97, 0.25), 0 16px 30px rgba(244, 162, 97, 0.12);
    `}
    ${props => props.$isBestRiskReward && css`
        box-shadow: 0 0 0 1px rgba(103, 168, 255, 0.25), 0 16px 30px rgba(103, 168, 255, 0.12);
    `}
    ${props => props.$isBestRiskReward && props.$isBestPop && css`
        box-shadow:
            0 0 0 1px rgba(103, 168, 255, 0.22),
            0 0 0 3px rgba(244, 162, 97, 0.12),
            0 18px 34px rgba(73, 112, 186, 0.14);
    `}

    ${props => props.$hasConflict && css`
        border-color: rgba(255, 107, 126, 0.55);
    `}
`

const StrategyBox = styled.div<{$hasConflict: boolean}>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    color: var(--app-text);

    @media (max-width: 480px) {
        padding: 12px;
    }

    ${props => props.$hasConflict && css`
        box-shadow: inset 0 0 0 1px rgba(255, 107, 126, 0.2);
    `}
`

const BadgeRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`

const StrategyBadge = styled.span<{ $tone: 'primary' | 'warning' | 'danger' }>`
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;

    ${props => props.$tone === 'primary' && css`
        background: rgba(103, 168, 255, 0.14);
        color: var(--ion-color-primary);
        border: 1px solid rgba(103, 168, 255, 0.24);
    `}

    ${props => props.$tone === 'warning' && css`
        background: rgba(244, 162, 97, 0.14);
        color: var(--ion-color-tertiary);
        border: 1px solid rgba(244, 162, 97, 0.24);
    `}

    ${props => props.$tone === 'danger' && css`
        background: rgba(255, 107, 126, 0.14);
        color: var(--ion-color-danger);
        border: 1px solid rgba(255, 107, 126, 0.26);
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
        <StrategyCard $isBestRiskReward={isBestRiskReward}
                      $isBestPop={isBestPop}
                      $hasConflict={hasConflict}
                      $deltaBias={deltaBias}>
            <StrategyBox $hasConflict={hasConflict}>
                {(isBestRiskReward || isBestPop || hasConflict) ? (
                    <BadgeRow>
                        {isBestRiskReward ? <StrategyBadge $tone="primary">Best risk/reward</StrategyBadge> : null}
                        {isBestPop ? <StrategyBadge $tone="warning">Best POP</StrategyBadge> : null}
                        {hasConflict ? <StrategyBadge $tone="danger">Conflict</StrategyBadge> : null}
                    </BadgeRow>
                ) : null}
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
        </StrategyCard>
    )
})

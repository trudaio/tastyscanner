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
import {IonAccordion, IonItem} from "@ionic/react";
import styled, {css} from "styled-components";
import {useServices} from "../../hooks/use-services.hook";

function computeHeaderTone(expirationType: OptionExpirationTypeEnum) {
    switch (expirationType) {
        case OptionExpirationTypeEnum.Regular:
            return css`
                background: linear-gradient(135deg, rgba(103, 168, 255, 0.12), rgba(125, 226, 209, 0.08));
                border-color: rgba(103, 168, 255, 0.24);
            `;
        case OptionExpirationTypeEnum.Quarterly:
        case OptionExpirationTypeEnum.EndOfMonth:
            return css`
                background: linear-gradient(135deg, rgba(244, 162, 97, 0.14), rgba(246, 200, 95, 0.08));
                border-color: rgba(244, 162, 97, 0.24);
            `
        default:
            return css`
                background: var(--app-surface-1);
                border-color: var(--app-border);
            `
    }
}

const ExpirationHeaderItemBox = styled(IonItem)<{ $expirationType: OptionExpirationTypeEnum}>`
    cursor: pointer;
    --background: transparent;
    --color: var(--app-text);
    --inner-padding-end: 0;
    --padding-start: 0;
    --min-height: 0;
    margin: 0 12px;
    border-radius: 18px;
    border: 1px solid var(--app-border);
    ${props =>computeHeaderTone(props.$expirationType)}

    @media (max-width: 720px) {
        margin: 0 8px;
        border-radius: 16px;
    }
`
const ExpirationHeaderItemContentBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 14px 16px;

    @media (max-width: 720px) {
        padding: 12px 14px;
        align-items: flex-start;
        flex-direction: column;
    }
`

const HeaderLeft = styled.div`
    display: grid;
    gap: 8px;
    min-width: 0;
`

const HeaderTitle = styled.div`
    color: var(--app-text);
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`

const HeaderMeta = styled.div`
    color: var(--app-text-muted);
    font-size: 0.84rem;
    line-height: 1.5;
`

const HeaderMetricsRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`

const MetricBadge = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--app-subtle-surface-2);
    border: 1px solid var(--app-border);
    color: var(--app-text);
    font-size: 0.78rem;
    font-weight: 800;
`

const TypeBadge = styled.span<{ $expirationType: OptionExpirationTypeEnum }>`
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    ${props => computeHeaderTone(props.$expirationType)}
`

const StrategiesBox = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
    padding: 14px;
    margin: 0 12px 12px;
    background: var(--app-subtle-surface);
    border: 1px solid var(--app-border);
    border-top: none;
    border-bottom-left-radius: 18px;
    border-bottom-right-radius: 18px;

    @media (max-width: 400px) {
        grid-template-columns: 1fr;
        gap: 8px;
        padding: 10px;
        margin: 0 8px 10px;
    }
`

interface OptionsExpirationStrategiesComponentProps {
    ticker: ITickerViewModel;
    expiration: IOptionsExpirationVewModel;
    strategies: IOptionsStrategyViewModel[];
    earningsDatePosition: EarningsDatePositionEnum;
    onTrade: (strategy: IOptionsStrategyViewModel) => void;
}
export const OptionsExpirationStrategiesComponent: React.FC<OptionsExpirationStrategiesComponentProps> = observer((props) => {
    const services = useServices();

    const strategies = props.strategies;
    const bestPop = Math.max(...strategies.map(strategy => strategy.pop));
    const bestRiskReward = Math.min(...strategies.map(strategy => strategy.riskRewardRatio));
    const positionCount = services.positions.getPositionsForExpiration(props.expiration.expirationDate).length;


    const meta = [
        `${props.expiration.daysToExpiration} zile pana la expirare`,
        props.expiration.settlementType === 'AM' ? 'Settlement AM' : null,
    ].filter(Boolean).join(' • ');

    return (
        <React.Fragment>
            <EarningsDateMarkerBeforeExpirationComponent ticker={props.ticker} position={props.earningsDatePosition}/>

            <IonAccordion value={props.expiration.key}>

                <ExpirationHeaderItemBox slot="header" $expirationType={props.expiration.expirationType}>
                    <ExpirationHeaderItemContentBox>
                        <HeaderLeft>
                            <HeaderMetricsRow>
                                <MetricBadge>{strategies.length} setup</MetricBadge>
                                {positionCount > 0 ? (
                                    <MetricBadge>{positionCount} pozitii</MetricBadge>
                                ) : null}
                            </HeaderMetricsRow>
                            <HeaderTitle>{props.expiration.expirationDate}</HeaderTitle>
                            <HeaderMeta>{meta}</HeaderMeta>
                        </HeaderLeft>
                        <TypeBadge $expirationType={props.expiration.expirationType}>
                            {props.expiration.expirationType}
                        </TypeBadge>
                    </ExpirationHeaderItemContentBox>
                </ExpirationHeaderItemBox>

                <StrategiesBox slot="content">
                    {strategies.map(condor => (<OptionsStrategyComponent key={condor.key}
                                                                         strategy={condor} bestPop={bestPop}
                                                                         bestRiskReward={bestRiskReward} onOpenTradeModal={props.onTrade}/>))}
                </StrategiesBox>

            </IonAccordion>


            <EarningsDateMarkerAfterExpirationComponent ticker={props.ticker} position={props.earningsDatePosition}/>

        </React.Fragment>

    );
})

import React from "react";
import {IOptionsStrategySendOrderParams, IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {IonButton, IonIcon, IonModal} from "@ionic/react";
import {observer} from "mobx-react";
import styled from "styled-components";
import {InputBaseBox} from "../input-base.box";
import {chevronDown, chevronUp, closeOutline, lockClosedOutline, lockOpenOutline} from "ionicons/icons";
import {OrderType, TimeInForce} from "../../services/broker-account/broker-account.service.interface";
import {NullableString} from "../../utils/nullable-types";
import {Check} from "../../utils/type-checking";
import {IOptionsStrategyLegViewModel} from "../../models/options-strategy-leg.view-model.interface";
import {useServices} from "../../hooks/use-services.hook";

const ContentBox = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
`

const HeaderBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    padding: 16px;
    border-bottom: 1px solid var(--ion-color-light-shade);
`
const TitleBox = styled.div`
    flex-grow: 1;
`


const BodyBox = styled.div`
    display: flex;
    flex-direction: column;
    padding: 24px;
    padding-bottom: 8px;
    overflow-y: auto;
    justify-content: center;
    justify-items: center;
`


const SpacerBox = styled.div`
    grid-column: 1/-1;
    width: 100%;
    height: 8px;
`

const FieldsGridBox = styled.div`
    display: grid;
    grid-template-columns: 1.5fr repeat(5, 1fr);
    row-gap: 4px;
    padding: 0 16px;
`



const FooterBox = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    width: 100%;
    background-color: var(--ion-color-light);
    padding: 16px;
    
`

const CloseButtonBox = styled.div`
    cursor: pointer;
    font-size: 1.5rem;
`

const FieldLabelBox = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
`

const ReadonlyFieldValueBox = styled(FieldLabelBox)`
    
`

const MidPriceValueBox = styled(ReadonlyFieldValueBox)`
    text-align: center;
    padding: 8px;
    border: 1px solid var(--ion-color-light-shade);
    border-radius: 8px;
`

const BpeInfoBox = styled.div`
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 107, 53, 0.1);
    border: 1px solid rgba(255, 107, 53, 0.3);
    border-radius: 8px;
    padding: 8px 12px;
`

const BpeLabel = styled.span`
    font-size: 13px;
    color: #888;
`

const BpeValue = styled.span`
    font-size: 15px;
    font-weight: 700;
    color: #ff6b35;
`

const ValueEditorContainerBox = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    grid-column: 1/-1;
    width: 100%;
    
`

const ValueEditorInputContainerBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    width: 100%;
`

const ValueEditorInputInnerContainerBox = styled.div`
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    width: 100%;
`

const ValueInputBox = styled(InputBaseBox)`
    height: fit-content;
    text-align: center;
    flex-grow: 1;
    width: 100%;
`

const ChevronBox = styled.div`
    position: absolute;
    font-size: 1.3rem;
    cursor: pointer;
`

const ChevronLeftBox = styled(ChevronBox)`
    left: 4px;
`

const ChevronRightBox = styled(ChevronBox)`
    right: 4px;
`

const LockerBox = styled.div`
    position: absolute;
    right: 0;
    transform: translateX(calc(100% + 4px));
    cursor: pointer;
    font-size: 1.3rem;
`

const LegCellBox = styled.div`
    border-bottom: 1px solid var(--ion-color-light-shade);
    padding: 4px;
    width: 100%;
    text-align: center;
`

const LegExpirationCellBox = styled(LegCellBox)`
    text-align: left;
`

const LegPriceCellBox = styled(LegCellBox)`
    text-align: right;
`

const LegTypeCellBox = styled(LegCellBox)<{$isSell: boolean}>`
    width: 120px;
    color: ${props => props.$isSell ? "var(--ion-color-danger)" : "var(--ion-color-success)"};
`

const OrderTypeBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    grid-column: 1/3;
    width: 100%;
`

const TimeInForceBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    grid-column: 4/6;
    width: 100%;
`

const LegComponent: React.FC<{leg: IOptionsStrategyLegViewModel}> = observer((props) => {
    return (
        <>
            <LegExpirationCellBox>{props.leg.option.expirationDate}</LegExpirationCellBox>
            <LegCellBox>{`${props.leg.option.daysToExpiration}d`}</LegCellBox>
            <LegCellBox>{props.leg.option.strikePrice}</LegCellBox>
            <LegCellBox>{props.leg.option.optionType}</LegCellBox>
            <LegTypeCellBox $isSell={props.leg.isSell}>
                {props.leg.legType}
            </LegTypeCellBox>
            <LegPriceCellBox>{props.leg.isSell ? props.leg.option.midPrice : -1 * props.leg.option.midPrice}</LegPriceCellBox>
        </>
    )
})

const MidPriceBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    grid-column: 1/-1;
    width: 100%;
`

interface ValueEditorComponentProps {
    //strategy: IOptionsStrategyViewModel;
    label: string;
    onValueChanged: (price: NullableString) => void;
    value: NullableString;
    defaultValue: string;
    parseValue: (value: NullableString) => number;
    offset: number;
    onLockerClick?: (isLocked: boolean) => void;
}

const ValueEditorComponent: React.FC<ValueEditorComponentProps> = observer((props) => {
    const value = props.value ?? props.defaultValue;
    const isLocked = Boolean(props.value);

    const onValueChanged = (value: string) => {
        const p = props.parseValue(value);
        if(Check.isNumber(p)) {
            props.onValueChanged(value);
        } else {
            props.onValueChanged(null);
        }
    }


  const onLockerClick = () => {

      if (props.onLockerClick) {
          props.onLockerClick(isLocked);
      }

  }


    const renderLockerIcon = () => {
        if(!props.onLockerClick) {
            return null;
        }
        if(isLocked) {

            return (
                <IonIcon icon={lockClosedOutline}/>
            )


        } else {
            return (
                <IonIcon icon={lockOpenOutline}/>
            )
        }
    }

    const changeValue = (offsetSign: number) => {
        let v = props.parseValue(value);
        if(!Check.isNumber(v)) {
            return;
        }
        v = Math.round(v * 100) / 100;
        if(Check.isNumber(v)) {
            props.onValueChanged((Math.round((v + (offsetSign * props.offset))*100)/100).toString());
        }
    }

    const increment = () => {
        changeValue(1);

    }

    const decrement = () => {
        changeValue(-1);
    }


    return (
       <ValueEditorContainerBox>
           <FieldLabelBox>
               {props.label}
           </FieldLabelBox>
           <ValueEditorInputContainerBox>
               <ValueEditorInputInnerContainerBox>
                   <ChevronLeftBox onClick={decrement}>
                       <IonIcon icon={chevronDown}/>
                   </ChevronLeftBox>
                   <ValueInputBox value={value} onChange={e => onValueChanged(e.target.value)}/>
                   <ChevronRightBox onClick={increment}>
                       <IonIcon icon={chevronUp}/>
                   </ChevronRightBox>
               </ValueEditorInputInnerContainerBox>

               <LockerBox onClick={onLockerClick}>
                   {renderLockerIcon()}
               </LockerBox>


           </ValueEditorInputContainerBox>


       </ValueEditorContainerBox>
    )
})


const GuvidButton = styled.button<{ $saved?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(155, 89, 255, 0.15);
    border: 1.5px solid #9b59ff;
    border-radius: 6px;
    color: #9b59ff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: rgba(155, 89, 255, 0.3);
        box-shadow: 0 0 12px rgba(155, 89, 255, 0.3);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    img {
        width: 20px;
        height: 20px;
        border-radius: 50%;
    }
`

interface SendOrderDialogComponentProps {
    isOpen: boolean;
    strategy: IOptionsStrategyViewModel;
    symbol: string;
    onDitDismiss: () => void;
    onGuvidChallenge?: (strategy: IOptionsStrategyViewModel) => Promise<void>;
}

export const SendOrderDialogComponent: React.FC<SendOrderDialogComponentProps> = observer((props) => {
    const services = useServices();
    const [limitPrice, setLimitPrice] = React.useState<NullableString>(null);
    const [quantity, setQuantity] = React.useState<number>(1);
    const [orderType] = React.useState<OrderType>("Limit");
    const [timeInForce] = React.useState<TimeInForce>("Day");
    const [guvidSaving, setGuvidSaving] = React.useState(false);
    const [guvidSaved, setGuvidSaved] = React.useState(false);

    const handleAddToGuvid = async () => {
        if (!props.onGuvidChallenge || guvidSaving || guvidSaved) return;
        setGuvidSaving(true);
        try {
            await props.onGuvidChallenge(props.strategy);
            setGuvidSaved(true);
        } catch (e) {
            console.error('[AddToGuvid] Error:', e);
        } finally {
            setGuvidSaving(false);
        }
    };


    const onLockerClick = (isLocked: boolean) => {
        if(isLocked) {
            setLimitPrice(null);
        } else {
            setLimitPrice(props.strategy.credit.toString());
        }
    }

    const sendOrder = async () => {
        const orderParams: IOptionsStrategySendOrderParams = {
            quantity: quantity,
            orderType: orderType,
            timeInForce: timeInForce
        }

        const resolvedPrice = limitPrice ? parseFloat(limitPrice) : props.strategy.credit;
        if(limitPrice) {
            orderParams.price = resolvedPrice;
        }

        await props.strategy.sendOrder(orderParams);

        // Log the trade
        const firstLeg = props.strategy.legs[0];
        const dte = firstLeg?.option?.daysToExpiration ?? 0;
        const icType = services.settings.strategyFilters.icType;

        await services.tradeLog.logTrade({
            symbol: props.symbol,
            strategyName: props.strategy.strategyName,
            dte,
            credit: resolvedPrice,
            maxProfit: props.strategy.maxProfit,
            maxLoss: props.strategy.maxLoss,
            pop: props.strategy.pop,
            expectedValue: props.strategy.expectedValue,
            alpha: props.strategy.alpha,
            delta: props.strategy.delta,
            theta: props.strategy.theta,
            riskRewardRatio: props.strategy.riskRewardRatio,
            quantity,
            limitPrice: resolvedPrice,
            bpe: props.strategy.maxLoss * quantity,
            icType,
            legs: props.strategy.legs.map(leg => ({
                action: leg.legType,
                optionType: leg.option.optionType,
                strikePrice: leg.option.strikePrice,
                expirationDate: leg.option.expirationDate,
                midPrice: leg.option.midPrice,
                delta: leg.option.absoluteDeltaPercent,
                streamerSymbol: leg.option.streamerSymbol,
            })),
        });

        props.onDitDismiss();
    }

    const onQuantityChange = (value: NullableString) => {
        const q = parseInt(value ?? "1");
        if(Check.isNumber(q)) {
            setQuantity(Math.max(1, q));
        }

    }

    return (
        <IonModal isOpen={props.isOpen} onDidDismiss={props.onDitDismiss}>
            <ContentBox>
                <HeaderBox>
                    <TitleBox>
                        {props.strategy.strategyName}
                    </TitleBox>
                    <CloseButtonBox onClick={props.onDitDismiss}>
                        <IonIcon icon={closeOutline}/>
                    </CloseButtonBox>
                </HeaderBox>
                <BodyBox>
                    <FieldsGridBox>

                        {props.strategy.legs.map(leg => (<LegComponent key={leg.key} leg={leg}/>))}

                        <SpacerBox/>

                        <MidPriceBox>
                            <FieldLabelBox>
                                {`Mid price`}
                            </FieldLabelBox>
                            <MidPriceValueBox>
                                {props.strategy.credit}
                            </MidPriceValueBox>
                        </MidPriceBox>

                        <SpacerBox/>

                        {/* Buying Power Effect */}
                        <BpeInfoBox>
                            <BpeLabel>Buying Power Effect (1 contract)</BpeLabel>
                            <BpeValue>
                                ${((props.strategy.wingsWidth - (parseFloat(limitPrice ?? props.strategy.credit.toString()) || props.strategy.credit)) * 100 * quantity).toFixed(0)}
                            </BpeValue>
                        </BpeInfoBox>

                        <SpacerBox/>

                        <ValueEditorComponent  value={ limitPrice}
                                               defaultValue={props.strategy.credit.toString()}
                                               onValueChanged={setLimitPrice}
                                               parseValue={value => parseFloat(value ?? "")}
                                               label={"Limit Price"}
                                               offset={0.01}
                                               onLockerClick={onLockerClick}/>




                        <SpacerBox/>

                        <ValueEditorComponent  value={ quantity.toString()}
                                               defaultValue={"1"}
                                               onValueChanged={onQuantityChange}
                                               parseValue={value => parseInt(value ?? "1")}
                                               label={"Quantity"}
                                               offset={1}/>



                        <SpacerBox/>

                        <OrderTypeBox>
                            <FieldLabelBox>Order Type</FieldLabelBox>
                            <ReadonlyFieldValueBox>{orderType}</ReadonlyFieldValueBox>
                        </OrderTypeBox>

                        <TimeInForceBox>
                            <FieldLabelBox>Time in force</FieldLabelBox>
                            <ReadonlyFieldValueBox>{timeInForce}</ReadonlyFieldValueBox>
                        </TimeInForceBox>

                    </FieldsGridBox>

                </BodyBox>
                <FooterBox>
                    {props.onGuvidChallenge && (
                        <GuvidButton onClick={handleAddToGuvid} disabled={guvidSaving || guvidSaved}>
                            <img src="/logo-guvidul.svg" alt="Guvid" />
                            {guvidSaved ? 'Added' : 'Add to Guvid'}
                        </GuvidButton>
                    )}
                    <IonButton color={"success"} onClick={sendOrder}>
                        Send order
                    </IonButton>
                </FooterBox>
            </ContentBox>
        </IonModal>
    )
})
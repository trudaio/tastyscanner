import React, {useEffect} from "react";
import {observer} from "mobx-react-lite";
import {useServices} from "../../hooks/use-services.hook";
import styled from "styled-components";
import {IDeltaAlertLeg} from "../../services/delta-alert/delta-alert.interface";
import {IonSpinner} from "@ionic/react";

const ContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    max-width: 900px;
    margin: 0 auto;
`

const EmptyBox = styled.div`
    text-align: center;
    padding: 48px 16px;
    color: var(--ion-color-medium);
    font-size: 1.1rem;
`

const CardBox = styled.div<{$severity: 'warning' | 'danger'}>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid ${p => p.$severity === 'danger' ? 'rgba(255, 59, 48, 0.4)' : 'rgba(255, 204, 0, 0.4)'};
    background: ${p => p.$severity === 'danger' ? 'rgba(255, 59, 48, 0.08)' : 'rgba(255, 204, 0, 0.08)'};
`

const CardHeaderBox = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const SymbolBox = styled.span`
    font-weight: 700;
    font-size: 1.15rem;
`

const BadgeBox = styled.span<{$severity: 'warning' | 'danger'}>`
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: white;
    background: ${p => p.$severity === 'danger' ? '#ff3b30' : '#cc8800'};
`

const DetailsGridBox = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
`

const DetailBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`

const DetailLabelBox = styled.span`
    font-size: 0.75rem;
    color: var(--ion-color-medium);
    text-transform: uppercase;
`

const DetailValueBox = styled.span`
    font-size: 0.95rem;
    font-weight: 600;
`

const LoadingBox = styled.div`
    display: flex;
    justify-content: center;
    padding: 48px;
`

const InfoBox = styled.div`
    padding: 12px 16px;
    background: rgba(var(--ion-color-primary-rgb), 0.08);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--ion-color-medium);
    line-height: 1.5;
`

const AlertCard: React.FC<{alert: IDeltaAlertLeg}> = ({alert}) => {
    const severity = alert.deltaRatio >= 2 ? 'danger' : 'warning';
    const legLabel = alert.leg.optionType === 'P' ? 'Short PUT' : 'Short CALL';

    return (
        <CardBox $severity={severity}>
            <CardHeaderBox>
                <SymbolBox>{alert.trade.symbol}</SymbolBox>
                <BadgeBox $severity={severity}>{alert.deltaRatio}x</BadgeBox>
            </CardHeaderBox>
            <DetailsGridBox>
                <DetailBox>
                    <DetailLabelBox>Leg</DetailLabelBox>
                    <DetailValueBox>{legLabel}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Strike</DetailLabelBox>
                    <DetailValueBox>{alert.leg.strikePrice}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Expiration</DetailLabelBox>
                    <DetailValueBox>{alert.leg.expirationDate}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Initial Delta</DetailLabelBox>
                    <DetailValueBox>{alert.initialDelta}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Current Delta</DetailLabelBox>
                    <DetailValueBox style={{color: severity === 'danger' ? '#ff3b30' : '#cc8800'}}>
                        {alert.currentDelta}
                    </DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>IC Type</DetailLabelBox>
                    <DetailValueBox>{alert.trade.icType}</DetailValueBox>
                </DetailBox>
            </DetailsGridBox>
        </CardBox>
    );
};

export const DeltaAlertComponent: React.FC = observer(() => {
    const services = useServices();
    const deltaAlert = services.deltaAlert;

    useEffect(() => {
        deltaAlert.refresh();
        return () => deltaAlert.dispose();
    }, [deltaAlert]);

    if (deltaAlert.isLoading) {
        return (
            <LoadingBox>
                <IonSpinner name="crescent"/>
            </LoadingBox>
        );
    }

    return (
        <ContainerBox>
            <InfoBox>
                Shows open IC legs where the current delta has reached 1.5x or more
                of the initial delta at entry. Red = 2x+ (critical), Yellow = 1.5x+ (warning).
                Trades placed before this feature was added will show as "N/A" and are excluded.
            </InfoBox>

            {deltaAlert.alerts.length === 0 ? (
                <EmptyBox>
                    No delta alerts. All short legs are within safe range.
                </EmptyBox>
            ) : (
                deltaAlert.alerts.map((alert, i) => (
                    <AlertCard key={`${alert.trade.id}-${alert.leg.strikePrice}-${alert.leg.optionType}-${i}`} alert={alert}/>
                ))
            )}
        </ContainerBox>
    );
});

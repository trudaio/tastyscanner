import React, {useEffect} from "react";
import {observer} from "mobx-react-lite";
import {useServices} from "../../hooks/use-services.hook";
import styled from "styled-components";
import {IDeltaAlertLeg} from "../../services/delta-alert/delta-alert.interface";
import {IonRange, IonSpinner} from "@ionic/react";

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

const CardBox = styled.div<{$severity: 'warning' | 'danger' | 'unknown'}>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid ${p =>
        p.$severity === 'danger' ? 'rgba(255, 59, 48, 0.4)' :
        p.$severity === 'warning' ? 'rgba(255, 204, 0, 0.4)' :
        'rgba(150, 150, 150, 0.4)'};
    background: ${p =>
        p.$severity === 'danger' ? 'rgba(255, 59, 48, 0.08)' :
        p.$severity === 'warning' ? 'rgba(255, 204, 0, 0.08)' :
        'rgba(150, 150, 150, 0.08)'};
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

const BadgeBox = styled.span<{$severity: 'warning' | 'danger' | 'unknown'}>`
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: white;
    background: ${p =>
        p.$severity === 'danger' ? '#ff3b30' :
        p.$severity === 'warning' ? '#cc8800' :
        '#888'};
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

const ThresholdBox = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: rgba(var(--ion-color-primary-rgb), 0.05);
    border-radius: 8px;
`

const ThresholdLabel = styled.span`
    font-size: 0.85rem;
    color: var(--ion-color-medium);
    white-space: nowrap;
`

const ThresholdValue = styled.span`
    font-size: 1rem;
    font-weight: 700;
    min-width: 40px;
    text-align: center;
`

function getSeverity(alert: IDeltaAlertLeg): 'danger' | 'warning' | 'unknown' {
    if (alert.deltaRatio != null) {
        return alert.deltaRatio >= 2 ? 'danger' : 'warning';
    }
    // No initial delta — absolute threshold based
    return alert.currentDelta >= 50 ? 'danger' : 'unknown';
}

function getBadgeText(alert: IDeltaAlertLeg): string {
    if (alert.deltaRatio != null) {
        return `${alert.deltaRatio}x`;
    }
    return `\u0394${alert.currentDelta}`;
}

function formatStrikeWithPrice(alert: IDeltaAlertLeg): string {
    if (alert.underlyingPrice == null) return `${alert.strikePrice}`;
    return `${alert.strikePrice}`;
}

function formatStrikeDistance(alert: IDeltaAlertLeg): string {
    if (alert.strikeDistance == null) return '';
    const sign = alert.strikeDistance > 0 ? '+' : '';
    return `${sign}${alert.strikeDistance.toFixed(2)}%`;
}

function getDistanceColor(alert: IDeltaAlertLeg): string {
    if (alert.strikeDistance == null) return 'inherit';
    // For puts: negative = ITM (bad). For calls: positive = ITM (bad).
    if (alert.optionType === 'P') {
        return alert.strikeDistance >= 0 ? '#ff3b30' : 'var(--ion-color-medium)';
    }
    return alert.strikeDistance <= 0 ? '#ff3b30' : 'var(--ion-color-medium)';
}

const AlertCard: React.FC<{alert: IDeltaAlertLeg}> = ({alert}) => {
    const severity = getSeverity(alert);
    const legLabel = alert.optionType === 'P' ? 'Short PUT' : 'Short CALL';

    return (
        <CardBox $severity={severity}>
            <CardHeaderBox>
                <SymbolBox>
                    {alert.symbol}
                    {alert.underlyingPrice != null && (
                        <span style={{fontWeight: 400, fontSize: '0.85rem', color: 'var(--ion-color-medium)', marginLeft: 8}}>
                            ${alert.underlyingPrice.toFixed(2)}
                        </span>
                    )}
                </SymbolBox>
                <BadgeBox $severity={severity}>{getBadgeText(alert)}</BadgeBox>
            </CardHeaderBox>
            <DetailsGridBox>
                <DetailBox>
                    <DetailLabelBox>Leg</DetailLabelBox>
                    <DetailValueBox>{legLabel}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Strike</DetailLabelBox>
                    <DetailValueBox>
                        {formatStrikeWithPrice(alert)}
                        {alert.strikeDistance != null && (
                            <span style={{fontSize: '0.8rem', marginLeft: 6, color: getDistanceColor(alert)}}>
                                ({formatStrikeDistance(alert)})
                            </span>
                        )}
                    </DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>DTE</DetailLabelBox>
                    <DetailValueBox style={{color: alert.dte <= 7 ? '#ff3b30' : alert.dte <= 21 ? '#cc8800' : 'inherit'}}>
                        {alert.dte}d
                    </DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Initial Delta</DetailLabelBox>
                    <DetailValueBox>{alert.initialDelta ?? 'N/A'}</DetailValueBox>
                </DetailBox>
                <DetailBox>
                    <DetailLabelBox>Current Delta</DetailLabelBox>
                    <DetailValueBox style={{color: severity === 'danger' ? '#ff3b30' : severity === 'warning' ? '#cc8800' : 'inherit'}}>
                        {alert.currentDelta}
                    </DetailValueBox>
                </DetailBox>
                {alert.deltaRatio != null && (
                    <DetailBox>
                        <DetailLabelBox>Ratio</DetailLabelBox>
                        <DetailValueBox>{alert.deltaRatio}x</DetailValueBox>
                    </DetailBox>
                )}
            </DetailsGridBox>
        </CardBox>
    );
};

export const DeltaAlertComponent: React.FC = observer(() => {
    const services = useServices();
    const deltaAlert = services.deltaAlert;
    const threshold = services.settings.deltaAlertSettings.deltaThreshold;

    useEffect(() => {
        // Refresh for immediate data; background monitor owns the lifecycle
        deltaAlert.refresh();
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
            <ThresholdBox>
                <ThresholdLabel>Alert Threshold</ThresholdLabel>
                <IonRange
                    min={1.1}
                    max={3.0}
                    step={0.1}
                    value={threshold}
                    onIonChange={e => {
                        services.settings.deltaAlertSettings.deltaThreshold = e.detail.value as number;
                    }}
                    style={{flex: 1}}
                />
                <ThresholdValue>{threshold.toFixed(1)}x</ThresholdValue>
            </ThresholdBox>

            <InfoBox>
                Monitors ALL short option positions from your account.
                For trades logged through the app: alerts when current delta reaches {threshold.toFixed(1)}x+ of the initial delta.
                For other positions: alerts when current delta exceeds 40.
                Red = 2x+ or delta 50+ (critical). Checked every 4 hours while the app is open.
            </InfoBox>

            {deltaAlert.alerts.length === 0 ? (
                <EmptyBox>
                    No delta alerts. All short legs are within safe range.
                </EmptyBox>
            ) : (
                deltaAlert.alerts.map((alert, i) => (
                    <AlertCard key={`${alert.streamerSymbol}-${i}`} alert={alert}/>
                ))
            )}
        </ContainerBox>
    );
});

import React from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { IonIcon } from '@ionic/react';
import { trendingDownOutline } from 'ionicons/icons';

const BannerBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 24px;
    margin: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(244, 67, 54, 0.08), rgba(255, 152, 0, 0.08));
    border: 1px solid rgba(244, 67, 54, 0.25);
    text-align: center;
`

const BannerIcon = styled(IonIcon)`
    font-size: 40px;
    color: var(--ion-color-warning);
`

const BannerTitle = styled.div`
    font-size: 18px;
    font-weight: 700;
    color: var(--ion-color-danger);
`

const BannerSubtitle = styled.div`
    font-size: 13px;
    color: var(--ion-color-medium);
    max-width: 320px;
    line-height: 1.5;
`

const BannerHint = styled.div`
    font-size: 12px;
    color: var(--ion-color-medium-shade);
    font-style: italic;
`

interface NoEdgeBannerProps {
    symbol: string;
}

export const NoEdgeBannerComponent: React.FC<NoEdgeBannerProps> = observer(({ symbol }) => {
    return (
        <BannerBox>
            <BannerIcon icon={trendingDownOutline} />
            <BannerTitle>No Edge Right Now — {symbol}</BannerTitle>
            <BannerSubtitle>
                No iron condor setup meets your EV / Alpha / POP criteria for this underlying.
                Pricing isn't favorable — waiting is the right move.
            </BannerSubtitle>
            <BannerHint>
                Try relaxing the Min EV or Min Alpha filters, or check back when IV conditions change.
            </BannerHint>
        </BannerBox>
    );
});

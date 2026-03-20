import React from 'react';
import styled from 'styled-components';
import { BrokerType } from '../../services/broker-provider/broker-provider.interface';

const Badge = styled.span<{ $broker: BrokerType; $size?: 'xs' | 'sm' }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${p => p.$broker === BrokerType.TastyTrade ? '#ff6b35' : '#dc3545'};
    color: #fff;
    font-size: ${p => p.$size === 'xs' ? '0.52rem' : '0.58rem'};
    font-weight: 800;
    padding: ${p => p.$size === 'xs' ? '1px 4px' : '2px 5px'};
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1;
    vertical-align: middle;
`;

interface Props {
    brokerType: BrokerType;
    size?: 'xs' | 'sm';
}

export const BrokerBadgeInline: React.FC<Props> = ({ brokerType, size = 'sm' }) => (
    <Badge $broker={brokerType} $size={size}>
        {brokerType === BrokerType.TastyTrade ? 'TT' : 'IB'}
    </Badge>
);

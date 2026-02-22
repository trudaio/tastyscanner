import React, { useMemo } from 'react';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import { IPositionViewModel } from '../../services/positions/positions.service.interface';

const VisualizationContainer = styled.div`
    width: 100%;
    padding: 20px;
    background-color: #1a1a1a;
    border-radius: 8px;
    overflow-x: auto;
`;

const Title = styled.h3`
    color: #fff;
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 500;
`;

const ChartWrapper = styled.div`
    position: relative;
    min-height: 350px;
    padding-bottom: 40px;
`;

const StrikesContainer = styled.div`
    display: flex;
    align-items: flex-end;
    justify-content: center;
    position: relative;
    min-height: 280px;
    padding: 0 20px;
`;

const StrikeColumn = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    min-width: 36px;
`;

const PositionStackContainer = styled.div`
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 2px;
    position: relative;
    min-height: 200px;
    justify-content: flex-start;
    padding-bottom: 8px;
`;

const PositionBox = styled.div<{ $isShort: boolean; $isPut: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 22px;
    padding: 2px 4px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 3px;
    border: 2px solid ${props => props.$isShort ? '#ff4d6d' : '#888'};
    background-color: ${props => props.$isShort ? 'rgba(255, 77, 109, 0.3)' : '#2a2a2a'};
    color: ${props => props.$isShort ? '#fff' : '#ccc'};
    white-space: nowrap;
`;

const StrikeLine = styled.div<{ $isCurrentPrice?: boolean }>`
    width: 2px;
    height: ${props => props.$isCurrentPrice ? '100%' : '8px'};
    background-color: ${props => props.$isCurrentPrice ? '#ff6b35' : '#444'};
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
`;

const PriceAxis = styled.div`
    display: flex;
    justify-content: center;
    border-top: 2px solid #444;
    margin-top: 0;
    position: relative;
`;

const StrikeLabel = styled.div<{ $isCurrentPrice?: boolean }>`
    font-size: 10px;
    color: ${props => props.$isCurrentPrice ? '#ff6b35' : '#888'};
    font-weight: ${props => props.$isCurrentPrice ? '600' : '400'};
    padding-top: 8px;
    min-width: 36px;
    text-align: center;
`;

const CurrentPriceMarker = styled.div`
    position: absolute;
    width: 16px;
    height: 16px;
    background-color: #ff6b35;
    border: 2px solid #fff;
    border-radius: 50%;
    z-index: 20;
    transform: translateX(-50%);

    &::before {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid #ff6b35;
    }
`;

const ProbabilityCurve = styled.svg`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 280px;
    pointer-events: none;
    z-index: 1;
`;

const NoPositionsMessage = styled.div`
    text-align: center;
    color: #666;
    padding: 40px;
    font-size: 14px;
`;

const AlertsContainer = styled.div`
    margin-top: 16px;
    padding: 16px;
    background: rgba(255, 107, 53, 0.1);
    border: 1px solid rgba(255, 107, 53, 0.3);
    border-radius: 8px;
`;

const AlertTitle = styled.div`
    color: #ff6b35;
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const AlertItem = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: rgba(255, 77, 109, 0.1);
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 13px;
    color: #fff;

    &:last-child {
        margin-bottom: 0;
    }
`;

const AlertBadge = styled.span<{ $severity: 'high' | 'medium' | 'low' }>`
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: ${props => {
        switch (props.$severity) {
            case 'high': return '#ff4d6d';
            case 'medium': return '#ff6b35';
            default: return '#ffd93d';
        }
    }};
    color: ${props => props.$severity === 'low' ? '#000' : '#fff'};
`;

const AlertText = styled.span`
    flex: 1;
`;

const AlertDTE = styled.span`
    color: #aaa;
    font-size: 12px;
`;

interface PositionAtStrike {
    strike: number;
    positions: Array<{
        quantity: number;
        type: 'P' | 'C';
        isShort: boolean;
        expirationDate: string;
    }>;
}

interface RiskAlert {
    strike: number;
    type: 'put' | 'call';
    quantity: number;
    expirationDate: string;
    daysToExpiration: number;
    severity: 'high' | 'medium' | 'low';
    message: string;
}

export interface BreakEvenPoint {
    expirationDate: string;
    lowerBreakEven: number;
    upperBreakEven: number;
    shortPutStrike: number;
    shortCallStrike: number;
    creditPerShare: number;
}

interface PositionsVisualizationProps {
    positions: IPositionViewModel[];
    currentPrice: number;
    expirationDate?: string;
    breakEvenPoints?: BreakEvenPoint[];
}

export const PositionsVisualizationComponent: React.FC<PositionsVisualizationProps> = observer(({
    positions,
    currentPrice,
    expirationDate,
    breakEvenPoints = []
}) => {
    const DANGER_PERCENT = 4;

    const filteredPositions = useMemo(() => {
        if (expirationDate) {
            return positions.filter(p => p.expirationDate === expirationDate);
        }
        return positions;
    }, [positions, expirationDate]);

    // Group positions by strike with individual position entries for stacking
    const positionsByStrike = useMemo(() => {
        const strikeMap = new Map<number, PositionAtStrike>();

        for (const pos of filteredPositions) {
            if (!strikeMap.has(pos.strikePrice)) {
                strikeMap.set(pos.strikePrice, {
                    strike: pos.strikePrice,
                    positions: []
                });
            }

            const entry = strikeMap.get(pos.strikePrice)!;
            const isShort = pos.quantityDirection === 'Short';

            // Add each position individually for stacking
            entry.positions.push({
                quantity: pos.quantity,
                type: pos.optionType,
                isShort,
                expirationDate: pos.expirationDate
            });
        }

        return Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
    }, [filteredPositions]);

    // Calculate danger zone prices
    const dangerPriceDown = currentPrice * (1 - DANGER_PERCENT / 100);
    const dangerPriceUp = currentPrice * (1 + DANGER_PERCENT / 100);

    // Calculate risk alerts
    const riskAlerts = useMemo(() => {
        const alerts: RiskAlert[] = [];
        const now = new Date();

        const positionsByExp = new Map<string, IPositionViewModel[]>();
        for (const pos of positions) {
            if (!positionsByExp.has(pos.expirationDate)) {
                positionsByExp.set(pos.expirationDate, []);
            }
            positionsByExp.get(pos.expirationDate)!.push(pos);
        }

        for (const [expDate, expPositions] of positionsByExp) {
            const expDateObj = new Date(expDate);
            const dte = Math.ceil((expDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const shortPuts = expPositions.filter(p => p.optionType === 'P' && p.quantityDirection === 'Short');
            for (const put of shortPuts) {
                if (put.strikePrice >= dangerPriceDown) {
                    const severity = dte <= 7 ? 'high' : (dte <= 14 ? 'medium' : 'low');
                    alerts.push({
                        strike: put.strikePrice,
                        type: 'put',
                        quantity: put.quantity,
                        expirationDate: expDate,
                        daysToExpiration: dte,
                        severity,
                        message: `${put.quantity} short ${put.strikePrice}P expires in ${dte}d - at risk if ${((put.strikePrice / currentPrice - 1) * 100).toFixed(1)}% drop`
                    });
                }
            }

            const shortCalls = expPositions.filter(p => p.optionType === 'C' && p.quantityDirection === 'Short');
            for (const call of shortCalls) {
                if (call.strikePrice <= dangerPriceUp) {
                    const severity = dte <= 7 ? 'high' : (dte <= 14 ? 'medium' : 'low');
                    alerts.push({
                        strike: call.strikePrice,
                        type: 'call',
                        quantity: call.quantity,
                        expirationDate: expDate,
                        daysToExpiration: dte,
                        severity,
                        message: `${call.quantity} short ${call.strikePrice}C expires in ${dte}d - at risk if ${((call.strikePrice / currentPrice - 1) * 100).toFixed(1)}% rise`
                    });
                }
            }
        }

        return alerts.sort((a, b) => {
            const severityOrder = { high: 0, medium: 1, low: 2 };
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return a.daysToExpiration - b.daysToExpiration;
        });
    }, [positions, dangerPriceDown, dangerPriceUp, currentPrice]);

    // Calculate strike range for display
    const { strikeRange, minStrike, maxStrike } = useMemo(() => {
        if (positionsByStrike.length === 0) {
            const range: number[] = [];
            const start = Math.floor(currentPrice / 5) * 5 - 50;
            const end = Math.ceil(currentPrice / 5) * 5 + 50;
            for (let s = start; s <= end; s += 5) {
                range.push(s);
            }
            return { strikeRange: range, minStrike: start, maxStrike: end };
        }

        const strikes = positionsByStrike.map(p => p.strike);
        const allStrikes = [...new Set(strikes)].sort((a, b) => a - b);

        const min = Math.min(...allStrikes, currentPrice);
        const max = Math.max(...allStrikes, currentPrice);
        const padding = Math.max((max - min) * 0.15, 20);

        const rangeMin = Math.floor((min - padding) / 5) * 5;
        const rangeMax = Math.ceil((max + padding) / 5) * 5;
        const range: number[] = [];

        for (let s = rangeMin; s <= rangeMax; s += 5) {
            range.push(s);
        }

        return { strikeRange: range, minStrike: rangeMin, maxStrike: rangeMax };
    }, [positionsByStrike, currentPrice]);

    // Get the index of the strike closest to current price
    const currentPriceIndex = useMemo(() => {
        let closestIdx = 0;
        let closestDiff = Infinity;
        strikeRange.forEach((strike, idx) => {
            const diff = Math.abs(strike - currentPrice);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIdx = idx;
            }
        });
        return closestIdx;
    }, [strikeRange, currentPrice]);

    // Generate probability curve path
    const curvePath = useMemo(() => {
        if (strikeRange.length === 0) return '';

        const range = maxStrike - minStrike;
        const meanX = ((currentPrice - minStrike) / range) * 100;
        const stdDev = 12;

        const points: string[] = [];
        for (let x = 0; x <= 100; x += 1) {
            const z = (x - meanX) / stdDev;
            const y = Math.exp(-0.5 * z * z) * 60;
            points.push(`${x},${100 - y}`);
        }

        return `M ${points.join(' L ')}`;
    }, [strikeRange, currentPrice, minStrike, maxStrike]);

    const formatPositionLabel = (pos: { quantity: number; type: 'P' | 'C'; isShort: boolean }) => {
        const prefix = pos.isShort ? '-' : '';
        return `${prefix}${pos.quantity}${pos.type}`;
    };

    if (filteredPositions.length === 0) {
        return (
            <VisualizationContainer>
                <Title>Positions Visualization {expirationDate && `- ${expirationDate}`}</Title>
                <NoPositionsMessage>
                    No positions found {expirationDate ? `for expiration ${expirationDate}` : ''}
                </NoPositionsMessage>
            </VisualizationContainer>
        );
    }

    return (
        <VisualizationContainer>
            <Title>Positions Visualization {expirationDate && `- ${expirationDate}`}</Title>

            <ChartWrapper>
                <ProbabilityCurve viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                        d={curvePath}
                        fill="none"
                        stroke="#4a9eff"
                        strokeWidth="0.3"
                        opacity="0.5"
                    />
                </ProbabilityCurve>

                <StrikesContainer>
                    {strikeRange.map((strike, idx) => {
                        const posAtStrike = positionsByStrike.find(p => p.strike === strike);
                        const isCurrentPrice = idx === currentPriceIndex;

                        return (
                            <StrikeColumn key={strike}>
                                <PositionStackContainer>
                                    {posAtStrike && posAtStrike.positions.map((pos, posIdx) => (
                                        <PositionBox
                                            key={`${strike}-${posIdx}`}
                                            $isShort={pos.isShort}
                                            $isPut={pos.type === 'P'}
                                        >
                                            {formatPositionLabel(pos)}
                                        </PositionBox>
                                    ))}
                                </PositionStackContainer>
                                <StrikeLine $isCurrentPrice={isCurrentPrice} />
                                {isCurrentPrice && (
                                    <CurrentPriceMarker style={{ bottom: '25px' }} />
                                )}
                            </StrikeColumn>
                        );
                    })}
                </StrikesContainer>

                <PriceAxis>
                    {strikeRange.map((strike, idx) => (
                        <StrikeLabel
                            key={`label-${strike}`}
                            $isCurrentPrice={idx === currentPriceIndex}
                        >
                            {strike}
                        </StrikeLabel>
                    ))}
                </PriceAxis>
            </ChartWrapper>

            {/* Risk Alerts */}
            {riskAlerts.length > 0 && (
                <AlertsContainer>
                    <AlertTitle>
                        ⚠️ Position Risk Alerts ({riskAlerts.length})
                    </AlertTitle>
                    {riskAlerts.slice(0, 5).map((alert, index) => (
                        <AlertItem key={index}>
                            <AlertBadge $severity={alert.severity}>
                                {alert.severity.toUpperCase()}
                            </AlertBadge>
                            <AlertText>{alert.message}</AlertText>
                            <AlertDTE>{alert.expirationDate}</AlertDTE>
                        </AlertItem>
                    ))}
                    {riskAlerts.length > 5 && (
                        <AlertItem style={{ justifyContent: 'center', background: 'transparent' }}>
                            <span style={{ color: '#aaa' }}>...and {riskAlerts.length - 5} more alerts</span>
                        </AlertItem>
                    )}
                </AlertsContainer>
            )}
        </VisualizationContainer>
    );
});

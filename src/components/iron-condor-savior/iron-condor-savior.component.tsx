import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';

const Container = styled.div`
    padding: 20px;
    background-color: #0d0d1a;
    min-height: 100%;

    @media (max-width: 480px) {
        padding: 12px;
    }
`;

const Title = styled.h1`
    color: #fff;
    font-size: 24px;
    margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
    color: #888;
    font-size: 14px;
    margin: 0 0 24px 0;
`;

const SearchForm = styled.div`
    background: #1a1a2e;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 24px;
`;

const FormRow = styled.div`
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    @media (max-width: 480px) {
        flex: 1;
        min-width: calc(50% - 8px);
    }
`;

const Label = styled.label`
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 500;
`;

const Input = styled.input`
    padding: 12px 16px;
    background: #0d0d1a;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    font-size: 16px;
    width: 120px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: #ff6b35;
    }

    &::placeholder {
        color: #555;
    }

    @media (max-width: 480px) {
        width: 100%;
    }
`;

const SymbolInput = styled(Input)`
    width: 140px;
    text-transform: uppercase;

    @media (max-width: 480px) {
        width: 100%;
    }
`;

const CreditInput = styled(Input)`
    width: 100px;

    @media (max-width: 480px) {
        width: 100%;
    }
`;

const SearchButton = styled.button`
    padding: 12px 32px;
    background: #ff6b35;
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    height: 46px;

    &:hover {
        background: #ff8c5a;
    }

    &:disabled {
        background: #333;
        cursor: not-allowed;
    }

    @media (max-width: 480px) {
        width: 100%;
        height: 48px;
    }
`;

const CurrentPriceBox = styled.div`
    background: #2a2a4e;
    padding: 8px 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 46px;
`;

const PriceLabel = styled.span`
    color: #888;
    font-size: 12px;
`;

const PriceValue = styled.span`
    color: #4dff91;
    font-size: 18px;
    font-weight: 600;
`;

const ResultsContainer = styled.div`
    margin-top: 16px;
`;

const ResultsHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
`;

const ResultsTitle = styled.h2`
    color: #fff;
    font-size: 18px;
    margin: 0;
`;

const ResultsCount = styled.span`
    color: #888;
    font-size: 14px;
`;

const LoadingText = styled.div`
    color: #888;
    font-size: 14px;
    padding: 40px;
    text-align: center;
    background: #1a1a2e;
    border-radius: 8px;
`;

const NoDataText = styled.div`
    color: #666;
    font-size: 14px;
    padding: 40px;
    text-align: center;
    background: #1a1a2e;
    border-radius: 8px;
`;

const ResultsTableWrapper = styled.div`
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 8px;
`;

const ResultsTable = styled.table`
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
    background: #1a1a2e;
    border-radius: 8px;
    overflow: hidden;
`;

const Th = styled.th<{ $align?: string }>`
    padding: 12px 12px;
    text-align: ${props => props.$align || 'left'};
    color: #888;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    background: #0d0d1a;
    border-bottom: 1px solid #333;
`;

const Tr = styled.tr<{ $meetsTarget?: boolean }>`
    background: ${props => props.$meetsTarget ? 'rgba(77, 255, 145, 0.08)' : 'transparent'};

    &:hover {
        background: ${props => props.$meetsTarget ? 'rgba(77, 255, 145, 0.12)' : '#2a2a3e'};
    }
`;

const Td = styled.td<{ $align?: string; $positive?: boolean; $negative?: boolean; $highlight?: boolean }>`
    padding: 10px 12px;
    text-align: ${props => props.$align || 'left'};
    color: ${props => {
        if (props.$positive) return '#4dff91';
        if (props.$negative) return '#ff4d6d';
        if (props.$highlight) return '#ff6b35';
        return '#fff';
    }};
    font-size: 13px;
    border-bottom: 1px solid #222;
`;

const MeetsTargetBadge = styled.span`
    background: #4dff91;
    color: #000;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
`;

const StrikesCell = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const StrikeRow = styled.div`
    display: flex;
    gap: 4px;
    font-size: 12px;
`;

const StrikeLabel = styled.span`
    color: #666;
    width: 20px;
`;

const StrikeValue = styled.span`
    color: #fff;
`;

const TradeButton = styled.button`
    padding: 6px 12px;
    background: #ff6b35;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: #ff8c5a;
    }
`;

const TargetInfoBox = styled.div`
    background: linear-gradient(90deg, #ff6b35, #ff8c5a);
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;

    @media (max-width: 480px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 12px 16px;
    }
`;

const TargetInfoText = styled.div`
    color: #fff;
    font-size: 14px;
`;

const TargetValue = styled.span`
    font-weight: 700;
    font-size: 16px;
`;

export const IronCondorSaviorComponent: React.FC = observer(() => {
    const services = useServices();
    const savior = services.ironCondorSavior;

    const [symbol, setSymbol] = useState('SPY');
    const [minDTE, setMinDTE] = useState('30');
    const [maxDTE, setMaxDTE] = useState('45');
    const [targetCredit, setTargetCredit] = useState('2.00');

    const handleSearch = async () => {
        if (!symbol.trim()) return;

        await savior.search({
            symbol: symbol.trim().toUpperCase(),
            minDTE: parseInt(minDTE) || 30,
            maxDTE: parseInt(maxDTE) || 45,
            targetCredit: parseFloat(targetCredit) || 2.00
        });
    };

    const formatMoney = (value: number) => `$${value.toFixed(2)}`;

    const meetsTargetCount = savior.results.filter(r => r.meetsTarget).length;

    return (
        <Container>
            <Title>🛟 Iron Condor Savior</Title>
            <Subtitle>
                Find iron condors that generate enough credit to cover your loss
            </Subtitle>

            <SearchForm>
                <FormRow>
                    <FormGroup>
                        <Label>Symbol</Label>
                        <SymbolInput
                            type="text"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="SPY"
                        />
                    </FormGroup>

                    <FormGroup>
                        <Label>Min DTE</Label>
                        <Input
                            type="number"
                            value={minDTE}
                            onChange={(e) => setMinDTE(e.target.value)}
                            placeholder="30"
                        />
                    </FormGroup>

                    <FormGroup>
                        <Label>Max DTE</Label>
                        <Input
                            type="number"
                            value={maxDTE}
                            onChange={(e) => setMaxDTE(e.target.value)}
                            placeholder="45"
                        />
                    </FormGroup>

                    <FormGroup>
                        <Label>Target Credit ($)</Label>
                        <CreditInput
                            type="number"
                            step="0.05"
                            value={targetCredit}
                            onChange={(e) => setTargetCredit(e.target.value)}
                            placeholder="2.00"
                        />
                    </FormGroup>

                    <SearchButton
                        onClick={handleSearch}
                        disabled={savior.isLoading || !symbol.trim()}
                    >
                        {savior.isLoading ? 'Searching...' : '🔍 Find Iron Condors'}
                    </SearchButton>

                    {savior.currentPrice > 0 && (
                        <CurrentPriceBox>
                            <PriceLabel>Current:</PriceLabel>
                            <PriceValue>{formatMoney(savior.currentPrice)}</PriceValue>
                        </CurrentPriceBox>
                    )}
                </FormRow>
            </SearchForm>

            {savior.isLoading && (
                <LoadingText>
                    🔄 Searching for iron condors...
                </LoadingText>
            )}

            {!savior.isLoading && savior.searchParams && savior.results.length === 0 && (
                <NoDataText>
                    No iron condors found matching your criteria. Try adjusting the DTE range or target credit.
                </NoDataText>
            )}

            {!savior.isLoading && savior.results.length > 0 && (
                <ResultsContainer>
                    <TargetInfoBox>
                        <TargetInfoText>
                            Target Credit: <TargetValue>{formatMoney(parseFloat(targetCredit))}</TargetValue>
                        </TargetInfoText>
                        <TargetInfoText>
                            <TargetValue>{meetsTargetCount}</TargetValue> of {savior.results.length} meet target
                        </TargetInfoText>
                    </TargetInfoBox>

                    <ResultsHeader>
                        <ResultsTitle>📋 Iron Condor Options</ResultsTitle>
                        <ResultsCount>{savior.results.length} results</ResultsCount>
                    </ResultsHeader>

                    <ResultsTableWrapper>
                    <ResultsTable>
                        <thead>
                            <tr>
                                <Th>Expiration</Th>
                                <Th>DTE</Th>
                                <Th>Put Spread</Th>
                                <Th>Call Spread</Th>
                                <Th $align="right">Credit</Th>
                                <Th $align="right">vs Target</Th>
                                <Th $align="center">POP</Th>
                                <Th $align="right">Max Loss</Th>
                                <Th $align="right">R:R</Th>
                                <Th $align="right">Delta</Th>
                                <Th $align="center">Status</Th>
                                <Th $align="center">Action</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {savior.results.map((ic) => (
                                <Tr key={ic.key} $meetsTarget={ic.meetsTarget}>
                                    <Td>{ic.expirationDate}</Td>
                                    <Td>{ic.daysToExpiration}</Td>
                                    <Td>
                                        <StrikesCell>
                                            <StrikeRow>
                                                <StrikeLabel>B:</StrikeLabel>
                                                <StrikeValue>{ic.longPutStrike}p</StrikeValue>
                                            </StrikeRow>
                                            <StrikeRow>
                                                <StrikeLabel>S:</StrikeLabel>
                                                <StrikeValue>{ic.shortPutStrike}p</StrikeValue>
                                            </StrikeRow>
                                        </StrikesCell>
                                    </Td>
                                    <Td>
                                        <StrikesCell>
                                            <StrikeRow>
                                                <StrikeLabel>S:</StrikeLabel>
                                                <StrikeValue>{ic.shortCallStrike}c</StrikeValue>
                                            </StrikeRow>
                                            <StrikeRow>
                                                <StrikeLabel>B:</StrikeLabel>
                                                <StrikeValue>{ic.longCallStrike}c</StrikeValue>
                                            </StrikeRow>
                                        </StrikesCell>
                                    </Td>
                                    <Td $align="right" $highlight>
                                        {formatMoney(ic.totalCredit)}
                                    </Td>
                                    <Td $align="right" $positive={ic.creditAboveTarget >= 0} $negative={ic.creditAboveTarget < 0}>
                                        {ic.creditAboveTarget >= 0 ? '+' : ''}{formatMoney(ic.creditAboveTarget)}
                                    </Td>
                                    <Td $align="center" $positive={ic.pop >= 70}>
                                        {ic.pop.toFixed(0)}%
                                    </Td>
                                    <Td $align="right" $negative>
                                        {formatMoney(ic.maxLoss)}
                                    </Td>
                                    <Td $align="right">
                                        {ic.riskRewardRatio.toFixed(1)}
                                    </Td>
                                    <Td $align="right">
                                        {ic.delta.toFixed(2)}
                                    </Td>
                                    <Td $align="center">
                                        {ic.meetsTarget && <MeetsTargetBadge>✓ Meets Target</MeetsTargetBadge>}
                                    </Td>
                                    <Td $align="center">
                                        <TradeButton onClick={() => ic.sendOrder(1)}>
                                            Trade
                                        </TradeButton>
                                    </Td>
                                </Tr>
                            ))}
                        </tbody>
                    </ResultsTable>
                    </ResultsTableWrapper>
                </ResultsContainer>
            )}
        </Container>
    );
});

import styled from 'styled-components';

const Wrapper = styled.div`
    padding: 40px 16px;
    text-align: center;
    color: var(--ion-color-medium);
`;
const Icon = styled.div`
    font-size: 48px;
    margin-bottom: 12px;
`;
const Sub = styled.div`
    font-size: 12px;
    margin-top: 8px;
`;

export interface EmptyStateProps {
    maxDate: Date | null;
}

export function EmptyState({ maxDate }: EmptyStateProps) {
    const dateStr = maxDate ? maxDate.toISOString().split('T')[0] : 'unknown';
    return (
        <Wrapper>
            <Icon>📭</Icon>
            <div>No upcoming events matching filter.</div>
            <Sub>Calendar seeded through {dateStr}</Sub>
        </Wrapper>
    );
}

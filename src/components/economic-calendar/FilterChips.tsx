import styled from 'styled-components';
import type { FilterMode } from '../../services/economic-calendar/event-formatting';

const Row = styled.div`
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    flex-wrap: wrap;
`;
const Chip = styled.button<{ $selected: boolean }>`
    padding: 6px 14px;
    border-radius: 16px;
    border: 1px solid var(--ion-color-step-300);
    background: ${p => p.$selected ? 'var(--ion-color-primary)' : 'transparent'};
    color: ${p => p.$selected ? 'white' : 'var(--ion-text-color)'};
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
        background: ${p => p.$selected ? 'var(--ion-color-primary-shade)' : 'var(--ion-color-step-100)'};
    }
`;

export interface FilterChipsProps {
    mode: FilterMode;
    onChange: (mode: FilterMode) => void;
}

export function FilterChips({ mode, onChange }: FilterChipsProps) {
    return (
        <Row>
            <Chip $selected={mode === 'all'} onClick={() => onChange('all')}>All</Chip>
            <Chip $selected={mode === 'criticalMajor'} onClick={() => onChange('criticalMajor')}>
                Critical + Major
            </Chip>
            <Chip $selected={mode === 'criticalOnly'} onClick={() => onChange('criticalOnly')}>
                Critical only
            </Chip>
        </Row>
    );
}

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { formatCountdown } from '../../services/economic-calendar/event-formatting';

const Banner = styled.div<{ $severity: 'critical' | 'warning' }>`
    padding: 10px 16px;
    background: ${p => p.$severity === 'critical' ? '#e74c3c' : '#f39c12'};
    color: white;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;

    a { color: white; text-decoration: underline; }
`;

const DismissBtn = styled.button`
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
    padding: 0 4px;
    line-height: 1;
`;

export const EventBanner = observer(() => {
    const { economicCalendar } = useServices();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const pauseState = economicCalendar.activePauseState;
    const closeEvent = economicCalendar.nextCloseWindowEvent;

    if (!pauseState.paused && !closeEvent) return null;

    const severity: 'critical' | 'warning' = closeEvent ? 'critical' : 'warning';

    return (
        <Banner $severity={severity}>
            <span>
                {closeEvent ? (
                    <>
                        🔴 <strong>{closeEvent.name}</strong> in {formatCountdown(closeEvent.scheduledUtc as Date)}
                        {' — review profitable positions ≥40% '}
                        <Link to="/economic-calendar">details</Link>
                    </>
                ) : (
                    <>
                        🟡 Laddering blocked: <strong>{pauseState.reason}</strong>
                        {' '}
                        <Link to="/economic-calendar">view calendar</Link>
                    </>
                )}
            </span>
            <DismissBtn onClick={() => setDismissed(true)} aria-label="Dismiss">×</DismissBtn>
        </Banner>
    );
});

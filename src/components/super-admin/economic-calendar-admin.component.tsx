import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';

const Container = styled.div`
    padding: 20px;
    background: #0d0d1a;
    color: #fff;
`;

const Card = styled.div`
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
`;

const Title = styled.h2`
    margin: 0 0 6px 0;
    font-size: 18px;
    color: #fff;
`;

const Sub = styled.p`
    margin: 0 0 18px 0;
    font-size: 13px;
    color: #8888aa;
`;

const Row = styled.div`
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
`;

const Btn = styled.button`
    padding: 8px 18px;
    background: #4a9eff;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const StatusLine = styled.div`
    font-size: 12px;
    color: #8888aa;
    margin-top: 10px;
    font-family: monospace;
`;

const SuccessMsg = styled.div`
    color: #4dff91;
    margin-top: 8px;
    font-size: 13px;
`;

const ErrorMsg = styled.div`
    color: #ff4d6d;
    margin-top: 8px;
    font-size: 13px;
`;

export const EconomicCalendarAdminComponent = observer(() => {
    const { economicCalendar } = useServices();
    const [seeding, setSeeding] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const onSeed = async (year: number) => {
        if (!confirm(`Upsert ~90 events for ${year}. Safe to re-run. Continue?`)) return;
        setSeeding(true);
        setStatus(null);
        try {
            const result = await economicCalendar.seedYear(year);
            setStatus({ type: 'success', msg: `Seeded ${result.seeded} events for ${result.year}` });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setStatus({ type: 'error', msg: message });
        } finally {
            setSeeding(false);
        }
    };

    const maxDateStr = economicCalendar.maxScheduledDate
        ? economicCalendar.maxScheduledDate.toISOString().split('T')[0]
        : '—';

    return (
        <Container>
            <Card>
                <Title>Economic Calendar</Title>
                <Sub>
                    Events in DB: <strong>{economicCalendar.events.length}</strong>
                    {' · '}
                    Extends to: <strong>{maxDateStr}</strong>
                    {' · '}
                    Active alerts: <strong>{economicCalendar.systemAlerts.length}</strong>
                </Sub>

                <Row>
                    <Btn onClick={() => onSeed(2026)} disabled={seeding}>
                        {seeding ? 'Seeding...' : 'Seed 2026 events'}
                    </Btn>
                </Row>

                {status?.type === 'success' && <SuccessMsg>✓ {status.msg}</SuccessMsg>}
                {status?.type === 'error' && <ErrorMsg>✗ {status.msg}</ErrorMsg>}

                <StatusLine>
                    Feature flag: <strong>featureFlags/economicCalendar.enabled</strong> (edit via Firestore console for kill-switch)
                </StatusLine>
            </Card>
        </Container>
    );
});

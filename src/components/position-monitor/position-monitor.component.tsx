import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    IonBadge,
    IonButton,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSpinner,
    IonToggle,
} from '@ionic/react';
import {
    playOutline,
    stopOutline,
    trashOutline,
    checkmarkCircleOutline,
    alertCircleOutline,
    warningOutline,
    timeOutline,
    closeCircleOutline,
} from 'ionicons/icons';
import styled from 'styled-components';
import { useServices } from '../../hooks/use-services.hook';
import { AlertStatus, IMonitorRules } from '../../services/position-monitor/position-monitor.interface';

// ── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
    padding: 16px;
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const SectionCard = styled.div`
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 16px;
`;

const SectionTitle = styled.h3`
    font-size: 0.85rem;
    font-weight: 600;
    color: #8888aa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 12px 0;
`;

const ControlRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 12px;
    background: ${({ $active }) => ($active ? '#1a3a1a' : '#2a2a2a')};
    color: ${({ $active }) => ($active ? '#4caf50' : '#888')};
    border: 1px solid ${({ $active }) => ($active ? '#4caf50' : '#444')};
`;

const RulesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
`;

const RuleField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const RuleLabel = styled.label`
    font-size: 0.75rem;
    color: #8888aa;
`;

const RuleInput = styled.input`
    background: #0d0d1a;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    color: #e0e0ff;
    padding: 6px 10px;
    font-size: 0.9rem;
    width: 100%;
    outline: none;

    &:focus {
        border-color: #4a9eff;
    }
`;

const PositionsTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
`;

const Th = styled.th`
    color: #8888aa;
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid #2a2a4a;
    font-weight: 500;
    white-space: nowrap;
`;

const Td = styled.td`
    padding: 8px 8px;
    border-bottom: 1px solid #1a1a2e;
    color: #e0e0ff;
    vertical-align: middle;
`;

const ProfitText = styled.span<{ $profit: number }>`
    color: ${({ $profit }) => ($profit >= 0 ? '#4caf50' : '#f44336')};
    font-weight: 600;
`;

const EmptyText = styled.div`
    color: #555;
    text-align: center;
    padding: 32px;
    font-size: 0.9rem;
`;

const ActivityList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
`;

const ActivityRow = styled.div`
    display: flex;
    gap: 8px;
    font-size: 0.8rem;
    padding: 6px 8px;
    background: #0d0d1a;
    border-radius: 4px;
    border-left: 3px solid #2a2a4a;
    align-items: flex-start;
`;

const ActivityTime = styled.span`
    color: #555;
    white-space: nowrap;
    font-size: 0.72rem;
    padding-top: 1px;
`;

const ActivityMsg = styled.span`
    color: #b0b0cc;
    flex: 1;
`;

// ── Alert status helpers ─────────────────────────────────────────────────────

function alertBadgeColor(status: AlertStatus): string {
    switch (status) {
        case 'profit_target': return 'success';
        case 'stop_loss': return 'danger';
        case 'dte_warning': return 'warning';
        case 'roll_needed': return 'danger';
        default: return 'medium';
    }
}

function alertLabel(status: AlertStatus): string {
    switch (status) {
        case 'profit_target': return 'CLOSE';
        case 'stop_loss': return 'EXIT';
        case 'dte_warning': return 'DTE ⚠';
        case 'roll_needed': return 'ROLL!';
        default: return '—';
    }
}

function alertIcon(status: AlertStatus): string {
    switch (status) {
        case 'profit_target': return checkmarkCircleOutline;
        case 'stop_loss': return closeCircleOutline;
        case 'dte_warning': return timeOutline;
        case 'roll_needed': return warningOutline;
        default: return alertCircleOutline;
    }
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Component ────────────────────────────────────────────────────────────────

export const PositionMonitorComponent: React.FC = observer(() => {
    const services = useServices();
    const monitor = services.positionMonitor;
    const [localRules, setLocalRules] = useState<IMonitorRules>(monitor.rules);

    const handleRuleChange = (key: keyof IMonitorRules, value: string) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setLocalRules(prev => ({ ...prev, [key]: num }));
    };

    const handleApplyRules = () => {
        monitor.updateRules(localRules);
    };

    const positions = monitor.monitoredPositions;
    const activityLog = monitor.activityLog;

    return (
        <Container>
            {/* ── Monitor Controls ── */}
            <SectionCard>
                <SectionTitle>Monitor Controls</SectionTitle>
                <ControlRow>
                    {monitor.isMonitoring ? (
                        <IonButton color="danger" size="small" onClick={() => monitor.stopMonitoring()}>
                            <IonIcon slot="start" icon={stopOutline} />
                            Stop
                        </IonButton>
                    ) : (
                        <IonButton color="success" size="small" onClick={() => monitor.startMonitoring()}>
                            <IonIcon slot="start" icon={playOutline} />
                            Start
                        </IonButton>
                    )}
                    <StatusBadge $active={monitor.isMonitoring}>
                        {monitor.isMonitoring ? 'MONITORING' : 'STOPPED'}
                    </StatusBadge>
                    {monitor.isLoading && <IonSpinner name="dots" style={{ width: 20, height: 20 }} />}
                    {monitor.activeAlertCount > 0 && (
                        <IonBadge color="warning">{monitor.activeAlertCount} alert{monitor.activeAlertCount > 1 ? 's' : ''}</IonBadge>
                    )}
                </ControlRow>
            </SectionCard>

            {/* ── Rules Configuration ── */}
            <SectionCard>
                <SectionTitle>Rules Configuration</SectionTitle>
                <RulesGrid>
                    <RuleField>
                        <RuleLabel>Profit Target (%)</RuleLabel>
                        <RuleInput
                            type="number"
                            min={0}
                            max={100}
                            value={localRules.profitTargetPct}
                            onChange={e => handleRuleChange('profitTargetPct', e.target.value)}
                        />
                    </RuleField>
                    <RuleField>
                        <RuleLabel>Stop Loss (% of credit)</RuleLabel>
                        <RuleInput
                            type="number"
                            min={0}
                            value={localRules.stopLossPct}
                            onChange={e => handleRuleChange('stopLossPct', e.target.value)}
                        />
                    </RuleField>
                    <RuleField>
                        <RuleLabel>DTE Warning (days)</RuleLabel>
                        <RuleInput
                            type="number"
                            min={0}
                            value={localRules.dteWarningDays}
                            onChange={e => handleRuleChange('dteWarningDays', e.target.value)}
                        />
                    </RuleField>
                    <RuleField>
                        <RuleLabel>Roll Urgently (days)</RuleLabel>
                        <RuleInput
                            type="number"
                            min={0}
                            value={localRules.rollDays}
                            onChange={e => handleRuleChange('rollDays', e.target.value)}
                        />
                    </RuleField>
                    <RuleField>
                        <RuleLabel>Poll Interval (seconds)</RuleLabel>
                        <RuleInput
                            type="number"
                            min={10}
                            value={localRules.pollIntervalSeconds}
                            onChange={e => handleRuleChange('pollIntervalSeconds', e.target.value)}
                        />
                    </RuleField>
                </RulesGrid>
                <div style={{ marginTop: 14 }}>
                    <IonButton size="small" onClick={handleApplyRules}>
                        Apply Rules
                    </IonButton>
                </div>
            </SectionCard>

            {/* ── Monitored Positions ── */}
            <SectionCard>
                <SectionTitle>Monitored Positions ({positions.length})</SectionTitle>
                {positions.length === 0 ? (
                    <EmptyText>
                        {monitor.isMonitoring
                            ? 'No open IC positions found.'
                            : 'Start monitoring to load positions.'}
                    </EmptyText>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <PositionsTable>
                            <thead>
                                <tr>
                                    <Th>Ticker</Th>
                                    <Th>Put Spread</Th>
                                    <Th>Call Spread</Th>
                                    <Th>Expiry</Th>
                                    <Th>DTE</Th>
                                    <Th>Credit</Th>
                                    <Th>Profit %</Th>
                                    <Th>Alert</Th>
                                    <Th></Th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map(pos => (
                                    <tr key={pos.id}>
                                        <Td><strong>{pos.ticker}</strong></Td>
                                        <Td>{pos.putBuyStrike}/{pos.putSellStrike}</Td>
                                        <Td>{pos.callSellStrike}/{pos.callBuyStrike}</Td>
                                        <Td>{pos.expirationDate}</Td>
                                        <Td>
                                            <span style={{ color: pos.dte <= 14 ? '#f44336' : pos.dte <= 21 ? '#ff9800' : '#e0e0ff' }}>
                                                {pos.dte}d
                                            </span>
                                        </Td>
                                        <Td>${pos.openCredit.toFixed(2)}</Td>
                                        <Td>
                                            <ProfitText $profit={pos.profitPct}>
                                                {pos.profitPct.toFixed(1)}%
                                            </ProfitText>
                                        </Td>
                                        <Td>
                                            {pos.alertStatus !== 'none' ? (
                                                <IonBadge color={alertBadgeColor(pos.alertStatus)}>
                                                    <IonIcon icon={alertIcon(pos.alertStatus)} style={{ marginRight: 4, fontSize: '0.7rem' }} />
                                                    {alertLabel(pos.alertStatus)}
                                                </IonBadge>
                                            ) : (
                                                <span style={{ color: '#444' }}>—</span>
                                            )}
                                        </Td>
                                        <Td>
                                            {pos.alertStatus !== 'none' && (
                                                <IonButton
                                                    fill="clear"
                                                    size="small"
                                                    color="medium"
                                                    onClick={() => monitor.dismissAlert(pos.id)}
                                                    title="Dismiss alert"
                                                >
                                                    Dismiss
                                                </IonButton>
                                            )}
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </PositionsTable>
                    </div>
                )}
            </SectionCard>

            {/* ── Activity Log ── */}
            <SectionCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <SectionTitle style={{ margin: 0 }}>Activity Log ({activityLog.length})</SectionTitle>
                    {activityLog.length > 0 && (
                        <IonButton fill="clear" size="small" color="medium" onClick={() => monitor.clearActivityLog()}>
                            <IonIcon slot="start" icon={trashOutline} />
                            Clear
                        </IonButton>
                    )}
                </div>
                {activityLog.length === 0 ? (
                    <EmptyText>No activity yet.</EmptyText>
                ) : (
                    <ActivityList>
                        {activityLog.map(entry => (
                            <ActivityRow key={entry.id}>
                                <ActivityTime>{formatTime(entry.timestamp)}</ActivityTime>
                                <ActivityMsg>{entry.message}</ActivityMsg>
                            </ActivityRow>
                        ))}
                    </ActivityList>
                )}
            </SectionCard>
        </Container>
    );
});

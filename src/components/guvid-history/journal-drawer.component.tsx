import React from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonButton, IonButtons, IonContent } from '@ionic/react';
import styled from 'styled-components';
import type { ITradeJournalEntry } from '../../services/trade-journal/trade-journal.service.interface';

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 24px;
    padding: 16px;
`;

const Row = styled.div`
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #1a1a2e;
    padding: 6px 0;
`;

const Label = styled.div`color: #8888aa; font-size: 0.85rem;`;
const Value = styled.div<{ $positive?: boolean; $negative?: boolean }>`
    font-weight: 600;
    color: ${p => p.$positive ? '#4dff91' : p.$negative ? '#ff4d6d' : '#e8e8ee'};
`;
const StatusChip = styled.span<{ $status: 'pending' | 'confirmed' | 'orphan' }>`
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
    background: ${p => p.$status === 'confirmed' ? '#1a5e3a' : p.$status === 'pending' ? '#4a3a1a' : '#5e1a1a'};
    color: ${p => p.$status === 'confirmed' ? '#4dff91' : p.$status === 'pending' ? '#ffcc4d' : '#ff8888'};
`;

interface Props {
    entry: ITradeJournalEntry | null;
    isOpen: boolean;
    onClose: () => void;
}

export const JournalDrawer: React.FC<Props> = ({ entry, isOpen, onClose }) => {
    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose}>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Trade Journal — Entry Snapshot</IonTitle>
                    <IonButtons slot="end"><IonButton onClick={onClose}>Close</IonButton></IonButtons>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                {!entry ? (
                    <div style={{ padding: 24, color: '#8888aa' }}>No journal entry available for this trade.</div>
                ) : (
                    <>
                        <div style={{ padding: 16 }}>
                            <StatusChip $status={entry.status}>{entry.status.toUpperCase()}</StatusChip>
                            <span style={{ marginLeft: 12, color: '#8888aa' }}>
                                {entry.ticker} · exp {entry.expirationDate}
                            </span>
                        </div>
                        <Grid>
                            <Row><Label>Delta (Δ)</Label><Value>{entry.entry.delta.toFixed(2)}</Value></Row>
                            <Row><Label>Theta (Θ)</Label><Value $positive={entry.entry.theta > 0}>{entry.entry.theta.toFixed(2)}</Value></Row>
                            <Row><Label>Gamma (Γ)</Label><Value>{entry.entry.gamma.toFixed(4)}</Value></Row>
                            <Row><Label>Vega (V)</Label><Value>{entry.entry.vega.toFixed(2)}</Value></Row>
                            <Row><Label>IV (short avg)</Label><Value>{(entry.entry.iv * 100).toFixed(1)}%</Value></Row>
                            <Row><Label>IV Rank</Label><Value>{entry.entry.ivRank.toFixed(1)}%</Value></Row>
                            <Row><Label>VIX</Label><Value>{entry.entry.vix == null ? '—' : entry.entry.vix.toFixed(2)}</Value></Row>
                            <Row><Label>Underlying</Label><Value>{entry.entry.underlyingPrice.toFixed(2)}</Value></Row>
                            <Row><Label>POP</Label><Value $positive={entry.entry.pop >= 70}>{entry.entry.pop.toFixed(1)}%</Value></Row>
                            <Row><Label>DTE</Label><Value>{entry.entry.dte}</Value></Row>
                        </Grid>
                    </>
                )}
            </IonContent>
        </IonModal>
    );
};

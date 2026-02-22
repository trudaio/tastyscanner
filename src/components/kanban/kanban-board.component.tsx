import React, {useState} from 'react';
import {observer} from 'mobx-react-lite';
import {makeAutoObservable, runInAction} from 'mobx';
import styled from 'styled-components';
import {IonBadge, IonButton, IonChip, IonIcon, IonTextarea} from '@ionic/react';
import {
    checkmarkCircleOutline,
    codeSlashOutline,
    constructOutline,
    eyeOutline,
    timeOutline
} from 'ionicons/icons';

// ─── Types ───────────────────────────────────────────────────────────────────

export type KanbanStatus = 'todo' | 'in-progress' | 'review' | 'done';
export type KanbanPriority = 'high' | 'medium' | 'low';

export interface KanbanCard {
    id: string;
    title: string;
    description: string;
    status: KanbanStatus;
    priority: KanbanPriority;
    tags: string[];
    feature: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tasty-kanban-board';

const DEFAULT_CARDS: KanbanCard[] = [
    {
        id: 'f2',
        feature: 2,
        title: 'Expected Value (EV) per contract',
        description: 'EV = (POP/100 × maxProfit) − ((1−POP/100) × maxLoss). Show green/red in footer. Block negative-EV trades via Min EV filter.',
        status: 'done',
        priority: 'high',
        tags: ['model', 'filter', 'footer'],
    },
    {
        id: 'f3',
        feature: 3,
        title: 'Alpha metric (EV % of risk)',
        description: 'Alpha = EV / maxLoss × 100. Sort condors by alpha descending. Add Min Alpha filter slider.',
        status: 'done',
        priority: 'high',
        tags: ['model', 'filter', 'sort'],
    },
    {
        id: 'f8',
        feature: 8,
        title: '"No Edge Right Now" signal',
        description: 'When no IC meets EV/Alpha/POP criteria, show NoEdgeBanner instead of empty list. Prevents bad trades in low-edge environments.',
        status: 'done',
        priority: 'high',
        tags: ['UX', 'banner', 'iron-condors'],
    },
    {
        id: 'f4',
        feature: 4,
        title: 'Asymmetric IC — bullish / bearish / symmetric',
        description: 'Add IC Type selector in filters. Bullish = wider put wing. Bearish = wider call wing. StrategiesBuilder adapts wings per type.',
        status: 'done',
        priority: 'medium',
        tags: ['builder', 'filter', 'asymmetric'],
    },
    {
        id: 'f-tradelog',
        feature: 0,
        title: 'Trade Automation Log',
        description: 'Log every placed trade with full metrics snapshot (EV, Alpha, POP, legs). Store in localStorage. Send rich embed to Discord #trade-log webhook.',
        status: 'done',
        priority: 'high',
        tags: ['service', 'discord', 'storage'],
    },
    {
        id: 'f-tradelog-page',
        feature: 0,
        title: 'Trade Log page / UI',
        description: 'Dedicated page to view all logged trades: open, closed, expired. Ability to mark as closed with exit price and P&L.',
        status: 'todo',
        priority: 'medium',
        tags: ['page', 'UI'],
    },
    {
        id: 'f1',
        feature: 1,
        title: 'Trade Ideas Scanner (multi-symbol)',
        description: 'Scan SPY, QQQ, IWM, TLT, GLD in one screen. Rank by alpha. Show only positive-EV setups. Refresh every minute.',
        status: 'todo',
        priority: 'high',
        tags: ['scanner', 'multi-symbol', 'ranking'],
    },
    {
        id: 'f5',
        feature: 5,
        title: 'Pre-set Exit Rules per trade',
        description: 'At trade entry, configure: profit target %, DTE exit threshold, max loss %. Store in trade log. Alert when conditions are met.',
        status: 'todo',
        priority: 'medium',
        tags: ['exit', 'alerts', 'trade-log'],
    },
    {
        id: 'f6',
        feature: 6,
        title: 'Trade Automation Log — analytics',
        description: 'Aggregate trade log: win rate, avg EV, avg hold time, P&L by symbol. Visual charts on dashboard.',
        status: 'todo',
        priority: 'low',
        tags: ['analytics', 'dashboard'],
    },
    {
        id: 'f7',
        feature: 7,
        title: 'Beta Exposure Check',
        description: 'Before recommending new IC, check portfolio beta-weighted delta. If too directional, suggest rebalancing spread instead of IC.',
        status: 'todo',
        priority: 'medium',
        tags: ['greeks', 'portfolio', 'risk'],
    },
    {
        id: 'f9',
        feature: 9,
        title: 'Payoff Diagram — interactive',
        description: 'Live P&L diagram updated as strikes change. Mark break-evens, max profit zone, max loss zone. All metrics recalculated instantly.',
        status: 'todo',
        priority: 'low',
        tags: ['UX', 'chart', 'builder'],
    },
    {
        id: 'f10',
        feature: 10,
        title: 'Discord Webhook Config UI',
        description: 'Settings screen to enter/save Discord webhook URL for #trade-log. Test button that sends a sample embed.',
        status: 'todo',
        priority: 'medium',
        tags: ['settings', 'discord'],
    },
];

class KanbanStore {
    cards: KanbanCard[];

    constructor() {
        const saved = this._load();
        this.cards = saved ?? DEFAULT_CARDS;
        makeAutoObservable(this);
    }

    moveCard(id: string, status: KanbanStatus) {
        runInAction(() => {
            const card = this.cards.find(c => c.id === id);
            if (card) {
                card.status = status;
                this._save();
            }
        });
    }

    resetToDefault() {
        runInAction(() => {
            this.cards = DEFAULT_CARDS.map(c => ({...c}));
            this._save();
        });
    }

    private _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cards));
        } catch {}
    }

    private _load(): KanbanCard[] | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }
}

const kanbanStore = new KanbanStore();

// ─── Styles ──────────────────────────────────────────────────────────────────

const BoardBox = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 16px;
    min-height: 100%;

    @media (max-width: 900px) {
        grid-template-columns: repeat(2, 1fr);
    }
    @media (max-width: 560px) {
        grid-template-columns: 1fr;
    }
`

const ColumnBox = styled.div<{ $color: string }>`
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--ion-color-light);
    border-radius: 12px;
    padding: 12px;
    border-top: 4px solid ${p => p.$color};
    min-height: 200px;
`

const ColumnHeaderBox = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 14px;
    margin-bottom: 4px;
`

const CardBox = styled.div<{ $priority: KanbanPriority }>`
    background: var(--ion-background-color);
    border-radius: 8px;
    padding: 12px;
    border-left: 4px solid ${p =>
        p.$priority === 'high' ? 'var(--ion-color-danger)' :
        p.$priority === 'medium' ? 'var(--ion-color-warning)' :
        'var(--ion-color-medium)'};
    cursor: pointer;
    transition: box-shadow 0.15s;
    &:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
`

const CardTitleBox = styled.div`
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
`

const CardDescBox = styled.div`
    font-size: 11px;
    color: var(--ion-color-medium);
    margin-bottom: 8px;
    line-height: 1.4;
`

const TagsBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
`

const TagChip = styled(IonChip)`
    --background: var(--ion-color-light-shade);
    font-size: 10px;
    height: 20px;
    margin: 0;
`

const MoveButtonsBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
`

const FeatureBadge = styled(IonBadge)`
    font-size: 10px;
    margin-left: auto;
`

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { status: KanbanStatus; label: string; color: string; icon: string }[] = [
    { status: 'todo', label: 'To Do', color: '#607d8b', icon: timeOutline },
    { status: 'in-progress', label: 'In Progress', color: '#ff9800', icon: constructOutline },
    { status: 'review', label: 'Review', color: '#9c27b0', icon: eyeOutline },
    { status: 'done', label: 'Done ✅', color: '#4caf50', icon: checkmarkCircleOutline },
];

const STATUS_LABELS: Record<KanbanStatus, string> = {
    'todo': 'To Do',
    'in-progress': 'In Progress',
    'review': 'Review',
    'done': 'Done',
};

// ─── Components ───────────────────────────────────────────────────────────────

const KanbanCardComponent: React.FC<{ card: KanbanCard }> = observer(({ card }) => {
    return (
        <CardBox $priority={card.priority}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <CardTitleBox>{card.title}</CardTitleBox>
                {card.feature > 0 && (
                    <FeatureBadge color="tertiary">#{card.feature}</FeatureBadge>
                )}
            </div>
            <CardDescBox>{card.description}</CardDescBox>
            <TagsBox>
                {card.tags.map(tag => (
                    <TagChip key={tag}>
                        <IonIcon icon={codeSlashOutline} style={{ fontSize: '10px', marginRight: '2px' }} />
                        {tag}
                    </TagChip>
                ))}
            </TagsBox>
            <MoveButtonsBox>
                {COLUMNS
                    .filter(col => col.status !== card.status)
                    .map(col => (
                        <IonButton
                            key={col.status}
                            size="small"
                            fill="outline"
                            color={col.status === 'done' ? 'success' : col.status === 'in-progress' ? 'warning' : col.status === 'review' ? 'tertiary' : 'medium'}
                            onClick={() => kanbanStore.moveCard(card.id, col.status)}
                        >
                            → {STATUS_LABELS[col.status]}
                        </IonButton>
                    ))
                }
            </MoveButtonsBox>
        </CardBox>
    );
});

export const KanbanBoardComponent: React.FC = observer(() => {
    return (
        <>
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <IonButton size="small" fill="clear" color="medium" onClick={() => kanbanStore.resetToDefault()}>
                    Reset board
                </IonButton>
            </div>
            <BoardBox>
                {COLUMNS.map(col => {
                    const cards = kanbanStore.cards.filter(c => c.status === col.status);
                    return (
                        <ColumnBox key={col.status} $color={col.color}>
                            <ColumnHeaderBox>
                                <IonIcon icon={col.icon} style={{ color: col.color }} />
                                {col.label}
                                <IonBadge color="medium" style={{ marginLeft: 'auto' }}>{cards.length}</IonBadge>
                            </ColumnHeaderBox>
                            {cards.map(card => (
                                <KanbanCardComponent key={card.id} card={card} />
                            ))}
                        </ColumnBox>
                    );
                })}
            </BoardBox>
        </>
    );
});

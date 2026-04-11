import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { StrategyProfileType } from '../../models/strategy-profile';

export interface ICompetitionRound {
    id?: string;
    round: number;
    date: string;
    userEmail: string;
    userTrade: ICompetitionTrade;
    guvidTrade: ICompetitionTrade;
    winner: 'Guvidul' | 'User' | 'Draw' | 'Pending';
    createdAt?: Timestamp;
    guvidProfile?: StrategyProfileType;
}

export interface ICompetitionTrade {
    ticker: string;
    strategy: string;
    expiration: string;
    legs: { type: string; optionType: string; strike: number }[];
    credit: number;
    pop: number;
    ev: number;
    alpha: number;
    rr: number;
    delta: number;
    theta: number;
    exitPl: number | null;
    status: 'open' | 'won' | 'lost' | 'draw';
    strategyProfile?: StrategyProfileType;
    exitProfitPercent?: number;
}

function getUserCompetitionRef() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return collection(db, 'users', user.uid, 'competition');
}

export async function saveCompetitionRound(round: Omit<ICompetitionRound, 'id' | 'createdAt'>): Promise<string> {
    const ref = getUserCompetitionRef();
    const docRef = await addDoc(ref, {
        ...round,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function getCompetitionRounds(): Promise<ICompetitionRound[]> {
    const ref = getUserCompetitionRef();
    const q = query(ref, orderBy('round', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ICompetitionRound));
}

export async function updateCompetitionRound(roundId: string, data: Partial<ICompetitionRound>): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const roundRef = doc(db, 'users', user.uid, 'competition', roundId);
    await updateDoc(roundRef, data);
}

export function buildTradeFromStrategy(
    strategy: { strategyName: string; credit: number; pop: number; expectedValue: number; alpha: number; riskRewardRatio: number; delta: number; theta: number; legs: { legType: string; option: { optionType: string; strikePrice: number; expirationDate: string } }[] },
    ticker: string,
    profile?: StrategyProfileType
): ICompetitionTrade {
    const expiration = strategy.legs[0]?.option.expirationDate || '';
    const legs = strategy.legs.map(l => ({
        type: l.legType,
        optionType: l.option.optionType,
        strike: l.option.strikePrice
    }));

    // Build strategy description
    const btoPut = legs.find(l => l.type === 'BTO' && l.optionType === 'P');
    const stoPut = legs.find(l => l.type === 'STO' && l.optionType === 'P');
    const stoCall = legs.find(l => l.type === 'STO' && l.optionType === 'C');
    const btoCall = legs.find(l => l.type === 'BTO' && l.optionType === 'C');

    const strategyStr = `IC ${btoPut?.strike}/${stoPut?.strike}p ${stoCall?.strike}/${btoCall?.strike}c`;

    return {
        ticker,
        strategy: strategyStr,
        expiration,
        legs,
        credit: Math.round(strategy.credit * 100),
        pop: strategy.pop,
        ev: Math.round(strategy.expectedValue * 100) / 100,
        alpha: Math.round(strategy.alpha * 100) / 100,
        rr: strategy.riskRewardRatio,
        delta: strategy.delta,
        theta: strategy.theta,
        exitPl: null,
        status: 'open',
        ...(profile ? { strategyProfile: profile } : {}),
    };
}

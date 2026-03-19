import React, { useEffect, useState, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { IonSpinner } from '@ionic/react';
import { auth } from '../../firebase';
import TastyTradeClient, { MarketDataSubscriptionType } from '@tastytrade/api';

/* ─── Constants ─────────────────────────────────────────── */

const SUPERADMIN_UID = '7OcSxAkz8eahmOJD2ddu4ElBPsf2';
const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL;

/* ─── Types ──────────────────────────────────────────────── */

interface IUserAccountData {
    uid: string;
    status: 'loading' | 'loaded' | 'error' | 'loading-greeks';
    error?: string;
    accountNumber?: string;
    netLiquidity?: number;
    optionBuyingPower?: number;
    delta?: number;
    theta?: number;
    vega?: number;
    gamma?: number;
}

/* ─── Styled Components ──────────────────────────────────── */

const Container = styled.div`
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: clamp(18px, 3vw, 28px);
    background: transparent;
    min-height: 100%;
    @media (max-width: 480px) { padding: 12px; }
`;

const Title = styled.h1`
    color: var(--app-text);
    font-size: 22px;
    margin: 0 0 6px 0;
`;

const Subtitle = styled.p`
    color: var(--app-text-muted);
    font-size: 13px;
    margin: 0 0 24px 0;
`;

const TopBar = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 24px;
`;

const RefreshBtn = styled.button`
    min-height: 42px;
    padding: 8px 18px;
    background: linear-gradient(135deg, #67a8ff, #7de2d1);
    border: 1px solid rgba(103, 168, 255, 0.2);
    border-radius: 14px;
    color: #08111f;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    &:hover { filter: brightness(0.99); transform: translateY(-1px); }
    &:disabled { background: var(--app-subtle-surface-2); color: var(--app-text-muted); border-color: var(--app-border); cursor: not-allowed; }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    background: var(--app-panel-surface);
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
`;

const Th = styled.th`
    text-align: left;
    padding: 12px 14px;
    background: var(--app-table-head-surface);
    color: var(--app-text-muted);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
`;

const Td = styled.td<{ $color?: string }>`
    padding: 10px 14px;
    color: ${p => p.$color || 'var(--app-text)'};
    border-bottom: 1px solid var(--app-border);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
`;

const StatusBadge = styled.span<{ $type: 'loading' | 'loaded' | 'error' | 'loading-greeks' }>`
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: ${p =>
        p.$type === 'loaded' ? 'rgba(84, 214, 148, 0.14)' :
        p.$type === 'loading' ? 'rgba(246, 200, 95, 0.14)' :
        p.$type === 'loading-greeks' ? 'rgba(103, 168, 255, 0.14)' :
        'rgba(255, 107, 126, 0.14)'};
    color: ${p =>
        p.$type === 'loaded' ? '#4dff91' :
        p.$type === 'loading' ? '#f6c85f' :
        p.$type === 'loading-greeks' ? '#67a8ff' :
        '#ff6b7e'};
    border: 1px solid ${p =>
        p.$type === 'loaded' ? 'rgba(84, 214, 148, 0.22)' :
        p.$type === 'loading' ? 'rgba(246, 200, 95, 0.22)' :
        p.$type === 'loading-greeks' ? 'rgba(103, 168, 255, 0.22)' :
        'rgba(255, 107, 126, 0.22)'};
`;

const ErrorBox = styled.div`
    background: rgba(255, 107, 126, 0.12);
    border: 1px solid rgba(255, 107, 126, 0.22);
    border-radius: 16px;
    padding: 16px;
    color: #ff6b7e;
    margin-bottom: 20px;
`;

const SummaryRow = styled.div`
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
`;

const SummaryCard = styled.div<{ $color?: string }>`
    position: relative;
    background: var(--app-panel-surface);
    border-radius: 18px;
    padding: 14px 18px;
    min-width: 140px;
    flex: 1;
    border: 1px solid var(--app-border);
    box-shadow: var(--app-shadow);
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: ${p => p.$color || '#4a9eff'};
    }
`;

const SummaryLabel = styled.div`
    color: var(--app-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
`;

const SummaryValue = styled.div<{ $color?: string }>`
    color: ${p => p.$color || 'var(--app-text)'};
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
`;

const LoadingContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    color: var(--app-text-muted);
`;

/* ─── Helpers ────────────────────────────────────────────── */

function formatCurrency(n: number | undefined): string {
    if (n === undefined || n === null) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatGreek(n: number | undefined, decimals = 2): string {
    if (n === undefined || n === null) return '—';
    return n.toFixed(decimals);
}

function plColor(n: number | undefined): string {
    if (n === undefined || n === null) return 'var(--app-text-muted)';
    return n > 0 ? '#4dff91' : n < 0 ? '#ff4d6d' : '#e0e0e0';
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
}

/* ─── Component ──────────────────────────────────────────── */

export const SuperAdminComponent: React.FC = () => {
    const [users, setUsers] = useState<IUserAccountData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const clientsRef = useRef<TastyTradeClient[]>([]);

    // Clean up TastyTrade clients on unmount
    useEffect(() => {
        return () => {
            for (const client of clientsRef.current) {
                try { client.quoteStreamer.disconnect(); } catch { /* noop */ }
            }
            clientsRef.current = [];
        };
    }, []);

    const isSuperadmin = auth.currentUser?.uid === SUPERADMIN_UID;

    const loadAllUsers = useCallback(async () => {
        if (!isSuperadmin) return;

        // Disconnect previous clients
        for (const client of clientsRef.current) {
            try { client.quoteStreamer.disconnect(); } catch { /* noop */ }
        }
        clientsRef.current = [];

        setIsLoading(true);
        setGlobalError(null);
        setUsers([]);

        try {
            // 1. Fetch all user UIDs from backend
            const headers = await getAuthHeaders();
            const uidsRes = await fetch(`${FUNCTIONS_BASE}/api/admin/users`, { headers });
            if (!uidsRes.ok) {
                const errData = await uidsRes.json().catch(() => ({ error: 'Unknown' }));
                throw new Error(errData.error || `HTTP ${uidsRes.status}`);
            }
            const { uids } = await uidsRes.json() as { uids: string[] };

            // Initialize all users as loading
            const initial: IUserAccountData[] = uids.map(uid => ({ uid, status: 'loading' as const }));
            setUsers(initial);
            setIsLoading(false);

            // 2. For each user, load data sequentially (to avoid overwhelming API)
            for (let i = 0; i < uids.length; i++) {
                const uid = uids[i];
                try {
                    // Fetch credentials via superadmin endpoint
                    const credsRes = await fetch(`${FUNCTIONS_BASE}/api/credentials?uid=${uid}`, { headers });
                    if (!credsRes.ok) {
                        setUsers(prev => prev.map(u =>
                            u.uid === uid ? { ...u, status: 'error', error: `Creds: HTTP ${credsRes.status}` } : u
                        ));
                        continue;
                    }
                    const { clientSecret, refreshToken } = await credsRes.json() as { clientSecret: string; refreshToken: string };

                    // Create TastyTrade client
                    const client = new TastyTradeClient({
                        ...TastyTradeClient.ProdConfig,
                        clientSecret,
                        refreshToken,
                        oauthScopes: ['read'],
                    });
                    clientsRef.current.push(client);

                    // Get accounts
                    const accounts: any[] = await client.accountsAndCustomersService.getCustomerAccounts();
                    if (!accounts.length) {
                        setUsers(prev => prev.map(u =>
                            u.uid === uid ? { ...u, status: 'error', error: 'No accounts found' } : u
                        ));
                        continue;
                    }
                    const accountNumber: string = accounts[0].account['account-number'];

                    // Get balances (REST — fast)
                    const balances: any = await client.balancesAndPositionsService.getAccountBalanceValues(accountNumber);
                    const netLiquidity = parseFloat(balances['net-liquidating-value'] || '0');
                    const optionBuyingPower = parseFloat(balances['derivative-buying-power'] || '0');

                    setUsers(prev => prev.map(u =>
                        u.uid === uid
                            ? { ...u, status: 'loading-greeks', accountNumber, netLiquidity, optionBuyingPower }
                            : u
                    ));

                    // Get positions + Greeks (WebSocket — slower)
                    loadGreeksForUser(client, uid, accountNumber);

                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    setUsers(prev => prev.map(u =>
                        u.uid === uid ? { ...u, status: 'error', error: msg } : u
                    ));
                }
            }

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setGlobalError(msg);
            setIsLoading(false);
        }
    }, [isSuperadmin]);

    const loadGreeksForUser = async (client: TastyTradeClient, uid: string, accountNumber: string) => {
        try {
            // Connect WebSocket
            await client.quoteStreamer.connect();

            // Get positions
            const positions: any[] = await client.balancesAndPositionsService.getPositionsList(accountNumber, {});
            const optionPositions = positions.filter((p: any) => (p['instrument-type'] || '').includes('Option'));

            if (optionPositions.length === 0) {
                setUsers(prev => prev.map(u =>
                    u.uid === uid
                        ? { ...u, status: 'loaded', delta: 0, theta: 0, vega: 0, gamma: 0 }
                        : u
                ));
                try { client.quoteStreamer.disconnect(); } catch { /* noop */ }
                return;
            }

            // Collect greeks via event listener (same pattern as TastyMarketDataProvider)
            const greeksMap: Record<string, any> = {};
            const streamerSymbols = optionPositions.map((p: any) => p['streamer-symbol'] || p['symbol']);

            const eventHandler = (records: any[]) => {
                for (const record of records) {
                    if (record.eventType === 'Greeks') {
                        greeksMap[record.eventSymbol] = record;
                    }
                }
            };
            client.quoteStreamer.addEventListener(eventHandler);

            // Subscribe to greeks
            client.quoteStreamer.subscribe(streamerSymbols, [MarketDataSubscriptionType.Greeks]);

            // Wait for greeks data to arrive (poll for up to 15 seconds)
            let attempts = 0;
            const maxAttempts = 30;
            const interval = 500;

            const computeAndFinalize = () => {
                let totalDelta = 0;
                let totalTheta = 0;
                let totalGamma = 0;
                let totalVega = 0;

                for (const pos of optionPositions) {
                    const sym = pos['streamer-symbol'] || pos['symbol'];
                    const greeksData = greeksMap[sym];
                    if (!greeksData) continue;

                    const direction = pos['quantity-direction'] === 'Short' ? -1 : 1;
                    const quantity = Math.abs(parseFloat(pos['quantity'] || '0'));
                    const multiplier = quantity * direction * 100;

                    totalDelta += (greeksData.delta || 0) * multiplier;
                    totalTheta += (greeksData.theta || 0) * multiplier;
                    totalGamma += (greeksData.gamma || 0) * multiplier;
                    totalVega  += (greeksData.vega  || 0) * multiplier;
                }

                setUsers(prev => prev.map(u =>
                    u.uid === uid
                        ? {
                            ...u,
                            status: 'loaded' as const,
                            delta: Math.round(totalDelta * 100) / 100,
                            theta: Math.round(totalTheta * 100) / 100,
                            gamma: Math.round(totalGamma * 10000) / 10000,
                            vega:  Math.round(totalVega  * 100) / 100,
                        }
                        : u
                ));
                try { client.quoteStreamer.removeEventListener(eventHandler); } catch { /* noop */ }
                try { client.quoteStreamer.disconnect(); } catch { /* noop */ }
            };

            const pollGreeks = () => {
                attempts++;
                const gotData = Object.keys(greeksMap).length;

                // If we got data for most positions or max attempts reached, finalize
                if (gotData >= streamerSymbols.length * 0.5 || attempts >= maxAttempts) {
                    computeAndFinalize();
                    return;
                }
                setTimeout(pollGreeks, interval);
            };

            setTimeout(pollGreeks, 1000); // initial delay for connection

        } catch (err) {
            console.error(`[SuperAdmin] Greeks error for ${uid}:`, err);
            // Still mark loaded — we have balances at least
            setUsers(prev => prev.map(u =>
                u.uid === uid && u.status === 'loading-greeks'
                    ? { ...u, status: 'loaded', delta: undefined, theta: undefined, vega: undefined, gamma: undefined }
                    : u
            ));
        }
    };

    // Auto-load on mount
    useEffect(() => {
        if (isSuperadmin) {
            loadAllUsers();
        }
    }, [isSuperadmin, loadAllUsers]);

    if (!isSuperadmin) {
        return (
            <Container>
                <ErrorBox>Access denied. This page is restricted to the superadmin.</ErrorBox>
            </Container>
        );
    }

    // Compute aggregates
    const loadedUsers = users.filter(u => u.netLiquidity !== undefined);
    const totalNetLiq = loadedUsers.reduce((sum, u) => sum + (u.netLiquidity || 0), 0);
    const totalTheta = loadedUsers.filter(u => u.theta !== undefined).reduce((sum, u) => sum + (u.theta || 0), 0);
    const totalDelta = loadedUsers.filter(u => u.delta !== undefined).reduce((sum, u) => sum + (u.delta || 0), 0);
    const totalVega = loadedUsers.filter(u => u.vega !== undefined).reduce((sum, u) => sum + (u.vega || 0), 0);

    return (
        <Container>
            <TopBar>
                <div style={{ flex: 1 }}>
                    <Title>SuperAdmin Dashboard</Title>
                    <Subtitle>{users.length} accounts in database</Subtitle>
                </div>
                <RefreshBtn onClick={loadAllUsers} disabled={isLoading}>
                    {isLoading ? 'Loading...' : 'Refresh All'}
                </RefreshBtn>
            </TopBar>

            {globalError && <ErrorBox>{globalError}</ErrorBox>}

            {isLoading ? (
                <LoadingContainer>
                    <IonSpinner name="crescent" />
                    <span>Fetching accounts...</span>
                </LoadingContainer>
            ) : (
                <>
                    {/* Summary Cards */}
                    {loadedUsers.length > 0 && (
                        <SummaryRow>
                            <SummaryCard $color="#4a9eff">
                                <SummaryLabel>Total Accounts</SummaryLabel>
                                <SummaryValue>{users.length}</SummaryValue>
                            </SummaryCard>
                            <SummaryCard $color={totalNetLiq > 0 ? '#4dff91' : '#ff4d6d'}>
                                <SummaryLabel>Total Net Liq</SummaryLabel>
                                <SummaryValue $color={plColor(totalNetLiq)}>{formatCurrency(totalNetLiq)}</SummaryValue>
                            </SummaryCard>
                            <SummaryCard $color="#4dff91">
                                <SummaryLabel>Total Theta</SummaryLabel>
                                <SummaryValue $color={plColor(totalTheta)}>{formatGreek(totalTheta)}</SummaryValue>
                            </SummaryCard>
                            <SummaryCard $color={totalDelta > 0 ? '#4dff91' : '#ff4d6d'}>
                                <SummaryLabel>Total Delta</SummaryLabel>
                                <SummaryValue $color={plColor(totalDelta)}>{formatGreek(totalDelta)}</SummaryValue>
                            </SummaryCard>
                            <SummaryCard $color="#ff4d6d">
                                <SummaryLabel>Total Vega</SummaryLabel>
                                <SummaryValue $color={plColor(totalVega)}>{formatGreek(totalVega)}</SummaryValue>
                            </SummaryCard>
                        </SummaryRow>
                    )}

                    {/* Accounts Table */}
                    <Table>
                        <thead>
                            <tr>
                                <Th>Account</Th>
                                <Th>Net Liquidity</Th>
                                <Th>Option BP</Th>
                                <Th>Delta</Th>
                                <Th>Theta</Th>
                                <Th>Vega</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.uid}>
                                    <Td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                        {u.accountNumber || u.uid.slice(0, 12) + '...'}
                                    </Td>
                                    <Td $color={plColor(u.netLiquidity)}>
                                        {u.status === 'loading' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : formatCurrency(u.netLiquidity)}
                                    </Td>
                                    <Td>
                                        {u.status === 'loading' ? '—' : formatCurrency(u.optionBuyingPower)}
                                    </Td>
                                    <Td $color={plColor(u.delta)}>
                                        {u.status === 'loading-greeks' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : formatGreek(u.delta)}
                                    </Td>
                                    <Td $color={plColor(u.theta)}>
                                        {u.status === 'loading-greeks' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : formatGreek(u.theta)}
                                    </Td>
                                    <Td $color={plColor(u.vega)}>
                                        {u.status === 'loading-greeks' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : formatGreek(u.vega)}
                                    </Td>
                                    <Td>
                                        <StatusBadge $type={u.status}>
                                            {u.status === 'loading' ? 'Loading...' :
                                             u.status === 'loading-greeks' ? 'Greeks...' :
                                             u.status === 'loaded' ? 'OK' :
                                             u.error || 'Error'}
                                        </StatusBadge>
                                    </Td>
                                </tr>
                            ))}
                            {users.length === 0 && !isLoading && (
                                <tr>
                                    <Td colSpan={7} style={{ textAlign: 'center', color: 'var(--app-text-muted)', padding: '40px' }}>
                                        No accounts found
                                    </Td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </>
            )}
        </Container>
    );
};

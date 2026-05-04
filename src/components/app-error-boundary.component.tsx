import React from 'react';

interface IProps {
    children: React.ReactNode;
}

interface IState {
    error: Error | null;
    info: React.ErrorInfo | null;
}

/**
 * Top-level error boundary so any render-time crash inside the protected
 * subtree shows a readable diagnostic page instead of unmounting the entire
 * React tree (which would blank the whole app).
 */
export class AppErrorBoundary extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);
        this.state = { error: null, info: null };
    }

    static getDerivedStateFromError(error: Error): Partial<IState> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // eslint-disable-next-line no-console
        console.error('[AppErrorBoundary]', error, info);
        this.setState({ info });
    }

    private reload = (): void => {
        this.setState({ error: null, info: null });
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    render(): React.ReactNode {
        const { error, info } = this.state;
        if (!error) return this.props.children;
        return (
            <div style={{
                padding: 24,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                background: '#1a0f0f',
                color: '#fbeaea',
                minHeight: '100vh',
            }}>
                <h2 style={{ marginBottom: 12, color: '#ff6b6b' }}>App crash caught</h2>
                <p style={{ marginBottom: 16, opacity: 0.8 }}>
                    A render-time error stopped the app from loading. The full message and React component stack are below — please copy this and report.
                </p>
                <pre style={{
                    background: '#0d0707',
                    padding: 16,
                    borderRadius: 8,
                    overflow: 'auto',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    border: '1px solid #ff6b6b33',
                }}>
{error.name}: {error.message}
{'\n\n'}
{error.stack}
{'\n\n--- React component stack ---\n'}
{info?.componentStack ?? '(unavailable)'}
                </pre>
                <button
                    onClick={this.reload}
                    style={{
                        marginTop: 16,
                        padding: '10px 18px',
                        background: '#ff6b6b',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14,
                    }}
                >
                    Reload
                </button>
            </div>
        );
    }
}

export default AppErrorBoundary;

import React from 'react';

interface IProps {
    fallbackTitle: string;
    children: React.ReactNode;
}

interface IState {
    error: Error | null;
}

/**
 * Local error boundary for the Skew Analysis chart so a Recharts /
 * MobX-proxy interaction can't blank the whole page. Any other render
 * exception in the chart subtree shows a readable fallback with the
 * exception message instead of unmounting the React tree.
 */
export class SkewErrorBoundary extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error): IState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error('[SkewErrorBoundary]', error, info);
    }

    render(): React.ReactNode {
        if (this.state.error) {
            return (
                <div style={{ padding: 16, border: '1px solid var(--ion-color-warning)', borderRadius: 8, background: 'rgba(255, 196, 9, 0.06)' }}>
                    <strong>{this.props.fallbackTitle} — failed to render.</strong>
                    <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                        {this.state.error.message}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

export default SkewErrorBoundary;

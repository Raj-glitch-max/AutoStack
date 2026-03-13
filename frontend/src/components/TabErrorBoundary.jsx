import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, Button } from './ui/index';

class TabErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Tab Error Boundary caught an error", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onRetry) {
            this.props.onRetry();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="animate-fadeIn py-10">
                    <Card className="p-8 flex flex-col items-center text-center max-w-md mx-auto border-dashed border-red-500/30">
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                            <AlertTriangle className="text-red-500" size={24} />
                        </div>
                        <h3 className="text-lg font-bold mb-2">Something went wrong</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-6">
                            There was an error loading this tab. This might be due to a network glitch or a rendering issue.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="secondary" icon={RefreshCw} onClick={this.handleRetry}>
                                Try again
                            </Button>
                            <Button variant="ghost" onClick={() => window.location.reload()}>
                                Reload app
                            </Button>
                        </div>
                        {process.env.NODE_ENV === 'development' && (
                            <pre className="mt-6 p-4 bg-black/20 rounded text-[10px] font-mono text-left w-full overflow-x-auto text-red-400">
                                {this.state.error?.toString()}
                            </pre>
                        )}
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default TabErrorBoundary;

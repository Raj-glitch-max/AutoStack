import { Component } from 'react';

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error("ErrorBoundary caught an error:", error, info);
        this.setState({ info });
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-900 border border-red-500 rounded text-left overflow-auto text-white m-4 font-mono text-sm">
                    <h2 className="font-bold mb-2">Something went wrong.</h2>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.error?.toString()}
                        <br />
                        {this.state.info?.componentStack}
                    </details>
                </div>
            );
        }
        return this.props.children;
    }
}

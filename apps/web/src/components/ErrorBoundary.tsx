import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorState } from './states/ErrorState';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  isProduction?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled React ErrorBoundary exception:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isProd =
        this.props.isProduction ??
        (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production');

      const userMessage = isProd
        ? 'An unexpected application error occurred. Please try again.'
        : this.state.error?.message || 'An unexpected error occurred.';

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
          <ErrorState
            title="Application Error"
            message={userMessage}
            onRetry={this.handleReset}
            retryLabel="Reload page"
          />
        </div>
      );
    }

    return this.props.children;
  }
}

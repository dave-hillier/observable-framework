import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary component for catching and displaying cell errors.
 * Replaces Observable's rejected() callback that displays errors inline.
 *
 * Usage:
 *   <ErrorBoundary fallback={(error, reset) => (
 *     <div className="observablehq--error">
 *       <span>{error.message}</span>
 *       <button onClick={reset}>Retry</button>
 *     </div>
 *   )}>
 *     <CellComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {error};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Cell error:", error, errorInfo);
  }

  reset = (): void => {
    this.setState({error: null});
  };

  render(): React.ReactNode {
    if (this.state.error) {
      const {fallback} = this.props;
      if (typeof fallback === "function") {
        return fallback(this.state.error, this.reset);
      }
      if (fallback) return fallback;
      return (
        <div className="observablehq observablehq--error">
          <span>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

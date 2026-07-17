/**
 * Error Boundary Component
 * =========================
 * Catches JavaScript errors anywhere in the child component tree,
 * logs errors, and displays a fallback UI matching the AI assistant aesthetic.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<ErrorPage />}>
 *   <App />
 * </ErrorBoundary>
 * ```
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI to show when an error occurs */
  fallback?: ReactNode;
  /**
   * Render a compact, CONTAINED error card (fits inside a page/surface) instead
   * of the full-screen takeover. Use for page/route-level boundaries so one
   * faulting surface can't white-screen the whole app.
   */
  compact?: boolean;
  /** Optional label for the compact fallback (e.g. the page name). */
  label?: string;
  /**
   * When this value changes, the boundary clears any caught error and retries
   * rendering its children. Pass the current route (e.g. `location.pathname`)
   * so a transient error self-heals as soon as the user navigates — the app's
   * pages stay mounted forever, so without this a one-off throw would stick.
   */
  resetKey?: unknown;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** Last `resetKey` we reconciled against (for auto-recovery on change). */
  lastResetKey: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    // Auto-recover when the reset key (route) changes.
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Auto-reload on chunk load failures (stale deploys)
    const isChunkError =
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      const alreadyReloaded = sessionStorage.getItem('chunk-reload-attempted');
      if (!alreadyReloaded) {
        sessionStorage.setItem('chunk-reload-attempted', 'true');
        window.location.reload();
        return;
      }
      // Already reloaded once — clear flag and show error screen
      sessionStorage.removeItem('chunk-reload-attempted');
    }

    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = (): void => {
    window.location.href = '/app';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Compact, contained fallback — keeps the rest of the app alive.
      if (this.props.compact) {
        return (
          <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium text-foreground">
                {this.props.label ? `${this.props.label} hit a snag` : 'This section hit a snag'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The rest of the app is still working. Try again or head back home.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={this.handleReset} variant="glass" size="sm" className="gap-2 rounded-xl">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
              <Button onClick={this.handleGoHome} variant="glass" size="sm" className="gap-2 rounded-xl">
                <Home className="h-3.5 w-3.5" />
                Home
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
          {/* Ambient glow effects */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div 
              className="absolute top-1/4 left-1/4 w-96 h-96 opacity-20"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.4) 0%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
            <div 
              className="absolute bottom-1/4 right-1/4 w-80 h-80 opacity-15"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(251, 146, 60, 0.4) 0%, transparent 70%)',
                filter: 'blur(50px)',
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center max-w-md">
            {/* Avatar with error indicator */}
            <div className="relative mb-6">
              <img 
                src={assistantAvatar} 
                alt="Assistant" 
                className="w-24 h-24 object-contain opacity-80"
              />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-red-500/20 backdrop-blur-xl border border-red-500/30 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-semibold text-white mb-3">
              Something went wrong
            </h1>

            {/* Description */}
            <p className="text-zinc-400 text-sm leading-relaxed mb-8">
              An unexpected error occurred. Don't worry, your data is safe. 
              Try refreshing the page or head back to the home feed.
            </p>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button 
                onClick={this.handleReset}
                variant="glass"
                className="flex-1 h-12 rounded-xl gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button 
                onClick={this.handleGoHome}
                variant="glass"
                className="flex-1 h-12 rounded-xl gap-2"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Button>
            </div>

            {/* Full refresh option */}
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
            >
              Or refresh the entire page
            </button>

            {/* Error details — visible in all environments to aid mobile debugging */}
            {this.state.error && (
              <div className="mt-8 w-full">
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-left overflow-auto max-h-64">
                  <p className="text-[11px] text-red-400/70 font-mono mb-1">
                    {this.state.error.name || 'Error'}
                  </p>
                  <p className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all">
                    {this.state.error.message || 'Unknown error'}
                  </p>
                  {this.state.error.stack && (
                    <p className="text-[10px] text-red-400/60 font-mono mt-2 whitespace-pre-wrap break-all">
                      {this.state.error.stack.split('\n').slice(0, 8).join('\n')}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-500 font-mono mt-3 break-all">
                    UA: {typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Auth Prompt Component
 * =====================
 * IMPORTANT: Web3Auth popup flows must be started from a user gesture.
 * Triggering `connect()` inside an effect can be blocked (especially inside iframes),
 * leaving the UI stuck on "verifying".
 *
 * This component now shows a lightweight prompt and requires an explicit click.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface AuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthPrompt({ isOpen, onClose }: AuthPromptProps) {
  const { connect, isConnecting, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    setError(null);
    try {
      await connect();
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Login failed');
    }
  }, [connect, onClose]);

  if (!isOpen || isAuthenticated) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Log in required</h3>
          <p className="text-sm text-muted-foreground">
            Click below to open the secure login popup.
          </p>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={handleLogin}
            disabled={isConnecting}
          >
            {isConnecting ? 'Opening…' : 'Log in'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isConnecting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to use auth prompt
 */
// (hooks already imported above)

export function useAuthPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  const requireAuth = useCallback((callback?: () => void) => {
    if (isAuthenticated) {
      callback?.();
      return true;
    }
    setIsOpen(true);
    return false;
  }, [isAuthenticated]);

  const close = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    requireAuth,
    close,
    AuthPromptComponent: () => (
      <AuthPrompt isOpen={isOpen} onClose={close} />
    ),
  };
}

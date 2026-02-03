/**
 * Re-Authentication Handler Hook
 * ==============================
 * Provides a reusable handler for components to handle API errors,
 * specifically detecting authentication failures and prompting the user
 * to re-sign in.
 */

import { useAuth } from '@/contexts/AuthContext';
import { AuthenticationError } from '@/lib/api/dehub';
import { toast } from 'sonner';

/**
 * Hook that provides error handling for API calls with auth error detection.
 * When an AuthenticationError is caught, it shows a toast with a "Sign in" action
 * that opens the login modal.
 */
export function useReauthHandler() {
  const { openLoginModal } = useAuth();

  /**
   * Handle API errors with special handling for authentication failures.
   * 
   * @param error - The caught error from an API call
   * @param fallbackMessage - Message to show if it's not an auth error
   * @returns true if it was an auth error that was handled, false otherwise
   */
  const handleApiError = (error: unknown, fallbackMessage: string): boolean => {
    if (error instanceof AuthenticationError) {
      toast.error('Session expired', {
        description: 'Please sign in again to continue',
        action: {
          label: 'Sign in',
          onClick: openLoginModal,
        },
        duration: 8000,
      });
      return true; // Indicates auth error was handled
    }
    
    // Not an auth error, show fallback message
    toast.error(fallbackMessage);
    return false;
  };

  return { handleApiError };
}

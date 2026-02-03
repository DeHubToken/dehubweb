/**
 * Re-Authentication Handler Hook
 * ==============================
 * Provides a reusable handler for components to handle API errors,
 * specifically detecting authentication failures and attempting seamless
 * session refresh before falling back to the login modal.
 */

import { useAuth } from '@/contexts/AuthContext';
import { AuthenticationError } from '@/lib/api/dehub';
import { toast } from 'sonner';

/**
 * Hook that provides error handling for API calls with auth error detection.
 * When an AuthenticationError is caught, it first tries to seamlessly refresh
 * the session using the existing Web3Auth connection. If that fails, it shows
 * a toast with a "Sign in" action that opens the login modal.
 */
export function useReauthHandler() {
  const { openLoginModal, refreshSession } = useAuth();

  /**
   * Handle API errors with special handling for authentication failures.
   * Attempts seamless session refresh before prompting for full sign-in.
   * 
   * @param error - The caught error from an API call
   * @param fallbackMessage - Message to show if it's not an auth error
   * @returns true if it was an auth error that was handled, false otherwise
   */
  const handleApiError = async (error: unknown, fallbackMessage: string): Promise<boolean> => {
    if (error instanceof AuthenticationError) {
      // Try seamless refresh first
      const toastId = toast.loading('Refreshing session...');
      
      const refreshed = await refreshSession();
      toast.dismiss(toastId);
      
      if (refreshed) {
        toast.success('Session refreshed! Please try again.');
        return true; // Caller can retry the action
      }
      
      // Fallback to full sign-in if refresh fails
      toast.error('Session expired', {
        description: 'Please sign in again to continue',
        action: {
          label: 'Sign in',
          onClick: openLoginModal,
        },
        duration: 8000,
      });
      return true;
    }
    
    // Not an auth error, show fallback message
    toast.error(fallbackMessage);
    return false;
  };

  return { handleApiError };
}

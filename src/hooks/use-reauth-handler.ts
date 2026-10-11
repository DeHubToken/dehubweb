import { useTranslation as _useCopy } from 'react-i18next';
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
  const { t: _copy } = _useCopy();
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
      
      // force: the server just rejected this request, so the local expiry
      // check cannot be trusted to decide whether a refresh is needed.
      const refreshed = await refreshSession(true);
      toast.dismiss(toastId);
      
      if (refreshed) {
        toast.success(_copy("copy.b18e2ef76989", { defaultValue: "Session refreshed! Please try again." }));
        return true; // Caller can retry the action
      }
      
      // Fallback to full sign-in if refresh fails
      toast.error(_copy("copy.e5ee1e7e84aa", { defaultValue: "Session expired" }), {
        description: _copy("copy.6660f63e06ce", { defaultValue: "Please sign in again to continue" }),
        action: {
          label: _copy("copy.bfd402b2f6f3", { defaultValue: "Sign in" }),
          onClick: () => openLoginModal(),
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

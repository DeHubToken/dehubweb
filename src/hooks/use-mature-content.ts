/**
 * Mature Content Setting Hook
 * ===========================
 * One account-level preference, read by the cards and written by settings.
 *
 * The server already keeps mature posts out of the public feeds unless this is
 * on, so the client half is about the surfaces where a mature post is still
 * served on purpose — a profile, the Following feed, a shared link. There it
 * renders behind a content warning until the reader taps through, or not at
 * all if they have opted in.
 *
 * Signed out means off. Nothing to read, and the feeds they are served are
 * already filtered server-side.
 *
 * @module hooks/use-mature-content
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';

export function useMatureContent() {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress && isAuthenticated,
  });

  const showMatureContent = profile?.showMatureContent === true;

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateProfile({ showMatureContent: enabled }),
    onSuccess: (_result, enabled) => {
      // The feeds are filtered server-side on this value, so they have to be
      // refetched rather than patched — turning it on adds posts that were
      // never in the cached pages to begin with.
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
      toast.success(enabled ? 'Mature content is on' : 'Mature content is off');
    },
    onError: () => toast.error('Could not save that. Try again.'),
  });

  const setShowMatureContent = useCallback(
    (enabled: boolean) => mutation.mutate(enabled),
    [mutation],
  );

  return {
    showMatureContent,
    setShowMatureContent,
    isLoading,
    isSaving: mutation.isPending,
  };
}

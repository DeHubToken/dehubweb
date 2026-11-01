import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { togglePin, getUserPins, getPinCount, getPinners } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { DeHubPin } from '@/lib/api/dehub';

const PINS_KEY = 'pins';

export function useUserPins(address: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [PINS_KEY, address],
    queryFn: async () => {
      const res = await getUserPins(address);
      return { items: res.result || [], pagination: res.pagination };
    },
    enabled: !!address,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTogglePin() {
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const me = walletAddress?.toLowerCase() || '';
  const flip = (tokenId: number, pinned: boolean) =>
    queryClient.setQueryData<string[]>([PINS_KEY, 'mine', me], (old) => {
      if (old === undefined) return pinned ? [String(tokenId)] : undefined;
      const id = String(tokenId);
      return pinned ? [...old.filter((t) => t !== id), id] : old.filter((t) => t !== id);
    });

  return useMutation({
    mutationFn: togglePin,
    // Flip the viewer's pinned list before the request goes out, so the post
    // moves to (or off) the top of the profile the moment it is tapped.
    onMutate: async (tokenId: number) => {
      if (!me) return { previous: undefined as string[] | undefined };
      await queryClient.cancelQueries({ queryKey: [PINS_KEY, 'mine', me] });
      const previous = queryClient.getQueryData<string[]>([PINS_KEY, 'mine', me]);
      const wasPinned = (previous || []).includes(String(tokenId));
      flip(tokenId, !wasPinned);
      return { previous };
    },
    onSuccess: (data, tokenId) => {
      // Patch this post's pin count in place instead of refetching every pin query
      queryClient.setQueryData<number>([PINS_KEY, 'count', tokenId], (old) =>
        old === undefined ? undefined : Math.max(0, old + (data.pinned ? 1 : -1)));
      // Only this post's pinners list + the current user's own pins list are affected
      queryClient.invalidateQueries({ queryKey: [PINS_KEY, 'users', tokenId] });
      if (me) {
        // Settle on the server's answer (the toggle decides), then refresh.
        flip(tokenId, data.pinned);
        queryClient.invalidateQueries({ queryKey: [PINS_KEY, 'mine', me] });
        queryClient.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === PINS_KEY &&
            typeof q.queryKey[1] === 'string' &&
            q.queryKey[1].toLowerCase() === me,
        });
      }
      if (data.pinned) {
        toast.success(t('postOptions.postPinned', 'Pinned to your profile'));
      } else {
        toast.success(t('postOptions.postUnpinned', 'Unpinned from your profile'));
      }
    },
    onError: (_err, _tokenId, context) => {
      if (me) queryClient.setQueryData([PINS_KEY, 'mine', me], context?.previous);
      toast.error(t('postOptions.pinFailed', 'Could not pin or unpin this post'));
    },
  });
}

export function usePinCount(tokenId: number) {
  return useQuery({
    queryKey: [PINS_KEY, 'count', tokenId],
    queryFn: async () => {
      const res = await getPinCount(tokenId);
      return res.count || 0;
    },
    enabled: !!tokenId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePinners(tokenId: number) {
  return useQuery({
    queryKey: [PINS_KEY, 'users', tokenId],
    queryFn: async () => {
      const res = await getPinners(tokenId);
      return { items: res.result || [], pagination: res.pagination };
    },
    enabled: !!tokenId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Token ids the signed-in viewer has pinned.
 *
 * Every pin control used to seed itself with `useState(false)`, so a post that
 * was already pinned still offered "Pin post" — and now that the same post can
 * show a pin control in two places at once (the card's utility cluster and its
 * three-dot menu), two local booleans would also disagree with each other. One
 * shared query settles both: it is fetched once per session, patched in place
 * by `useTogglePin`, and read as a plain string[] so the persisted query cache
 * can round-trip it (a Set cannot).
 */
export function usePinnedPostIds() {
  const { walletAddress, isAuthenticated } = useAuth();
  const me = walletAddress?.toLowerCase() || '';

  return useQuery({
    queryKey: [PINS_KEY, 'mine', me],
    queryFn: async () => {
      const res = await getUserPins(me, 1, 100);
      return (res.result || []).map((pin) => String(pin.tokenId));
    },
    enabled: isAuthenticated && !!me,
    staleTime: 2 * 60 * 1000,
  });
}

/** Whether the viewer has pinned this post. */
export function useIsPostPinned(tokenId?: number | string | null) {
  const { data } = usePinnedPostIds();
  if (tokenId == null) return false;
  return (data || []).includes(String(tokenId));
}

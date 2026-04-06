/**
 * useFriendsAtEvent
 * =================
 * Returns up to 5 avatars of people the current user follows who RSVP'd to an event.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { buildAvatarUrl } from '@/lib/media-url';

export interface FriendAtEvent {
  address: string;
  avatarUrl?: string;
}

const MAX_FRIENDS = 5;

export function useFriendsAtEvent(eventId: string | undefined) {
  const { walletAddress } = useAuth();
  const { data: profile } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress,
  });

  const followingsList = profile?.followingsList;

  return useQuery({
    queryKey: ['friends-at-event', eventId, walletAddress],
    enabled: !!eventId && !!walletAddress && !!followingsList && followingsList.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<FriendAtEvent[]> => {
      if (!followingsList || followingsList.length === 0) return [];

      // Get all RSVPs for this event
      const { data: rsvps } = await supabase
        .from('community_event_rsvps')
        .select('wallet_address')
        .eq('event_id', eventId!)
        .in('status', ['going', 'approved', 'interested']);

      if (!rsvps || rsvps.length === 0) return [];

      const rsvpAddresses = new Set(rsvps.map(r => r.wallet_address.toLowerCase()));
      const followingLower = followingsList.map(f => f.toLowerCase());

      // Find intersection
      const friendAddresses = followingLower
        .filter(addr => rsvpAddresses.has(addr))
        .slice(0, MAX_FRIENDS);

      if (friendAddresses.length === 0) return [];

      // Resolve avatars
      const resolved = await Promise.allSettled(
        friendAddresses.map(async (addr) => {
          try {
            const info = await getAccountInfo(addr);
            const avatarPath = (info as any)?.avatarImageUrl || (info as any)?.avatarUrl || (info as any)?.avatar_url;
            return {
              address: addr,
              avatarUrl: buildAvatarUrl(addr, avatarPath),
            };
          } catch {
            return { address: addr };
          }
        })
      );

      return resolved
        .filter((r): r is PromiseFulfilledResult<FriendAtEvent> => r.status === 'fulfilled')
        .map(r => r.value);
    },
  });
}

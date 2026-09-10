/**
 * useFriendsAtEvent
 * =================
 * Returns up to 5 avatars of people the current user follows who RSVP'd to an event.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { getAccountSummaries } from '@/lib/api/dehub/users';
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
      try {
        const profiles = await getAccountSummaries(friendAddresses);
        const byAddress = new Map(profiles.map(profile => [profile.address.toLowerCase(), profile]));
        return friendAddresses.map(address => ({
          address,
          avatarUrl: buildAvatarUrl(address, byAddress.get(address)?.avatarImageUrl || undefined),
        }));
      } catch {
        return friendAddresses.map(address => ({ address }));
      }
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { getFollowList, type FollowListItem } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

interface UseMutualFollowersOptions {
  profileAddress: string | undefined;
  enabled?: boolean;
}

/**
 * Computes mutual followers: people you follow who also follow the visited profile.
 * Fetches up to 300 from each list and intersects by address.
 */
export function useMutualFollowers({ profileAddress, enabled = true }: UseMutualFollowersOptions) {
  const { walletAddress, isAuthenticated } = useAuth();

  const isOwnProfile = !!(
    walletAddress &&
    profileAddress &&
    walletAddress.toLowerCase() === profileAddress.toLowerCase()
  );

  const shouldFetch = enabled && isAuthenticated && !!walletAddress && !!profileAddress && !isOwnProfile;

  const { data: mutuals = [], isLoading } = useQuery({
    queryKey: ['mutual-followers', walletAddress?.toLowerCase(), profileAddress?.toLowerCase()],
    queryFn: async (): Promise<FollowListItem[]> => {
      if (!walletAddress || !profileAddress) return [];

      // Fetch both lists in parallel (best-effort, first 300 each)
      const [myFollowing, theirFollowers] = await Promise.all([
        getFollowList(walletAddress, 'following', { limit: 300 }),
        getFollowList(profileAddress, 'followers', { limit: 300 }),
      ]);

      // Build a set of addresses I follow
      const myFollowingSet = new Set(
        myFollowing.items.map((item) => item.address.toLowerCase())
      );

      // Intersection: people I follow who also follow this profile
      return theirFollowers.items.filter(
        (item) => myFollowingSet.has(item.address.toLowerCase())
      );
    },
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000,
  });

  return { mutuals, isLoading: shouldFetch ? isLoading : false };
}

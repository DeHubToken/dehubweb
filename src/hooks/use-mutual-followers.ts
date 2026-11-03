import { useQuery } from '@tanstack/react-query';
import { getFollowList, getMutualFollowers, type FollowListItem } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

interface UseMutualFollowersOptions {
  profileAddress: string | undefined;
  enabled?: boolean;
}

/**
 * Mutual followers: people you follow who also follow the visited profile.
 * The server intersects the full lists; the old first-50-of-each check is
 * only a fallback while an older API is still live.
 */
export function useMutualFollowers({ profileAddress, enabled = true }: UseMutualFollowersOptions) {
  const { walletAddress, isAuthenticated } = useAuth();

  const isOwnProfile = !!(
    walletAddress &&
    profileAddress &&
    walletAddress.toLowerCase() === profileAddress.toLowerCase()
  );

  const shouldFetch = enabled && isAuthenticated && !!walletAddress && !!profileAddress && !isOwnProfile;

  const { data, isLoading } = useQuery({
    queryKey: ['mutual-followers-v2', walletAddress?.toLowerCase(), profileAddress?.toLowerCase()],
    queryFn: async (): Promise<{ items: FollowListItem[]; totalCount: number }> => {
      if (!walletAddress || !profileAddress) return { items: [], totalCount: 0 };
      try {
        return await getMutualFollowers(profileAddress, 5);
      } catch {
        const [myFollowing, theirFollowers] = await Promise.all([
          getFollowList(walletAddress, 'following', { limit: 100 }),
          getFollowList(profileAddress, 'followers', { limit: 100 }),
        ]);
        const myFollowingSet = new Set(myFollowing.items.map((item) => item.address.toLowerCase()));
        const items = theirFollowers.items.filter((item) => myFollowingSet.has(item.address.toLowerCase()));
        return { items, totalCount: items.length };
      }
    },
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000,
  });

  const mutuals = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  return { mutuals, totalCount, isLoading: shouldFetch ? isLoading : false };
}

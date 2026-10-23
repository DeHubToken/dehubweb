import { useInfiniteQuery } from '@tanstack/react-query';
import { getDislikedPosts } from '@/lib/api/dehub';

const PAGE_SIZE = 20;

/** Stored in the public profile `customs` blob; absent means private. */
export const DISLIKES_VISIBILITY_KEY = 'dislikesVisibility';

export function dislikesArePublic(customs: Record<string, unknown> | null | undefined): boolean {
  return customs?.[DISLIKES_VISIBILITY_KEY] === 'public';
}

/** Whether this viewer gets a Dislikes tab on this profile. */
export function canSeeDislikesTab(isOwnProfile: boolean, customs: Record<string, unknown> | null | undefined): boolean {
  return isOwnProfile || dislikesArePublic(customs);
}

/** The profile Dislikes tab: posts this account disliked, newest first. */
export function useProfileDislikes(address: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['profile-dislikes', address?.toLowerCase()],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getDislikedPosts(address!, pageParam, PAGE_SIZE);
      const items = response.result || [];
      return {
        items,
        nextPage: response.pagination?.hasMore ? pageParam + 1 : undefined,
        totalCount: response.pagination?.totalCount ?? items.length,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: enabled && !!address,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * Daily post quota — how many main-feed posts the signed-in wallet has left
 * today.
 *
 * The allowance comes from the staking badge tier (`lib/post-quota.ts`); the
 * count comes from the server's own list of the user's posts, not from
 * anything kept in the browser, so clearing storage or switching device does
 * not hand anyone a fresh day. `/api/myPosts` answers newest-first, and the
 * top tier can only publish 14 in a day, so one page covers the window with
 * room to spare.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getMyPosts } from "@/lib/api/dehub/feed";
import {
  getPostAllowanceForBadge,
  isWithinQuotaDay,
  formatQuotaReset,
  type PostAllowanceInfo,
} from "@/lib/post-quota";

/** One page is plenty: the largest allowance is 14. */
const PAGE_SIZE = 50;

export const DAILY_POST_QUOTA_KEY = "daily-post-quota";

export interface DailyPostQuotaState {
  allowance: PostAllowanceInfo;
  /** Posts already published today. Treated as 0 until the count arrives. */
  used: number;
  remaining: number;
  /** The user is out of posts for today. Never true while still loading. */
  exhausted: boolean;
  /** Time until the allowance resets, e.g. "3h 20m". */
  resetsIn: string;
  isLoading: boolean;
  /** The server's count has arrived — until then `used` is a guess of zero. */
  isCounted: boolean;
  /** Call after publishing so the next open sees the new count. */
  invalidate: () => void;
}

export function useDailyPostQuota(): DailyPostQuotaState {
  const { user, walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const address = walletAddress ?? user?.address ?? null;

  const query = useQuery({
    queryKey: [DAILY_POST_QUOTA_KEY, address],
    queryFn: async () => {
      const res = await getMyPosts(1, PAGE_SIZE);
      const posts = Array.isArray(res?.result) ? res.result : [];
      // A scheduled post has not landed on the feed yet, so it is not spent
      // against today — the cron that publishes it will show up in this list
      // on the day it actually goes out.
      return posts.filter((p) => {
        const row = p as { createdAt?: string; status?: string };
        return row?.status !== "scheduled" && isWithinQuotaDay(row?.createdAt);
      }).length;
    },
    enabled: Boolean(isAuthenticated && address),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    // A failed count must not lock anyone out of posting; treat it as zero
    // used and let the server have the final word.
    retry: 1,
  });

  const allowance = getPostAllowanceForBadge(user?.badgeBalance, user?.username ?? null);
  const used = query.data ?? 0;
  const remaining = Math.max(0, allowance.postsPerDay - used);
  const isLoading = query.isLoading;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [DAILY_POST_QUOTA_KEY] });
  }, [queryClient]);

  return {
    allowance,
    used,
    remaining,
    isCounted: query.isSuccess,
    exhausted: !isLoading && query.isSuccess && remaining <= 0,
    resetsIn: formatQuotaReset(),
    isLoading,
    invalidate,
  };
}

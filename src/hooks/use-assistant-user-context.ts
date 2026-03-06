/**
 * useAssistantUserContext Hook
 * =============================
 * Aggregates user profile data from existing hooks/APIs
 * to send as context to the AI assistant edge function.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

export interface LeaderboardSnapshot {
  balance: number;
  followers: number | null;
  likes: number | null;
  subscribers: number | null;
  sent_tips: number;
  received_tips: number;
  snapshot_date: string;
}

export interface AssistantUserContext {
  username?: string;
  displayName?: string;
  walletAddress?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  likesReceived?: number;
  badgeBalance?: number;
  tipsReceived?: number;
  tipsSent?: number;
  staked?: number;
  leaderboardRank?: number;
  leaderboardBalance?: number;
  snapshots?: LeaderboardSnapshot[];
}

export function useAssistantUserContext(): AssistantUserContext | null {
  const { walletAddress, isAuthenticated } = useAuth();

  // Fetch DeHub profile
  const { data: profile } = useQuery({
    queryKey: ['assistant-user-context', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      try {
        return await getAccountInfo(walletAddress, walletAddress);
      } catch {
        return null;
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  });

  // Fetch tip totals from leaderboard cache
  const { data: tipData } = useQuery({
    queryKey: ['assistant-tip-context', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      try {
        const { data } = await withWalletHeader(
          supabase
            .from('tip_leaderboard_cache')
            .select('sent_total, received_total')
            .eq('wallet_address', walletAddress.toLowerCase())
            .eq('period', 'all')
            .maybeSingle(),
          walletAddress
        );
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch leaderboard rank + balance from cache
  const { data: leaderboardData } = useQuery({
    queryKey: ['assistant-leaderboard-context', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      try {
        const { data } = await supabase
          .from('leaderboard_cache')
          .select('data')
          .eq('sort_mode', 'holdings')
          .eq('period', 'all')
          .single();
        if (!data?.data) return null;
        const parsed = data.data as any;
        const entries = parsed?.result?.byWalletBalance || [];
        const idx = entries.findIndex((e: any) => e.account?.toLowerCase() === walletAddress.toLowerCase());
        if (idx === -1) return null;
        return { rank: idx + 1, balance: entries[idx].total ?? 0 };
      } catch {
        return null;
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch recent leaderboard snapshots for historical deltas
  const { data: snapshots } = useQuery({
    queryKey: ['assistant-snapshots-context', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      try {
        const { data } = await supabase
          .from('leaderboard_snapshots')
          .select('balance, followers, likes, subscribers, sent_tips, received_tips, snapshot_date')
          .eq('account', walletAddress.toLowerCase())
          .order('snapshot_date', { ascending: false })
          .limit(30);
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    if (!walletAddress || !isAuthenticated) return null;

    const followers = typeof profile?.followers === 'number'
      ? profile.followers
      : Array.isArray(profile?.followers)
        ? profile.followers.length
        : profile?.follower_count ?? undefined;

    const following = typeof profile?.followings === 'object' && Array.isArray(profile?.followings)
      ? profile.followings.length
      : profile?.following_count ?? undefined;

    const likes = typeof profile?.likes === 'number'
      ? profile.likes
      : Array.isArray(profile?.likes)
        ? profile.likes.length
        : undefined;

    return {
      username: profile?.username ?? undefined,
      displayName: profile?.displayName ?? profile?.display_name ?? undefined,
      walletAddress: walletAddress.toLowerCase(),
      followers,
      following,
      postsCount: profile?.uploads ?? profile?.post_count ?? undefined,
      likesReceived: likes,
      badgeBalance: profile?.badgeBalance ?? undefined,
      tipsReceived: tipData?.received_total ? Number(tipData.received_total) : undefined,
      tipsSent: tipData?.sent_total ? Number(tipData.sent_total) : undefined,
      staked: profile?.staked ?? undefined,
    };
  }, [walletAddress, isAuthenticated, profile, tipData]);
}

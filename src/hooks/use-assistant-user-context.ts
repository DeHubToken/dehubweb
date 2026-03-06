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

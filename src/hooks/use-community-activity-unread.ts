/**
 * Community Activity Unread Count Hook
 * =====================================
 * Tracks unread community_join notifications for community owners.
 * Uses Supabase Realtime for instant updates.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';

const QUERY_KEY = ['community-activity-unread'] as const;

/**
 * Returns the total unread count of community_join notifications
 * for the current user (as a community owner).
 */
export function useCommunityActivityUnreadCount() {
  const { walletAddress, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { count, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'community_join')
          .eq('read', false),
        walletAddress!
      );
      if (error) throw error;
      return count || 0;
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 60_000,
  });

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!walletAddress) return;

    const channel = supabase
      .channel('community-join-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'custom_notifications',
          filter: `type=eq.community_join`,
        },
        (payload) => {
          // Only invalidate if this notification is for the current user
          const row = payload.new as { recipient_address?: string };
          if (row.recipient_address?.toLowerCase() === walletAddress.toLowerCase()) {
            qc.invalidateQueries({ queryKey: QUERY_KEY });
            qc.invalidateQueries({ queryKey: ['community-join-notifications'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'custom_notifications',
          filter: `type=eq.community_join`,
        },
        (payload) => {
          const row = payload.new as { recipient_address?: string };
          if (row.recipient_address?.toLowerCase() === walletAddress.toLowerCase()) {
            qc.invalidateQueries({ queryKey: QUERY_KEY });
            qc.invalidateQueries({ queryKey: ['community-join-notifications'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [walletAddress, qc]);

  return {
    unreadCount: query.data ?? 0,
    isLoading: query.isLoading,
  };
}

/**
 * Returns unread count for a specific community
 */
export function useCommunityUnreadCount(communityId?: string) {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['community-activity-unread', communityId],
    queryFn: async () => {
      const { count, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'community_join')
          .eq('reference_id', communityId!)
          .eq('read', false),
        walletAddress!
      );
      if (error) throw error;
      return count || 0;
    },
    enabled: !!communityId && !!walletAddress,
    staleTime: 60_000,
  });
}

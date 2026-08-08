/**
 * Custom Notifications Hook
 * =========================
 * Fetches platform-specific notifications (e.g., feature request likes)
 * from the custom_notifications table and exposes them as DeHubNotification-shaped objects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

// Keyed by wallet so switching accounts cannot serve the previous one's rows
// from cache — these queries are scoped by a request header, not by a session
// the query client knows about.
export const customNotificationKeys = {
  all: ['custom-notifications'] as const,
  list: (walletAddress?: string | null) =>
    [...customNotificationKeys.all, 'list', walletAddress?.toLowerCase() ?? null] as const,
  unreadCount: (walletAddress?: string | null) =>
    [...customNotificationKeys.all, 'unread', walletAddress?.toLowerCase() ?? null] as const,
};

interface CustomNotificationRow {
  id: string;
  recipient_address: string;
  actor_address: string;
  actor_username: string | null;
  actor_avatar: string | null;
  type: string;
  content: string;
  reference_id: string | null;
  reference_title: string | null;
  read: boolean;
  created_at: string;
}

/**
 * Convert a custom notification row to a DeHubNotification shape
 * so it integrates seamlessly into the existing notification UI.
 */
function toDeHubNotification(row: CustomNotificationRow): DeHubNotification {
  return {
    _id: `custom_${row.id}`,
    id: `custom_${row.id}`,
    address: row.recipient_address,
    type: row.type as any,
    category: 'engagement',
    content: row.content,
    read: row.read,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    actorAddress: row.actor_address,
    actorUsername: row.actor_username || undefined,
    actorAvatar: row.actor_avatar || undefined,
    // Store reference data for navigation
    tokenId: undefined,
    tokenTitle: row.reference_title || undefined,
    // Custom field to identify this as a custom notification
    ...(row.reference_id ? { _customReferenceId: row.reference_id } : {}),
    ...(row.reference_title ? { _customReferenceTitle: row.reference_title } : {}),
  } as DeHubNotification & { _customReferenceId?: string; _customReferenceTitle?: string };
}

export function useCustomNotifications() {
  const { isAuthenticated, walletAddress } = useAuth();

  const query = useQuery({
    queryKey: customNotificationKeys.list(walletAddress),
    queryFn: async () => {
      // RLS on custom_notifications matches recipient_address against
      // get_request_wallet_address(), which reads the x-wallet-address header.
      // Without withWalletHeader that function sees nothing and the policy
      // matches no rows — the query succeeds and returns an empty list, so the
      // Features and Communities tabs looked permanently empty rather than
      // broken. The explicit recipient filter is belt-and-braces alongside it.
      const { data, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('*')
          .eq('recipient_address', walletAddress!.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(100),
        walletAddress!,
      );

      if (error) throw error;
      return (data as CustomNotificationRow[]).map(toDeHubNotification);
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return {
    customNotifications: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useCustomUnreadCount() {
  const { isAuthenticated, walletAddress } = useAuth();

  return useQuery({
    queryKey: customNotificationKeys.unreadCount(walletAddress),
    queryFn: async () => {
      const { count, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_address', walletAddress!.toLowerCase())
          .eq('read', false),
        walletAddress!,
      );

      if (error) throw error;
      return count || 0;
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useMarkCustomNotificationAsRead() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const listKey = customNotificationKeys.list(walletAddress);
  const countKey = customNotificationKeys.unreadCount(walletAddress);

  return useMutation({
    mutationFn: async (notificationId: string) => {
      // Strip the 'custom_' prefix to get the real DB id
      const dbId = notificationId.replace('custom_', '');
      // Same header requirement as the reads — without it the UPDATE matches no
      // rows under RLS and resolves without an error, so the row silently
      // reappeared as unread on the next refetch.
      const { error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .update({ read: true })
          .eq('id', dbId),
        walletAddress!,
      );
      if (error) throw error;
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: customNotificationKeys.all });

      const previousList = queryClient.getQueryData<DeHubNotification[]>(listKey);
      const previousCount = queryClient.getQueryData<number>(countKey);
      const target = previousList?.find((n) => n.id === notificationId);

      // Optimistically flag the row as read and decrement the unread count
      queryClient.setQueryData<DeHubNotification[]>(listKey, (old) =>
        old?.map((n) => n.id === notificationId ? { ...n, read: true } : n));
      if (target && !target.read && typeof previousCount === 'number') {
        queryClient.setQueryData<number>(countKey, Math.max(0, previousCount - 1));
      }

      return { previousList, previousCount };
    },
    onError: (_err, _notificationId, context) => {
      // Rollback on error
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(listKey, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(countKey, context.previousCount);
      }
    },
    onSettled: () => {
      // Caches already patched optimistically — mark stale without refetching
      queryClient.invalidateQueries({ queryKey: customNotificationKeys.all, refetchType: 'none' });
    },
  });
}

export function useMarkAllCustomNotificationsAsRead() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const listKey = customNotificationKeys.list(walletAddress);
  const countKey = customNotificationKeys.unreadCount(walletAddress);

  return useMutation({
    mutationFn: async () => {
      const { error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .update({ read: true })
          .eq('recipient_address', walletAddress!.toLowerCase())
          .eq('read', false),
        walletAddress!,
      );
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: customNotificationKeys.all });

      const previousList = queryClient.getQueryData<DeHubNotification[]>(listKey);
      const previousCount = queryClient.getQueryData<number>(countKey);

      // Optimistically flag every row as read and zero the unread count
      queryClient.setQueryData<DeHubNotification[]>(listKey, (old) =>
        old?.map((n) => n.read ? n : { ...n, read: true }));
      queryClient.setQueryData<number>(countKey, 0);

      return { previousList, previousCount };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(listKey, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(countKey, context.previousCount);
      }
    },
    onSettled: () => {
      // Caches already patched optimistically — mark stale without refetching
      queryClient.invalidateQueries({ queryKey: customNotificationKeys.all, refetchType: 'none' });
    },
  });
}

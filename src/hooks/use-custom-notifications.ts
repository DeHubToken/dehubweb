/**
 * Custom Notifications Hook
 * =========================
 * Fetches platform-specific notifications (e.g., feature request likes)
 * from the custom_notifications table and exposes them as DeHubNotification-shaped objects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

export const customNotificationKeys = {
  all: ['custom-notifications'] as const,
  list: () => [...customNotificationKeys.all, 'list'] as const,
  unreadCount: () => [...customNotificationKeys.all, 'unread'] as const,
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
    queryKey: customNotificationKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
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
    queryKey: customNotificationKeys.unreadCount(),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('custom_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      
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

  return useMutation({
    mutationFn: async (notificationId: string) => {
      // Strip the 'custom_' prefix to get the real DB id
      const dbId = notificationId.replace('custom_', '');
      const { error } = await supabase
        .from('custom_notifications')
        .update({ read: true })
        .eq('id', dbId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });
    },
  });
}

export function useMarkAllCustomNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('custom_notifications')
        .update({ read: true })
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });
    },
  });
}

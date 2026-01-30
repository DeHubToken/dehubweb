/**
 * Notifications Hooks
 * ===================
 * React Query hooks for managing user notifications.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type DeHubNotification,
} from '@/lib/api/dehub';

// Query keys for cache management
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (type?: string) => [...notificationKeys.all, 'list', type] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

/**
 * Hook to fetch notifications with infinite scroll
 */
export function useNotifications(type: string = 'all') {
  const { isAuthenticated } = useAuth();

  const query = useInfiniteQuery({
    queryKey: notificationKeys.list(type),
    queryFn: async ({ pageParam = 0 }) => {
      return getNotifications(pageParam, 20, type !== 'all' ? type : undefined);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Poll every minute
  });

  // Flatten pages into single array, filtering out any undefined items
  const notifications = query.data?.pages
    .flatMap((page) => page?.items || [])
    .filter((item): item is DeHubNotification => Boolean(item && item.id)) || [];

  return {
    notifications,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

/**
 * Hook to get unread notification count
 */
export function useUnreadNotificationCount() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadNotificationCount,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Poll every minute
  });
}

/**
 * Hook for marking a single notification as read
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Hook for marking all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: async () => {
      // Optimistically set unread count to 0
      await queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount() });
      const previousCount = queryClient.getQueryData(notificationKeys.unreadCount());
      queryClient.setQueryData(notificationKeys.unreadCount(), 0);
      return { previousCount };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unreadCount(), context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

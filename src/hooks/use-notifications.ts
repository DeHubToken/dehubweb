/**
 * Notifications Hooks
 * ===================
 * React Query hooks for managing user notifications.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRef, useEffect } from 'react';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type DeHubNotification,
  type NotificationCategory,
  type UnreadNotificationCount,
} from '@/lib/api/dehub';
import { useBrowserNotifications, getLastSeenTimestamp, setLastSeenTimestamp } from '@/hooks/use-browser-notifications';

// Query keys for cache management
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (category?: NotificationCategory) => [...notificationKeys.all, 'list', category] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

/**
 * Hook to fetch notifications with infinite scroll
 * @param category - Optional category filter (engagement, social, monetization, content, system)
 */
export function useNotifications(category?: NotificationCategory) {
  const { isAuthenticated } = useAuth();
  const { showNotification } = useBrowserNotifications();
  const prevIdsRef = useRef<Set<string>>(new Set());

  const query = useInfiniteQuery({
    queryKey: notificationKeys.list(category),
    queryFn: async ({ pageParam = 1 }) => {
      return getNotifications(pageParam, 30, category, false);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Flatten pages into single array, filtering out any undefined items
  const notifications = query.data?.pages
    .flatMap((page) => page?.items || [])
    .filter((item): item is DeHubNotification => Boolean(item && item.id)) || [];

  // Trigger browser notifications for newly arrived unread items
  useEffect(() => {
    if (!notifications.length) return;
    const lastSeen = getLastSeenTimestamp();
    const isFirstLoad = prevIdsRef.current.size === 0;

    for (const n of notifications) {
      if (prevIdsRef.current.has(n.id)) continue;
      // On first load, just populate the set without showing notifications
      if (!isFirstLoad && !n.read) {
        const createdAt = new Date(n.createdAt || 0).getTime();
        if (createdAt > lastSeen) {
          const title = n.actorUsername ? `${n.actorUsername}` : 'DeHub';
          showNotification(title, n.content || '', n.actorAvatar, n.id);
        }
      }
    }

    // Update refs
    prevIdsRef.current = new Set(notifications.map(n => n.id));
    // Update last seen to now
    setLastSeenTimestamp(Date.now());
  }, [notifications, showNotification]);

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
 * Hook to get unread notification count with category breakdown
 */
export function useUnreadNotificationCount() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadNotificationCount,
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes
  });
}

/**
 * Hook for marking a single notification as read
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationAsRead(notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });

      const previousLists = queryClient.getQueriesData<{ pages: { items: DeHubNotification[] }[] }>(
        { queryKey: [...notificationKeys.all, 'list'] },
      );
      const previousCount = queryClient.getQueryData<UnreadNotificationCount>(notificationKeys.unreadCount());

      // Locate the row so we only decrement the count when it was actually unread
      let target: DeHubNotification | undefined;
      for (const [, data] of previousLists) {
        target = data?.pages?.flatMap((page) => page?.items || []).find((n) => n?.id === notificationId);
        if (target) break;
      }

      // Optimistically flag the row as read in every cached list (all category filters)
      queryClient.setQueriesData<{ pages: { items: DeHubNotification[] }[] }>(
        { queryKey: [...notificationKeys.all, 'list'] },
        (old) => old ? {
          ...old,
          pages: old.pages.map((page) => page ? {
            ...page,
            items: (page.items || []).map((n) => n?.id === notificationId ? { ...n, read: true } : n),
          } : page),
        } : old,
      );

      // Optimistically decrement the unread count for that notification's category
      if (target && !target.read && previousCount) {
        queryClient.setQueryData<UnreadNotificationCount>(notificationKeys.unreadCount(), {
          total: Math.max(0, previousCount.total - 1),
          byCategory: {
            ...previousCount.byCategory,
            [target.category]: Math.max(0, (previousCount.byCategory[target.category] || 0) - 1),
          },
        });
      }

      return { previousLists, previousCount };
    },
    onError: (_err, _notificationId, context) => {
      // Rollback on error
      context?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unreadCount(), context.previousCount);
      }
    },
    onSettled: () => {
      // Caches already patched optimistically — mark stale without refetching
      queryClient.invalidateQueries({ queryKey: notificationKeys.all, refetchType: 'none' });
    },
  });
}

/**
 * Hook for marking all notifications as read
 * @param category - Optional: Only mark notifications in this category as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (category?: NotificationCategory) => markAllNotificationsAsRead(category),
    onMutate: async () => {
      // Optimistically set unread count to 0
      await queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount() });
      const previousCount = queryClient.getQueryData<UnreadNotificationCount>(notificationKeys.unreadCount());
      queryClient.setQueryData<UnreadNotificationCount>(notificationKeys.unreadCount(), {
        total: 0,
        byCategory: { engagement: 0, social: 0, monetization: 0, content: 0, system: 0 },
      });
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

// Re-export types for convenience
export type { DeHubNotification, NotificationCategory, UnreadNotificationCount };

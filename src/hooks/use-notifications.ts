/**
 * Notifications Hooks
 * ===================
 * React Query hooks for managing user notifications.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { buildDigest, type DigestItem } from '@/lib/notification-digest';

// Query keys for cache management
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (category?: NotificationCategory, types?: string[]) =>
    [...notificationKeys.all, 'list', category, types?.length ? [...types].sort().join(',') : null] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

/**
 * Warm the unfiltered first page the bell opens on (same key and fetch as
 * useNotifications with no filters), so the list is current the moment it
 * mounts. Respects the list's staleTime, so a fresh cache costs nothing.
 */
export function prefetchNotificationsList(queryClient: QueryClient): Promise<void> {
  return queryClient.prefetchInfiniteQuery({
    queryKey: notificationKeys.list(undefined, undefined),
    queryFn: ({ pageParam = 1 }) => getNotifications(pageParam as number, 30, undefined, false, undefined, false),
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch notifications with infinite scroll
 * @param category - Optional category filter (engagement, social, monetization, content, system)
 * @param types - Optional exact-type filter backing the per-type tabs. Applied
 *   server-side, so a tab no longer depends on its rows happening to fall inside
 *   the first page of an unfiltered feed.
 * @param options.notifyOnNew - Whether newly arrived unread rows raise a browser
 *   notification. Defaults to true for an unfiltered feed. Set it false on a
 *   second instance so a page that runs both a filtered and an unfiltered query
 *   does not announce the same row twice.
 */
export function useNotifications(
  category?: NotificationCategory,
  types?: string[],
  options?: {
    notifyOnNew?: boolean;
    /** List what the reader's notification filters held back. Fetched only while enabled. */
    filtered?: boolean;
    enabled?: boolean;
  },
) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { showNotification } = useBrowserNotifications();
  const prevIdsRef = useRef<Set<string>>(new Set());

  const query = useInfiniteQuery({
    queryKey: options?.filtered ? [...notificationKeys.list(category, types), 'filtered'] : notificationKeys.list(category, types),
    queryFn: async ({ pageParam = 1 }) => {
      return getNotifications(pageParam, 30, category, false, types, !!options?.filtered);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Flatten pages into single array, filtering out any undefined items
  const notifications = useMemo(() => query.data?.pages
    .flatMap((page) => page?.items || [])
    .filter((item): item is DeHubNotification => Boolean(item && item.id)) || [], [query.data]);
  const processedData = useRef<typeof query.data>();
  const initialized = useRef(false);

  // Never announce from a filtered feed: it returns a different slice of the
  // same data, so with a tab active every row absent from the previously seen
  // set looks "new" — switching to Tips would fire a desktop notification per
  // tip already sitting in the list.
  const notifyOnNew = (options?.notifyOnNew ?? true) && !types?.length && !options?.filtered;

  // Trigger browser notifications for newly arrived unread items.
  //
  // Collected first, announced once. The feed is polled every five minutes, so
  // a pile-up is the normal case rather than the exception: nine things
  // happening between two polls used to raise nine cards, and the reader
  // dismissed eight of them to read the ninth. One card describing the pile is
  // what they were going to reconstruct anyway.
  useEffect(() => {
    if (!notifyOnNew) return;
    if (!query.data || processedData.current === query.data) return;
    processedData.current = query.data;
    const lastSeen = getLastSeenTimestamp();
    const isFirstLoad = !initialized.current;
    initialized.current = true;

    const arrived: { at: number; id: string; item: DigestItem }[] = [];

    for (const n of notifications) {
      if (prevIdsRef.current.has(n.id)) continue;
      // On first load, just populate the set without showing notifications
      if (!isFirstLoad && !n.read) {
        const createdAt = new Date(n.createdAt || 0).getTime();
        if (createdAt > lastSeen) {
          arrived.push({
            at: createdAt,
            id: n.id,
            item: {
              from: n.actorUsername || undefined,
              text: n.content || '',
              avatar: n.actorAvatar || undefined,
            },
          });
        }
      }
    }

    // The API hands these back newest-first; a digest quotes the newest line,
    // so it needs them the other way round.
    arrived.sort((a, b) => a.at - b.at);
    const newest = arrived[arrived.length - 1];

    if (arrived.length === 1 && newest) {
      showNotification(
        newest.item.from || 'DeHub',
        newest.item.text || '',
        newest.item.avatar,
        newest.id,
      );
    } else if (arrived.length > 1 && newest) {
      const digest = buildDigest(arrived.map((a) => a.item));
      const who = digest.otherNames > 0
        ? t('digest.andOthers', { names: digest.names.join(', '), count: digest.otherNames })
        : digest.names.join(', ') || t('digest.someone', 'Someone');
      showNotification(
        'DeHub',
        t('notifications.burstBody', '{{count}} new notifications from {{who}}', {
          count: arrived.length,
          who,
        }),
        newest.item.avatar,
        // Keyed on the newest row so a later burst replaces this card rather
        // than stacking behind it, but a re-render of the same burst cannot
        // raise it twice.
        `dehub-burst-${newest.id}`,
      );
    }

    // Update refs
    prevIdsRef.current = new Set(notifications.map(n => n.id));
    // Only fetched rows advance the watermark; rendering must not acknowledge
    // notifications that the next fetch has not returned yet.
    setLastSeenTimestamp(notifications.reduce((latest, n) =>
      Math.max(latest, new Date(n.createdAt || 0).getTime() || 0), lastSeen));
  }, [query.data, notifications, showNotification, notifyOnNew, t]);

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
      // Lists are already patched optimistically — mark them stale without
      // refetching. The unread count is refetched: the optimistic decrement only
      // covers the one row, and a server-aggregated row stands for several
      // notifications, so without this the nav badge kept its old number.
      queryClient.invalidateQueries({ queryKey: notificationKeys.all, refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
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
        byCategory: { engagement: 0, social: 0, monetization: 0, content: 0, messages: 0, system: 0 },
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

/**
 * Community notifications, as the Communities page reads them
 * ===========================================================
 * Every hook here is a view of the one query in `use-custom-notifications` —
 * the same rows the bell shows, read once. Splitting them into their own module
 * keeps `lib/community-notifications` off the boot path, which the sidebar
 * drags in through `useCustomUnreadCount`.
 *
 * @module hooks/use-community-notifications
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';
import {
  customNotificationKeys,
  customNotificationListOptions,
} from '@/hooks/use-custom-notifications';
import {
  COMMUNITY_NOTIFICATION_TYPES,
  communityNotificationMatches,
  communityNotificationRef,
  communityNotificationRefs,
  isCommunityNotificationType,
  type CommunityRef,
} from '@/lib/community-notifications';

/**
 * The community rows the bell already holds, newest first — optionally narrowed
 * to one community. No second request: this is the list query with a `select`.
 *
 * Narrowing matches the slug *and* the uuid, because the join trigger has
 * written both into `reference_id` (see lib/community-notifications).
 */
export function useCommunityNotifications(community?: CommunityRef | null) {
  const { isAuthenticated, walletAddress } = useAuth();

  const select = useCallback(
    (rows: DeHubNotification[]) =>
      rows.filter((row) => {
        if (!isCommunityNotificationType(row.type as string)) return false;
        if (!community) return true;
        return communityNotificationMatches(communityNotificationRef(row), community);
      }),
    [community?.id, community?.slug], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const query = useQuery({
    ...customNotificationListOptions(walletAddress, isAuthenticated),
    select,
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/** Unread community rows: a total for the tab badge, plus a count per community. */
export interface CommunityUnreadCounts {
  total: number;
  byReference: Record<string, number>;
}

/**
 * Unread community notifications, grouped by the community they belong to.
 *
 * A count rather than a slice of the list: an account with a busy bell can have
 * community rows sitting past the 100 the list loads, and a badge that silently
 * reads zero in that case is worse than no badge at all.
 *
 * This replaces a hook that kept a Supabase Realtime channel open for the same
 * numbers. That channel could never have fired — the table's SELECT policy
 * reads the `x-wallet-address` request header and a websocket cannot send one,
 * so the subscription reported itself SUBSCRIBED and emitted nothing. The rows
 * arrive on the bell's own refetch instead, which is where they always came
 * from in practice.
 */
export function useCommunityUnreadCounts() {
  const { isAuthenticated, walletAddress } = useAuth();

  const query = useQuery({
    queryKey: customNotificationKeys.communityUnread(walletAddress),
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('reference_id')
          .eq('recipient_address', walletAddress!.toLowerCase())
          .eq('read', false)
          .in('type', [...COMMUNITY_NOTIFICATION_TYPES]),
        walletAddress!,
      );
      if (error) throw error;

      const byReference: Record<string, number> = {};
      for (const row of (data ?? []) as { reference_id: string | null }[]) {
        const key = row.reference_id?.toLowerCase();
        if (!key) continue;
        byReference[key] = (byReference[key] || 0) + 1;
      }
      return { total: (data ?? []).length, byReference } satisfies CommunityUnreadCounts;
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const byReference = query.data?.byReference;

  /** Unread for one community, counting both reference forms it may be filed under. */
  const countFor = useCallback(
    (community: CommunityRef | null | undefined) => {
      if (!byReference) return 0;
      return communityNotificationRefs(community).reduce((sum, ref) => sum + (byReference[ref] || 0), 0);
    },
    [byReference],
  );

  return useMemo(
    () => ({ total: query.data?.total ?? 0, countFor, isLoading: query.isLoading }),
    [query.data?.total, query.isLoading, countFor],
  );
}

/**
 * Mark every unread notification for one community read.
 *
 * Writes through the same table and invalidates the same key family as the
 * bell's own mark-read, so clearing a community here also drops the bell's
 * badge — which is the whole point of there being one system.
 */
export function useMarkCommunityNotificationsRead() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const listKey = customNotificationKeys.list(walletAddress);

  return useMutation({
    mutationFn: async (community: CommunityRef) => {
      const refs = communityNotificationRefs(community);
      if (refs.length === 0) return;
      const { error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .update({ read: true })
          .eq('recipient_address', walletAddress!.toLowerCase())
          .eq('read', false)
          .in('type', [...COMMUNITY_NOTIFICATION_TYPES])
          .in('reference_id', refs),
        walletAddress!,
      );
      if (error) throw error;
    },
    onMutate: async (community) => {
      await queryClient.cancelQueries({ queryKey: customNotificationKeys.all });
      const previousList = queryClient.getQueryData<DeHubNotification[]>(listKey);

      queryClient.setQueryData<DeHubNotification[]>(listKey, (old) =>
        old?.map((row) =>
          !row.read &&
          isCommunityNotificationType(row.type as string) &&
          communityNotificationMatches(communityNotificationRef(row), community)
            ? { ...row, read: true }
            : row,
        ));

      return { previousList };
    },
    onError: (_err, _community, context) => {
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(listKey, context.previousList);
      }
    },
    // The counts are separate queries rather than slices of the list, so they
    // have to be refetched — unlike the single-row mark-read, which can patch
    // everything it touches optimistically.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });
    },
  });
}


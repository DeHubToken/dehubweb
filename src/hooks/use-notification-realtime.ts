import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DEHUB_API_BASE, getAuthToken } from '@/lib/api/dehub';
import { notificationKeys } from '@/hooks/use-notifications';
import { customNotificationKeys } from '@/hooks/use-custom-notifications';

/**
 * Keep both notification stores live for the whole session.
 *
 * Three signals, because no single one covers the case people actually hit —
 * a push card arrives, they open the app, and the list is still the one it
 * fetched minutes ago:
 *
 * - the service worker posts `dehub:notification-push` the moment a push
 *   lands. This is the one that matters: the API has no socket event for a
 *   new notification, so a tab left open otherwise learns nothing until its
 *   five-minute poll.
 * - Supabase realtime, which only covers `custom_notifications`.
 * - coming back to the tab, since the app disables refetch-on-focus globally
 *   and a backgrounded tab's timers are throttled to near nothing anyway.
 */
export function useNotificationRealtime() {
  const queryClient = useQueryClient();
  const { isAuthenticated, walletAddress } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        void queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });
      }, 150);
    };

    const token = getAuthToken();
    const identity = { address: walletAddress.toLowerCase(), ...(token ? { token } : {}) };
    const socket = io(DEHUB_API_BASE, {
      auth: identity,
      query: identity,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
    });
    socket.on('notification', refresh);
    socket.on('connect', refresh);

    const channel = supabase
      .channel(`notification-list:${walletAddress.toLowerCase()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_notifications',
          filter: `recipient_address=eq.${walletAddress.toLowerCase()}`,
        },
        refresh,
      )
      .subscribe();

    const onWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      const type = event.data?.type;
      // The click message means a push was delivered too, and it lands just
      // before the reader looks at the list — worth refreshing on both.
      if (type === 'dehub:notification-push' || type === 'dehub:notification-click') refresh();
    };
    const hasWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    if (hasWorker) navigator.serviceWorker.addEventListener('message', onWorkerMessage);

    // Throttled: an infinite list can hold many pages, and every invalidate
    // refetches all of them. Flipping between tabs should not re-run that.
    let lastVisibleRefresh = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibleRefresh < 30_000) return;
      lastVisibleRefresh = now;
      refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearTimeout(refreshTimer);
      socket.off('notification', refresh);
      socket.off('connect', refresh);
      socket.disconnect();
      void supabase.removeChannel(channel);
      if (hasWorker) navigator.serviceWorker.removeEventListener('message', onWorkerMessage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isAuthenticated, walletAddress, queryClient]);
}

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DEHUB_API_BASE, getAuthToken } from '@/lib/api/dehub';
import { notificationKeys } from '@/hooks/use-notifications';
import { customNotificationKeys } from '@/hooks/use-custom-notifications';

/** Keep both notification stores live while the cached notifications page exists. */
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

    return () => {
      clearTimeout(refreshTimer);
      socket.off('notification', refresh);
      socket.off('connect', refresh);
      socket.disconnect();
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, walletAddress, queryClient]);
}

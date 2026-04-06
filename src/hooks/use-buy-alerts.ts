/**
 * useBuyAlerts Hook
 * Fetches buy_alert messages from community_chat_messages and subscribes to realtime inserts.
 * Used in PublicChat and SidebarChat to show buy bot alerts inline.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BuyAlertMessage {
  id: string;
  content: string;
  created_at: string;
  message_type: 'buy_alert';
}

export function useBuyAlerts() {
  const [alerts, setAlerts] = useState<BuyAlertMessage[]>([]);

  // Initial fetch
  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('community_chat_messages')
        .select('id, content, created_at, message_type')
        .eq('message_type', 'buy_alert')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setAlerts(data as BuyAlertMessage[]);
      }
    };

    fetchAlerts();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('buy-alerts-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
          filter: 'message_type=eq.buy_alert',
        },
        (payload) => {
          const newAlert = payload.new as BuyAlertMessage;
          setAlerts((prev) => {
            if (prev.some((a) => a.id === newAlert.id)) return prev;
            // Keep last 50
            const updated = [...prev, newAlert];
            return updated.length > 50 ? updated.slice(-50) : updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return alerts;
}

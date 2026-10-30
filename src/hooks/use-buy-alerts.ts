/**
 * useBuyAlerts Hook
 * Fetches buy_alert messages from community_chat_messages and subscribes to realtime inserts.
 * Used in PublicChat and SidebarChat to show buy bot alerts inline.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BuyAlertMessage {
  id: string;
  content: string;
  created_at: string;
  message_type: 'buy_alert';
}

// The mount read and the subscribe callback below fired together on every
// page open, and the side chat and public chat each run this hook too. One
// read in flight, or finished in the last few seconds, answers them all.
const RECENT_READ_MS = 5000;
let read: { at: number; rows: Promise<BuyAlertMessage[] | null> } | null = null;

function readAlerts(): Promise<BuyAlertMessage[] | null> {
  if (read && Date.now() - read.at < RECENT_READ_MS) return read.rows;
  const rows = Promise.resolve(
    supabase
      .from('community_chat_messages')
      .select('id, content, created_at, message_type')
      .eq('message_type', 'buy_alert')
      .order('created_at', { ascending: false })
      .limit(50),
  ).then(({ data, error }) => (!error && data ? ([...data] as BuyAlertMessage[]).reverse() : null));
  const entry = { at: Date.now(), rows };
  read = entry;
  void rows.then((r) => { if (!r && read === entry) read = null; });
  return rows;
}

export function useBuyAlerts() {
  const [alerts, setAlerts] = useState<BuyAlertMessage[]>([]);

  const fetchAlerts = useCallback(async () => {
    const rows = await readAlerts();
    if (!rows) return;
    // Keep any realtime insert that landed after the read started.
    setAlerts((prev) => {
      const ids = new Set(rows.map((a) => a.id));
      const newer = prev.filter((a) => !ids.has(a.id) && a.created_at > (rows[rows.length - 1]?.created_at ?? ''));
      const merged = [...rows, ...newer];
      return merged.length > 50 ? merged.slice(-50) : merged;
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchAlerts();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  return alerts;
}

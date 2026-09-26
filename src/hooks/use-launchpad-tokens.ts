import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LaunchpadToken = {
  id: string;
  chain_id: number;
  creator_address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  description: string | null;
  socials: Record<string, string>;
  status: 'bonding' | 'graduating' | 'graduated';
  supply_sold: number;
  market_cap_usd: number;
  volume_24h: number;
  progress_bps: number;
  graduation_target_usd: number;
  created_at: string;
  updated_at: string;
};

const LIST_REFRESH_THROTTLE_MS = 3_000;

export type LaunchpadFilter = 'new' | 'graduating' | 'trending' | 'graduated' | 'mine';

export function useLaunchpadTokens(filter: LaunchpadFilter, mineAddress?: string) {
  const query = useQuery({
    queryKey: ['launchpad-tokens', filter, mineAddress?.toLowerCase() ?? ''],
    queryFn: async () => {
      let q = supabase.from('launchpad_tokens').select('*').limit(100);
      if (filter === 'new') q = q.order('created_at', { ascending: false });
      else if (filter === 'graduating') q = q.eq('status', 'bonding').order('progress_bps', { ascending: false });
      else if (filter === 'trending') q = q.order('volume_24h', { ascending: false });
      else if (filter === 'graduated') q = q.eq('status', 'graduated').order('updated_at', { ascending: false });
      else if (filter === 'mine' && mineAddress) q = q.eq('creator_address', mineAddress.toLowerCase()).order('created_at', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LaunchpadToken[];
    },
    staleTime: 15_000,
  });

  // Trades update rows constantly. Refetching the whole list per event meant
  // one 100-row read per trade per open tab, so bursts are coalesced into at
  // most one refetch every few seconds. A hidden tab skips them and catches up
  // once when it is shown again.
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  const mine = filter === 'mine' ? mineAddress?.toLowerCase() : undefined;
  useEffect(() => {
    if (filter === 'mine' && !mine) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let missed = false;
    const schedule = () => {
      if (document.visibilityState === 'hidden') { missed = true; return; }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refetchRef.current();
      }, LIST_REFRESH_THROTTLE_MS);
    };
    const ch = supabase.channel(`launchpad-tokens-live:${filter}:${mine ?? ''}`)
      .on(
        'postgres_changes',
        mine
          ? { event: '*', schema: 'public', table: 'launchpad_tokens', filter: `creator_address=eq.${mine}` }
          : { event: '*', schema: 'public', table: 'launchpad_tokens' },
        schedule,
      ).subscribe();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missed) return;
      missed = false;
      schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [filter, mine]);

  return query;
}

export function useLaunchpadToken(id?: string) {
  const queryClient = useQueryClient();

  // The row is pushed over realtime; the interval is only a fallback for a
  // dropped socket.
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`launchpad-token:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'launchpad_tokens', filter: `id=eq.${id}` }, (payload) => {
        const row = payload.new as Partial<LaunchpadToken> | undefined;
        if (!row?.id) return;
        queryClient.setQueryData<LaunchpadToken>(['launchpad-token', id], (prev) =>
          prev ? { ...prev, ...row } : (row as LaunchpadToken));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, queryClient]);

  return useQuery({
    queryKey: ['launchpad-token', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('launchpad_tokens').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as unknown as LaunchpadToken;
    },
    staleTime: 5_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

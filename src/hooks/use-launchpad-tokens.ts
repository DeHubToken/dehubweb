import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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

  useEffect(() => {
    const ch = supabase.channel('launchpad-tokens-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'launchpad_tokens' }, () => {
        query.refetch();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

export function useLaunchpadToken(id?: string) {
  return useQuery({
    queryKey: ['launchpad-token', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('launchpad_tokens').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as unknown as LaunchpadToken;
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LaunchpadTrade = {
  id: string;
  token_id: string;
  trader_address: string;
  side: 'buy' | 'sell';
  dhb_in: number;
  tokens_out: number;
  price_per_token: number;
  created_at: string;
};

export function useLaunchpadTrades(tokenId?: string, limit = 50) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['launchpad-trades', tokenId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('launchpad_trades').select('*').order('created_at', { ascending: false }).limit(limit);
      if (tokenId) q = q.eq('token_id', tokenId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LaunchpadTrade[];
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    const ch = supabase.channel(`launchpad-trades-${tokenId ?? 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'launchpad_trades', ...(tokenId ? { filter: `token_id=eq.${tokenId}` } : {}) }, () => {
        qc.invalidateQueries({ queryKey: ['launchpad-trades', tokenId ?? 'all'] });
        qc.invalidateQueries({ queryKey: ['launchpad-token', tokenId] });
        qc.invalidateQueries({ queryKey: ['launchpad-tokens'] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tokenId, qc]);

  return query;
}

export async function mockTrade(args: { tokenId: string; side: 'buy' | 'sell'; amount: number; traderAddress: string }) {
  const { data, error } = await supabase.functions.invoke('launchpad-mock-trade', {
    body: {
      token_id: args.tokenId,
      side: args.side,
      amount: args.amount,
      trader_address: args.traderAddress,
    },
  });
  if (error) throw error;
  return data;
}

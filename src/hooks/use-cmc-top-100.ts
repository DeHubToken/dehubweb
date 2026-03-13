import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CmcCoin {
  rank: number;
  id: number;
  name: string;
  symbol: string;
  price: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  volume_24h: number;
}

async function fetchTop100(): Promise<CmcCoin[]> {
  const { data, error } = await supabase.functions.invoke('cmc-top-100');
  if (error) throw new Error(error.message);
  return data?.coins ?? [];
}

export function useCmcTop100() {
  return useQuery({
    queryKey: ['cmc-top-100'],
    queryFn: fetchTop100,
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CmcMarketData {
  symbol: string;
  name: string;
  marketCap: number | null;
  fullyDilutedMarketCap: number | null;
  price: number | null;
  volume24h: number | null;
  percentChange24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  cmcRank: number | null;
}

async function fetchCmcMarketCap(symbol: string): Promise<CmcMarketData | null> {
  const clean = symbol.replace(/^\$/, '').toUpperCase();
  if (!clean) return null;

  const { data, error } = await supabase.functions.invoke('cmc-market-cap', {
    body: { symbol: clean },
  });

  if (error || !data?.marketCap) return null;
  return data as CmcMarketData;
}

export function useCmcMarketCap(query: string, enabled: boolean) {
  const isCashtag = query.trim().startsWith('$') && query.trim().length >= 2;

  return useQuery({
    queryKey: ['cmc-market-cap', query.trim()],
    queryFn: () => fetchCmcMarketCap(query.trim()),
    enabled: enabled && isCashtag,
    staleTime: 60_000, // 1 min cache
    retry: 1,
  });
}

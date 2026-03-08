import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CmcMarketData {
  symbol: string;
  name: string;
  slug: string | null;
  cmcRank: number | null;
  dateAdded: string | null;
  tags: string[];
  maxSupply: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  platform: {
    name: string;
    symbol: string;
    tokenAddress: string;
  } | null;
  // Quote data
  price: number | null;
  marketCap: number | null;
  fullyDilutedMarketCap: number | null;
  volume24h: number | null;
  volumeChange24h: number | null;
  percentChange1h: number | null;
  percentChange24h: number | null;
  percentChange7d: number | null;
  percentChange30d: number | null;
  percentChange60d: number | null;
  percentChange90d: number | null;
  marketCapDominance: number | null;
  // Metadata
  logo: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  reddit: string | null;
  chat: string[];
  explorer: string[];
  sourceCode: string | null;
  category: string | null;
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
    staleTime: 60_000,
    retry: 1,
  });
}

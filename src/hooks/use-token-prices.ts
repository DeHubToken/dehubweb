/**
 * Hook for fetching USD prices for wallet tokens
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TokenPrices = Record<string, number>;

/**
 * Fetch prices. Optionally pass extra token addresses (for auto-detected tokens)
 * as {address}:{symbol} pairs to look up on DexScreener.
 */
async function fetchTokenPrices(extraTokens?: { address: string; symbol: string }[]): Promise<TokenPrices> {
  let extra = '';
  if (extraTokens && extraTokens.length > 0) {
    extra = extraTokens
      .map(t => `${t.address}:${t.symbol}`)
      .join(',');
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/get-dhb-price${extra ? `?extra=${encodeURIComponent(extra)}` : ''}`;

  const res = await fetch(url, { headers: { apikey: anonKey } });
  if (!res.ok) throw new Error('Failed to fetch prices');
  const data = await res.json();
  return data?.prices ?? {};
}

export function useTokenPrices(extraTokens?: { address: string; symbol: string }[]) {
  // Stable query key based on extra token addresses
  const extraKey = extraTokens?.map(t => `${t.address}:${t.symbol}`).sort().join(',') || '';

  return useQuery<TokenPrices>({
    queryKey: ['token-prices', extraKey],
    queryFn: () => fetchTokenPrices(extraTokens),
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: { DHB: 0, ETH: 0, BNB: 0, USDT: 1, BTC: 0, WETH: 0, WBNB: 0 },
  });
}

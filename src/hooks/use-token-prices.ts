/**
 * Hook for fetching USD prices for wallet tokens
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TokenPrices = Record<string, number>;

async function fetchTokenPrices(): Promise<TokenPrices> {
  const { data, error } = await supabase.functions.invoke('get-dhb-price');
  if (error) throw error;
  return data?.prices ?? {};
}

export function useTokenPrices() {
  return useQuery<TokenPrices>({
    queryKey: ['token-prices'],
    queryFn: fetchTokenPrices,
    staleTime: 60_000, // 1 min
    refetchInterval: 120_000, // 2 min
    placeholderData: { DHB: 0, ETH: 0, BNB: 0, USDT: 1, WETH: 0, WBNB: 0 },
  });
}

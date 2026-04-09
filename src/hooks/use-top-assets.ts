import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopAsset {
  symbol: string;
  name: string;
  icon: string;
  type: 'commodity' | 'stock';
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  currency: string;
}

async function fetchTopAssets(): Promise<TopAsset[]> {
  const { data, error } = await supabase.functions.invoke('top-assets');
  if (error) throw new Error(error.message);
  return data?.assets ?? [];
}

export function useTopAssets() {
  return useQuery({
    queryKey: ['top-assets'],
    queryFn: fetchTopAssets,
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

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

const TOP_ASSETS = [
  { yahooSymbol: 'GC=F', symbol: 'GOLD', name: 'Gold', icon: '🥇', type: 'commodity' as const },
  { yahooSymbol: 'SI=F', symbol: 'SILVER', name: 'Silver', icon: '🥈', type: 'commodity' as const },
  { yahooSymbol: 'CL=F', symbol: 'OIL', name: 'Crude Oil (WTI)', icon: '🛢️', type: 'commodity' as const },
  { yahooSymbol: 'AAPL', symbol: 'AAPL', name: 'Apple', icon: '🍎', type: 'stock' as const },
  { yahooSymbol: 'MSFT', symbol: 'MSFT', name: 'Microsoft', icon: '💻', type: 'stock' as const },
  { yahooSymbol: 'GOOGL', symbol: 'GOOGL', name: 'Alphabet (Google)', icon: '🔍', type: 'stock' as const },
  { yahooSymbol: 'AMZN', symbol: 'AMZN', name: 'Amazon', icon: '📦', type: 'stock' as const },
  { yahooSymbol: 'TSLA', symbol: 'TSLA', name: 'Tesla', icon: '⚡', type: 'stock' as const },
  { yahooSymbol: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', icon: '🎮', type: 'stock' as const },
  { yahooSymbol: 'META', symbol: 'META', name: 'Meta', icon: '👤', type: 'stock' as const },
  { yahooSymbol: 'BRK-B', symbol: 'BRK.B', name: 'Berkshire Hathaway', icon: '🏛️', type: 'stock' as const },
  { yahooSymbol: 'JPM', symbol: 'JPM', name: 'JPMorgan Chase', icon: '🏦', type: 'stock' as const },
];

async function fetchTopAssets(): Promise<TopAsset[]> {
  const results = await Promise.all(
    TOP_ASSETS.map(async (asset) => {
      const { data, error } = await supabase.functions.invoke('stock-quote', {
        body: { symbol: asset.yahooSymbol },
      });

      if (error || !data?.found) return null;

      return {
        symbol: asset.symbol,
        name: asset.name,
        icon: asset.icon,
        type: asset.type,
        price: data.price ?? null,
        change24h: data.percentChange24h ?? null,
        marketCap: data.marketCap ?? null,
        volume24h: data.volume24h ?? null,
        currency: data.currency ?? 'USD',
      } satisfies TopAsset;
    })
  );

  return results.filter((asset): asset is TopAsset => asset !== null);
}

export function useTopAssets() {
  return useQuery({
    queryKey: ['top-assets', 'v2'],
    queryFn: fetchTopAssets,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnMount: 'always',
  });
}

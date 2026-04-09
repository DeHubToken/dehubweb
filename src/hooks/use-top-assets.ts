import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopAsset {
  symbol: string;
  name: string;
  logoUrl: string;
  type: 'commodity' | 'stock';
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  currency: string;
}

const TOP_ASSETS = [
  { yahooSymbol: 'GC=F', symbol: 'GOLD', name: 'Gold', logoUrl: '', type: 'commodity' as const, fallbackMarketCap: 22.5e12 },
  { yahooSymbol: 'SI=F', symbol: 'SILVER', name: 'Silver', logoUrl: '', type: 'commodity' as const, fallbackMarketCap: 1.9e12 },
  { yahooSymbol: 'CL=F', symbol: 'OIL', name: 'Crude Oil (WTI)', logoUrl: 'https://logo.clearbit.com/shell.com', type: 'commodity' as const, fallbackMarketCap: 3.4e12 },
  { yahooSymbol: 'AAPL', symbol: 'AAPL', name: 'Apple', logoUrl: 'https://logo.clearbit.com/apple.com', type: 'stock' as const, fallbackMarketCap: 3.0e12 },
  { yahooSymbol: 'MSFT', symbol: 'MSFT', name: 'Microsoft', logoUrl: 'https://logo.clearbit.com/microsoft.com', type: 'stock' as const, fallbackMarketCap: 2.9e12 },
  { yahooSymbol: 'GOOGL', symbol: 'GOOGL', name: 'Alphabet (Google)', logoUrl: 'https://logo.clearbit.com/google.com', type: 'stock' as const, fallbackMarketCap: 2.2e12 },
  { yahooSymbol: 'AMZN', symbol: 'AMZN', name: 'Amazon', logoUrl: 'https://logo.clearbit.com/amazon.com', type: 'stock' as const, fallbackMarketCap: 2.0e12 },
  { yahooSymbol: 'TSLA', symbol: 'TSLA', name: 'Tesla', logoUrl: 'https://logo.clearbit.com/tesla.com', type: 'stock' as const, fallbackMarketCap: 1.1e12 },
  { yahooSymbol: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', logoUrl: 'https://logo.clearbit.com/nvidia.com', type: 'stock' as const, fallbackMarketCap: 4.4e12 },
  { yahooSymbol: 'META', symbol: 'META', name: 'Meta', logoUrl: 'https://logo.clearbit.com/meta.com', type: 'stock' as const, fallbackMarketCap: 1.6e12 },
  { yahooSymbol: 'BRK-B', symbol: 'BRK.B', name: 'Berkshire Hathaway', logoUrl: 'https://logo.clearbit.com/berkshirehathaway.com', type: 'stock' as const, fallbackMarketCap: 1.2e12 },
  { yahooSymbol: 'JPM', symbol: 'JPM', name: 'JPMorgan Chase', logoUrl: 'https://logo.clearbit.com/jpmorganchase.com', type: 'stock' as const, fallbackMarketCap: 8.0e11 },
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
        logoUrl: asset.logoUrl,
        type: asset.type,
        price: data.price ?? null,
        change24h: data.percentChange24h ?? null,
          marketCap: data.marketCap ?? asset.fallbackMarketCap ?? null,
        volume24h: data.volume24h ?? null,
        currency: data.currency ?? 'USD',
      } satisfies TopAsset;
    })
  );

  return results.filter((asset): asset is TopAsset => asset !== null);
}

export function useTopAssets() {
  return useQuery({
    queryKey: ['top-assets', 'v4'],
    queryFn: fetchTopAssets,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnMount: 'always',
  });
}

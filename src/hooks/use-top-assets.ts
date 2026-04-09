import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopAsset {
  symbol: string;
  name: string;
  type: 'commodity' | 'stock';
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  currency: string;
}

// Fallback market caps (approximate, in USD) for when Yahoo returns null
const FALLBACK_MARKET_CAPS: Record<string, number> = {
  GOLD: 22.5e12,
  SILVER: 1.9e12,
  OIL: 3.4e12,
  NATGAS: 0.3e12,
  COPPER: 0.4e12,
  PLATINUM: 0.05e12,
  AAPL: 3.0e12,
  MSFT: 3.1e12,
  NVDA: 3.4e12,
  GOOGL: 2.2e12,
  AMZN: 2.0e12,
  META: 1.6e12,
  TSLA: 1.1e12,
  'BRK.B': 1.1e12,
  TSM: 0.9e12,
  AVGO: 0.8e12,
  LLY: 0.75e12,
  WMT: 0.65e12,
  JPM: 0.7e12,
  V: 0.6e12,
  MA: 0.45e12,
  UNH: 0.5e12,
  XOM: 0.45e12,
  JNJ: 0.38e12,
  PG: 0.4e12,
  HD: 0.38e12,
  COST: 0.4e12,
  NFLX: 0.35e12,
  ORCL: 0.35e12,
  CRM: 0.28e12,
  AMD: 0.25e12,
  PEP: 0.22e12,
  KO: 0.27e12,
  INTC: 0.1e12,
  BA: 0.12e12,
};

async function fetchTopAssets(): Promise<TopAsset[]> {
  const { data, error } = await supabase.functions.invoke('top-assets');

  if (error || !data?.assets) return [];

  return (data.assets as any[]).map((a) => ({
    symbol: a.symbol,
    name: a.name,
    type: a.type as 'commodity' | 'stock',
    price: a.price ?? null,
    change24h: a.change24h ?? null,
    marketCap: a.marketCap ?? FALLBACK_MARKET_CAPS[a.symbol] ?? null,
    volume24h: a.volume24h ?? null,
    currency: a.currency ?? 'USD',
  }));
}

export function useTopAssets() {
  return useQuery({
    queryKey: ['top-assets', 'v5'],
    queryFn: fetchTopAssets,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnMount: 'always',
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PricePoint } from '@/hooks/use-token-chart';

export interface StockQuote {
  found: boolean;
  name: string;
  symbol: string;
  exchange: string;
  exchangeShort: string;
  currency: string;
  instrumentType: string;
  price: number | null;
  change24h: number | null;
  percentChange24h: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketCap: number | null;
  volume24h: number | null;
  chartData: PricePoint[];
}

export function useStockQuote(query: string, enabled: boolean) {
  const symbol = query.trim().replace(/^\$/, '').toUpperCase();
  // Stock tickers are 1-5 chars, only letters (maybe with dots like BRK.B)
  const isValidTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol);

  return useQuery<StockQuote | null>({
    queryKey: ['stock-quote', symbol],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('stock-quote', {
        body: { symbol },
      });
      if (error) {
        console.error('Stock quote error:', error);
        return null;
      }
      if (!data?.found) return null;
      return data as StockQuote;
    },
    enabled: enabled && isValidTicker && symbol.length >= 1,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}

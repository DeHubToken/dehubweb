import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PricePoint {
  time: number;
  price: number;
}

export type ChartTimeframe = '1D' | '7D' | '30D' | '90D' | '1Y';

const TIMEFRAME_DAYS: Record<ChartTimeframe, number> = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
};

function extractCashtagSymbol(input: string): string | null {
  const match = input.trim().match(/^\$([a-zA-Z0-9]+)/);
  return match?.[1]?.toUpperCase() ?? null;
}

async function fetchTokenChart(symbol: string, timeframe: ChartTimeframe): Promise<PricePoint[]> {
  const days = TIMEFRAME_DAYS[timeframe];

  const { data, error } = await supabase.functions.invoke('cmc-chart', {
    body: { symbol, days },
  });

  if (error) {
    console.error('cmc-chart error:', error);
    return [];
  }

  return data?.prices ?? [];
}

export interface UseTokenChartOptions {
  contractAddress?: string;
  chainId?: string;
}

export function useTokenChart(
  symbol: string,
  enabled: boolean,
  timeframe: ChartTimeframe = '1D',
  _options?: UseTokenChartOptions
) {
  const normalizedSymbol = extractCashtagSymbol(symbol);

  return useQuery({
    queryKey: ['token-chart', normalizedSymbol, timeframe],
    queryFn: () => fetchTokenChart(normalizedSymbol as string, timeframe),
    enabled: enabled && Boolean(normalizedSymbol),
    staleTime: 60_000,
    retry: 2,
  });
}

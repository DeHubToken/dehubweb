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
  options?: UseTokenChartOptions
) {
  const isCashtag = symbol.trim().startsWith('$') && symbol.trim().length >= 2;

  return useQuery({
    queryKey: ['token-chart', symbol.trim(), timeframe],
    queryFn: () => fetchTokenChart(symbol.trim(), timeframe),
    enabled: enabled && isCashtag,
    staleTime: 60_000,
    retry: 2,
  });
}

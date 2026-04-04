import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PricePoint {
  time: number;
  price: number;
}

export type ChartTimeframe = '7D' | '30D' | '90D' | '1Y';

const TIMEFRAME_DAYS: Record<ChartTimeframe, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
};

const DEX_TO_GECKO_NETWORK: Record<string, string> = {
  solana: 'solana',
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  optimism: 'optimism',
};

function extractCashtagSymbol(input: string): string | null {
  const match = input.trim().match(/^\$([a-zA-Z0-9]+)/);
  return match?.[1]?.toUpperCase() ?? null;
}

async function fetchGeckoTerminalOHLCV(
  pairAddress: string,
  chainId: string,
  timeframe: ChartTimeframe
): Promise<PricePoint[]> {
  const network = DEX_TO_GECKO_NETWORK[chainId];
  if (!network) return [];

  // Strip suffixes like ":4meme" from pair addresses
  const cleanPairAddress = pairAddress.split(':')[0];
  const days = TIMEFRAME_DAYS[timeframe];
  const limit = Math.min(days, 1000);
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${cleanPairAddress}/ohlcv/day?limit=${limit}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const ohlcvList: number[][] = data?.data?.attributes?.ohlcv_list ?? [];
    // Each entry: [timestamp, open, high, low, close, volume]
    // Sort ascending by time
    return ohlcvList
      .map((c) => ({ time: c[0] * 1000, price: c[4] }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

async function fetchTokenChart(
  symbol: string,
  timeframe: ChartTimeframe,
  options?: UseTokenChartOptions
): Promise<PricePoint[]> {
  const days = TIMEFRAME_DAYS[timeframe];

  const { data, error } = await supabase.functions.invoke('cmc-chart', {
    body: { symbol, days },
  });

  const cmcPrices: PricePoint[] = (!error && data?.prices?.length) ? data.prices : [];

  if (cmcPrices.length > 0) return cmcPrices;

  // Fallback: GeckoTerminal OHLCV via pair address
  if (options?.pairAddress && options?.chainId) {
    return fetchGeckoTerminalOHLCV(options.pairAddress, options.chainId, timeframe);
  }

  return [];
}

export interface UseTokenChartOptions {
  contractAddress?: string;
  chainId?: string;
  pairAddress?: string;
}

export function useTokenChart(
  symbol: string,
  enabled: boolean,
  timeframe: ChartTimeframe = '7D',
  _options?: UseTokenChartOptions
) {
  const normalizedSymbol = extractCashtagSymbol(symbol);

  return useQuery({
    queryKey: ['token-chart', normalizedSymbol, timeframe, _options?.pairAddress],
    queryFn: () => fetchTokenChart(normalizedSymbol as string, timeframe, _options),
    enabled: enabled && Boolean(normalizedSymbol),
    staleTime: 60_000,
    retry: 2,
  });
}

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

  // Use hourly candles for 1D, daily for everything else
  const isHourly = timeframe === '1D';
  const limit = isHourly ? 24 : Math.min(days, 1000);
  const period = isHourly ? 'hour' : 'day';
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${cleanPairAddress}/ohlcv/${period}?limit=${limit}`;

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

/** Find the best DexScreener pair for a symbol and fetch its GeckoTerminal OHLCV */
async function fetchGeckoTerminalBySymbol(
  symbol: string,
  timeframe: ChartTimeframe
): Promise<PricePoint[]> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const pairs = data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return [];

    // Find exact symbol matches sorted by liquidity
    const exact = pairs
      .filter((p: any) => p.baseToken?.symbol?.toUpperCase() === symbol)
      .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    // Try top 3 pairs until we get enough candles
    for (const pair of exact.slice(0, 3)) {
      const network = DEX_TO_GECKO_NETWORK[pair.chainId];
      if (!network) continue;
      const pairAddr = (pair.pairAddress || '').split(':')[0];
      if (!pairAddr) continue;

      const points = await fetchGeckoTerminalOHLCV(pairAddr, pair.chainId, timeframe);
      if (points.length >= 2) return points;
    }
    return [];
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

  // For 1D, require at least 12 points for a useful chart; for others require > 0
  const minPoints = timeframe === '1D' ? 12 : 1;
  if (cmcPrices.length >= minPoints) return cmcPrices;

  // Fallback: GeckoTerminal OHLCV via pair address
  if (options?.pairAddress && options?.chainId) {
    const points = await fetchGeckoTerminalOHLCV(options.pairAddress, options.chainId, timeframe);
    if (points.length >= 2) return points;
  }

  // Last resort: search DexScreener for best pair and try GeckoTerminal
  const fallback = await fetchGeckoTerminalBySymbol(symbol, timeframe);
  if (fallback.length >= 2) return fallback;

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

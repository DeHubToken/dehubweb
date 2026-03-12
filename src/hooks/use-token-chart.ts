import { useQuery } from '@tanstack/react-query';

export interface PricePoint {
  time: number;
  price: number;
}

export type ChartTimeframe = '1D' | '7D' | '30D' | '90D' | '1Y' | 'ALL';

const TIMEFRAME_DAYS: Record<ChartTimeframe, number | 'max'> = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
  'ALL': 'max',
};

async function fetchTokenChart(symbol: string, timeframe: ChartTimeframe): Promise<PricePoint[]> {
  const clean = symbol.replace(/^\$/, '').toLowerCase();

  // Step 1: Search CoinGecko for coin ID
  const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`);
  if (!searchRes.ok) return [];

  const searchData = await searchRes.json();
  const coin = searchData.coins?.find(
    (c: any) => c.symbol?.toLowerCase() === clean
  );
  if (!coin) return [];

  // Step 2: Fetch market chart for the selected timeframe
  const days = TIMEFRAME_DAYS[timeframe];
  const chartRes = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!chartRes.ok) return [];

  const chartData = await chartRes.json();
  if (!chartData.prices || !Array.isArray(chartData.prices)) return [];

  // Downsample to ~60 points for performance
  const prices: [number, number][] = chartData.prices;
  const step = Math.max(1, Math.floor(prices.length / 60));

  return prices
    .filter((_, i) => i % step === 0 || i === prices.length - 1)
    .map(([timestamp, price]) => ({ time: timestamp, price }));
}

export function useTokenChart(symbol: string, enabled: boolean, timeframe: ChartTimeframe = '1D') {
  const isCashtag = symbol.trim().startsWith('$') && symbol.trim().length >= 2;

  return useQuery({
    queryKey: ['token-chart', symbol.trim(), timeframe],
    queryFn: () => fetchTokenChart(symbol.trim(), timeframe),
    enabled: enabled && isCashtag,
    staleTime: 60_000,
    retry: 1,
  });
}

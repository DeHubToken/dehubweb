import { useQuery } from '@tanstack/react-query';

export interface PricePoint {
  time: number;
  price: number;
}

async function fetchTokenChart(symbol: string): Promise<PricePoint[]> {
  const clean = symbol.replace(/^\$/, '').toLowerCase();
  
  // Step 1: Search CoinGecko for coin ID
  const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`);
  if (!searchRes.ok) return [];
  
  const searchData = await searchRes.json();
  const coin = searchData.coins?.find(
    (c: any) => c.symbol?.toLowerCase() === clean
  );
  if (!coin) return [];

  // Step 2: Fetch 24h market chart
  const chartRes = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=1`
  );
  if (!chartRes.ok) return [];

  const chartData = await chartRes.json();
  if (!chartData.prices || !Array.isArray(chartData.prices)) return [];

  // Downsample to ~50 points for performance
  const prices: [number, number][] = chartData.prices;
  const step = Math.max(1, Math.floor(prices.length / 50));
  
  return prices
    .filter((_, i) => i % step === 0 || i === prices.length - 1)
    .map(([timestamp, price]) => ({ time: timestamp, price }));
}

export function useTokenChart(symbol: string, enabled: boolean) {
  const isCashtag = symbol.trim().startsWith('$') && symbol.trim().length >= 2;

  return useQuery({
    queryKey: ['token-chart', symbol.trim()],
    queryFn: () => fetchTokenChart(symbol.trim()),
    enabled: enabled && isCashtag,
    staleTime: 60_000, // 1 min
    retry: 1,
  });
}

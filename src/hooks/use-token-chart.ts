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

const CHAIN_TO_COINGECKO_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  base: 'base',
  solana: 'solana',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  avalanche: 'avalanche',
  optimism: 'optimistic-ethereum',
};

function downsample(prices: [number, number][]): PricePoint[] {
  const step = Math.max(1, Math.floor(prices.length / 60));
  return prices
    .filter((_, i) => i % step === 0 || i === prices.length - 1)
    .map(([timestamp, price]) => ({ time: timestamp, price }));
}

async function fetchChartBySymbol(symbol: string, days: number | 'max'): Promise<PricePoint[] | null> {
  const clean = symbol.replace(/^\$/, '').toLowerCase();

  const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`);
  if (!searchRes.ok) return null;

  const searchData = await searchRes.json();
  const coin = searchData.coins?.find((c: any) => c.symbol?.toLowerCase() === clean);
  if (!coin) return null;

  const chartRes = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!chartRes.ok) return null;

  const chartData = await chartRes.json();
  if (!chartData.prices || !Array.isArray(chartData.prices) || chartData.prices.length === 0) return null;

  return downsample(chartData.prices);
}

async function fetchChartByContract(
  contractAddress: string,
  chainId: string,
  days: number | 'max'
): Promise<PricePoint[] | null> {
  const platform = CHAIN_TO_COINGECKO_PLATFORM[chainId];
  if (!platform) return null;

  const chartRes = await fetch(
    `https://api.coingecko.com/api/v3/coins/${platform}/contract/${contractAddress.toLowerCase()}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!chartRes.ok) return null;

  const chartData = await chartRes.json();
  if (!chartData.prices || !Array.isArray(chartData.prices) || chartData.prices.length === 0) return null;

  return downsample(chartData.prices);
}

async function fetchTokenChart(
  symbol: string,
  timeframe: ChartTimeframe,
  contractAddress?: string,
  chainId?: string
): Promise<PricePoint[]> {
  const days = TIMEFRAME_DAYS[timeframe];

  // Try symbol-based lookup first
  const symbolResult = await fetchChartBySymbol(symbol, days);
  if (symbolResult && symbolResult.length > 0) return symbolResult;

  // Fallback: try contract address lookup on CoinGecko
  if (contractAddress && chainId) {
    const contractResult = await fetchChartByContract(contractAddress, chainId, days);
    if (contractResult && contractResult.length > 0) return contractResult;
  }

  return [];
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
    queryKey: ['token-chart', symbol.trim(), timeframe, options?.contractAddress],
    queryFn: () => fetchTokenChart(symbol.trim(), timeframe, options?.contractAddress, options?.chainId),
    enabled: enabled && isCashtag,
    staleTime: 60_000,
    retry: 1,
  });
}

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

function getH24TxnCount(pair: any): number {
  return (pair?.txns?.h24?.buys || 0) + (pair?.txns?.h24?.sells || 0);
}

function compareDexPairs(a: any, b: any, preferredChainId?: string) {
  const aPreferred = preferredChainId && a?.chainId === preferredChainId ? 1 : 0;
  const bPreferred = preferredChainId && b?.chainId === preferredChainId ? 1 : 0;
  if (aPreferred !== bPreferred) return bPreferred - aPreferred;

  const aIsBase = a?.chainId === 'base' ? 1 : 0;
  const bIsBase = b?.chainId === 'base' ? 1 : 0;
  if (aIsBase !== bIsBase) return bIsBase - aIsBase;

  const aVolume = a?.volume?.h24 || 0;
  const bVolume = b?.volume?.h24 || 0;
  if (aVolume !== bVolume) return bVolume - aVolume;

  const aTxns = getH24TxnCount(a);
  const bTxns = getH24TxnCount(b);
  if (aTxns !== bTxns) return bTxns - aTxns;

  const aLiquidity = a?.liquidity?.usd || 0;
  const bLiquidity = b?.liquidity?.usd || 0;
  if (aLiquidity !== bLiquidity) return bLiquidity - aLiquidity;

  const aCreated = a?.pairCreatedAt || 0;
  const bCreated = b?.pairCreatedAt || 0;
  return aCreated - bCreated;
}

function pickLongerSeries(current: PricePoint[], candidate: PricePoint[]): PricePoint[] {
  return candidate.length > current.length ? candidate : current;
}

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

    // Find exact symbol matches and prefer active/liquid markets
    const exact = pairs
      .filter((p: any) => p.baseToken?.symbol?.toUpperCase() === symbol)
      .sort((a: any, b: any) => compareDexPairs(a, b));

    let best: PricePoint[] = [];
    const targetPoints = timeframe === '1D' ? 24 : TIMEFRAME_DAYS[timeframe];

    for (const pair of exact.slice(0, 8)) {
      const network = DEX_TO_GECKO_NETWORK[pair.chainId];
      if (!network) continue;
      const pairAddr = (pair.pairAddress || '').split(':')[0];
      if (!pairAddr) continue;

      const points = await fetchGeckoTerminalOHLCV(pairAddr, pair.chainId, timeframe);
      best = pickLongerSeries(best, points);
      if (best.length >= targetPoints) return best;
    }
    return best;
  } catch {
    return [];
  }
}

async function fetchGeckoTerminalByTokenAddress(
  contractAddress: string,
  timeframe: ChartTimeframe,
  preferredChainId?: string
): Promise<PricePoint[]> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contractAddress)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    if (pairs.length === 0) return [];

    const ranked = pairs.sort((a: any, b: any) => compareDexPairs(a, b, preferredChainId));
    let best: PricePoint[] = [];
    const targetPoints = timeframe === '1D' ? 24 : TIMEFRAME_DAYS[timeframe];

    for (const pair of ranked.slice(0, 8)) {
      const pairAddr = (pair.pairAddress || '').split(':')[0];
      if (!pairAddr || !DEX_TO_GECKO_NETWORK[pair.chainId]) continue;

      const points = await fetchGeckoTerminalOHLCV(pairAddr, pair.chainId, timeframe);
      best = pickLongerSeries(best, points);
      if (best.length >= targetPoints) return best;
    }

    return best;
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
  const minPoints = timeframe === '1D' ? 1 : 1;

  if (timeframe !== '1D') {
    const { data, error } = await supabase.functions.invoke('cmc-chart', {
      body: { symbol, days },
    });

    const cmcPrices: PricePoint[] = (!error && data?.prices?.length) ? data.prices : [];
    if (cmcPrices.length >= minPoints) return cmcPrices;
  }

  let best: PricePoint[] = [];

  // Fallback: GeckoTerminal OHLCV via pair address
  if (options?.pairAddress && options?.chainId) {
    const points = await fetchGeckoTerminalOHLCV(options.pairAddress, options.chainId, timeframe);
    best = pickLongerSeries(best, points);
  }

  // Better fallback: same token address, best available pool
  if (options?.contractAddress) {
    const tokenFallback = await fetchGeckoTerminalByTokenAddress(
      options.contractAddress,
      timeframe,
      options.chainId
    );
    best = pickLongerSeries(best, tokenFallback);
  }

  // Last resort: search DexScreener for best pair and try GeckoTerminal
  const fallback = await fetchGeckoTerminalBySymbol(symbol, timeframe);
  best = pickLongerSeries(best, fallback);

  return best;
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

import { useQuery } from '@tanstack/react-query';

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string | null;
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  } | null;
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { url: string; label: string }[];
    socials?: { url: string; type: string }[];
  };
}

interface DexSearchResponse {
  pairs: DexPair[] | null;
}

async function searchDexScreener(query: string): Promise<DexPair | null> {
  const symbol = query.replace(/^\$/, '').toUpperCase();
  if (!symbol) return null;

  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;

  const data: DexSearchResponse = await res.json();
  if (!data.pairs || data.pairs.length === 0) return null;

  const exactMatches = data.pairs.filter(
    (p) => p.baseToken.symbol.toUpperCase() === symbol
  );

  if (exactMatches.length === 0) return null;

  // Prioritize Base chain, then by liquidity
  exactMatches.sort((a, b) => {
    const aIsBase = a.chainId === 'base' ? 1 : 0;
    const bIsBase = b.chainId === 'base' ? 1 : 0;
    if (aIsBase !== bIsBase) return bIsBase - aIsBase;
    return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
  });
  return exactMatches[0];
}

export function useDexScreenerSearch(query: string, enabled: boolean) {
  const isCashtag = query.trim().startsWith('$') && query.trim().length >= 2;

  return useQuery({
    queryKey: ['dexscreener', query.trim()],
    queryFn: () => searchDexScreener(query.trim()),
    enabled: enabled && isCashtag,
    staleTime: 30_000,
    retry: 1,
  });
}

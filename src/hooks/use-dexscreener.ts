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

function getH24TxnCount(pair: DexPair): number {
  return (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
}

function compareDexPairs(a: DexPair, b: DexPair) {
  const aIsBase = a.chainId === 'base' ? 1 : 0;
  const bIsBase = b.chainId === 'base' ? 1 : 0;
  if (aIsBase !== bIsBase) return bIsBase - aIsBase;

  const aVolume = a.volume?.h24 || 0;
  const bVolume = b.volume?.h24 || 0;
  if (aVolume !== bVolume) return bVolume - aVolume;

  const aTxns = getH24TxnCount(a);
  const bTxns = getH24TxnCount(b);
  if (aTxns !== bTxns) return bTxns - aTxns;

  const aLiquidity = a.liquidity?.usd || 0;
  const bLiquidity = b.liquidity?.usd || 0;
  if (aLiquidity !== bLiquidity) return bLiquidity - aLiquidity;

  const aCreated = a.pairCreatedAt || 0;
  const bCreated = b.pairCreatedAt || 0;
  return aCreated - bCreated;
}

async function searchDexScreenerMulti(query: string): Promise<DexPair[]> {
  const symbol = query.replace(/^\$/, '').toUpperCase();
  if (!symbol) return [];

  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
  if (!res.ok) return [];

  const data: DexSearchResponse = await res.json();
  if (!data.pairs || data.pairs.length === 0) return [];

  const exactMatches = data.pairs.filter(
    (p) => p.baseToken.symbol.toUpperCase() === symbol
  );

  if (exactMatches.length === 0) return [];

  // Sort: Base chain first, then prefer active/liquid markets over spoof pools
  exactMatches.sort(compareDexPairs);

  // Deduplicate by chain — keep highest-liquidity pair per chain
  const seenChains = new Set<string>();
  const deduped: DexPair[] = [];
  for (const pair of exactMatches) {
    if (seenChains.has(pair.chainId)) continue;
    seenChains.add(pair.chainId);
    deduped.push(pair);
    if (deduped.length >= 4) break;
  }

  return deduped;
}

export function useDexScreenerSearch(query: string, enabled: boolean) {
  const isCashtag = query.trim().startsWith('$') && query.trim().length >= 2;

  return useQuery({
    queryKey: ['dexscreener', query.trim()],
    queryFn: async () => {
      const results = await searchDexScreenerMulti(query.trim());
      return results[0] || null;
    },
    enabled: enabled && isCashtag,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDexScreenerSearchMulti(query: string, enabled: boolean) {
  const isCashtag = query.trim().startsWith('$') && query.trim().length >= 2;

  return useQuery({
    queryKey: ['dexscreener-multi', query.trim()],
    queryFn: () => searchDexScreenerMulti(query.trim()),
    enabled: enabled && isCashtag,
    staleTime: 30_000,
    retry: 1,
  });
}

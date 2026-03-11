import { useQuery } from '@tanstack/react-query';

/**
 * Resolves a contract address to a token symbol via DexScreener.
 * Returns the symbol prefixed with $ (e.g. "$DHB") or null.
 */
async function resolveContractToSymbol(address: string): Promise<string | null> {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/${address}`);
  if (!res.ok) return null;

  const pairs = await res.json();
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  // Sort by liquidity, pick the best pair
  pairs.sort((a: any, b: any) => {
    const aBase = a.chainId === 'base' ? 1 : 0;
    const bBase = b.chainId === 'base' ? 1 : 0;
    if (aBase !== bBase) return bBase - aBase;
    return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
  });

  const symbol = pairs[0]?.baseToken?.symbol;
  return symbol ? `$${symbol.toUpperCase()}` : null;
}

export function useContractToTicker(query: string) {
  const trimmed = query.trim().toLowerCase();
  const isContractAddress = /^0x[a-f0-9]{40}$/i.test(trimmed);

  const { data: resolvedTicker, isLoading } = useQuery({
    queryKey: ['contract-to-ticker', trimmed],
    queryFn: () => resolveContractToSymbol(trimmed),
    enabled: isContractAddress,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return {
    isContractAddress,
    resolvedTicker: isContractAddress ? resolvedTicker ?? null : null,
    isResolving: isContractAddress && isLoading,
  };
}

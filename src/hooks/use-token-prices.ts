/**
 * Hook for fetching USD prices for wallet tokens
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export type TokenPrices = Record<string, number>;

/**
 * Fetch prices. Optionally pass extra token addresses (for auto-detected tokens)
 * as {address}:{symbol} pairs to look up on DexScreener.
 */
async function fetchTokenPrices(extraTokens?: { address: string; symbol: string }[]): Promise<TokenPrices> {
  let extra = '';
  if (extraTokens && extraTokens.length > 0) {
    extra = extraTokens
      .map(t => `${t.address}:${t.symbol}`)
      .join(',');
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/get-dhb-price${extra ? `?extra=${encodeURIComponent(extra)}` : ''}`;

  const res = await fetch(url, { headers: { apikey: anonKey } });
  if (!res.ok) throw new Error('Failed to fetch prices');
  const data = await res.json();
  return data?.prices ?? {};
}

const STATIC_PRICE_DEFAULTS: TokenPrices = { DHB: 0, ETH: 0, BNB: 0, USDT: 1, USDC: 1, BTC: 0, WETH: 0, WBNB: 0 };

/** Routes that actually display live token prices (wallet, staking, buy, stores). */
const PRICE_SURFACES = new Set(['/app/wallet', '/app/stake', '/stake', '/app/buy', '/app/stores']);

/** True when the active route renders live USD prices (store detail pages included). */
function isPriceSurface(pathname: string): boolean {
  return PRICE_SURFACES.has(pathname) || pathname.startsWith('/app/stores/');
}

export function useTokenPrices(extraTokens?: { address: string; symbol: string }[]) {
  const queryClient = useQueryClient();
  // Stable query key based on extra token addresses
  const extraKey = extraTokens?.map(t => `${t.address}:${t.symbol}`).sort().join(',') || '';

  // The consumers (FullWalletPage, StakingPage, BuyCoins) never unmount
  // (PersistentPageCache) — poll only while a price surface is on screen.
  const { pathname } = useLocation();
  const isPriceSurfaceActive = isPriceSurface(pathname);

  return useQuery<TokenPrices>({
    queryKey: ['token-prices', extraKey],
    queryFn: () => fetchTokenPrices(extraTokens),
    staleTime: 60_000,
    refetchInterval: isPriceSurfaceActive ? 120_000 : false,
    // When the extras list changes (balances resolve after prices), reuse the
    // already-fetched base prices instead of resetting every USD value to 0
    // while the new key loads.
    placeholderData: (prev) =>
      prev ??
      queryClient.getQueryData<TokenPrices>(['token-prices', '']) ??
      STATIC_PRICE_DEFAULTS,
  });
}

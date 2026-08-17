/**
 * Asset reference hooks
 * =====================
 * The query keys are the point of this file. A ticker or a contract address
 * shows up in dozens of captions at once — a trending token is the whole feed —
 * and every provider behind `market.ts` is either rate-limited (GeckoTerminal:
 * 30/min per IP) or costs a CMC credit. Keying on the reference rather than on
 * the post means one lookup serves every card for that asset on screen.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { AssetRef } from '@/lib/asset-refs';
import {
  fetch24hSeries,
  resolveAssetRef,
  searchAssets,
  type ResolvedAsset,
} from '@/lib/api/market';

export function useResolvedAsset(ref: AssetRef | null | undefined, enabled = true) {
  return useQuery<ResolvedAsset | null>({
    queryKey: ['asset', ref?.kind, ref?.value],
    queryFn: () => resolveAssetRef(ref as AssetRef),
    enabled: enabled && Boolean(ref),
    // Prices move, but not so fast that a scroll back up should re-ask. The
    // window is deliberately wider than the feed's own cache.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}

export function useAsset24hSeries(asset: ResolvedAsset | null | undefined) {
  return useQuery({
    queryKey: ['asset-series', asset?.assetClass, asset?.symbol, asset?.chainId, asset?.pairAddress],
    queryFn: () => fetch24hSeries(asset as ResolvedAsset),
    enabled: Boolean(asset),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/**
 * The composer's dropdown. `keepPreviousData` is what stops the list from
 * emptying between keystrokes — without it every character blanks the dropdown
 * for as long as the slowest provider takes, and the thing flickers.
 */
export function useAssetSearch(query: string, enabled: boolean) {
  const trimmed = query.replace(/^\$/, '').trim();
  return useQuery({
    queryKey: ['asset-search', trimmed.toUpperCase()],
    queryFn: () => searchAssets(trimmed),
    enabled: enabled && trimmed.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 0,
  });
}

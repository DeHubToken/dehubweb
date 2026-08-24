/**
 * The badge ladder's scale
 * ========================
 * Badge tiers are pegged in dollars (see `lib/staking-badges`), so the DHB a
 * tier costs depends on what DHB is worth. This resolves that one number and
 * publishes it.
 *
 * Shape mirrors the self-badge sync deliberately: one owner fetches
 * (`useBadgeLadderSync`, mounted once in `<SelfBadgeSync/>`), and everything
 * else reads the cached answer through `useBadgeScale`, whose observer never
 * fetches. A feed with two hundred names on it costs no requests.
 *
 * It rides the `['token-prices', '']` cache the wallet, staking and buy pages
 * already fill, so on those routes there is no extra request at all — and when
 * one of them is polling, the ladder follows along for free.
 *
 * Two things worth knowing:
 *
 * - **The scale is also written to module state** (`setActiveBadgeScale`), for
 *   the callers that have no hook: post quota, profile allowance and editor
 *   storage are plain functions called from mappers and loaders. They read
 *   whatever the last sync published, which is the reference ladder until the
 *   first price lands.
 * - **The price is a client read, so it is advisory.** Two people looking at
 *   the same profile a minute apart could resolve slightly different rungs
 *   while a price is moving. That is invisible while DHB is pinned to the
 *   anchor, and the fix when it is not is for the API to send the scale it
 *   used — one line here, and this becomes the fallback.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  activeBadgeScale,
  badgeScaleForPrice,
  setActiveBadgeScale,
} from '@/lib/staking-badges';

/** Shared with `use-token-prices` — same endpoint, same cache entry. */
export const TOKEN_PRICES_QUERY_KEY = ['token-prices', ''] as const;

type TokenPrices = Record<string, number>;

/**
 * The price endpoint, called directly rather than through the supabase client.
 *
 * This module is reachable from the entry bundle through `BadgeIcon`, and
 * `scripts/check-entry-bundle.mjs` fails the build on anything heavy arriving
 * there. `use-token-prices` builds the same URL by hand for its own reasons;
 * this keeps the dependency footprint at `fetch`.
 */
async function fetchTokenPrices(): Promise<TokenPrices> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-dhb-price`, {
    headers: { apikey: anonKey },
  });
  if (!res.ok) throw new Error(`Price lookup failed: ${res.status}`);
  const data = await res.json();
  return data?.prices ?? {};
}

/**
 * Own the ladder scale: fetch the price, publish the scale, hand it back.
 *
 * Mount once. The price moves the ladder in two-significant-figure steps, so
 * there is nothing to gain from watching it closely — five minutes stale and a
 * focus refetch is well inside the resolution of the thing it feeds.
 */
export function useBadgeLadderSync(): number {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const scale = badgeScaleForPrice(data?.DHB);

  useEffect(() => {
    setActiveBadgeScale(scale);
  }, [scale]);

  return scale;
}

/**
 * Read the scale without owning the fetch.
 *
 * Falls back to whatever the last sync published, so a badge drawn before the
 * first price lands uses the reference ladder rather than nothing.
 */
export function useBadgeScale(): number {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    // The sync owns the fetching; this observer only tracks its answer, so
    // mounting it on every name in a feed costs nothing.
    enabled: false,
    staleTime: Infinity,
  });

  return data?.DHB ? badgeScaleForPrice(data.DHB) : activeBadgeScale();
}

/**
 * The DHB price the ladder is currently using, when one has been read.
 *
 * Only for surfaces that show the peg itself — the badge progress panel says
 * what a tier costs in dollars, and that sentence is a lie if the price it was
 * derived from is not the one on screen.
 */
export function useBadgeLadderPrice(): number | undefined {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    enabled: false,
    staleTime: Infinity,
  });

  const price = data?.DHB;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : undefined;
}

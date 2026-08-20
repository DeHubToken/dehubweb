/**
 * Wallets to people.
 * ==================
 * A leaderboard row, a lobby row and a challenge are all the same thing on
 * screen: a name, a face and a badge, keyed on an address. Identity comes from
 * api.dehub.io's public `account_info` endpoint — one cached query per wallet,
 * the same enrichment pass stories and suggestions already do.
 *
 * The queries are keyed on the address alone rather than on the surface asking,
 * so the chess lobby, the ladder and the run board share one cache: a player
 * who appears on two of them is fetched once.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getAccountInfo } from '@/lib/api/dehub';
import type { DeHubUser } from '@/lib/api/dehub/types';
import { buildAvatarUrl } from '@/lib/media-url';

export function useWalletProfiles(wallets: string[]): Record<string, DeHubUser> {
  const results = useQueries({
    queries: wallets.map((address) => ({
      queryKey: ['wallet-profile', address],
      queryFn: () => getAccountInfo(address),
      // An avatar five minutes stale is still the right avatar.
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  // Memoised on the resolved data rather than rebuilt every render: this map is
  // a dependency of the lists that render from it.
  return useMemo(() => {
    const map: Record<string, DeHubUser> = {};
    results.forEach((result, index) => {
      if (result.data) map[wallets[index]] = result.data;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results is a new array identity every render; its data is not
  }, [wallets.join(','), results.map((r) => (r.data ? 1 : 0)).join('')]);
}

/** Display name, falling back through username to a shortened address. */
export function profileName(profile: DeHubUser | undefined, wallet: string | null | undefined): string {
  if (profile?.displayName || profile?.username) return profile.displayName || profile.username!;
  if (!wallet) return 'anon';
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/** Avatar URL, or undefined so the caller draws its own fallback. */
export function profileAvatar(profile: DeHubUser | undefined, wallet: string): string | undefined {
  const path = profile?.avatarImageUrl || profile?.avatarUrl;
  return path ? buildAvatarUrl(wallet, path) : undefined;
}

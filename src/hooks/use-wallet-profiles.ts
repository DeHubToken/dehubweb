/**
 * Wallets to people.
 * ==================
 * A leaderboard row, a lobby row and a challenge are all the same thing on
 * screen: a name, a face and a badge, keyed on an address. Identity comes from
 * api.dehub.io's batched `account_info/batch` endpoint — one request per
 * hundred addresses rather than one per row, which is what a ten-row board
 * used to cost.
 *
 * The batch result is also written into the per-wallet `['wallet-profile',
 * address]` cache entries, so a caller that reads one address straight from
 * the query cache (the chess page names an opponent that way) still finds it.
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountSummaries, type AccountSummary } from '@/lib/api/dehub';
import type { DeHubUser } from '@/lib/api/dehub/types';
import { buildAvatarUrl } from '@/lib/media-url';
import i18n from '@/i18n';

/** The identity fields a board row draws, in the shape the rest of the app reads. */
function toProfile(summary: AccountSummary): DeHubUser {
  return {
    address: summary.address,
    username: summary.username ?? null,
    displayName: summary.displayName ?? null,
    avatarImageUrl: summary.avatarImageUrl ?? null,
    badgeBalance: summary.badgeBalance ?? undefined,
    isBanned: summary.isBanned,
  };
}

export function useWalletProfiles(wallets: string[]): Record<string, DeHubUser> {
  const queryClient = useQueryClient();

  // Sorted and de-duplicated so two callers asking for the same people in a
  // different order share one cache row.
  const key = useMemo(
    () => [...new Set(wallets.filter(Boolean).map((w) => w.toLowerCase()))].sort().join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not array identity
    [wallets.join(',')],
  );

  const { data } = useQuery({
    queryKey: ['wallet-profiles', key],
    queryFn: async () => {
      const summaries = await getAccountSummaries(key.split(','));
      const byAddress: Record<string, DeHubUser> = {};
      for (const summary of summaries) {
        if (!summary?.address) continue;
        const profile = toProfile(summary);
        byAddress[summary.address.toLowerCase()] = profile;
        queryClient.setQueryData(['wallet-profile', summary.address.toLowerCase()], profile);
      }
      return byAddress;
    },
    enabled: key.length > 0,
    // An avatar five minutes stale is still the right avatar.
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Memoised on the resolved data rather than rebuilt every render: this map is
  // a dependency of the lists that render from it. Keyed back on the exact
  // strings the caller passed, whatever their case.
  return useMemo(() => {
    const map: Record<string, DeHubUser> = {};
    if (!data) return map;
    for (const wallet of wallets) {
      const profile = data[wallet.toLowerCase()];
      if (profile) map[wallet] = profile;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wallets is compared by content
  }, [data, wallets.join(',')]);
}

/** Display name, falling back through username to a shortened address. */
export function profileName(profile: DeHubUser | undefined, wallet: string | null | undefined): string {
  if (profile?.displayName || profile?.username) return profile.displayName || profile.username!;
  if (!wallet) return i18n.t('arcade.anon');
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/** Avatar URL, or undefined so the caller draws its own fallback. */
export function profileAvatar(profile: DeHubUser | undefined, wallet: string): string | undefined {
  const path = profile?.avatarImageUrl || profile?.avatarUrl;
  return path ? buildAvatarUrl(wallet, path) : undefined;
}

/**
 * Badge balance lookup
 * ====================
 * Feed items embed the author's `minterUser.badgeBalance`, so a post card can
 * draw its badge with no extra request. Other surfaces know only who the user
 * is: a stage row has `host_username`, a community card has an owner address,
 * a served ad has the advertiser's wallet. Those need the balance fetched.
 *
 * One shared query key per identifier, so the same user drawn on several cards
 * costs a single request, and the entry is reused for the rest of the session.
 * `provided` short-circuits the fetch entirely — pass the payload's balance
 * whenever there is one and this hook stays inert.
 *
 * The account lookup also returns the canonical username, which matters: the
 * override table in lib/staking-badges is keyed by username, so a surface that
 * only knows a wallet address still resolves an overridden badge.
 */

import { useQuery } from '@tanstack/react-query';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { getBadgeName, getBadgeUrl, isBigBadge, isBigBadgeUrl } from '@/lib/staking-badges';

export interface ResolvedBadge {
  badgeBalance?: number;
  /** Canonical username, for the override table. */
  username?: string;
}

/** Normalise a username or address into a stable cache key. */
function badgeKey(identifier?: string | null): string {
  return identifier?.replace('@', '').trim().toLowerCase() || '';
}

export function useBadgeBalance(
  identifier?: string | null,
  provided?: number | null,
): ResolvedBadge {
  const key = badgeKey(identifier);
  const hasProvided = typeof provided === 'number' && Number.isFinite(provided);

  const { data } = useQuery({
    queryKey: ['badge-balance', key],
    queryFn: async (): Promise<ResolvedBadge> => {
      const user = await getAccountInfo(key);
      return {
        badgeBalance: user?.badgeBalance,
        username: user?.username || undefined,
      };
    },
    enabled: !!key && !hasProvided,
    // Staking tiers move on the scale of days; an unknown user 404s, and
    // retrying that on every card is pure noise.
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (hasProvided) {
    return { badgeBalance: provided as number };
  }
  return data ?? {};
}

export interface BadgeVisualInput {
  badgeBalance?: number | string | null;
  /** Username or address to resolve the balance from, when none was passed. */
  lookupId?: string | null;
  /** Username for the override table. */
  username?: string | null;
  /** Pre-resolved image, skips resolution entirely. */
  src?: string | null;
}

export interface BadgeVisual {
  /** Badge image, or null when the user is below the 10k DHB floor. */
  url: string | null;
  /** Tier name, for the tooltip. */
  name: string | null;
  /** Shark and whale tiers render 10% larger. */
  big: boolean;
}

/**
 * Resolve the badge a user should draw. Callers that need to know whether a
 * badge exists *before* rendering — to reserve the gutter the icon is absolutely
 * positioned into — share this hook with BadgeIcon rather than recomputing
 * `getBadgeUrl` themselves, which is what kept the two out of step.
 */
export function useBadgeVisual({ badgeBalance, lookupId, username, src }: BadgeVisualInput): BadgeVisual {
  const numeric = typeof badgeBalance === 'string' ? parseFloat(badgeBalance) : badgeBalance;
  const looked = useBadgeBalance(src ? null : lookupId, numeric);

  if (src) {
    return { url: src, name: null, big: isBigBadgeUrl(src) };
  }

  const balance = numeric ?? looked.badgeBalance;
  const nameKey = username ?? looked.username ?? lookupId;

  return {
    url: getBadgeUrl(balance, nameKey),
    name: getBadgeName(balance, nameKey),
    big: isBigBadge(balance, nameKey),
  };
}

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
 *
 * Both paths are only as fresh as `badgeBalance` on the API's account row — a
 * denormalised sum refreshed out of band. For the signed-in user we do not
 * have to wait for it: see use-self-badge-balance.
 */

import { useQuery } from '@tanstack/react-query';
import { getAccountInfo } from '@/lib/api/dehub/users';
import {
  getBadgeName,
  getBadgeUrl,
  isBigBadge,
  isBigBadgeUrl,
  parseBadgeLock,
  type BadgeLock,
} from '@/lib/staking-badges';
import { useBadgeScale } from '@/hooks/use-badge-scale';
import { useSelfBadge, preferLiveBalance } from '@/hooks/use-self-badge-balance';

export interface ResolvedBadge {
  badgeBalance?: number;
  /** The tier this user has grandfathered, when the account row carries one. */
  badgeLock?: BadgeLock | null;
  /** Canonical username, for the override table. */
  username?: string;
  /**
   * Wallet address, for surfaces that only knew a name but need one — the new
   * member chip checks membership by address. Free: it rides the account row
   * this query already fetched.
   */
  address?: string;
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
        badgeLock: parseBadgeLock(user?.badgeLock),
        username: user?.username || undefined,
        address: user?.address || user?.wallet_address || undefined,
      };
    },
    enabled: !!key && !hasProvided,
    // A tier can move the moment someone buys, and a badge that shows up half
    // an hour late reads as broken. One request per unique name per minute,
    // shared across every card drawing that name — and only for the handful
    // of surfaces whose payload carries no balance at all.
    staleTime: 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // An unknown user 404s; retrying that on every card is pure noise.
    retry: false,
    refetchOnWindowFocus: true,
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
  /** The holder's grandfathered tier, when the payload carries one. */
  badgeLock?: BadgeLock | null;
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
 *
 * When the name being drawn is the signed-in user's own, the live on-chain
 * balance is allowed to win — but only upward, so this can promote a badge the
 * instant the tokens land and can never take one away.
 *
 * The ladder itself is priced in dollars, so the DHB a tier costs depends on
 * the token price: `useBadgeScale` supplies that, and a holder's `badgeLock`
 * keeps the tier they already earned when the ladder moves under them.
 */
export function useBadgeVisual({ badgeBalance, lookupId, username, badgeLock, src }: BadgeVisualInput): BadgeVisual {
  const numeric = typeof badgeBalance === 'string' ? parseFloat(badgeBalance) : badgeBalance;
  const looked = useBadgeBalance(src ? null : lookupId, numeric);
  const self = useSelfBadge();
  const scale = useBadgeScale();

  if (src) {
    return { url: src, name: null, big: isBigBadgeUrl(src) };
  }

  const nameKey = username ?? looked.username ?? lookupId;
  // Any of the three can be the one that names me: a feed card passes a
  // handle, a stage row passes a wallet address, a lookup resolves the
  // canonical username after the fact.
  const isSelf = self.isSelf(lookupId) || self.isSelf(username) || self.isSelf(looked.username);
  const balance = isSelf
    ? preferLiveBalance(numeric ?? looked.badgeBalance, self.balance)
    : numeric ?? looked.badgeBalance;
  // Prop first (the payload knows), then the lookup, then — for my own name —
  // the account row I am already signed in with.
  const lock = parseBadgeLock(badgeLock) ?? looked.badgeLock ?? (isSelf ? self.lock : null) ?? null;
  const context = { scale, lock };

  return {
    url: getBadgeUrl(balance, nameKey, context),
    name: getBadgeName(balance, nameKey, context),
    big: isBigBadge(balance, nameKey, context),
  };
}

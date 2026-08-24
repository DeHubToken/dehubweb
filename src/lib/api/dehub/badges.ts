/**
 * Badge delegation — lending your tier to another account
 * =======================================================
 * A badge is a claim about influence, and influence can be lent. Every tier
 * carries one delegation slot per rung climbed (Crab 1, up to Meglodon 13),
 * and a slot hands your badge to another account — a second wallet, a backup,
 * or someone worth bringing up.
 *
 * Two things about this that are not obvious from the endpoints:
 *
 * **A delegation grants the rung below yours**, never your own. Slots scale
 * with tier, so granting at your own rung would get cheaper the higher you
 * climb, and the rarest badges would be the cheapest to counterfeit.
 *
 * **A lent badge renders exactly like an earned one, everywhere.** The server
 * folds it into `badgeBalance`, which every surface already reads, so nothing
 * on this side has to know a badge was lent in order to draw it. The one place
 * that does is the profile, which says whose badge it is — `fetchBadgePatron`
 * below.
 */

import { apiCall } from './core';

export interface DelegationEntry {
  /** Lower-cased wallet address of the other party. */
  address: string;
  /** Tier name, matching the badge art in `@/lib/staking-badges`. */
  tier: string;
  since: string;
}

export interface BadgeDelegationSummary {
  address: string;
  /** What the chain says this account holds, before anything lent to it. */
  ownBadgeBalance: number;
  /** Tier earned outright, or null. */
  ownTier: string | null;
  /** Tier actually rendered — earned or lent. */
  effectiveTier: string | null;
  /** Slots this tier carries in total. */
  slots: number;
  /** Slots in use, counting ones still cooling down after a revoke. */
  slotsUsed: number;
  /** Tier this account may hand out, or null if it may not. */
  grantableTier: string | null;
  /** Badges this account has lent out. */
  granted: DelegationEntry[];
  /** The badge this account is wearing, if it was lent one. */
  received: DelegationEntry | null;
}

export interface BadgePatron {
  tier: string;
  since: string;
  grantor: {
    address: string;
    username?: string | null;
    displayName?: string | null;
    avatarImageUrl?: string | null;
  } | null;
}

/** Slots, who is wearing this account's badge, and whose badge it is wearing. */
export async function fetchMyDelegations(): Promise<BadgeDelegationSummary> {
  const response = await apiCall<{ result: BadgeDelegationSummary }>('/api/badge/delegations', {
    requiresAuth: true,
  });
  return response.result;
}

/**
 * Lend this account's badge to another.
 *
 * `to` is an address or a username — the server resolves either, so the input
 * can take whatever someone pastes.
 */
export async function grantDelegation(to: string): Promise<{ tier: string; slotsRemaining: number }> {
  const response = await apiCall<{ result: { tier: string; slotsRemaining: number } }>(
    '/api/badge/delegations',
    { method: 'POST', body: { to }, requiresAuth: true },
  );
  return response.result;
}

/**
 * End a delegation with the named account, whichever end of it you are.
 *
 * One call for both directions: someone wearing a badge they would rather not
 * is not stuck waiting for the grantor to notice.
 */
export async function revokeDelegation(counterparty: string): Promise<void> {
  await apiCall<{ result: unknown }>(`/api/badge/delegations/${encodeURIComponent(counterparty)}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

/**
 * Who lent this account its badge, for the line on their profile.
 *
 * Public, and null for the overwhelming majority of accounts — a badge is
 * usually earned.
 */
export async function fetchBadgePatron(idOrAddress: string): Promise<BadgePatron | null> {
  const response = await apiCall<{ result: BadgePatron | null }>(
    `/api/badge/delegations/${encodeURIComponent(idOrAddress)}`,
  );
  return response.result ?? null;
}

// Refusals are not mapped to codes on this side on purpose. `apiCall` throws
// with the server's own `error` string as the message, and those strings are
// already written for a person to read — "No free delegation slots", "That
// account is already wearing someone else's badge". Re-deriving a code from
// the text to look up a second wording would only give the two places to
// disagree.

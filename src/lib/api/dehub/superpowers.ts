/**
 * SuperPowers — spending a badge on reach
 * =======================================
 * A badge buys quiet things: a cheaper DHB rate, a bigger posting allowance,
 * more weight on a reaction. SuperPowers is the loud half. Every holder gets
 * an allowance of boosts each fortnight, and a boost puts one of their posts
 * in the slot at the top of the home feed.
 *
 * Thirteen tiers, thirteen powers, one unlock per rung — so the next rung
 * always buys exactly one new thing. Two are built: **Boost** for a post under
 * a week old, and **Second Wind** for anything older, which unlocks a rung up
 * because bringing something back from the archive is a different act from
 * amplifying what you just posted.
 *
 * Two things worth knowing before touching this:
 *
 * **The slot rotates; it is not a pin.** A fortnight is 20,160 minutes and the
 * ladder hands out more than that as soon as a few thousand badges exist. When
 * several boosts are live the viewer is dealt one weighted by the booster's
 * tier, so a Meglodon's turns up fourteen times as often as a Crab's. The
 * promise is "thirty minutes at the top", which holds; what varies is share of
 * voice. Never write copy that promises sole possession of the slot.
 *
 * **Nothing here derives the ladder.** `fetchSuperpowerTiers` serves it. The
 * client draws a badge from a live wallet read that deliberately over-reports
 * (`useSelfBadge` takes `max(server, live)` so a badge cannot vanish
 * mid-stake), so a client-side table would promise an allowance the server
 * will not grant — the same trap the DHB gateway discount has.
 *
 * `apiCall` resolves against the bare origin here, so every path below starts
 * `/api/`. Mobile's `env.API_URL` already ends in `/api` and its copy of this
 * file must not — copying a path across verbatim gives `/api/api/…`.
 */

import { apiCall } from './core';

/** Keys are stable and stored on bookings; renaming one is a migration. */
export type SuperPowerKey =
  | 'boost'
  | 'second_wind'
  | 'comment_anchor'
  | 'trend_jacker'
  | 'timeline_bomber'
  | 'signal_flare'
  | 'flak_jacket'
  | 'precision_strike'
  | 'harpoon'
  | 'golden_hour'
  | 'crew_boost'
  | 'front_row'
  | 'deep_current';

export interface SuperPowerInfo {
  key: SuperPowerKey;
  label: string;
  summary: string;
  /** Badge tier this unlocks at, matching the art in `@/lib/staking-badges`. */
  tier: string;
  /** False while a power is published but not yet built. */
  available: boolean;
  /** Whether this account's tier reaches it. Absent on the public ladder. */
  unlocked?: boolean;
}

export interface SuperPowerBooking {
  id: string;
  /**
   * Null for a power that does not act on a post — a Golden Hour acts on the
   * whole account. Check before linking to `/app/post/`.
   */
  tokenId: number | null;
  power: SuperPowerKey;
  startsAt: string;
  endsAt: string;
  minutes: number;
  /** Tier at booking time, frozen — not necessarily the tier worn now. */
  tier: string;
  status: 'active' | 'completed' | 'cancelled';
  /**
   * Whose post it landed on.
   *
   * The holder's own address for every power but Deep Current, which is a
   * gift. Optional for the same deploy-skew reason as the flare counters.
   */
  beneficiary?: string;
  /** Times this boost has been dealt to a viewer. */
  served: number;
  live: boolean;
}

export interface SuperPowerStatus {
  cycle: number;
  cycleStartedAt: string;
  /** When the next allowance lands. The same moment for everybody. */
  cycleEndsAt: string;
  cycleDays: number;
  tier: string | null;
  /** Earned balance the tier came from — a lent badge does not count here. */
  badgeBalance: number;
  boostsPerCycle: number;
  boostsUsed: number;
  boostsLeft: number;
  /**
   * The Signal Flare pot — a SECOND allowance the same size as the boost one,
   * spent independently.
   *
   * Optional because a client can be newer than the API it is talking to, and
   * the fallback has to be the boost count rather than zero: showing an
   * Octopus "no flares left" on a deploy skew takes the power away.
   */
  signalsPerCycle?: number;
  signalsUsed?: number;
  signalsLeft?: number;
  minutesPerBoost: number;
  /** Share of the slot when several boosts run at once. */
  slotWeight: number;
  powers: SuperPowerInfo[];
  bookings: SuperPowerBooking[];
}

export interface SuperPowerTierRow {
  name: string | null;
  minBadgeBalance: number;
  boostsPerCycle: number;
  minutesPerBoost: number;
  slotWeight: number;
}

export interface SuperPowerLadder {
  cycleDays: number;
  cycleEndsAt: string;
  tiers: SuperPowerTierRow[];
  powers: SuperPowerInfo[];
}

export interface BoostSlot {
  tokenId: number;
  bookingId: string;
  power: SuperPowerKey;
  tier: string;
  endsAt: string;
  booster: string;
}

/** This account's tier, allowance and bookings. */
export async function fetchSuperpowerStatus(): Promise<SuperPowerStatus> {
  const response = await apiCall<{ result: SuperPowerStatus }>('/api/superpowers', {
    requiresAuth: true,
  });
  return response.result;
}

/** The published ladder. Public — no badge needed to read what one buys. */
export async function fetchSuperpowerTiers(): Promise<SuperPowerLadder> {
  const response = await apiCall<{ result: SuperPowerLadder }>('/api/superpowers/tiers');
  return response.result;
}

/**
 * The boosted post to show this viewer, or null when nothing is running.
 *
 * Each call is an independent weighted draw, so the cache window on the caller
 * *is* the rotation: cache for five minutes and a viewer sees one boost per
 * refresh. Do not cache it for the session.
 *
 * Deliberately unauthenticated at this layer — `apiCall` still sends a token
 * when one is present, which the server uses only to avoid showing someone
 * their own boost. A signed-out viewer gets the slot too.
 */
export async function fetchBoostSlot(): Promise<BoostSlot | null> {
  const response = await apiCall<{ result: BoostSlot | null }>('/api/superpowers/slot');
  return response.result ?? null;
}

/**
 * Spend a boost on one of your posts.
 *
 * `power` must suit the post's age — Boost under a week, Second Wind over it.
 * The server refuses the wrong one rather than silently correcting it, because
 * the two cost the same boost and mean different things.
 */
export async function bookBoost(
  tokenId: number,
  power: SuperPowerKey = 'boost',
  startAt?: string,
  aim?: {
    /** `precision_strike` — the account whose followers to reach. */
    targetAccount?: string;
    /** `harpoon` — badge tier NAMES, never balances. The ladder is dollar-pegged. */
    targetTiers?: string[];
  },
): Promise<SuperPowerBooking> {
  const body: Record<string, unknown> = { tokenId, power };
  if (startAt) body.startAt = startAt;
  if (aim?.targetAccount) body.targetAccount = aim.targetAccount;
  if (aim?.targetTiers?.length) body.targetTiers = aim.targetTiers;

  const response = await apiCall<{ result: SuperPowerBooking }>('/api/superpowers/boost', {
    method: 'POST',
    body,
    requiresAuth: true,
  });
  return response.result;
}

/**
 * Cancel a boost.
 *
 * `refunded` is false once the window has opened — a boost that has been in
 * the slot has been seen, and giving it back would make a fifteen-minute
 * allowance an unlimited one in five-second pieces. Say which happened rather
 * than reporting a flat success.
 */
export async function cancelBoost(bookingId: string): Promise<{ refunded: boolean }> {
  const response = await apiCall<{ result: { refunded: boolean } }>(
    `/api/superpowers/boost/${encodeURIComponent(bookingId)}`,
    { method: 'DELETE', requiresAuth: true },
  );
  return response.result;
}

// Refusals carry the server's own sentence — "That post is over a week old —
// use Second Wind to bring it back", "You have used all 2 of your boosts this
// cycle". `apiCall` throws with that string as the message, so show it. Mapping
// it back to a code to look up a second wording only gives the two places to
// disagree.

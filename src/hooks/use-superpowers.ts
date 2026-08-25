/**
 * SuperPowers — allowance, ladder and the feed's boost slot
 * =========================================================
 * Three queries, deliberately with three different cache windows, because they
 * answer three different kinds of question.
 *
 * `useSuperpowers` is the holder's own allowance and has to be right the
 * instant a boost is spent, so it is short-lived and invalidated on every
 * write. `useSuperpowerLadder` is a published table that changes on deploys.
 *
 * `useBoostSlot` is the interesting one. The server deals a fresh weighted draw
 * on every call, so **the cache window here IS the rotation** — five minutes
 * means a viewer sees one boost, then a different one after a refresh. Cache it
 * for the session and one holder owns that viewer's slot until they close the
 * tab; drop the cache entirely and the slot changes under someone mid-scroll.
 * Five minutes is the number, and it is a product decision rather than a
 * performance one.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import {
  bookBoost,
  cancelBoost,
  fetchBoostSlot,
  fetchFrontRow,
  joinCrewBoost,
  fetchSuperpowerStatus,
  fetchSuperpowerTiers,
  type SuperPowerKey,
  type SuperPowerStatus,
} from '@/lib/api/dehub/superpowers';

/** How long a viewer keeps the boost they were dealt. See the note above. */
const SLOT_ROTATION_MS = 5 * 60 * 1000;

/**
 * `useAuth()` throws outside AuthProvider and the boost slot is read from the
 * feed, which mounts inside it — but the ladder is also rendered on the public
 * docs page, which does not. Reading the context directly and treating
 * undefined as signed out keeps one hook usable in both places.
 */
function useIsAuthed(): boolean {
  const auth = useContext(AuthContext);
  return !!auth?.isAuthenticated;
}

/** This account's tier, allowance and bookings. Null while signed out. */
export function useSuperpowers(enabled = true) {
  const isAuthenticated = useIsAuthed();

  return useQuery<SuperPowerStatus | null>({
    queryKey: ['superpowers', 'status'],
    queryFn: () => fetchSuperpowerStatus(),
    // Callers that mount many copies (the boost sheet lives on every feed
    // card) pass their own open/closed state; without it each mount is an
    // observer that refetches the moment the stale window has passed.
    enabled: isAuthenticated && enabled,
    staleTime: 30 * 1000,
    // An account with no badge gets a legitimate, well-formed answer here
    // (tier null, nothing granted), so a failure is a real failure — but it
    // must never block a composer. Callers treat undefined as "no boost
    // available" rather than showing an error.
    retry: 1,
  });
}

/** The published ladder. Public, and safe to render signed out. */
export function useSuperpowerLadder() {
  return useQuery({
    queryKey: ['superpowers', 'tiers'],
    queryFn: () => fetchSuperpowerTiers(),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

/**
 * The boosted post for this viewer, or null when nothing is running.
 *
 * Deliberately not gated on being signed in — a signed-out viewer sees boosts
 * too. That is most of the audience on a shared link, and a boost that only
 * reaches signed-in users is worth a fraction of what the holder was promised.
 *
 * `enabled` is the caller's own "is this the surface a boost belongs on"
 * decision: the home feed passes false once the viewer has narrowed the feed,
 * because the slot renders above the list and is untouched by the filters, so
 * on Following it would put a paid post from somebody they do not follow at the
 * top of a feed they narrowed to people they do.
 */
/**
 * The stage holding the front row, or null.
 *
 * Same cache window as the boost slot, and for the same reason: the server
 * deals a fresh weighted draw on every call, so the window on this side IS
 * the rotation. Two Blue Whales running at once each top the rail for part of
 * the hour rather than one of them taking all of it.
 *
 * Never gated on being signed in — a stage is public, and most of the
 * audience on a shared link is signed out.
 */
export function useFrontRow() {
  return useQuery({
    queryKey: ['superpowers', 'front-row'],
    queryFn: fetchFrontRow,
    staleTime: SLOT_ROTATION_MS,
    gcTime: SLOT_ROTATION_MS,
    refetchOnWindowFocus: false,
    // The rail renders perfectly well unsorted. It must never wait on this,
    // and must never break without it.
    retry: false,
  });
}

/**
 * Put one of your own boosts behind somebody else's Crew Boost.
 *
 * Minutes pool; weight does not — the leader's tier still decides how often
 * the slot is dealt. Never write copy promising a joiner more reach: what
 * they buy is a longer window for the post they are backing.
 */
export function useJoinCrewBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => joinCrewBoost(bookingId),
    onSuccess: () => {
      // The joiner's own allowance changed, and the boost they backed now
      // runs longer — both are on screen.
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'slot'] });
    },
  });
}

export function useBoostSlot(enabled = true) {
  return useQuery({
    queryKey: ['superpowers', 'slot'],
    queryFn: () => fetchBoostSlot(),
    enabled,
    staleTime: SLOT_ROTATION_MS,
    gcTime: SLOT_ROTATION_MS,
    refetchOnWindowFocus: false,
    // The feed must not wait on this, and must not break without it.
    retry: false,
  });
}

/** Spend a boost, then refresh the allowance and re-deal the slot. */
export function useBookBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tokenId,
      power = 'boost',
      startAt,
      targetAccount,
      targetTiers,
      commentId,
      stageId,
    }: {
      tokenId: number;
      power?: SuperPowerKey;
      startAt?: string;
      /** precision_strike: whose followers to reach. */
      targetAccount?: string;
      /** harpoon: badge tier NAMES to aim at. */
      targetTiers?: string[];
      /** comment_anchor: your comment, in somebody else's thread. */
      commentId?: string;
      /** front_row: a Stage you host. */
      stageId?: string;
    }) =>
      bookBoost(tokenId, power, startAt, { targetAccount, targetTiers, commentId, stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'status'] });
      // So the holder can see their own boost land, rather than waiting out
      // the rotation window wondering whether it worked.
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'slot'] });
    },
  });
}

/** Cancel a boost. The allowance comes back only if it had not started. */
export function useCancelBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => cancelBoost(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['superpowers', 'slot'] });
    },
  });
}

/**
 * Which power a post of this age needs, or null if it cannot be boosted.
 *
 * The server enforces the same line and its refusal is the authority; this is
 * so the sheet can label the button correctly rather than making someone press
 * it to find out.
 */
export function powerForPostAge(createdAt: string | Date | undefined): SuperPowerKey | null {
  if (!createdAt) return null;
  const age = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 'boost';
  return age > 7 * 24 * 60 * 60 * 1000 ? 'second_wind' : 'boost';
}

/** What a power needs from the holder before it can be spent. */
export type PowerTargeting = 'none' | 'account' | 'tiers';

export interface SpendablePower {
  key: SuperPowerKey;
  label: string;
  summary: string;
  /** What the holder must supply — an account to aim at, or badge tiers. */
  targeting: PowerTargeting;
  /** False when the tier does not reach it, or it is not built yet. */
  enabled: boolean;
  /** Why it is disabled, written for the holder. Empty when enabled. */
  blockedReason: string;
}

/**
 * Every power this holder could spend on this post, in ladder order.
 *
 * Replaces the age-derived either/or the sheet started with. That was right
 * while Boost and Second Wind were the only two — they split one job by age —
 * but there are six now, and four of them have nothing to do with age. A
 * chooser that infers the power from the post silently hides the rest.
 *
 * The age rule survives where it belongs: Boost and Second Wind are still
 * mutually exclusive, and only the one that suits the post is offered, because
 * the server refuses the other and the two cost the same boost.
 *
 * `status.powers` is the authority for what is unlocked and what is built —
 * never a table on this side. The client draws a badge from a live wallet read
 * that deliberately over-reports, so a local answer would offer powers the
 * server will refuse.
 */
export function spendablePowers(
  status: SuperPowerStatus | null | undefined,
  postCreatedAt: string | Date | undefined,
  /**
   * Whether the viewer wrote this post.
   *
   * Undefined means "not resolved yet", and nothing is filtered on it — the
   * server still refuses, which is the authority either way. Passing it is
   * what turns a refusal into a list the holder can read before they tap.
   */
  isOwnPost?: boolean,
): SpendablePower[] {
  if (!status) return [];

  const ageChoice = powerForPostAge(postCreatedAt);
  const TARGETING: Partial<Record<SuperPowerKey, PowerTargeting>> = {
    precision_strike: 'account',
    harpoon: 'tiers',
  };

  // Which powers act on your OWN post and which act on somebody else's. Deep
  // Current is the only gift on the ladder, and it is the exact inverse of
  // every other power rather than an addition to them — offering it on your
  // own post, or offering a Boost on a stranger's, produces a tap the server
  // refuses with a sentence the holder could have been shown first.
  const GIFTS: readonly SuperPowerKey[] = ['deep_current'];

  // Signal Flare is paid for out of a second allowance the same size as the
  // boost one. Reading boostsLeft for it tells an Octopus who has spent both
  // boosts that they have no flares either, which is wrong in the direction
  // that costs them the power they climbed a rung for.
  const SIGNALS: readonly SuperPowerKey[] = ['signal_flare'];
  const left = (key: SuperPowerKey) =>
    SIGNALS.includes(key) ? (status.signalsLeft ?? status.boostsLeft) : status.boostsLeft;

  return status.powers
    .filter(p => {
      if (!p.available) return false;
      // Golden Hour acts on the account, not this post — it belongs on the
      // SuperPowers page rather than in a post's sheet.
      if (p.key === 'golden_hour') return false;
      // A gift is offered only on somebody else's post, and everything else
      // only on your own. When ownership is unknown — a caller that has not
      // resolved the author yet — nothing is hidden and the server decides.
      if (isOwnPost !== undefined) {
        if (GIFTS.includes(p.key) !== !isOwnPost) return false;
      }
      // Only the age-appropriate half of the Boost/Second Wind pair.
      if (p.key === 'boost' || p.key === 'second_wind') return p.key === ageChoice;
      return true;
    })
    .map(p => ({
      key: p.key,
      label: p.label,
      summary: p.summary,
      targeting: TARGETING[p.key] ?? 'none',
      enabled: !!p.unlocked && left(p.key) > 0,
      blockedReason: !p.unlocked
        ? `Unlocks at ${p.tier}`
        : left(p.key) < 1
          ? SIGNALS.includes(p.key)
            ? 'No Signal Flares left this cycle'
            : 'No boosts left this cycle'
          : '',
    }));
}

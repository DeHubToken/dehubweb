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
    }: {
      tokenId: number;
      power?: SuperPowerKey;
      startAt?: string;
    }) => bookBoost(tokenId, power, startAt),
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
